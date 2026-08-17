import {
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import {
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  baseDatos,
  nombreTabla,
} from "../compartido/baseDatos.js";
import { construirCamposEvaluacionAnalitica } from "../compartido/contratos/analytics.js";

export interface CriteriosEvaluacion {
  claridad: number;
  creatividad: number;
  viabilidad: number;
  equipo: number;
  presentacion: number;
}

export interface Evaluacion extends CriteriosEvaluacion {
  grupoEvaluadoId: string;
  grupoEvaluadorId: string;
  comentario: string;
  reflexion: string;
  automatica: boolean;
}

export interface RepositorioFase5 {
  listarEvaluacionesDeGrupo(
    sesionId: string,
    grupoEvaluadoId: string,
  ): Promise<Evaluacion[]>;

  listarTodasEvaluaciones(sesionId: string): Promise<Evaluacion[]>;

  listarEvaluacionesDeEvaluador(
    sesionId: string,
    grupoEvaluadorId: string,
  ): Promise<Evaluacion[]>;

  crearEvaluacion(sesionId: string, evaluacion: Evaluacion): Promise<boolean>;

  marcarRecompensaPeerOtorgada(
    sesionId: string,
    grupoEvaluadorId: string,
  ): Promise<void>;
}

export function totalCriterios(evaluacion: CriteriosEvaluacion): number {
  return (
    evaluacion.claridad +
    evaluacion.creatividad +
    evaluacion.viabilidad +
    evaluacion.equipo +
    evaluacion.presentacion
  );
}

function esCondicional(error: unknown): boolean {
  return (
    error instanceof ConditionalCheckFailedException ||
    (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "ConditionalCheckFailedException"
    )
  );
}

function convertirEvaluacion(item: Record<string, unknown>): Evaluacion {
  return {
    grupoEvaluadoId: String(item.grupoEvaluadoId ?? ""),
    grupoEvaluadorId: String(item.grupoEvaluadorId ?? ""),
    claridad: Number(item.claridad || 0),
    creatividad: Number(item.creatividad || 0),
    viabilidad: Number(item.viabilidad || 0),
    equipo: Number(item.equipo || 0),
    presentacion: Number(item.presentacion || 0),
    comentario: String(item.comentario ?? ""),
    reflexion: String(item.reflexion ?? ""),
    automatica: Boolean(item.automatica),
  };
}

export const repositorioFase5: RepositorioFase5 = {
  async listarEvaluacionesDeGrupo(sesionId, grupoEvaluadoId) {
    const resultado = await baseDatos.send(
      new QueryCommand({
        TableName: nombreTabla(),
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefijo)",
        ExpressionAttributeValues: {
          ":pk": `SESION#${sesionId}`,
          ":prefijo": `EVAL#${grupoEvaluadoId}#`,
        },
        ConsistentRead: true,
      }),
    );

    return (resultado.Items ?? []).map(convertirEvaluacion);
  },

  async listarTodasEvaluaciones(sesionId) {
    const resultado = await baseDatos.send(
      new QueryCommand({
        TableName: nombreTabla(),
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefijo)",
        ExpressionAttributeValues: {
          ":pk": `SESION#${sesionId}`,
          ":prefijo": "EVAL#",
        },
        ConsistentRead: true,
      }),
    );

    return (resultado.Items ?? []).map(convertirEvaluacion);
  },

  async listarEvaluacionesDeEvaluador(sesionId, grupoEvaluadorId) {
    const todas = await this.listarTodasEvaluaciones(sesionId);
    return todas.filter((e) => e.grupoEvaluadorId === grupoEvaluadorId);
  },

  async crearEvaluacion(sesionId, evaluacion) {
    const campos = construirCamposEvaluacionAnalitica({
      grupoEvaluadoId: evaluacion.grupoEvaluadoId,
      grupoEvaluadorId: evaluacion.grupoEvaluadorId,
      claridad: evaluacion.claridad,
      creatividad: evaluacion.creatividad,
      viabilidad: evaluacion.viabilidad,
      equipo: evaluacion.equipo,
      presentacion: evaluacion.presentacion,
      automatica: evaluacion.automatica,
    });

    try {
      await baseDatos.send(
        new UpdateCommand({
          TableName: nombreTabla(),
          Key: {
            PK: `SESION#${sesionId}`,
            SK: `EVAL#${evaluacion.grupoEvaluadoId}#${evaluacion.grupoEvaluadorId}`,
          },
          UpdateExpression:
            "SET grupoEvaluadoId = :evaluado, " +
            "grupoEvaluadorId = :evaluador, " +
            "claridad = :claridad, creatividad = :creatividad, " +
            "viabilidad = :viabilidad, equipo = :equipo, " +
            "presentacion = :presentacion, comentario = :comentario, " +
            "reflexion = :reflexion, automatica = :automatica, " +
            "schemaVersion = :schemaVersion",
          ConditionExpression: "attribute_not_exists(PK)",
          ExpressionAttributeValues: {
            ":evaluado": campos.grupoEvaluadoId,
            ":evaluador": campos.grupoEvaluadorId,
            ":claridad": campos.claridad,
            ":creatividad": campos.creatividad,
            ":viabilidad": campos.viabilidad,
            ":equipo": campos.equipo,
            ":presentacion": campos.presentacion,
            ":comentario": evaluacion.comentario,
            ":reflexion": evaluacion.reflexion,
            ":automatica": campos.automatica,
            ":schemaVersion": campos.schemaVersion,
          },
        }),
      );

      return true;
    } catch (error) {
      if (esCondicional(error)) {
        return false;
      }

      throw error;
    }
  },

  async marcarRecompensaPeerOtorgada(sesionId, grupoEvaluadorId) {
    await baseDatos.send(
      new UpdateCommand({
        TableName: nombreTabla(),
        Key: {
          PK: `SESION#${sesionId}`,
          SK: `GRUPO#${grupoEvaluadorId}`,
        },
        UpdateExpression: "SET recompensaPeerOtorgada = :verdadero",
        ExpressionAttributeValues: { ":verdadero": true },
      }),
    );
  },
};