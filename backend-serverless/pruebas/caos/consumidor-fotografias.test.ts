import type { SQSEvent } from "aws-lambda";
import { afterEach, describe, expect, it } from "vitest";

import { procesarLote, type PuertoInspectorFoto } from "../../src/fotografias/consumidor.js";
import { reconciliar } from "../../src/fotografias/reconciliador.js";
import type { IntentoFoto, PuertoFotografias } from "../../src/fotografias/servicio.js";
import { redriveFotografiaAutorizada } from "./redrive-fotografias.js";
import { escribirEvidenciaCaos } from "./evidencia.js";

/*
 * Historia 6.5 — Experimento automatizado del consumidor fotográfico.
 *
 * Ejecuta código real (no dobles): `procesarLote`, `reconciliar` y
 * `redriveFotografiaAutorizada` (que a su vez usa
 * `ServicioFotografias.reintentar`, el mismo código que expone
 * `POST /api/profesor/fotografias/{trabajoId}/reintento`) son
 * exactamente las funciones que usa producción. Solo se reemplaza el
 * repositorio DynamoDB y el inspector S3 por implementaciones en
 * memoria: este repositorio no requiere AWS real para `npm run pruebas`.
 *
 * `CAOS_FOTOS_TRABAJO_ID` es el mismo mecanismo de acotamiento que
 * usa producción (parámetro `CaosFotosTrabajoId` en template.yaml):
 * solo el trabajo de prueba indicado falla; cualquier otro trabajo en
 * la misma cola se procesa con normalidad.
 */

const MAX_RECEIVE_COUNT = 4; // Igual que aws_sqs_queue.fotografias.redrive_policy en main.tf.

function fila(): { bytes: Uint8Array; mime: string } {
  return { bytes: new Uint8Array([255, 216, 255]), mime: "image/jpeg" };
}

class RepoFotografiasEnMemoria implements PuertoFotografias {
  private items = new Map<string, IntentoFoto>();
  llamadasCompletar = 0;

  sembrar(item: IntentoFoto): void {
    this.items.set(item.trabajoId, { ...item });
  }

  async crear(item: IntentoFoto): Promise<void> {
    this.items.set(item.trabajoId, { ...item });
  }

  async obtener(trabajoId: string): Promise<IntentoFoto | null> {
    const item = this.items.get(trabajoId);
    return item ? { ...item } : null;
  }

  async registrarVersionYEncolar(datos: {
    trabajoId: string;
    intentoId: string;
    bucket: string;
    key: string;
    versionId: string;
  }): Promise<"NUEVO" | "DUPLICADO" | "VERSION_CONFLICTIVA"> {
    const item = this.items.get(datos.trabajoId);
    if (!item) throw new Error("Intento no encontrado");

    if (item.versionId) {
      return item.versionId === datos.versionId ? "DUPLICADO" : "VERSION_CONFLICTIVA";
    }

    item.versionId = datos.versionId;
    item.clave = datos.key;
    item.estado = "ENCOLADO";
    return "NUEVO";
  }

  async adquirirLease(trabajoId: string, _intentoId: string, hasta: string): Promise<boolean> {
    const item = this.items.get(trabajoId);
    if (!item) return false;

    const leaseVencido = item.leaseUntil ? Date.parse(item.leaseUntil) < Date.now() : false;
    if (item.estado !== "ENCOLADO" && !(item.estado === "PROCESANDO" && leaseVencido)) return false;

    item.estado = "PROCESANDO";
    item.leaseUntil = hasta;
    return true;
  }

  async completar(trabajoId: string, _intentoId: string, _efecto: Record<string, unknown>): Promise<void> {
    const item = this.items.get(trabajoId);
    if (!item || item.estado !== "PROCESANDO") throw new Error("Estado inválido para completar");

    item.estado = "COMPLETADO";
    delete item.leaseUntil;
    this.llamadasCompletar += 1;
  }

  async fallar(trabajoId: string, _intentoId: string, causa: string, estado: "FALLIDO" | "EXPIRADO" = "FALLIDO"): Promise<boolean> {
    const item = this.items.get(trabajoId);
    if (!item) return false;

    const estadosFallables = new Set<IntentoFoto["estado"]>(["PENDIENTE_CARGA", "ENCOLADO", "PROCESANDO"]);
    if (!estadosFallables.has(item.estado)) return false;

    item.estado = estado;
    item.causa = causa;
    delete item.leaseUntil;
    return true;
  }

  async listarVencidos(): Promise<IntentoFoto[]> {
    return [];
  }
}

function intento(trabajoId: string): IntentoFoto {
  const ahora = new Date().toISOString();
  return {
    sesionId: "sesion-caos",
    grupoId: "grupo-caos",
    trabajoId,
    intentoId: `intento-${trabajoId}`,
    estado: "PENDIENTE_CARGA",
    mime: "image/jpeg",
    tamano: 3,
    clave: `entradas/sesion-caos/grupo-caos/${trabajoId}/intento-${trabajoId}`,
    creadoEn: ahora,
    actualizadoEn: ahora,
    numeroIntento: 1,
  };
}

function mensajeS3(trabajoId: string): SQSEvent["Records"][number] {
  const intentoId = `intento-${trabajoId}`;
  return {
    messageId: `msg-${trabajoId}`,
    body: JSON.stringify({
      Records: [
        {
          eventID: trabajoId,
          eventTime: "2026-08-17T12:00:00Z",
          s3: {
            bucket: { name: "privado" },
            object: { key: `entradas/sesion-caos/grupo-caos/${trabajoId}/${intentoId}`, versionId: "v1" },
          },
        },
      ],
    }),
  } as unknown as SQSEvent["Records"][number];
}

function eventoDe(...trabajoIds: string[]): SQSEvent {
  return { Records: trabajoIds.map((id) => mensajeS3(id)) } as SQSEvent;
}

function mensajeDlq(trabajoId: string): SQSEvent {
  const intentoId = `intento-${trabajoId}`;
  return {
    Records: [
      {
        messageId: `dlq-${trabajoId}`,
        body: JSON.stringify({
          Records: [{ s3: { object: { key: `entradas/sesion-caos/grupo-caos/${trabajoId}/${intentoId}` } } }],
        }),
      },
    ],
  } as unknown as SQSEvent;
}

const lectorOk: PuertoInspectorFoto = { inspeccionar: async () => ({ tamano: 3, ...fila() }) };

describe("Chaos Engineering — fallo controlado del consumidor fotográfico (6.5)", () => {
  afterEach(() => {
    delete process.env.CAOS_FOTOS;
    delete process.env.CAOS_FOTOS_TRABAJO_ID;
  });

  it("agota reintentos hasta DLQ, no afecta otros trabajos, y el redrive recupera PROCESADA sin duplicar efecto", async () => {
    const repo = new RepoFotografiasEnMemoria();
    const objetivoId = "trabajo-objetivo-caos";
    const controlId = "trabajo-control";

    repo.sembrar(intento(objetivoId));
    repo.sembrar(intento(controlId));

    const aserciones: string[] = [];
    let resultadoTexto =
      "PASA: reintentos agotados sin duplicar efecto; DLQ y reconciliador marcan FALLIDO/REINTENTOS_AGOTADOS; el redrive autorizado (ServicioFotografias.reintentar + nueva carga) recupera PROCESADA con un único efecto de dominio; el trabajo de control nunca se vio afectado.";

    try {
      // ── Estado estable: ambos trabajos PENDIENTE_CARGA, caos apagado ──
      process.env.CAOS_FOTOS = "false";
      expect((await repo.obtener(objetivoId))?.estado).toBe("PENDIENTE_CARGA");
      aserciones.push("Estado estable: ambos trabajos (objetivo y control) inician en PENDIENTE_CARGA con CAOS_FOTOS apagado.");

      // ── Fallo inyectado: acotado al trabajo objetivo únicamente ────────
      process.env.CAOS_FOTOS = "true";
      process.env.CAOS_FOTOS_TRABAJO_ID = objetivoId;

      for (let intentoEntrega = 1; intentoEntrega <= MAX_RECEIVE_COUNT; intentoEntrega += 1) {
        const salida = await procesarLote(eventoDe(objetivoId, controlId), repo, true, lectorOk, "privado", objetivoId);
        expect(salida.batchItemFailures).toEqual([{ itemIdentifier: `msg-${objetivoId}` }]);
      }
      aserciones.push(
        `El trabajo objetivo falló en las ${MAX_RECEIVE_COUNT} entregas simuladas (igual a redrive_policy.maxReceiveCount en main.tf); en ninguna se completó ni se duplicó efecto de dominio.`,
      );

      expect((await repo.obtener(objetivoId))?.estado).toBe("ENCOLADO"); // Nunca llegó a completar.
      expect((await repo.obtener(controlId))?.estado).toBe("COMPLETADO");
      aserciones.push("Otros trabajos en la misma cola (control) no se ven afectados: terminan COMPLETADO en la primera entrega, en cada una de las 4 iteraciones sin duplicar el efecto.");
      expect(repo.llamadasCompletar).toBe(1);

      // ── Traslado a DLQ: el reconciliador marca el trabajo terminal ────
      await reconciliar(mensajeDlq(objetivoId), repo);
      const traslaDoADlq = await repo.obtener(objetivoId);
      expect(traslaDoADlq?.estado).toBe("FALLIDO");
      expect(traslaDoADlq?.causa).toBe("REINTENTOS_AGOTADOS");
      aserciones.push("Al agotar reintentos, el reconciliador (conectado a la DLQ) marca el intento FALLIDO con causa REINTENTOS_AGOTADOS, sin reintentar por sí solo (AD-5).");

      // ── Apagado del caos (reversible) + redrive autorizado documentado ─
      process.env.CAOS_FOTOS = "false";
      process.env.CAOS_FOTOS_TRABAJO_ID = "";

      const firmadorFalso = { firmar: async () => "https://url-firmada.invalid/redrive" };
      const { nuevoIntentoId, resultado: salidaRedrive } = await redriveFotografiaAutorizada(repo, firmadorFalso, lectorOk, {
        trabajoId: objetivoId,
        sesionId: "sesion-caos",
        grupoId: "grupo-caos",
        profesorSub: "profesor-sub-caos",
        nuevaVersionId: "v2-redrive",
        bucketEsperado: "privado",
      });

      expect(nuevoIntentoId).not.toBe(`intento-${objetivoId}`); // Nuevo intento enlazado al anterior (AD-5), no el mismo mensaje.
      expect(salidaRedrive.batchItemFailures).toEqual([]);

      const recuperado = await repo.obtener(objetivoId);
      expect(recuperado?.estado).toBe("COMPLETADO");
      expect(recuperado?.intentoId).toBe(nuevoIntentoId);
      expect(repo.llamadasCompletar).toBe(2); // 1 del control + 1 del objetivo tras el redrive; nunca duplicado.
      aserciones.push(
        "El redrive autorizado (AD-5: nuevo intento enlazado al anterior, vía ServicioFotografias.reintentar) procesa la nueva carga con caos apagado: el trabajo objetivo termina COMPLETADO (externamente PROCESADA) con un único efecto de dominio, sin reanudar directamente el intento terminal.",
      );
    } catch (error) {
      resultadoTexto = `FALLA: ${error instanceof Error ? error.message : String(error)}`;

      throw error;
    } finally {
      // Se escribe siempre (éxito o fallo): la evidencia nunca queda
      // congelada en una corrida previa exitosa mientras el estado real es de falla.
      escribirEvidenciaCaos("_bmad-output/implementation-artifacts/experimento-chaos-fotografias.md", {
        titulo: "Evidencia — Chaos: fallo controlado del consumidor fotográfico y redrive (Historia 6.5)",
        estadoEstable:
          "CAOS_FOTOS=false, cola principal simulada vacía, DLQ vacía; trabajo objetivo y trabajo de control en PENDIENTE_CARGA.",
        hipotesis:
          "Con CAOS_FOTOS=true y CAOS_FOTOS_TRABAJO_ID fijado al trabajo objetivo, solo ese trabajo falla en cada entrega; tras maxReceiveCount entregas el mensaje llega a la DLQ, el reconciliador (suscrito a la propia DLQ) lo marca FALLIDO y drena el mensaje; el redrive autorizado (AD-5: nuevo intento enlazado al anterior, no un redrive crudo de SQS) lo recupera hasta COMPLETADO (PROCESADA) sin duplicar el efecto ni afectar al trabajo de control.",
        falloInyectado: `CAOS_FOTOS=true, CAOS_FOTOS_TRABAJO_ID=${objetivoId} (mismo mecanismo de src/fotografias/consumidor.ts), simulando ${MAX_RECEIVE_COUNT} entregas SQS.`,
        radioImpacto:
          "Limitado a un único trabajo de prueba (trabajo-objetivo-caos); el trabajo de control en la misma cola se procesa con normalidad en todo momento.",
        aserciones,
        resultado: resultadoTexto,
        recuperacion:
          "CAOS_FOTOS restaurado a 'false' y CAOS_FOTOS_TRABAJO_ID vacío (afterEach lo refuerza); trabajo objetivo verificado en estado terminal COMPLETADO, con el nuevo intentoId autorizado, tras el redrive.",
      });
    }
  });
});
