import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { baseDatos, nombreTabla } from "../compartido/baseDatos.js";

export interface SesionActual {
  sesionId: string;
  fase: string;
  timerCorriendo: boolean;
  segundosRestantes: number;
  totalGrupos: number;
}

export interface GrupoActual {
  grupoId: string;
  nombreGrupo: string;
  tokens: number;
}

export interface RepositorioSesiones {
  buscarVinculoGrupo(grupoSub: string): Promise<{ sesionId: string; grupoId: string } | null>;
  buscarSesion(sesionId: string): Promise<SesionActual | null>;
  buscarGrupo(sesionId: string, grupoId: string): Promise<GrupoActual | null>;
}

export const repositorioSesiones: RepositorioSesiones = {
  async buscarVinculoGrupo(grupoSub) {
    const resultado = await baseDatos.send(new GetCommand({
      TableName: nombreTabla(),
      Key: { PK: `IDENTIDAD#GRUPO#${grupoSub}`, SK: "VINCULO" },
      ConsistentRead: true,
    }));
    if (!resultado.Item) return null;
    return {
      sesionId: String(resultado.Item.sesionId || ""),
      grupoId: String(resultado.Item.grupoId || ""),
    };
  },
  async buscarSesion(sesionId: string): Promise<SesionActual | null> {
    const resultado = await baseDatos.send(
      new GetCommand({
        TableName: nombreTabla(),
        Key: {
          PK: `SESION#${sesionId}`,
          SK: "METADATOS",
        },
        ConsistentRead: true,
      }),
    );

    const item = resultado.Item;

    if (!item) {
      return null;
    }

    return {
      sesionId,
      fase: String(item.fase || "f1_bienvenida"),
      timerCorriendo: Boolean(item.timerCorriendo),
      segundosRestantes: Number(item.segundosRestantes || 0),
      totalGrupos: Number(item.totalGrupos || 0),
    };
  },

  async buscarGrupo(sesionId: string, grupoId: string): Promise<GrupoActual | null> {
    const resultado = await baseDatos.send(
      new GetCommand({
        TableName: nombreTabla(),
        Key: {
          PK: `SESION#${sesionId}`,
          SK: `GRUPO#${grupoId}`,
        },
        ConsistentRead: true,
      }),
    );

    const item = resultado.Item;

    if (!item) {
      return null;
    }

    return {
      grupoId,
      nombreGrupo: String(item.nombreGrupo || "Grupo"),
      tokens: Number(item.tokens || 0),
    };
  },
};
