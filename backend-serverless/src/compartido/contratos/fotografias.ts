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

export interface IntentoFoto {
  sesionId: string;
  grupoId: string;
  trabajoId: string;
  intentoId: string;
  estado: EstadoIntentoFoto;
  mime: string;
  tamano: number;
  clave: string;
  creadoEn: string;
  actualizadoEn: string;
  numeroIntento: number;
  versionId?: string;
  leaseUntil?: string;
  causa?: string;
  intentoAnteriorId?: string;
  creadoPorSub?: string;
}

export interface PuertoFotografias {
  crear(intento: IntentoFoto): Promise<void>;
  obtener(trabajoId: string): Promise<IntentoFoto | null>;
  registrarVersionYEncolar(datos: {
    trabajoId: string;
    intentoId: string;
    bucket: string;
    key: string;
    versionId: string;
  }): Promise<"NUEVO" | "DUPLICADO" | "VERSION_CONFLICTIVA">;
  adquirirLease(trabajoId: string, intentoId: string, hasta: string): Promise<boolean>;
  completar(trabajoId: string, intentoId: string, efecto: Record<string, unknown>): Promise<void>;
  fallar(trabajoId: string, intentoId: string, causa: string, estado?: "FALLIDO" | "EXPIRADO"): Promise<boolean>;
  listarVencidos(ahora: string): Promise<IntentoFoto[]>;
}

export interface FirmadorCarga {
  firmar(clave: string, mime: string, tamano: number): Promise<string>;
}

export interface PuertoConsultaFotos {
  verificarProcesada(trabajoId: string, sesionId: string, grupoId: string): Promise<boolean>;
}

export function proyectarEstadoFoto(estado: EstadoIntentoFoto): EstadoFotoExterno {
  if (estado === "COMPLETADO") return "PROCESADA";
  if (estado === "FALLIDO" || estado === "EXPIRADO") return "FALLIDA";
  return "RECIBIDA";
}
