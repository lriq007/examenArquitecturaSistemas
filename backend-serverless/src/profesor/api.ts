import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

import {
  leerJson,
  responderError,
  respuestaJson,
} from "../compartido/respuestas.js";
import {
  validarProfesorDesdeEvento,
} from "../compartido/seguridad.js";
import {
  repositorioProfesor,
} from "./repositorio.js";
import {
  crearSesiones,
  ejecutarAccionSesion,
  ingresarProfesor,
  listarSesionesProfesor,
  obtenerControlSesion,
} from "./servicio.js";
import type {
  AccionSesion,
  CrearSesionesEntrada,
} from "./servicio.js";

interface IngresoProfesorEntrada {
  usuario: string;
  clave: string;
  claveNueva?: string;
  sesionChallenge?: string;
}

interface AccionEntrada {
  accion: AccionSesion;
}

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;

    if (
      ruta === "/api/profesor/ingresar" &&
      metodo === "POST"
    ) {
      const entrada =
        leerJson<IngresoProfesorEntrada>(event);

      return respuestaJson(
        200,
        await ingresarProfesor({
          usuario: String(entrada.usuario || ""),
          clave: String(entrada.clave || ""),
          claveNueva: String(entrada.claveNueva || ""),
          sesionChallenge: String(entrada.sesionChallenge || ""),
        }),
      );
    }

    const profesor = validarProfesorDesdeEvento(event);

    if (
      ruta === "/api/profesor/sesiones" &&
      metodo === "GET"
    ) {
      return respuestaJson(
        200,
        await listarSesionesProfesor(
          profesor.sub,
          repositorioProfesor,
        ),
      );
    }

    if (
      ruta === "/api/profesor/sesiones" &&
      metodo === "POST"
    ) {
      const entrada =
        leerJson<CrearSesionesEntrada>(event);

      return respuestaJson(
        201,
        await crearSesiones(
          entrada,
          profesor.sub,
          repositorioProfesor,
        ),
      );
    }

    const detalle = ruta.match(
      /^\/api\/profesor\/sesiones\/([^/]+)$/,
    );

    const sesionIdDetalle = detalle?.[1];

    if (sesionIdDetalle && metodo === "GET") {
      return respuestaJson(
        200,
        await obtenerControlSesion(
          decodeURIComponent(sesionIdDetalle),
          profesor.sub,
          repositorioProfesor,
        ),
      );
    }

    const acciones = ruta.match(
      /^\/api\/profesor\/sesiones\/([^/]+)\/acciones$/,
    );

    const sesionIdAccion = acciones?.[1];

    if (sesionIdAccion && metodo === "POST") {
      const entrada = leerJson<AccionEntrada>(event);

      return respuestaJson(
        200,
        await ejecutarAccionSesion(
          decodeURIComponent(sesionIdAccion),
          entrada.accion,
          profesor.sub,
          repositorioProfesor,
        ),
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
