import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  leerJson,
  responderError,
  respuestaJson,
} from "../compartido/respuestas.js";
import { repositorioAcceso } from "./repositorio.js";
import { ingresarConCodigo } from "./servicio.js";

interface CuerpoIngreso {
  codigo?: string;
  nombreGrupo?: string;
}

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;

    if (ruta === "/api/acceso/ingresar" && metodo === "POST") {
      const cuerpo = leerJson<CuerpoIngreso>(event);

      const resultado = await ingresarConCodigo(
        cuerpo.codigo || "",
        cuerpo.nombreGrupo || "",
        repositorioAcceso,
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
