import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

import {
  ErrorAplicacion,
  responderError,
  respuestaJson,
} from "../compartido/respuestas.js";

import {
  validarProfesorDesdeEvento,
} from "../compartido/seguridad.js";
import { exigirSesionProfesor } from "../compartido/alcance.js";

import {
  obtenerKpisSesion,
} from "./servicio.js";

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const profesor = validarProfesorDesdeEvento(event);

    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;

    const coincidencia = ruta.match(
      /^\/api\/analytics\/kpis\/([^/]+)$/,
    );

    if (coincidencia?.[1] && metodo === "GET") {
      const sesionId =
        decodeURIComponent(coincidencia[1]);

      const uuidValido =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      if (!uuidValido.test(sesionId)) {
        throw new ErrorAplicacion(
          "El identificador de sesión no es válido",
          400,
          "SESION_ID_INVALIDO",
        );
      }

      await exigirSesionProfesor(profesor.sub, sesionId);

      return respuestaJson(
        200,
        await obtenerKpisSesion(sesionId),
      );
    }

    return respuestaJson(404, {
      ok: false,
      error: "Ruta no encontrada",
    });
  } catch (error) {
    return responderError(error, event);
  }
}
