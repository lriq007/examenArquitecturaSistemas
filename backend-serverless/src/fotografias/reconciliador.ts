import type { ScheduledEvent, SQSEvent, SQSBatchResponse } from "aws-lambda";

import { RepositorioFotografiasDynamo } from "./repositorio.js";
import type { PuertoFotografias } from "./servicio.js";
import { crearRegistrador, emitirMetricaEMF } from "../compartido/observabilidad.js";

const repo = new RepositorioFotografiasDynamo();

type PuertoReconciliacion = Pick<PuertoFotografias, "fallar" | "listarVencidos">;

function idsDesdeClave(valor: unknown): { trabajoId: string; intentoId: string } {
  if (typeof valor !== "string") throw new Error("Evento S3 sin clave");
  const partes = decodeURIComponent(valor.replace(/\+/g, " ")).split("/");
  if (partes.length !== 5 || partes[0] !== "entradas" || partes.some((parte) => !parte)) throw new Error("Clave S3 inválida");
  return { trabajoId: partes[3]!, intentoId: partes[4]! };
}

export async function reconciliar(event: ScheduledEvent | SQSEvent, repositorio: PuertoReconciliacion, ahora = new Date()): Promise<void | SQSBatchResponse> {
  if ("Records" in event) {
    const batchItemFailures: Array<{ itemIdentifier: string }> = [];
    for (const mensaje of event.Records) {
      const log = crearRegistrador({ correlationId: mensaje.messageId, componente: "reconciliadorFotografias" });
      try {
        const cuerpo = JSON.parse(mensaje.body) as { Records?: Array<{ s3?: { object?: { key?: unknown } } }> };
        if (!Array.isArray(cuerpo.Records) || cuerpo.Records.length === 0) throw new Error("Evento S3 sin registros");
        for (const record of cuerpo.Records) {
          const ids = idsDesdeClave(record.s3?.object?.key);
          const terminalizado = await repositorio.fallar(ids.trabajoId, ids.intentoId, "REINTENTOS_AGOTADOS");
          if (terminalizado) {
            emitirMetricaEMF("FotografiaDlqReconciliada", 1, {});
            log.warn("fotografia_dlq_reconciliada", { trabajoId: ids.trabajoId, intentoId: ids.intentoId, causa: "REINTENTOS_AGOTADOS" });
          } else {
            log.info("fotografia_dlq_ya_terminal", { trabajoId: ids.trabajoId, intentoId: ids.intentoId });
          }
        }
      } catch (error) {
        log.error("fotografia_dlq_reconciliacion_fallo", { causa: error instanceof Error ? error.message : "desconocida" });
        batchItemFailures.push({ itemIdentifier: mensaje.messageId });
      }
    }
    return { batchItemFailures };
  }
  const logProgramado = crearRegistrador({ componente: "reconciliadorFotografias" });
  const limite = new Date(ahora.getTime() - 15 * 60_000).toISOString();
  const vencidos = await repositorio.listarVencidos(limite);
  for (const item of vencidos) {
    const terminalizado = await repositorio.fallar(item.trabajoId, item.intentoId, "INTENTO_VENCIDO", "EXPIRADO");
    if (terminalizado) {
      emitirMetricaEMF("FotografiaIntentoExpirado", 1, {});
      logProgramado.warn("fotografia_intento_expirado", { trabajoId: item.trabajoId, intentoId: item.intentoId });
    } else {
      logProgramado.info("fotografia_intento_ya_terminal", { trabajoId: item.trabajoId, intentoId: item.intentoId });
    }
  }
}

export async function manejador(event: ScheduledEvent | SQSEvent): Promise<void | SQSBatchResponse> {
  return reconciliar(event, repo);
}
