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
} from "./repositorio.js";
import {
  guardarPitch,
  iniciarPresentacionPitch,
  marcarListoFase4,
  obtenerEstadoFase4,
} from "./servicio.js";
import type {
  EtapaListaFase4,
} from "./servicio.js";

interface ListoEntrada {
  etapa: EtapaListaFase4;
}

interface PitchEntrada {
  pitch?: string;
}

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const { sesionId, grupoId } = await contextoGrupoDesdeEvento(event);

    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;

    if (ruta === "/api/fase4/estado" && metodo === "GET") {
      return respuestaJson(
        200,
        await obtenerEstadoFase4(sesionId, grupoId, repositorioFase4),
      );
    }

    if (ruta === "/api/fase4/listo" && metodo === "POST") {
      const entrada = leerJson<ListoEntrada>(event);

      return respuestaJson(
        200,
        await marcarListoFase4(
          sesionId,
          grupoId,
          entrada.etapa,
          repositorioFase4,
        ),
      );
    }

    if (ruta === "/api/fase4/pitch/guardar" && metodo === "POST") {
      const entrada = leerJson<PitchEntrada>(event);

      return respuestaJson(
        200,
        await guardarPitch(sesionId, grupoId, entrada, repositorioFase4),
      );
    }

    if (ruta === "/api/fase4/pitch/iniciar" && metodo === "POST") {
      return respuestaJson(
        200,
        await iniciarPresentacionPitch(
          sesionId,
          grupoId,
          repositorioFase4,
        ),
      );
    }

    return respuestaJson(404, {
      ok: false,
      error: "Ruta de Fase 4 no encontrada",
    });
  } catch (error) {
    return responderError(error, event);
  }
}
