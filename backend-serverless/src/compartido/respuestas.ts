import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";

import { crearRegistrador } from "./observabilidad.js";

export class ErrorAplicacion extends Error {
  constructor(
    mensaje: string,
    public readonly estado = 400,
    public readonly codigo = "ERROR_APLICACION",
  ) {
    super(mensaje);
    this.name = "ErrorAplicacion";
  }
}

export function respuestaJson(
  estado: number,
  contenido: unknown,
): APIGatewayProxyResultV2 {
  return {
    statusCode: estado,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": process.env.ORIGEN_CORS || "*",
    },
    body: JSON.stringify(contenido),
  };
}

export function leerJson<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    throw new ErrorAplicacion("La solicitud no contiene datos", 400, "CUERPO_VACIO");
  }

  try {
    return JSON.parse(event.body) as T;
  } catch {
    throw new ErrorAplicacion("El JSON enviado no es válido", 400, "JSON_INVALIDO");
  }
}

export function responderError(
  error: unknown,
  event?: Pick<APIGatewayProxyEventV2, "requestContext">,
): APIGatewayProxyResultV2 {
  const correlationId = event?.requestContext?.requestId;
  const log = crearRegistrador({ correlationId, componente: "api" });

  if (error instanceof ErrorAplicacion) {
    log.warn("error_aplicacion", { codigo: error.codigo, estado: error.estado, mensaje: error.message });

    return respuestaJson(error.estado, {
      ok: false,
      codigo: error.codigo,
      error: error.message,
    });
  }

  log.error("error_interno", {
    mensaje: error instanceof Error ? error.message : "desconocido",
    nombre: error instanceof Error ? error.name : undefined,
  });

  return respuestaJson(500, {
    ok: false,
    codigo: "ERROR_INTERNO",
    error: "Ocurrió un error interno",
  });
}
