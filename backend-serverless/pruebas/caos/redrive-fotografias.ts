import type { SQSBatchResponse, SQSEvent } from "aws-lambda";

import { procesarLote, type PuertoInspectorFoto } from "../../src/fotografias/consumidor.js";
import { ServicioFotografias, type FirmadorCarga, type PuertoFotografias } from "../../src/fotografias/servicio.js";

/**
 * Script de redrive documentado para el trabajo fotográfico (Historia
 * 6.5), reutilizado por `pruebas/caos/consumidor-fotografias.test.ts`.
 *
 * Por qué el redrive real de este sistema es el "reintento autorizado"
 * de AD-5 y no un redrive crudo de SQS: `FuncionReconciliadorFotografias`
 * está suscrita como origen de eventos SQS de la propia DLQ
 * (`DlqFotografias` en template.yaml), así que en cuanto un mensaje
 * llega a la DLQ el reconciliador lo procesa, marca el intento
 * FALLIDO/EXPIRADO de inmediato y SQS borra ese mensaje de la DLQ. No
 * queda ningún mensaje "esperando" un redrive manual de cola. Además,
 * el intento terminal queda protegido por condiciones DynamoDB
 * (`adquirirLease` exige estado ENCOLADO) que rechazan reanudarlo
 * directamente aunque se reenviara el mismo evento S3.
 *
 * La recuperación real y documentada es la que expone
 * `POST /api/profesor/fotografias/{trabajoId}/reintento`
 * (`ServicioFotografias.reintentar`, ya implementado en la Épica 4,
 * historia 4-4): un profesor autorizado crea un nuevo intento enlazado
 * al anterior; al volver a subirse el archivo, el evento S3 resultante
 * llega a la consumidora real y el trabajo puede llegar a `PROCESADA`.
 *
 * Este script ejecuta ambos pasos con código real (no dobles):
 * `ServicioFotografias.reintentar` y `procesarLote`.
 */
export interface ContextoRedriveFotografia {
  trabajoId: string;
  sesionId: string;
  grupoId: string;
  profesorSub: string;
  /** VersionId que asignaría S3 a la nueva carga (distinta de la original). */
  nuevaVersionId: string;
  bucketEsperado: string;
}

function eventoS3DeRedrive(bucket: string, key: string, versionId: string): SQSEvent {
  return {
    Records: [
      {
        messageId: `redrive-${key}`,
        body: JSON.stringify({
          Records: [
            {
              eventTime: new Date().toISOString(),
              s3: { bucket: { name: bucket }, object: { key, versionId } },
            },
          ],
        }),
      },
    ],
  } as unknown as SQSEvent;
}

export async function redriveFotografiaAutorizada(
  repositorio: PuertoFotografias,
  firmador: FirmadorCarga,
  lector: PuertoInspectorFoto,
  contexto: ContextoRedriveFotografia,
): Promise<{ nuevoIntentoId: string; resultado: SQSBatchResponse }> {
  const servicio = new ServicioFotografias(repositorio, firmador);

  // Paso 1: reintento autorizado — crea un nuevo intento enlazado al anterior.
  const { intentoId: nuevoIntentoId } = await servicio.reintentar(
    contexto.trabajoId,
    contexto.sesionId,
    contexto.profesorSub,
  );

  // Paso 2: el profesor vuelve a subir el archivo; procesamos el evento S3 real resultante.
  const clave = `entradas/${contexto.sesionId}/${contexto.grupoId}/${contexto.trabajoId}/${nuevoIntentoId}`;
  const evento = eventoS3DeRedrive(contexto.bucketEsperado, clave, contexto.nuevaVersionId);

  const resultado = await procesarLote(evento, repositorio, false, lector, contexto.bucketEsperado, "");

  return { nuevoIntentoId, resultado };
}
