/*
 * Observabilidad compartida: logging estructurado con correlación y
 * métricas EMF (Embedded Metric Format) emitidas por `console.log`.
 *
 * No requiere permisos IAM nuevos: Lambda ya escribe en CloudWatch Logs
 * y CloudWatch parsea automáticamente los documentos EMF que encuentra
 * en esas líneas de log para publicarlos como métricas.
 */
import { randomUUID } from "node:crypto";

/*
 * Cualquier clave que coincida (insensible a mayúsculas) se redacta por
 * completo, sin importar el tipo de dato que contenga.
 */
/*
 * Nota: "clave" queda deliberadamente fuera de esta lista porque colisiona
 * con el campo de dominio legítimo `clave` (la key S3 del ítem fotográfico,
 * usado en fotografias/repositorio.ts y fotografias/consumidor.ts). Los
 * términos ya cubiertos (secret, credencial, contrasena, authorization,
 * jwt, apikey/api_key) son suficientemente específicos sin necesitar esa
 * palabra suelta.
 */
const PATRON_CLAVE_SECRETA =
  /token|secret|password|contrasena|authorization|jwt|credencial|apikey|api_key/i;

const REDACTADO = "[REDACTADO]";

function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function redactar(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6) {
    return "[PROFUNDIDAD_MAXIMA]";
  }

  if (Array.isArray(valor)) {
    return valor.map((item) => redactar(item, profundidad + 1));
  }

  if (esObjetoPlano(valor)) {
    const salida: Record<string, unknown> = {};

    for (const [clave, contenido] of Object.entries(valor)) {
      salida[clave] = PATRON_CLAVE_SECRETA.test(clave)
        ? REDACTADO
        : redactar(contenido, profundidad + 1);
    }

    return salida;
  }

  return valor;
}

export interface ContextoRegistro {
  correlationId?: string | undefined;
  [clave: string]: unknown;
}

export interface Registrador {
  info(evento: string, datos?: Record<string, unknown>): void;
  warn(evento: string, datos?: Record<string, unknown>): void;
  error(evento: string, datos?: Record<string, unknown>): void;
  /** Crea un registrador hijo que conserva el contexto (incluido correlationId) y agrega/sustituye campos. */
  hijo(contextoAdicional: ContextoRegistro): Registrador;
}

type Nivel = "info" | "warn" | "error";

function escribir(nivel: Nivel, linea: string): void {
  if (nivel === "error") {
    console.error(linea);
  } else if (nivel === "warn") {
    console.warn(linea);
  } else {
    console.info(linea);
  }
}

/**
 * Crea un registrador estructurado. Si no se entrega `correlationId`, se
 * genera uno nuevo que se conserva para todos los eventos de este
 * registrador (y de sus hijos, salvo que lo sobrescriban explícitamente).
 */
export function crearRegistrador(contexto: ContextoRegistro = {}): Registrador {
  const ctx: ContextoRegistro = {
    ...contexto,
    correlationId: contexto.correlationId ?? randomUUID(),
  };

  function emitir(nivel: Nivel, evento: string, datos?: Record<string, unknown>): void {
    const registro = {
      nivel,
      evento,
      timestamp: new Date().toISOString(),
      ...(redactar(ctx) as Record<string, unknown>),
      ...(datos ? (redactar(datos) as Record<string, unknown>) : {}),
    };

    escribir(nivel, JSON.stringify(registro));
  }

  return {
    info: (evento, datos) => emitir("info", evento, datos),
    warn: (evento, datos) => emitir("warn", evento, datos),
    error: (evento, datos) => emitir("error", evento, datos),
    hijo: (contextoAdicional) => crearRegistrador({ ...ctx, ...contextoAdicional }),
  };
}

export interface DimensionesMetrica {
  [nombre: string]: string;
}

export interface OpcionesMetricaEMF {
  namespace?: string;
  unidad?: string;
  dimensiones?: DimensionesMetrica;
  propiedades?: Record<string, unknown>;
}

/**
 * Emite una métrica en formato EMF por `console.log`. CloudWatch Logs
 * detecta el bloque `_aws` y publica la métrica automáticamente, sin
 * necesitar `cloudwatch:PutMetricData` ni roles IAM adicionales.
 */
export function emitirMetricaEMF(
  nombreMetrica: string,
  valor: number,
  opciones: OpcionesMetricaEMF = {},
): void {
  const namespace = opciones.namespace ?? "MisionEmprende";
  const dimensiones = opciones.dimensiones ?? {};
  const clavesDimensiones = Object.keys(dimensiones);

  const documento = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: namespace,
          Dimensions: [clavesDimensiones],
          Metrics: [{ Name: nombreMetrica, Unit: opciones.unidad ?? "Count" }],
        },
      ],
    },
    ...dimensiones,
    [nombreMetrica]: valor,
    ...(opciones.propiedades ? (redactar(opciones.propiedades) as Record<string, unknown>) : {}),
  };

  console.log(JSON.stringify(documento));
}
