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
import type {
  BubbleMapDatos,
} from "./repositorio.js";
import {
  repositorioFase2,
} from "./repositorio.js";
import {
  asignarDesafioAleatorio,
  completarBubbleMap,
  guardarBubbleMap,
  iniciarFase2,
  marcarListoFase2,
  obtenerEstadoFase2,
  obtenerRankingFase2,
  seleccionarDesafio,
} from "./servicio.js";
import type {
  EtapaListaFase2,
} from "./servicio.js";

interface ListoEntrada {
  etapa: EtapaListaFase2;
}

interface SeleccionEntrada {
  temaId: string;
  desafioId: string;
}

export async function manejador(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const { sesionId, grupoId } =
      await contextoGrupoDesdeEvento(event);
    const ruta = event.requestContext.http.path;
    const metodo = event.requestContext.http.method;

    if (
      ruta === "/api/fase2/estado" &&
      metodo === "GET"
    ) {
      return respuestaJson(
        200,
        await obtenerEstadoFase2(
          sesionId,
          grupoId,
          repositorioFase2,
        ),
      );
    }

    if (
      ruta === "/api/fase2/iniciar" &&
      metodo === "POST"
    ) {
      return respuestaJson(
        200,
        await iniciarFase2(
          sesionId,
          grupoId,
          repositorioFase2,
        ),
      );
    }

    if (
      ruta === "/api/fase2/listo" &&
      metodo === "POST"
    ) {
      const entrada = leerJson<ListoEntrada>(event);

      return respuestaJson(
        200,
        await marcarListoFase2(
          sesionId,
          grupoId,
          entrada.etapa,
          repositorioFase2,
        ),
      );
    }

    if (
      ruta === "/api/fase2/seleccion" &&
      metodo === "POST"
    ) {
      const entrada = leerJson<SeleccionEntrada>(event);

      return respuestaJson(
        200,
        await seleccionarDesafio(
          sesionId,
          grupoId,
          String(entrada.temaId || ""),
          String(entrada.desafioId || ""),
          repositorioFase2,
        ),
      );
    }

    if (
      ruta === "/api/fase2/asignar-azar" &&
      metodo === "POST"
    ) {
      return respuestaJson(
        200,
        await asignarDesafioAleatorio(
          sesionId,
          grupoId,
          repositorioFase2,
        ),
      );
    }

    if (
      ruta === "/api/fase2/bubblemap/guardar" &&
      metodo === "POST"
    ) {
      const entrada = leerJson<Partial<BubbleMapDatos>>(event);

      return respuestaJson(
        200,
        await guardarBubbleMap(
          sesionId,
          grupoId,
          entrada,
          repositorioFase2,
        ),
      );
    }

    if (
      ruta === "/api/fase2/bubblemap/completar" &&
      metodo === "POST"
    ) {
      const entrada = leerJson<Partial<BubbleMapDatos>>(event);

      return respuestaJson(
        200,
        await completarBubbleMap(
          sesionId,
          grupoId,
          entrada,
          repositorioFase2,
        ),
      );
    }

    if (
      ruta === "/api/fase2/ranking" &&
      metodo === "GET"
    ) {
      return respuestaJson(
        200,
        await obtenerRankingFase2(
          sesionId,
          grupoId,
          repositorioFase2,
        ),
      );
    }

    return respuestaJson(404, {
      ok: false,
      error: "Ruta de Fase 2 no encontrada",
    });
  } catch (error) {
    return responderError(error);
  }
}
