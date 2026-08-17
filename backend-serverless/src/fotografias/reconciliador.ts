import type { ScheduledEvent, SQSEvent, SQSBatchResponse } from "aws-lambda";

import { RepositorioFotografiasDynamo } from "./repositorio.js";
import type { PuertoFotografias } from "./servicio.js";

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
      try {
        const cuerpo = JSON.parse(mensaje.body) as { Records?: Array<{ s3?: { object?: { key?: unknown } } }> };
        if (!Array.isArray(cuerpo.Records) || cuerpo.Records.length === 0) throw new Error("Evento S3 sin registros");
        for (const record of cuerpo.Records) {
          const ids = idsDesdeClave(record.s3?.object?.key);
          await repositorio.fallar(ids.trabajoId, ids.intentoId, "REINTENTOS_AGOTADOS");
        }
      } catch { batchItemFailures.push({ itemIdentifier: mensaje.messageId }); }
    }
    return { batchItemFailures };
  }
  const limite = new Date(ahora.getTime() - 15 * 60_000).toISOString();
  for (const item of await repositorio.listarVencidos(limite)) await repositorio.fallar(item.trabajoId, item.intentoId, "INTENTO_VENCIDO", "EXPIRADO");
}

export async function manejador(event: ScheduledEvent | SQSEvent): Promise<void | SQSBatchResponse> {
  return reconciliar(event, repo);
}
