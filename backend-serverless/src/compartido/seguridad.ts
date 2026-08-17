import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { ErrorAplicacion } from "./respuestas.js";

export type RolIdentidad = "PROFESOR" | "GRUPO";

export interface IdentidadValidada {
  sub: string;
  rol: RolIdentidad;
}

type Claims = Record<string, string | number | boolean | string[] | undefined>;

function claimsDesdeEvento(event: APIGatewayProxyEventV2): Claims {
  const authorizer = (event.requestContext as unknown as { authorizer?: unknown }).authorizer as
    | { jwt?: { claims?: Claims } }
    | undefined;
  const claims = authorizer?.jwt?.claims;

  if (!claims) {
    throw new ErrorAplicacion("Falta una identidad válida", 401, "SIN_IDENTIDAD");
  }

  return claims;
}

function gruposDesdeClaim(valor: Claims["cognito:groups"]): string[] {
  if (Array.isArray(valor)) return valor.map(String);
  if (typeof valor !== "string") return [];

  const texto = valor.trim();
  if (!texto) return [];

  if (texto.startsWith("[")) {
    try {
      const lista = JSON.parse(texto) as unknown;
      if (Array.isArray(lista)) return lista.map(String);
    } catch {
      return [];
    }
  }

  return texto.split(",").map((grupo) => grupo.trim()).filter(Boolean);
}

export function identidadDesdeEvento(event: APIGatewayProxyEventV2): IdentidadValidada {
  const claims = claimsDesdeEvento(event);
  const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
  const roles = gruposDesdeClaim(claims["cognito:groups"])
    .filter((grupo): grupo is RolIdentidad => grupo === "PROFESOR" || grupo === "GRUPO");

  if (!sub) {
    throw new ErrorAplicacion("Identidad inválida", 401, "SUB_INVALIDO");
  }

  if (roles.length !== 1) {
    throw new ErrorAplicacion("Rol de identidad inválido", 403, "ROL_INVALIDO");
  }

  return { sub, rol: roles[0]! };
}

export function exigirRol(
  event: APIGatewayProxyEventV2,
  rolEsperado: RolIdentidad,
): IdentidadValidada {
  const identidad = identidadDesdeEvento(event);
  if (identidad.rol !== rolEsperado) {
    throw new ErrorAplicacion("Acceso no autorizado", 403, "ROL_INVALIDO");
  }
  return identidad;
}

export function contextoDesdeEvento(event: APIGatewayProxyEventV2): IdentidadValidada {
  return exigirRol(event, "GRUPO");
}

export function validarProfesorDesdeEvento(event: APIGatewayProxyEventV2): IdentidadValidada {
  return exigirRol(event, "PROFESOR");
}
