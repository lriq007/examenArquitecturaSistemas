import type { S3Event, SQSEvent, SQSBatchResponse } from "aws-lambda";

import { InspectorS3, RepositorioFotografiasDynamo } from "./repositorio.js";
import type { PuertoFotografias } from "./servicio.js";
import { VERSION_CONTRATO_FOTO, type ComandoProcesarFotoV1 } from "../compartido/contratos/fotografias.js";

const repo = new RepositorioFotografiasDynamo();
const inspector = new InspectorS3();
const CAOS = process.env.CAOS_FOTOS === "true";

function referencia(record: S3Event["Records"][number], bucketEsperado: string): ComandoProcesarFotoV1 {
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
  const partes = key.split("/");
  if (partes.length !== 5 || partes[0] !== "entradas") throw new Error("Clave S3 inválida");
  const versionId = record.s3.object.versionId;
  if (!versionId) throw new Error("El evento no contiene versionId");
  if (record.s3.bucket.name !== bucketEsperado) throw new Error("Bucket S3 no autorizado");
  return { schemaVersion: VERSION_CONTRATO_FOTO, eventId: record.s3.object.sequencer || `${key}:${versionId}`, eventType: "fotografia.encolada", occurredAt: record.eventTime, sesionId: partes[1]!, grupoId: partes[2]!, trabajoId: partes[3]!, intentoId: partes[4]!, objeto: { bucket: record.s3.bucket.name, key, versionId } };
}

export interface PuertoInspectorFoto { inspeccionar(bucket: string, key: string, versionId: string): Promise<{ tamano: number; mime: string; bytes: Uint8Array }>; }
function magicValido(mime: string, b: Uint8Array) { return mime === "image/jpeg" ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff : mime === "image/png" && b.slice(0, 8).every((v, i) => v === [137,80,78,71,13,10,26,10][i]); }

export async function procesarLote(event: SQSEvent, repositorio: PuertoFotografias, caos = false, lector: PuertoInspectorFoto = inspector, bucketEsperado = process.env.BUCKET_MULTIMEDIA || ""): Promise<SQSBatchResponse> {
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];
  for (const mensaje of event.Records) {
    try {
      const evento = JSON.parse(mensaje.body) as S3Event;
      for (const record of evento.Records ?? []) {
        const comando = referencia(record, bucketEsperado);
        if (comando.schemaVersion !== VERSION_CONTRATO_FOTO || comando.eventType !== "fotografia.encolada") throw new Error("Contrato interno inválido");
        const ref = { ...comando.objeto, trabajoId: comando.trabajoId, intentoId: comando.intentoId };
        const registro = await repositorio.registrarVersionYEncolar(ref);
        if (registro === "VERSION_CONFLICTIVA") throw new Error("Versión S3 conflictiva");
        if (caos) throw new Error("Fallo controlado de fotografía");
        const intento = await repositorio.obtener(ref.trabajoId); if (!intento || intento.intentoId !== ref.intentoId) throw new Error("Intento no encontrado");
        const objeto = await lector.inspeccionar(ref.bucket, ref.key, ref.versionId);
        if (objeto.tamano !== intento.tamano || objeto.mime !== intento.mime || !magicValido(objeto.mime, objeto.bytes)) throw new Error("Contenido S3 inválido");
        const lease = await repositorio.adquirirLease(ref.trabajoId, ref.intentoId, new Date(Date.now() + 60_000).toISOString());
        if (!lease) continue;
        await repositorio.completar(ref.trabajoId, ref.intentoId, { objeto: { bucket: ref.bucket, key: ref.key, versionId: ref.versionId } });
        console.info(JSON.stringify({ evento: "fotografia_procesada", trabajoId: ref.trabajoId, intentoId: ref.intentoId, sesionId: comando.sesionId, grupoId: comando.grupoId }));
      }
    } catch (error) {
      console.error(JSON.stringify({ evento: "fotografia_fallo", messageId: mensaje.messageId, causa: error instanceof Error ? error.message : "desconocida" }));
      batchItemFailures.push({ itemIdentifier: mensaje.messageId });
    }
  }
  return { batchItemFailures };
}

export async function manejador(event: SQSEvent): Promise<SQSBatchResponse> {
  return procesarLote(event, repo, CAOS, inspector, process.env.BUCKET_MULTIMEDIA || "");
}
