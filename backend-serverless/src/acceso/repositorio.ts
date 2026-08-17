import {
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  baseDatos,
  nombreTabla,
} from "../compartido/baseDatos.js";

export interface GrupoAcceso {
  sesionId: string;
  grupoId: string;
  nombreGrupo: string;
  codigoAcceso: string;
  cognitoUsername: string;
  grupoSub: string;
  estadoProvisionamiento: string;
}

export interface RepositorioAcceso {
  buscarPorCodigo(codigo: string): Promise<GrupoAcceso | null>;
  actualizarNombre(
    sesionId: string,
    grupoId: string,
    nombreGrupo: string,
  ): Promise<void>;
}

export const repositorioAcceso: RepositorioAcceso = {
  async buscarPorCodigo(codigo: string): Promise<GrupoAcceso | null> {
    for (let intento = 0; intento < 3; intento += 1) {
      const resultado = await baseDatos.send(
      new QueryCommand({
        TableName: nombreTabla(),
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :codigo",
        ExpressionAttributeValues: {
          ":codigo": `CODIGO#${codigo}`,
        },
        Limit: 1,
      }),
    );

      const item = resultado.Items?.[0];

      if (!item) {
        if (intento < 2) await new Promise((resolver) => setTimeout(resolver, 40 * 2 ** intento));
        continue;
      }

      const grupo = {
      sesionId: String(item.sesionId),
      grupoId: String(item.grupoId),
      nombreGrupo: String(item.nombreGrupo || "Grupo"),
      codigoAcceso: String(item.codigoAcceso),
      cognitoUsername: String(item.cognitoUsername || ""),
      grupoSub: String(item.grupoSub || ""),
      estadoProvisionamiento: String(item.estadoProvisionamiento || ""),
      };
      if (!grupo.sesionId || !grupo.grupoId || !grupo.grupoSub) return null;
      return grupo;
    }
    return null;
  },

  async actualizarNombre(
    sesionId: string,
    grupoId: string,
    nombreGrupo: string,
  ): Promise<void> {
    await baseDatos.send(
      new UpdateCommand({
        TableName: nombreTabla(),
        Key: {
          PK: `SESION#${sesionId}`,
          SK: `GRUPO#${grupoId}`,
        },
        UpdateExpression: "SET nombreGrupo = :nombreGrupo",
        ExpressionAttributeValues: {
          ":nombreGrupo": nombreGrupo,
        },
      }),
    );
  },
};
