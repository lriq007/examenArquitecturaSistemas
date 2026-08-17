import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { contextoGrupoDesdeEvento, exigirSesionProfesor } from "../compartido/alcance.js";
import { identidadDesdeEvento } from "../compartido/seguridad.js";
import { ErrorAplicacion, leerJson, responderError, respuestaJson } from "../compartido/respuestas.js";
import { FirmadorS3, RepositorioFotografiasDynamo } from "./repositorio.js";
import { ServicioFotografias } from "./servicio.js";

const servicio = new ServicioFotografias(new RepositorioFotografiasDynamo(), new FirmadorS3());

export async function manejador(event: APIGatewayProxyEventV2) {
  try {
    const ruta = event.rawPath; const metodo = event.requestContext.http.method; const trabajoId = event.pathParameters?.trabajoId;
    if (metodo === "POST" && ruta.endsWith("/fotografias")) {
      const alcance = await contextoGrupoDesdeEvento(event);
      const entrada = leerJson<{ mime: string; tamano: number }>(event);
      return respuestaJson(201, { ok: true, ...(await servicio.iniciar(alcance, entrada)) });
    }
    if (!trabajoId) throw new ErrorAplicacion("Ruta no encontrada", 404, "RUTA_NO_ENCONTRADA");
    const identidad = identidadDesdeEvento(event);
    if (metodo === "GET") {
      if (identidad.rol === "GRUPO") {
        const alcance = await contextoGrupoDesdeEvento(event); const resultado = await servicio.consultar(trabajoId, alcance);
        return respuestaJson(resultado.estado === "RECIBIDA" ? 202 : 200, { ok: true, ...resultado });
      }
      const sesionId = event.queryStringParameters?.sesionId || "";
      await exigirSesionProfesor(identidad.sub, sesionId);
      const resultado = await servicio.consultar(trabajoId, { sesionId });
      return respuestaJson(resultado.estado === "RECIBIDA" ? 202 : 200, { ok: true, ...resultado });
    }
    if (metodo === "POST" && ruta.endsWith("/reintento")) {
      if (identidad.rol !== "PROFESOR") throw new ErrorAplicacion("Acceso no autorizado", 403, "ROL_INVALIDO");
      const { sesionId, mime, tamano } = leerJson<{ sesionId: string; mime: string; tamano: number }>(event); await exigirSesionProfesor(identidad.sub, sesionId);
      return respuestaJson(201, { ok: true, ...(await servicio.reintentar(trabajoId, sesionId, identidad.sub, { mime, tamano })) });
    }
    throw new ErrorAplicacion("Ruta no encontrada", 404, "RUTA_NO_ENCONTRADA");
  } catch (error) { return responderError(error); }
}
