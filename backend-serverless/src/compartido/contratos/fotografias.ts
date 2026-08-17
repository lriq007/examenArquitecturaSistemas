export const VERSION_CONTRATO_FOTO = "1.0" as const;

export type EstadoIntentoFoto =
  | "PENDIENTE_CARGA"
  | "ENCOLADO"
  | "PROCESANDO"
  | "COMPLETADO"
  | "FALLIDO"
  | "EXPIRADO";

export type EstadoFotoExterno = "RECIBIDA" | "PROCESADA" | "FALLIDA";

export interface ReferenciaS3Foto {
  bucket: string;
  key: string;
  versionId: string;
}

export interface ComandoProcesarFotoV1 {
  schemaVersion: typeof VERSION_CONTRATO_FOTO;
  eventId: string;
  eventType: "fotografia.encolada";
  occurredAt: string;
  sesionId: string;
  grupoId: string;
  trabajoId: string;
  intentoId: string;
  objeto: ReferenciaS3Foto;
}

export function proyectarEstadoFoto(estado: EstadoIntentoFoto): EstadoFotoExterno {
  if (estado === "COMPLETADO") return "PROCESADA";
  if (estado === "FALLIDO" || estado === "EXPIRADO") return "FALLIDA";
  return "RECIBIDA";
}
