import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
  waitUntilTableNotExists,
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";

import {
  construirItemGrupoAnalitico,
  construirItemSesionAnalitica,
} from "../src/compartido/contratos/analytics.js";

const nombreTabla = process.env.NOMBRE_TABLA || "MisionEmprende-local";
const endpoint = process.env.DYNAMODB_ENDPOINT_LOCAL || "http://localhost:8000";

const clienteBase = new DynamoDBClient({
  region: "us-east-1",
  endpoint,
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});

const cliente = DynamoDBDocumentClient.from(clienteBase);

async function tablaExiste(): Promise<boolean> {
  try {
    await clienteBase.send(new DescribeTableCommand({ TableName: nombreTabla }));
    return true;
  } catch {
    return false;
  }
}

async function eliminarTabla(): Promise<void> {
  if (!(await tablaExiste())) return;

  console.log(`Eliminando tabla ${nombreTabla}...`);
  await clienteBase.send(new DeleteTableCommand({ TableName: nombreTabla }));
  await waitUntilTableNotExists(
    { client: clienteBase, maxWaitTime: 30 },
    { TableName: nombreTabla },
  );
}

async function crearTabla(): Promise<void> {
  console.log(`Creando tabla ${nombreTabla}...`);

  await clienteBase.send(
    new CreateTableCommand({
      TableName: nombreTabla,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
        { AttributeName: "GSI1PK", AttributeType: "S" },
        { AttributeName: "GSI1SK", AttributeType: "S" },
      ],
      KeySchema: [
        { AttributeName: "PK", KeyType: "HASH" },
        { AttributeName: "SK", KeyType: "RANGE" },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: "GSI1",
          KeySchema: [
            { AttributeName: "GSI1PK", KeyType: "HASH" },
            { AttributeName: "GSI1SK", KeyType: "RANGE" },
          ],
          Projection: { ProjectionType: "ALL" },
        },
      ],
    }),
  );

  await waitUntilTableExists(
    { client: clienteBase, maxWaitTime: 30 },
    { TableName: nombreTabla },
  );
}

async function cargarDatos(): Promise<void> {
  const ahora = new Date().toISOString();

  await cliente.send(
    new BatchWriteCommand({
      RequestItems: {
        [nombreTabla]: [
          {
            PutRequest: {
              Item: {
                PK: "SESION#1",
                SK: "METADATOS",
                ...construirItemSesionAnalitica({
                  sesionId: "1",
                  fase: "f1_sopa",
                  totalGrupos: 2,
                  totalAlumnos: 6,
                  fechaCreacion: ahora,
                }),
                nombre: "Sesión de prueba",
                gruposSopaCompletada: 0,
                timerCorriendo: true,
                segundosRestantes: 120,
                timerInicio: ahora,
              },
            },
          },
          {
            PutRequest: {
              Item: {
                PK: "SESION#1",
                SK: "GRUPO#1",
                GSI1PK: "CODIGO#ABC123",
                GSI1SK: "GRUPO#1",
                ...construirItemGrupoAnalitico({
                  sesionId: "1",
                  grupoId: "1",
                  nombreGrupo: "Código Naranja",
                  tokens: 10,
                  sopaCompletada: false,
                  legoCompletado: false,
                }),
                codigoAcceso: "ABC123",
              },
            },
          },
          {
            PutRequest: {
              Item: {
                PK: "SESION#1",
                SK: "GRUPO#2",
                GSI1PK: "CODIGO#XYZ789",
                GSI1SK: "GRUPO#2",
                ...construirItemGrupoAnalitico({
                  sesionId: "1",
                  grupoId: "2",
                  nombreGrupo: "Los Innovadores",
                  tokens: 10,
                  sopaCompletada: false,
                  legoCompletado: false,
                }),
                codigoAcceso: "XYZ789",
              },
            },
          },
        ],
      },
    }),
  );
}

async function ejecutar(): Promise<void> {
  await eliminarTabla();
  await crearTabla();
  await cargarDatos();
}

ejecutar().catch((error: unknown) => {
  console.error(
    "No fue posible preparar DynamoDB Local:",
    error,
  );

  process.exitCode = 1;
});

console.log("Base local preparada.");
console.log("Códigos de prueba: ABC123 y XYZ789");
