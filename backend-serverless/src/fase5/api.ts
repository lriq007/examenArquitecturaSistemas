import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

import {
  leerJson,
  responderError,
  respuestaJson,
} from "../compartido/respuestas.js";
import { contextoGrupoDesdeEvento } from "../compartido/alcance.js";
import {
  repositorioFase4,
} from "../fase4/repositorio.js";
import {
  repositorioFase5,
} from "./repositorio.js";
import type {
  CriteriosEvaluacion,
} from "./repositorio.js";
import {
  enviarEvaluacion,
  marcarListoRankingFinal,
  obtenerEstadoFase5,
  obtenerEstadoRankingFinal,
} from "./servicio.js";

interface EvaluacionEntrada extends Partial<CriteriosEvaluacion> {
  comentario?: string;
  reflexion?: string;
}

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const { sesionId, grupoId } = await contextoGrupoDesdeEvento(event);

    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;

    if (ruta === "/api/fase5/estado" && metodo === "GET") {
      return respuestaJson(
        200,
        await obtenerEstadoFase5(
          sesionId,
          grupoId,
          repositorioFase4,
          repositorioFase5,
        ),
      );
    }

    if (ruta === "/api/fase5/evaluar" && metodo === "POST") {
      const entrada = leerJson<EvaluacionEntrada>(event);

      return respuestaJson(
        200,
        await enviarEvaluacion(
          sesionId,
          grupoId,
          entrada,
          repositorioFase4,
          repositorioFase5,
        ),
      );
    }

    if (ruta === "/api/fase5/ranking" && metodo === "GET") {
      return respuestaJson(
        200,
        await obtenerEstadoRankingFinal(sesionId, repositorioFase4),
      );
    }

    if (ruta === "/api/fase5/ranking/listo" && metodo === "POST") {
      return respuestaJson(
        200,
        await marcarListoRankingFinal(sesionId, grupoId, repositorioFase4),
      );
    }

    return respuestaJson(404, {
      ok: false,
      error: "Ruta de Fase 5 no encontrada",
    });
  } catch (error) {
    return responderError(error);
  }
}
