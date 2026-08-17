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
import { RepositorioFotografiasDynamo } from "../fotografias/repositorio.js";
import {
  repositorioFase3,
} from "./repositorio.js";
import {
  completarLego,
  girarRuleta,
  iniciarFase3,
  marcarListoFase3,
  obtenerEstadoFase3,
  obtenerRankingFase3,
  responderAstronauta,
} from "./servicio.js";
import type {
  EtapaListaFase3,
} from "./servicio.js";

const repositorioFotos = new RepositorioFotografiasDynamo();
const consultaFotos = { verificarProcesada: async (trabajoId: string, sesionId: string, grupoId: string) => { const foto = await repositorioFotos.obtener(trabajoId); return foto?.sesionId === sesionId && foto.grupoId === grupoId && foto.estado === "COMPLETADO"; } };

interface ListoEntrada {
  etapa: EtapaListaFase3;
}

interface LegoEntrada {
  conFoto?: boolean;
  sinFoto?: boolean;
  trabajoFotoId?: string;
}

interface AstronautaEntrada {
  alternativa: string;
}

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const { sesionId, grupoId } =
      await contextoGrupoDesdeEvento(event);

    const ruta =
      event.requestContext.http.path;
    const metodo =
      event.requestContext.http.method;

    if (
      ruta === "/api/fase3/estado" &&
      metodo === "GET"
    ) {
      return respuestaJson(
        200,
        await obtenerEstadoFase3(
          sesionId,
          grupoId,
          repositorioFase3,
        ),
      );
    }

    if (
      ruta === "/api/fase3/iniciar" &&
      metodo === "POST"
    ) {
      return respuestaJson(
        200,
        await iniciarFase3(
          sesionId,
          grupoId,
          repositorioFase3,
        ),
      );
    }

    if (
      ruta === "/api/fase3/listo" &&
      metodo === "POST"
    ) {
      const entrada =
        leerJson<ListoEntrada>(event);

      return respuestaJson(
        200,
        await marcarListoFase3(
          sesionId,
          grupoId,
          entrada.etapa,
          repositorioFase3,
        ),
      );
    }

    if (
      ruta ===
        "/api/fase3/lego/completar" &&
      metodo === "POST"
    ) {
      const entrada =
        leerJson<LegoEntrada>(event);

      return respuestaJson(
        200,
        await completarLego(
          sesionId,
          grupoId,
          entrada,
          repositorioFase3,
          consultaFotos,
        ),
      );
    }

    if (
      ruta ===
        "/api/fase3/ruleta/girar" &&
      metodo === "POST"
    ) {
      return respuestaJson(
        200,
        await girarRuleta(
          sesionId,
          grupoId,
          repositorioFase3,
        ),
      );
    }

    if (
      ruta ===
        "/api/fase3/astronauta/responder" &&
      metodo === "POST"
    ) {
      const entrada =
        leerJson<AstronautaEntrada>(event);

      return respuestaJson(
        200,
        await responderAstronauta(
          sesionId,
          grupoId,
          String(
            entrada.alternativa || "",
          ),
          repositorioFase3,
        ),
      );
    }

    if (
      ruta === "/api/fase3/ranking" &&
      metodo === "GET"
    ) {
      return respuestaJson(
        200,
        await obtenerRankingFase3(
          sesionId,
          grupoId,
          repositorioFase3,
        ),
      );
    }

    return respuestaJson(404, {
      ok: false,
      error:
        "Ruta de Fase 3 no encontrada",
    });
  } catch (error) {
    return responderError(error, event);
  }
}
