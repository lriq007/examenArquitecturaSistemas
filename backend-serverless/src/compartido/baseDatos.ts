import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

import { crearRegistrador, emitirMetricaEMF } from "./observabilidad.js";

const endpointLocal = process.env.DYNAMODB_ENDPOINT?.trim();

const regionPrincipal =
  process.env.DYNAMODB_REGION_PRINCIPAL?.trim() ||
  process.env.AWS_REGION ||
  "us-east-1";

const regionRespaldo =
  process.env.DYNAMODB_REGION_RESPALDO?.trim() ||
  "us-west-2";

/*
 * Valores provisionales: la calibración final del umbral y el cooldown
 * es tarea de la prueba de carga (fuera de esta épica). Configurables
 * por variable de entorno para poder ajustarlos sin recompilar.
 */
const UMBRAL_FALLOS = Number(process.env.UMBRAL_FALLOS_BREAKER) || 3;
const DURACION_COOLDOWN_MS = Number(process.env.DURACION_COOLDOWN_MS_BREAKER) || 60_000;

/* ────────────────────────────────────────────────────────────────────────
 * Clasificación de errores elegibles para failover (sin cambios de
 * comportamiento respecto de la versión anterior).
 * ────────────────────────────────────────────────────────────────────── */
function nombreError(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }

  return "Error";
}

function codigoError(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const codigo = (error as { code?: unknown }).code;

    return typeof codigo === "string" ? codigo : undefined;
  }

  return undefined;
}

function statusHttp(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  return (
    error as {
      $metadata?: {
        httpStatusCode?: number;
      };
    }
  ).$metadata?.httpStatusCode;
}

export function debeHacerFailover(error: unknown): boolean {
  const nombre = nombreError(error);

  const erroresPermitidos = new Set([
    "ResourceNotFoundException",
    "InternalServerError",
    "InternalServerErrorException",
    "ServiceUnavailable",
    "ServiceUnavailableException",
    "RequestTimeout",
    "RequestTimeoutException",
    "TimeoutError",
  ]);

  if (erroresPermitidos.has(nombre)) {
    return true;
  }

  const codigo = codigoError(error);

  if (
    codigo &&
    ["ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"].includes(
      codigo,
    )
  ) {
    return true;
  }

  const status = statusHttp(error);

  return status !== undefined && status >= 500;
}

export function clonarComando(comando: any): any {
  return new comando.constructor(comando.input);
}

/* ────────────────────────────────────────────────────────────────────────
 * Circuit Breaker de failover DynamoDB.
 *
 * Estados CERRADO | ABIERTO | SEMI_ABIERTO, por instancia Lambda (AD-9
 * descarta explícitamente un estado compartido entre invocaciones).
 *
 * SEMI_ABIERTO no se persiste como estado adicional: es la transición
 * síncrona que ocurre dentro de una misma invocación cuando el cooldown
 * ya expiró y se reintenta la primaria antes de decidir CERRADO/ABIERTO.
 * ────────────────────────────────────────────────────────────────────── */
export type EstadoRuptor = "CERRADO" | "ABIERTO" | "SEMI_ABIERTO";

export interface ClienteEnviable {
  send(comando: any): Promise<any>;
}

export interface OpcionesRuptorDynamo {
  clientePrincipal: ClienteEnviable;
  clienteRespaldo: ClienteEnviable;
  umbralFallos?: number;
  duracionCooldownMs?: number;
  debeHacerFailover?: (error: unknown) => boolean;
  clonarComando?: (comando: any) => any;
  /** Reloj inyectable para pruebas deterministas del cooldown. */
  reloj?: () => number;
  regionPrincipal?: string;
  regionRespaldo?: string;
}

export interface CircuitBreakerDynamo {
  enviar(comando: any, correlationId?: string): Promise<any>;
  estado(): EstadoRuptor;
  contadorFallos(): number;
}

export function crearRuptorDynamo(opciones: OpcionesRuptorDynamo): CircuitBreakerDynamo {
  const {
    clientePrincipal,
    clienteRespaldo,
    umbralFallos = UMBRAL_FALLOS,
    duracionCooldownMs = DURACION_COOLDOWN_MS,
    debeHacerFailover: predicadoFailover = debeHacerFailover,
    clonarComando: clonar = clonarComando,
    reloj = Date.now,
    regionPrincipal: regionP = regionPrincipal,
    regionRespaldo: regionR = regionRespaldo,
  } = opciones;

  const registrador = crearRegistrador({
    componente: "circuitBreakerDynamo",
    regionPrincipal: regionP,
    regionRespaldo: regionR,
  });

  let estadoActual: EstadoRuptor = "CERRADO";
  let contador = 0;
  let cooldownHasta = 0;

  function emitirEstado(log: ReturnType<typeof registrador.hijo>): void {
    emitirMetricaEMF("RuptorEstado", 1, {
      dimensiones: { estado: estadoActual },
    });
    log.info("ruptor_estado", { estado: estadoActual, contadorFallos: contador });
  }

  async function usarReplica(comando: any, log: ReturnType<typeof registrador.hijo>): Promise<any> {
    if (regionP === regionR) {
      /*
       * Guard defensivo (comportamiento preexistente antes del refactor):
       * nunca "hacer failover" a la misma región por una mala
       * configuración — no aporta ninguna protección real.
       */
      const errorMismaRegion = new Error(
        `No se realiza failover: regionPrincipal y regionRespaldo son la misma región (${regionP})`,
      );

      log.error("ruptor_replica_misma_region", { region: regionP });

      throw errorMismaRegion;
    }

    try {
      const resultado = await clienteRespaldo.send(clonar(comando));

      log.info("ruptor_replica_ok", { estado: estadoActual });

      return resultado;
    } catch (errorReplica) {
      emitirMetricaEMF("RuptorReplicaFallo", 1, { dimensiones: { estado: estadoActual } });
      log.error("ruptor_replica_fallo", {
        motivo: errorReplica instanceof Error ? errorReplica.message : "desconocido",
      });

      throw errorReplica;
    }
  }

  return {
    estado: () => estadoActual,
    contadorFallos: () => contador,

    async enviar(comando: any, correlationId?: string): Promise<any> {
      const log = registrador.hijo({ correlationId });

      if (estadoActual === "ABIERTO") {
        if (reloj() < cooldownHasta) {
          emitirMetricaEMF("RuptorRechazoControlado", 1, { dimensiones: { estado: estadoActual } });
          log.warn("ruptor_rechazo_controlado", { cooldownHasta });

          return usarReplica(comando, log);
        }

        /* Cooldown vencido: transición síncrona a SEMI_ABIERTO. */
        estadoActual = "SEMI_ABIERTO";
        log.info("ruptor_semi_abierto_prueba", {});

        try {
          const resultado = await clientePrincipal.send(comando);

          estadoActual = "CERRADO";
          contador = 0;
          emitirMetricaEMF("RuptorRecuperacion", 1, {});
          emitirEstado(log);

          return resultado;
        } catch (error) {
          if (!predicadoFailover(error)) {
            /*
             * La primaria sí respondió (error no elegible para failover,
             * p. ej. validación): no dejar el breaker colgado en
             * SEMI_ABIERTO hasta el próximo cold start.
             */
            estadoActual = "CERRADO";
            contador = 0;

            throw error;
          }

          estadoActual = "ABIERTO";
          cooldownHasta = reloj() + duracionCooldownMs;
          emitirMetricaEMF("RuptorReapertura", 1, {});
          emitirEstado(log);

          return usarReplica(comando, log);
        }
      }

      /* CERRADO */
      try {
        const resultado = await clientePrincipal.send(comando);

        contador = 0;

        return resultado;
      } catch (error) {
        if (!predicadoFailover(error)) {
          throw error;
        }

        contador += 1;
        emitirMetricaEMF("RuptorErrorPrimaria", 1, { dimensiones: { estado: estadoActual } });

        if (contador < umbralFallos) {
          log.warn("ruptor_error_bajo_umbral", { contadorFallos: contador, umbralFallos });

          throw error;
        }

        estadoActual = "ABIERTO";
        cooldownHasta = reloj() + duracionCooldownMs;
        emitirEstado(log);
        log.error("ruptor_abre", { contadorFallos: contador, umbralFallos, motivo: nombreError(error) });

        return usarReplica(comando, log);
      }
    },
  };
}

/**
 * Envuelve un cliente para inyectar el fallo simulado de la primaria sin
 * borrar ninguna réplica real. Es el mismo mecanismo de simulación que
 * usan los experimentos de caos automatizados (6.4).
 */
export function envolverConSimulacion(
  cliente: ClienteEnviable,
  obtenerFlag: () => boolean = () => process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL === "true",
): ClienteEnviable {
  return {
    send(comando: any) {
      if (obtenerFlag()) {
        const errorSimulado = new Error("Fallo simulado de la réplica principal");

        errorSimulado.name = "ResourceNotFoundException";

        return Promise.reject(errorSimulado);
      }

      return cliente.send(comando);
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────
 * Wiring de producción.
 * ────────────────────────────────────────────────────────────────────── */
function crearCliente(region: string, endpoint?: string): DynamoDBDocumentClient {
  const cliente = new DynamoDBClient({
    region,
    maxAttempts: endpoint ? 3 : 1,

    ...(endpoint
      ? {
          endpoint,
          credentials: {
            accessKeyId: "local",
            secretAccessKey: "local",
          },
        }
      : {}),
  });

  return DynamoDBDocumentClient.from(cliente, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}

const clienteLocal = endpointLocal ? crearCliente(regionPrincipal, endpointLocal) : null;

const clientePrincipalReal = endpointLocal ? null : crearCliente(regionPrincipal);

const clienteRespaldoReal = endpointLocal ? null : crearCliente(regionRespaldo);

const ruptorProduccion: CircuitBreakerDynamo | null =
  clientePrincipalReal && clienteRespaldoReal
    ? crearRuptorDynamo({
        clientePrincipal: envolverConSimulacion(clientePrincipalReal),
        clienteRespaldo: clienteRespaldoReal,
      })
    : null;

async function enviarConFailover(comando: Parameters<DynamoDBDocumentClient["send"]>[0]): Promise<any> {
  /*
   * En desarrollo local conservamos exactamente el comportamiento
   * anterior: un único cliente, sin breaker (no hay réplica que probar).
   */
  if (clienteLocal) {
    return clienteLocal.send(comando);
  }

  if (!ruptorProduccion) {
    throw new Error("No se pudieron inicializar los clientes DynamoDB");
  }

  return ruptorProduccion.enviar(comando);
}

/*
 * El Proxy es importante:
 *
 * Hacia TypeScript sigue siendo un DynamoDBDocumentClient real,
 * por lo que GetCommand, QueryCommand, UpdateCommand, etc.
 * conservan sus tipos de respuesta.
 *
 * En ejecución interceptamos solamente send() para pasar por el breaker.
 */
const clienteBase = clienteLocal || clientePrincipalReal;

if (!clienteBase) {
  throw new Error("No fue posible crear el cliente DynamoDB");
}

export const baseDatos = new Proxy(clienteBase, {
  get(target, propiedad, receptor) {
    if (propiedad === "send") {
      return (comando: Parameters<DynamoDBDocumentClient["send"]>[0]) => enviarConFailover(comando);
    }

    const valor = Reflect.get(target, propiedad, receptor);

    if (typeof valor === "function") {
      return valor.bind(target);
    }

    return valor;
  },
}) as DynamoDBDocumentClient;

export function nombreTabla(): string {
  const nombre = process.env.NOMBRE_TABLA;

  if (!nombre) {
    throw new Error("Falta la variable de entorno NOMBRE_TABLA");
  }

  return nombre;
}

/** Solo para diagnóstico/pruebas de integración: estado actual del breaker de producción. */
export function estadoRuptorProduccion(): EstadoRuptor | "LOCAL" {
  return ruptorProduccion ? ruptorProduccion.estado() : "LOCAL";
}
