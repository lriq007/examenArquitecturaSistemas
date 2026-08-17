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
  repositorioFase1,
} from "./repositorio.js";
import type {
  EtapaLista,
} from "./repositorio.js";
import {
  completarSopa,
  finalizarActividadConocidos,
  iniciarFase1,
  marcarGrupoListo,
  obtenerEstadoFase1,
  obtenerRankingFase1,
  registrarPalabra,
  seleccionarModoEquipo,
} from "./servicio.js";

interface CuerpoPalabra {
  palabra?: string;
}

interface CuerpoModo {
  modo?: string;
}

interface CuerpoListo {
  etapa?: EtapaLista;
}

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;
    const contexto = await contextoGrupoDesdeEvento(event);

    if (
      ruta === "/api/fase1/estado" &&
      metodo === "GET"
    ) {
      return respuestaJson(
        200,
        await obtenerEstadoFase1(
          contexto.sesionId,
          contexto.grupoId,
          repositorioFase1,
        ),
      );
    }

    if (
      ruta === "/api/fase1/iniciar" &&
      metodo === "POST"
    ) {
      return respuestaJson(
        200,
        await iniciarFase1(
          contexto.sesionId,
          contexto.grupoId,
          repositorioFase1,
        ),
      );
    }

    if (
      ruta === "/api/fase1/modo-equipo" &&
      metodo === "POST"
    ) {
      const cuerpo = leerJson<CuerpoModo>(event);

      return respuestaJson(
        200,
        await seleccionarModoEquipo(
          contexto.sesionId,
          contexto.grupoId,
          cuerpo.modo || "",
          repositorioFase1,
        ),
      );
    }

    if (
      ruta === "/api/fase1/listo" &&
      metodo === "POST"
    ) {
      const cuerpo = leerJson<CuerpoListo>(event);

      if (!cuerpo.etapa) {
        return respuestaJson(400, {
          ok: false,
          codigo: "ETAPA_REQUERIDA",
          error: "Debes indicar la etapa",
        });
      }

      return respuestaJson(
        200,
        await marcarGrupoListo(
          contexto.sesionId,
          contexto.grupoId,
          cuerpo.etapa,
          repositorioFase1,
        ),
      );
    }

    if (
      ruta === "/api/fase1/finalizar-conocidos" &&
      metodo === "POST"
    ) {
      return respuestaJson(
        200,
        await finalizarActividadConocidos(
          contexto.sesionId,
          contexto.grupoId,
          repositorioFase1,
        ),
      );
    }

    if (
      ruta === "/api/fase1/palabras" &&
      metodo === "POST"
    ) {
      const cuerpo = leerJson<CuerpoPalabra>(event);

      return respuestaJson(
        200,
        await registrarPalabra(
          contexto.sesionId,
          contexto.grupoId,
          cuerpo.palabra || "",
          repositorioFase1,
        ),
      );
    }

    if (
      ruta === "/api/fase1/completar" &&
      metodo === "POST"
    ) {
      return respuestaJson(
        200,
        await completarSopa(
          contexto.sesionId,
          contexto.grupoId,
          repositorioFase1,
        ),
      );
    }

    if (
      ruta === "/api/fase1/ranking" &&
      metodo === "GET"
    ) {
      return respuestaJson(
        200,
        await obtenerRankingFase1(
          contexto.sesionId,
          contexto.grupoId,
          repositorioFase1,
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
