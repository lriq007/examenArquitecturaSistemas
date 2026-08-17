import { GetCommand } from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { baseDatos, nombreTabla } from "./baseDatos.js";
import { ErrorAplicacion } from "./respuestas.js";
import { exigirRol } from "./seguridad.js";

export interface AlcanceGrupo {
  sub: string;
  sesionId: string;
  grupoId: string;
}

export async function contextoGrupoDesdeEvento(
  event: APIGatewayProxyEventV2,
): Promise<AlcanceGrupo> {
  const identidad = exigirRol(event, "GRUPO");
  const resultado = await baseDatos.send(new GetCommand({
    TableName: nombreTabla(),
    Key: { PK: `IDENTIDAD#GRUPO#${identidad.sub}`, SK: "VINCULO" },
    ConsistentRead: true,
  }));
  const item = resultado.Item;
  if (!item?.sesionId || !item?.grupoId) {
    throw new ErrorAplicacion("Acceso no autorizado", 403, "ALCANCE_INVALIDO");
  }
  return {
    sub: identidad.sub,
    sesionId: String(item.sesionId),
    grupoId: String(item.grupoId),
  };
}

export async function exigirSesionProfesor(
  profesorSub: string,
  sesionId: string,
): Promise<void> {
  const resultado = await baseDatos.send(new GetCommand({
    TableName: nombreTabla(),
    Key: { PK: `SESION#${sesionId}`, SK: "METADATOS" },
    ConsistentRead: true,
  }));
  if (!resultado.Item || String(resultado.Item.profesorSub || "") !== profesorSub) {
    throw new ErrorAplicacion("Acceso no autorizado", 403, "ALCANCE_INVALIDO");
  }
}
