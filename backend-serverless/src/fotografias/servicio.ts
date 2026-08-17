import { randomUUID } from "node:crypto";

import { ErrorAplicacion } from "../compartido/respuestas.js";
import {
  proyectarEstadoFoto,
  type EstadoIntentoFoto,
  type IntentoFoto,
  type PuertoFotografias,
  type FirmadorCarga,
  type PuertoConsultaFotos,
} from "../compartido/contratos/fotografias.js";

export type { IntentoFoto, PuertoFotografias, FirmadorCarga, PuertoConsultaFotos };

export function crearConsultaFotos(repo: PuertoFotografias): PuertoConsultaFotos {
  return {
    async verificarProcesada(trabajoId: string, sesionId: string, grupoId: string): Promise<boolean> {
      const foto = await repo.obtener(trabajoId);
      return foto?.sesionId === sesionId && foto.grupoId === grupoId && foto.estado === "COMPLETADO";
    },
  };
}

const MIME_PERMITIDOS = new Set(["image/jpeg", "image/png"]);
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_INTENTOS = 3;

export class ServicioFotografias {
  constructor(private readonly repo: PuertoFotografias, private readonly firmador: FirmadorCarga, private readonly ahora = () => new Date()) {}

  async iniciar(alcance: { sesionId: string; grupoId: string }, entrada: { mime: string; tamano: number }) {
    if (process.env.CARGAS_FOTOGRAFIAS_HABILITADAS !== "true") throw new ErrorAplicacion("Las cargas fotográficas no están habilitadas", 503, "CARGAS_DESHABILITADAS");
    if (!MIME_PERMITIDOS.has(entrada.mime)) throw new ErrorAplicacion("Formato de imagen no permitido", 422, "MIME_INVALIDO");
    if (!Number.isInteger(entrada.tamano) || entrada.tamano <= 0 || entrada.tamano > MAX_BYTES) throw new ErrorAplicacion("Tamaño de imagen no permitido", 422, "TAMANO_INVALIDO");
    const trabajoId = randomUUID(); const intentoId = randomUUID();
    const clave = `entradas/${alcance.sesionId}/${alcance.grupoId}/${trabajoId}/${intentoId}`;
    const fecha = this.ahora().toISOString();
    await this.repo.crear({ ...alcance, trabajoId, intentoId, estado: "PENDIENTE_CARGA", mime: entrada.mime, tamano: entrada.tamano, clave, creadoEn: fecha, actualizadoEn: fecha, numeroIntento: 1 });
    return { trabajoId, intentoId, urlCarga: await this.firmador.firmar(clave, entrada.mime, entrada.tamano), expiraEnSegundos: 300 };
  }

  async consultar(trabajoId: string, alcance: { sesionId: string; grupoId?: string }) {
    const item = await this.repo.obtener(trabajoId);
    if (!item || item.sesionId !== alcance.sesionId || (alcance.grupoId && item.grupoId !== alcance.grupoId)) throw new ErrorAplicacion("Trabajo no encontrado", 404, "NO_ENCONTRADO");
    return { trabajoId, estado: proyectarEstadoFoto(item.estado), intento: item.numeroIntento, actualizadoEn: item.actualizadoEn };
  }

  async reintentar(trabajoId: string, sesionId: string, profesorSub: string, carga?: { mime: string; tamano: number }) {
    const anterior = await this.repo.obtener(trabajoId);
    if (!anterior || anterior.sesionId !== sesionId) throw new ErrorAplicacion("Trabajo no encontrado", 404, "NO_ENCONTRADO");
    if (!(["FALLIDO", "EXPIRADO"] as EstadoIntentoFoto[]).includes(anterior.estado)) throw new ErrorAplicacion("El trabajo no admite reintento", 409, "ESTADO_INVALIDO");
    if (anterior.numeroIntento >= MAX_INTENTOS) throw new ErrorAplicacion("Se alcanzó el límite de intentos", 409, "LIMITE_INTENTOS");
    const mime = carga?.mime ?? anterior.mime; const tamano = carga?.tamano ?? anterior.tamano;
    if (!MIME_PERMITIDOS.has(mime) || !Number.isInteger(tamano) || tamano <= 0 || tamano > MAX_BYTES) throw new ErrorAplicacion("Archivo de recuperación inválido", 422, "ARCHIVO_INVALIDO");
    const intentoId = randomUUID(); const clave = `entradas/${anterior.sesionId}/${anterior.grupoId}/${trabajoId}/${intentoId}`; const fecha = this.ahora().toISOString();
    await this.repo.crear({ sesionId: anterior.sesionId, grupoId: anterior.grupoId, trabajoId: anterior.trabajoId, mime, tamano, intentoId, clave, estado: "PENDIENTE_CARGA", numeroIntento: anterior.numeroIntento + 1, creadoEn: fecha, actualizadoEn: fecha, intentoAnteriorId: anterior.intentoId, creadoPorSub: profesorSub });
    return { trabajoId, intentoId, urlCarga: await this.firmador.firmar(clave, mime, tamano), expiraEnSegundos: 300 };
  }
}
