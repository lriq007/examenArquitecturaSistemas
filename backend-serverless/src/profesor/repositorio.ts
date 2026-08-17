import {
  BatchWriteCommand,
  GetCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  TransactWriteCommand,
  UpdateCommand,
  type BatchWriteCommandInput,

} from "@aws-sdk/lib-dynamodb";

import {
  baseDatos,
  nombreTabla,
} from "../compartido/baseDatos.js";

export interface AlumnoEntrada {
  correo: string;
  rut: string;
  nombre: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  carrera: string;
}

export interface ItemDynamo {
  PK: string;
  SK: string;
  [clave: string]: unknown;
}

export interface SesionResumen {
  sesionId: string;
  nombre: string;
  correoProfesor: string;
  facultad: string;
  fase: string;
  fechaCreacion: string;
  totalGrupos: number;
  totalAlumnos: number;
}

export interface RepositorioProfesor {
  guardarProfesor(
    profesorSub: string,
    correo: string,
    facultad: string,
  ): Promise<void>;

  guardarItems(
    items: ItemDynamo[],
  ): Promise<void>;

  listarSesiones(
    profesorSub: string,
  ): Promise<SesionResumen[]>;

  guardarVinculoGrupo(vinculo: {
    sesionId: string;
    grupoId: string;
    grupoSub: string;
    cognitoUsername: string;
  }): Promise<void>;

  marcarProvisionamientoFallido(sesionId: string, grupoId: string): Promise<void>;

  reservarCodigo(codigo: string, sesionId: string, grupoId: string): Promise<boolean>;
  liberarCodigo(codigo: string, sesionId: string, grupoId: string): Promise<void>;

  obtenerSesion(
    sesionId: string,
  ): Promise<ItemDynamo | null>;

  listarElementosSesion(
    sesionId: string,
  ): Promise<ItemDynamo[]>;

  actualizarSesion(
    sesionId: string,
    cambios: Record<string, unknown>,
  ): Promise<void>;
}

type SolicitudesPorTabla = NonNullable<
  BatchWriteCommandInput["RequestItems"]
>;

type SolicitudEscritura = NonNullable<
  SolicitudesPorTabla[string]
>[number];

function partirEnLotes<T>(
  elementos: T[],
  tamano = 25,
): T[][] {
  const lotes: T[][] = [];

  for (
    let indice = 0;
    indice < elementos.length;
    indice += tamano
  ) {
    lotes.push(elementos.slice(indice, indice + tamano));
  }

  return lotes;
}

async function escribirLote(
  items: ItemDynamo[],
): Promise<void> {
  let pendientes: SolicitudEscritura[] = items.map(
    (Item) => ({
     PutRequest: { Item },
    }),
  );

  for (let intento = 0; intento < 5; intento += 1) {
    if (!pendientes.length) {
      return;
    }

    const resultado = await baseDatos.send(
      new BatchWriteCommand({
        RequestItems: {
          [nombreTabla()]: pendientes,
        },
      }),
    );

    pendientes =
      resultado.UnprocessedItems?.[nombreTabla()] ?? [];

    if (pendientes.length) {
      await new Promise((resolver) =>
        setTimeout(resolver, 100 * (intento + 1)),
      );
    }
  }

  if (pendientes.length) {
    throw new Error(
      "No fue posible guardar todos los datos de la sesión",
    );
  }
}

function convertirSesion(
  item: Record<string, unknown>,
): SesionResumen {
  return {
    sesionId: String(item.sesionId || ""),
    nombre: String(item.nombre || "Sesión"),
    correoProfesor: String(item.correoProfesor || ""),
    facultad: String(item.facultad || ""),
    fase: String(item.fase || "f1_bienvenida"),
    fechaCreacion: String(item.fechaCreacion || ""),
    totalGrupos: Number(item.totalGrupos || 0),
    totalAlumnos: Number(item.totalAlumnos || 0),
  };
}

export const repositorioProfesor: RepositorioProfesor = {
  async guardarProfesor(
    profesorSub: string,
    correo: string,
    facultad: string,
  ): Promise<void> {
    const ahora = new Date().toISOString();

    await escribirLote([
      {
        PK: `IDENTIDAD#PROFESOR#${profesorSub}`,
        SK: "METADATOS",
        tipo: "PROFESOR",
        correo,
        profesorSub,
        facultad,
        actualizadoEn: ahora,
      },
    ]);
  },

  async guardarItems(
    items: ItemDynamo[],
  ): Promise<void> {
    for (const lote of partirEnLotes(items)) {
      await escribirLote(lote);
    }
  },

  async listarSesiones(
    profesorSub: string,
  ): Promise<SesionResumen[]> {
      const resultado = await baseDatos.send(
        new QueryCommand({
          TableName: nombreTabla(),
          IndexName: "GSI1",
          KeyConditionExpression: "GSI1PK = :pk",
          ExpressionAttributeValues: {
            ":pk": `PROFESOR_SUB#${profesorSub}`,
          },
          ScanIndexForward: false,
        }),
      );

      const items = (resultado.Items ?? []) as Array<
        Record<string, unknown>
      >;

      return items
        .filter((item) => item.tipo === "SESION")
        .map((item) => convertirSesion(item))
        .sort((a, b) =>
          b.fechaCreacion.localeCompare(a.fechaCreacion),
        );
  },

  async guardarVinculoGrupo(vinculo): Promise<void> {
    await baseDatos.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: nombreTabla(),
            Item: {
              PK: `IDENTIDAD#GRUPO#${vinculo.grupoSub}`,
              SK: "VINCULO",
              tipo: "VINCULO_GRUPO",
              ...vinculo,
            },
            ConditionExpression: "attribute_not_exists(PK) OR grupoId = :grupoId",
            ExpressionAttributeValues: { ":grupoId": vinculo.grupoId },
          },
        },
        {
          Update: {
            TableName: nombreTabla(),
            Key: { PK: `SESION#${vinculo.sesionId}`, SK: `GRUPO#${vinculo.grupoId}` },
            UpdateExpression: "SET grupoSub = :sub, cognitoUsername = :usuario, estadoProvisionamiento = :estado",
            ExpressionAttributeValues: {
              ":sub": vinculo.grupoSub,
              ":usuario": vinculo.cognitoUsername,
              ":estado": "LISTO",
            },
            ConditionExpression: "attribute_exists(PK)",
          },
        },
      ],
    }));
  },

  async marcarProvisionamientoFallido(sesionId, grupoId): Promise<void> {
    await baseDatos.send(new UpdateCommand({
      TableName: nombreTabla(),
      Key: { PK: `SESION#${sesionId}`, SK: `GRUPO#${grupoId}` },
      UpdateExpression: "SET estadoProvisionamiento = :estado, provisionamientoActualizadoEn = :ahora",
      ExpressionAttributeValues: {
        ":estado": "FALLIDO",
        ":ahora": new Date().toISOString(),
      },
    }));
  },

  async reservarCodigo(codigo, sesionId, grupoId): Promise<boolean> {
    try {
      await baseDatos.send(new PutCommand({
        TableName: nombreTabla(),
        Item: {
          PK: `CODIGO#${codigo}`,
          SK: "RESERVA",
          tipo: "RESERVA_CODIGO",
          codigoAcceso: codigo,
          sesionId,
          grupoId,
        },
        ConditionExpression: "attribute_not_exists(PK) OR (sesionId = :sesionId AND grupoId = :grupoId)",
        ExpressionAttributeValues: { ":sesionId": sesionId, ":grupoId": grupoId },
      }));
      return true;
    } catch (error) {
      if ((error as { name?: string }).name === "ConditionalCheckFailedException") return false;
      throw error;
    }
  },

  async liberarCodigo(codigo, sesionId, grupoId): Promise<void> {
    await baseDatos.send(new DeleteCommand({
      TableName: nombreTabla(),
      Key: { PK: `CODIGO#${codigo}`, SK: "RESERVA" },
      ConditionExpression: "sesionId = :sesionId AND grupoId = :grupoId",
      ExpressionAttributeValues: { ":sesionId": sesionId, ":grupoId": grupoId },
    }));
  },

  async obtenerSesion(
    sesionId: string,
  ): Promise<ItemDynamo | null> {
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

    return (resultado.Item as ItemDynamo | undefined) ?? null;
  },

  async listarElementosSesion(
    sesionId: string,
  ): Promise<ItemDynamo[]> {
    const resultado = await baseDatos.send(
      new QueryCommand({
        TableName: nombreTabla(),
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: {
          ":pk": `SESION#${sesionId}`,
        },
        ConsistentRead: true,
      }),
    );

    return (resultado.Items ?? []) as ItemDynamo[];
  },

  async actualizarSesion(
    sesionId: string,
    cambios: Record<string, unknown>,
  ): Promise<void> {
    const entradas = Object.entries(cambios);

    if (!entradas.length) {
      return;
    }

    const nombres: Record<string, string> = {};
    const valores: Record<string, unknown> = {};
    const expresiones: string[] = [];

    entradas.forEach(([clave, valor], indice) => {
      const nombre = `#campo${indice}`;
      const variable = `:valor${indice}`;

      nombres[nombre] = clave;
      valores[variable] = valor;
      expresiones.push(`${nombre} = ${variable}`);
    });

    await baseDatos.send(
      new UpdateCommand({
        TableName: nombreTabla(),
        Key: {
          PK: `SESION#${sesionId}`,
          SK: "METADATOS",
        },
        UpdateExpression: `SET ${expresiones.join(", ")}`,
        ExpressionAttributeNames: nombres,
        ExpressionAttributeValues: valores,
        ConditionExpression: "attribute_exists(PK)",
      }),
    );
  },
};
