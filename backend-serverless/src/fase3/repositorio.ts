import {
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

import {
  baseDatos,
  nombreTabla,
} from "../compartido/baseDatos.js";

export interface SesionFase3 {
  sesionId: string;
  fase: string;
  totalGrupos: number;
  timerCorriendo: boolean;
  segundosRestantes: number;
  timerInicio?: string;
  timerFin?: string;
}

export interface GrupoFase3 {
  grupoId: string;
  nombreGrupo: string;
  tokens: number;
  desafioNombre: string;
  desafioDescripcion: string;
  bubbleMap: Record<string, unknown>;

  listoF3Ranking: boolean;
  listoF3Mapa: boolean;
  listoF3Transicion: boolean;
  listoInicioF3: boolean;
  listoF3Salida: boolean;

  legoCompletado: boolean;
  legoConFoto: boolean;
  legoSinFoto: boolean;
  trabajoFotoId?: string;

  ruletaLegoIntentos: number;
  ruletaLegoUltimo: string;

  astronautaLegoRespondida: boolean;
  astronautaLegoCorrecta: boolean;
}

export interface RepositorioFase3 {
  buscarSesion(sesionId: string): Promise<SesionFase3 | null>;

  buscarGrupo(
    sesionId: string,
    grupoId: string,
  ): Promise<GrupoFase3 | null>;

  listarGrupos(sesionId: string): Promise<GrupoFase3[]>;

  marcarListo(
    sesionId: string,
    grupoId: string,
    campo: string,
  ): Promise<void>;

  cambiarFase(
    sesionId: string,
    fasesEsperadas: string[],
    nuevaFase: string,
    duracionSegundos: number,
  ): Promise<boolean>;

  iniciarTimerLego(
    sesionId: string,
    duracionSegundos: number,
  ): Promise<boolean>;

  completarLego(
    sesionId: string,
    grupoId: string,
    conFoto: boolean,
    sinFoto: boolean,
    trabajoFotoId?: string,
  ): Promise<boolean>;

  guardarResultadoRuleta(
    sesionId: string,
    grupoId: string,
    intentoEsperado: number,
    nuevosTokens: number,
    resultado: string,
  ): Promise<boolean>;

  guardarRespuestaAstronauta(
    sesionId: string,
    grupoId: string,
    correcta: boolean,
    nuevosTokens: number,
  ): Promise<boolean>;
}

const claveSesion = (sesionId: string) => ({
  PK: `SESION#${sesionId}`,
  SK: "METADATOS",
});

const claveGrupo = (sesionId: string, grupoId: string) => ({
  PK: `SESION#${sesionId}`,
  SK: `GRUPO#${grupoId}`,
});

function texto(valor: unknown): string {
  return String(valor ?? "");
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor &&
    typeof valor === "object" &&
    !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {};
}

function convertirGrupo(
  item: Record<string, unknown>,
): GrupoFase3 {
  return {
    grupoId: texto(item.grupoId),
    nombreGrupo: texto(item.nombreGrupo) || "Grupo",
    tokens: Number(item.tokens || 0),
    desafioNombre: texto(item.desafioNombre),
    desafioDescripcion: texto(item.desafioDescripcion),
    bubbleMap: objeto(item.bubbleMap),

    listoF3Ranking: Boolean(item.listoF3Ranking),
    listoF3Mapa: Boolean(item.listoF3Mapa),
    listoF3Transicion: Boolean(item.listoF3Transicion),
    listoInicioF3: Boolean(item.listoInicioF3),
    listoF3Salida: Boolean(item.listoF3Salida),

    legoCompletado: Boolean(item.legoCompletado),
    legoConFoto: Boolean(item.legoConFoto),
    legoSinFoto: Boolean(item.legoSinFoto),
    ...(item.trabajoFotoId ? { trabajoFotoId: String(item.trabajoFotoId) } : {}),

    ruletaLegoIntentos: Number(item.ruletaLegoIntentos || 0),
    ruletaLegoUltimo: texto(item.ruletaLegoUltimo),

    astronautaLegoRespondida: Boolean(
      item.astronautaLegoRespondida,
    ),
    astronautaLegoCorrecta: Boolean(
      item.astronautaLegoCorrecta,
    ),
  };
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

export const repositorioFase3: RepositorioFase3 = {
  async buscarSesion(
    sesionId: string,
  ): Promise<SesionFase3 | null> {
    const resultado = await baseDatos.send(
      new GetCommand({
        TableName: nombreTabla(),
        Key: claveSesion(sesionId),
        ConsistentRead: true,
      }),
    );

    const item = resultado.Item;

    if (!item) {
      return null;
    }

    return {
      sesionId,
      fase: texto(item.fase) || "f1_bienvenida",
      totalGrupos: Number(item.totalGrupos || 0),
      timerCorriendo: Boolean(item.timerCorriendo),
      segundosRestantes: Number(item.segundosRestantes || 0),
      ...(item.timerInicio
        ? { timerInicio: texto(item.timerInicio) }
        : {}),
      ...(item.timerFin
        ? { timerFin: texto(item.timerFin) }
        : {}),
    };
  },

  async buscarGrupo(
    sesionId: string,
    grupoId: string,
  ): Promise<GrupoFase3 | null> {
    const resultado = await baseDatos.send(
      new GetCommand({
        TableName: nombreTabla(),
        Key: claveGrupo(sesionId, grupoId),
        ConsistentRead: true,
      }),
    );

    return resultado.Item
      ? convertirGrupo(resultado.Item)
      : null;
  },

  async listarGrupos(
    sesionId: string,
  ): Promise<GrupoFase3[]> {
    const resultado = await baseDatos.send(
      new QueryCommand({
        TableName: nombreTabla(),
        KeyConditionExpression:
          "PK = :pk AND begins_with(SK, :grupo)",
        ExpressionAttributeValues: {
          ":pk": `SESION#${sesionId}`,
          ":grupo": "GRUPO#",
        },
        ConsistentRead: true,
      }),
    );

    return (resultado.Items ?? []).map(convertirGrupo);
  },

  async marcarListo(
    sesionId: string,
    grupoId: string,
    campo: string,
  ): Promise<void> {
    await baseDatos.send(
      new UpdateCommand({
        TableName: nombreTabla(),
        Key: claveGrupo(sesionId, grupoId),
        UpdateExpression:
          "SET #campo = :verdadero, fechaActualizacion = :ahora",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: {
          "#campo": campo,
        },
        ExpressionAttributeValues: {
          ":verdadero": true,
          ":ahora": new Date().toISOString(),
        },
      }),
    );
  },

  async cambiarFase(
    sesionId: string,
    fasesEsperadas: string[],
    nuevaFase: string,
    duracionSegundos: number,
  ): Promise<boolean> {
    if (!fasesEsperadas.length) {
      return false;
    }

    const valores: Record<string, unknown> = {
      ":nuevaFase": nuevaFase,
      ":duracion": duracionSegundos,
      ":falso": false,
      ":ahora": new Date().toISOString(),
      ":nulo": null,
    };

    const condiciones = fasesEsperadas.map((fase, indice) => {
      const clave = `:fase${indice}`;
      valores[clave] = fase;
      return clave;
    });

    try {
      await baseDatos.send(
        new UpdateCommand({
          TableName: nombreTabla(),
          Key: claveSesion(sesionId),
          UpdateExpression:
            "SET #fase = :nuevaFase, " +
            "segundosRestantes = :duracion, " +
            "timerCorriendo = :falso, " +
            "timerInicio = :nulo, " +
            "timerFin = :nulo, " +
            "fechaActualizacion = :ahora",
          ConditionExpression:
            `#fase IN (${condiciones.join(", ")})`,
          ExpressionAttributeNames: {
            "#fase": "fase",
          },
          ExpressionAttributeValues: valores,
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

  async iniciarTimerLego(
    sesionId: string,
    duracionSegundos: number,
  ): Promise<boolean> {
    const ahora = new Date();
    const fin = new Date(
      ahora.getTime() + duracionSegundos * 1000,
    );

    try {
      await baseDatos.send(
        new UpdateCommand({
          TableName: nombreTabla(),
          Key: claveSesion(sesionId),
          UpdateExpression:
            "SET timerCorriendo = :verdadero, " +
            "segundosRestantes = :duracion, " +
            "timerInicio = :inicio, " +
            "timerFin = :fin, " +
            "fechaActualizacion = :inicio",
          ConditionExpression:
            "#fase = :fase AND " +
            "(attribute_not_exists(timerCorriendo) " +
            "OR timerCorriendo = :falso)",
          ExpressionAttributeNames: {
            "#fase": "fase",
          },
          ExpressionAttributeValues: {
            ":fase": "f3_lego",
            ":verdadero": true,
            ":falso": false,
            ":duracion": duracionSegundos,
            ":inicio": ahora.toISOString(),
            ":fin": fin.toISOString(),
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

  async completarLego(
    sesionId: string,
    grupoId: string,
    conFoto: boolean,
    sinFoto: boolean,
    trabajoFotoId?: string,
  ): Promise<boolean> {
    try {
      await baseDatos.send(
        new UpdateCommand({
          TableName: nombreTabla(),
          Key: claveGrupo(sesionId, grupoId),
          UpdateExpression:
            "SET legoCompletado = :verdadero, " +
            "legoConFoto = :conFoto, " +
            "legoSinFoto = :sinFoto, " +
            "fechaLegoCompletado = :ahora, " +
            "trabajoFotoId = :trabajoFotoId",
          ConditionExpression:
            "attribute_exists(PK) AND " +
            "(attribute_not_exists(legoCompletado) " +
            "OR legoCompletado = :falso)",
          ExpressionAttributeValues: {
            ":verdadero": true,
            ":falso": false,
            ":conFoto": conFoto,
            ":sinFoto": sinFoto,
            ":ahora": new Date().toISOString(),
            ":trabajoFotoId": trabajoFotoId || null,
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

  async guardarResultadoRuleta(
    sesionId: string,
    grupoId: string,
    intentoEsperado: number,
    nuevosTokens: number,
    resultado: string,
  ): Promise<boolean> {
    try {
      await baseDatos.send(
        new UpdateCommand({
          TableName: nombreTabla(),
          Key: claveGrupo(sesionId, grupoId),
          UpdateExpression:
            "SET tokens = :tokens, " +
            "ruletaLegoIntentos = :nuevoIntento, " +
            "ruletaLegoUltimo = :resultado, " +
            "fechaActualizacion = :ahora",
          ConditionExpression:
            "attribute_exists(PK) AND " +
            "(attribute_not_exists(ruletaLegoIntentos) " +
            "OR ruletaLegoIntentos = :esperado)",
          ExpressionAttributeValues: {
            ":tokens": nuevosTokens,
            ":nuevoIntento": intentoEsperado + 1,
            ":resultado": resultado,
            ":esperado": intentoEsperado,
            ":ahora": new Date().toISOString(),
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

  async guardarRespuestaAstronauta(
    sesionId: string,
    grupoId: string,
    correcta: boolean,
    nuevosTokens: number,
  ): Promise<boolean> {
    try {
      await baseDatos.send(
        new UpdateCommand({
          TableName: nombreTabla(),
          Key: claveGrupo(sesionId, grupoId),
          UpdateExpression:
            "SET astronautaLegoRespondida = :verdadero, " +
            "astronautaLegoCorrecta = :correcta, " +
            "tokens = :tokens, " +
            "fechaActualizacion = :ahora",
          ConditionExpression:
            "attribute_exists(PK) AND " +
            "(attribute_not_exists(astronautaLegoRespondida) " +
            "OR astronautaLegoRespondida = :falso)",
          ExpressionAttributeValues: {
            ":verdadero": true,
            ":falso": false,
            ":correcta": correcta,
            ":tokens": nuevosTokens,
            ":ahora": new Date().toISOString(),
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
};
