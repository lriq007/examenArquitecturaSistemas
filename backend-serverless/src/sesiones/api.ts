import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { contextoDesdeEvento } from "../compartido/seguridad.js";
import { responderError, respuestaJson } from "../compartido/respuestas.js";
import { repositorioSesiones } from "./repositorio.js";
import { obtenerSesionActual } from "./servicio.js";

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;

    if (ruta === "/api/sesiones/actual" && metodo === "GET") {
      const contexto = contextoDesdeEvento(event);
      const resultado = await obtenerSesionActual(
        contexto.sub,
        repositorioSesiones,
      );

      return respuestaJson(200, resultado);
    }

    return respuestaJson(404, {
      ok: false,
      error: "Ruta no encontrada",
    });
  } catch (error) {
    return responderError(error, event);
  }
}
