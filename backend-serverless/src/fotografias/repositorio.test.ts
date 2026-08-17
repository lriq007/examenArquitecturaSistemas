import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositorioFotografiasDynamo } from "./repositorio.js";

describe("adaptador DynamoDB de fotografías", () => {
  beforeEach(() => {
    process.env.NOMBRE_TABLA = "tabla-prueba";
  });

  it("aliasa bucket y los atributos del CAS para no usar palabras reservadas", async () => {
    const comandos: unknown[] = [];
    const cliente = {
      send: vi.fn(async (comando: unknown) => {
        comandos.push(comando);
        return {};
      }),
    } as unknown as DynamoDBDocumentClient;
    const repositorio = new RepositorioFotografiasDynamo(cliente);

    await expect(repositorio.registrarVersionYEncolar({
      trabajoId: "trabajo-1",
      intentoId: "intento-1",
      bucket: "bucket-privado",
      key: "entradas/s/g/trabajo-1/intento-1",
      versionId: "version-1",
    })).resolves.toBe("NUEVO");

    expect(comandos).toHaveLength(1);
    expect(comandos[0]).toBeInstanceOf(UpdateCommand);
    const entrada = (comandos[0] as UpdateCommand).input;
    expect(entrada.UpdateExpression).toBe(
      "SET #versionId=:v, #bucket=:b, #estado=:enc, #actualizadoEn=:a, #gsi1sk=:g",
    );
    expect(entrada.ConditionExpression).toBe(
      "#estado=:pend AND #clave=:k AND attribute_not_exists(#versionId)",
    );
    expect(entrada.ExpressionAttributeNames).toEqual({
      "#versionId": "versionId",
      "#bucket": "bucket",
      "#estado": "estado",
      "#actualizadoEn": "actualizadoEn",
      "#gsi1sk": "GSI1SK",
      "#clave": "clave",
    });
    expect(entrada.UpdateExpression).not.toMatch(/(?:^|[ ,])bucket\s*=/);
  });

  it("terminaliza solo trabajos existentes y estados no terminales", async () => {
    const comandos: unknown[] = [];
    const cliente = { send: vi.fn(async (comando: unknown) => { comandos.push(comando); return {}; }) } as unknown as DynamoDBDocumentClient;
    await expect(new RepositorioFotografiasDynamo(cliente).fallar("t", "i", "agotado")).resolves.toBe(true);
    const entrada = (comandos[0] as UpdateCommand).input;
    expect(entrada.ConditionExpression).toBe("attribute_exists(PK) AND #e IN (:pendiente, :encolado, :procesando)");
    expect(entrada.ExpressionAttributeValues).toMatchObject({ ":pendiente": "PENDIENTE_CARGA", ":encolado": "ENCOLADO", ":procesando": "PROCESANDO" });
  });

  it("trata el fallo condicional como resultado idempotente", async () => {
    const error = Object.assign(new Error("condición"), { name: "ConditionalCheckFailedException" });
    const cliente = { send: vi.fn(async () => { throw error; }) } as unknown as DynamoDBDocumentClient;
    await expect(new RepositorioFotografiasDynamo(cliente).fallar("t", "i", "agotado")).resolves.toBe(false);
  });
});
