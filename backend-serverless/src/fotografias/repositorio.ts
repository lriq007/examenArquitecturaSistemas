import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { baseDatos, nombreTabla } from "../compartido/baseDatos.js";
import type { FirmadorCarga, IntentoFoto, PuertoFotografias } from "./servicio.js";

const pk = (trabajoId: string) => `TRABAJO_FOTO#${trabajoId}`;

function esCondicional(error: unknown): boolean {
  return error instanceof Error && (error.name === "ConditionalCheckFailedException" || error.name === "TransactionCanceledException");
}

export class RepositorioFotografiasDynamo implements PuertoFotografias {
  constructor(private readonly db: DynamoDBDocumentClient = baseDatos) {}

  async crear(item: IntentoFoto): Promise<void> {
    await this.db.send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: nombreTabla(), Item: {
        PK: pk(item.trabajoId), SK: `INTENTO#${item.intentoId}`, tipo: "INTENTO_FOTO", schemaVersion: "1.0", ...item,
        GSI1PK: "FOTOS_PENDIENTES", GSI1SK: `${item.actualizadoEn}#${item.trabajoId}`,
      }, ConditionExpression: "attribute_not_exists(PK)" } },
      { Put: { TableName: nombreTabla(), Item: {
        PK: pk(item.trabajoId), SK: "METADATOS", tipo: "TRABAJO_FOTO", schemaVersion: "1.0",
        sesionId: item.sesionId, grupoId: item.grupoId, trabajoId: item.trabajoId,
        intentoActualId: item.intentoId, numeroIntento: item.numeroIntento, actualizadoEn: item.actualizadoEn,
      }, ConditionExpression: "attribute_not_exists(PK) OR numeroIntento < :numero", ExpressionAttributeValues: { ":numero": item.numeroIntento } } },
    ] }));
  }

  async obtener(trabajoId: string): Promise<IntentoFoto | null> {
    const meta = await this.db.send(new GetCommand({ TableName: nombreTabla(), Key: { PK: pk(trabajoId), SK: "METADATOS" }, ConsistentRead: true }));
    if (!meta.Item?.intentoActualId) return null;
    const result = await this.db.send(new GetCommand({ TableName: nombreTabla(), Key: { PK: pk(trabajoId), SK: `INTENTO#${String(meta.Item.intentoActualId)}` }, ConsistentRead: true }));
    return (result.Item as unknown as IntentoFoto | undefined) ?? null;
  }

  async registrarVersionYEncolar(d: { trabajoId: string; intentoId: string; bucket: string; key: string; versionId: string }): Promise<"NUEVO" | "DUPLICADO" | "VERSION_CONFLICTIVA"> {
    try {
      await this.db.send(new UpdateCommand({ TableName: nombreTabla(), Key: { PK: pk(d.trabajoId), SK: `INTENTO#${d.intentoId}` },
        UpdateExpression: "SET #versionId=:v, #bucket=:b, #estado=:enc, #actualizadoEn=:a, #gsi1sk=:g",
        ConditionExpression: "#estado=:pend AND #clave=:k AND attribute_not_exists(#versionId)",
        ExpressionAttributeNames: {
          "#versionId": "versionId",
          "#bucket": "bucket",
          "#estado": "estado",
          "#actualizadoEn": "actualizadoEn",
          "#gsi1sk": "GSI1SK",
          "#clave": "clave",
        },
        ExpressionAttributeValues: { ":v": d.versionId, ":b": d.bucket, ":enc": "ENCOLADO", ":pend": "PENDIENTE_CARGA", ":k": d.key, ":a": new Date().toISOString(), ":g": `${new Date().toISOString()}#${d.trabajoId}` } }));
      return "NUEVO";
    } catch (error) {
      if (!esCondicional(error)) throw error;
      const actual = await this.obtener(d.trabajoId);
      return actual?.versionId === d.versionId ? "DUPLICADO" : "VERSION_CONFLICTIVA";
    }
  }

  async adquirirLease(trabajoId: string, intentoId: string, hasta: string): Promise<boolean> {
    try {
      const ahora = new Date().toISOString();
      await this.db.send(new UpdateCommand({ TableName: nombreTabla(), Key: { PK: pk(trabajoId), SK: `INTENTO#${intentoId}` }, UpdateExpression: "SET #e=:procesando, leaseUntil=:hasta, actualizadoEn=:ahora", ConditionExpression: "#e=:enc OR (#e=:procesando AND leaseUntil < :ahora)", ExpressionAttributeNames: { "#e": "estado" }, ExpressionAttributeValues: { ":procesando": "PROCESANDO", ":enc": "ENCOLADO", ":hasta": hasta, ":ahora": ahora } })); return true;
    } catch (error) { if (esCondicional(error)) return false; throw error; }
  }

  async completar(trabajoId: string, intentoId: string, efecto: Record<string, unknown>): Promise<void> {
    const ahora = new Date().toISOString();
    await this.db.send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: nombreTabla(), Item: { PK: pk(trabajoId), SK: `RESULTADO#${intentoId}`, tipo: "RESULTADO_FOTO", schemaVersion: "1.0", trabajoId, intentoId, ...efecto, creadoEn: ahora }, ConditionExpression: "attribute_not_exists(PK)" } },
      { Update: { TableName: nombreTabla(), Key: { PK: pk(trabajoId), SK: `INTENTO#${intentoId}` }, UpdateExpression: "SET #e=:ok, actualizadoEn=:a REMOVE leaseUntil, GSI1PK, GSI1SK", ConditionExpression: "#e=:procesando", ExpressionAttributeNames: { "#e": "estado" }, ExpressionAttributeValues: { ":ok": "COMPLETADO", ":procesando": "PROCESANDO", ":a": ahora } } },
    ] }));
  }

  async fallar(trabajoId: string, intentoId: string, causa: string, estado: "FALLIDO" | "EXPIRADO" = "FALLIDO"): Promise<boolean> {
    try {
      await this.db.send(new UpdateCommand({ TableName: nombreTabla(), Key: { PK: pk(trabajoId), SK: `INTENTO#${intentoId}` }, UpdateExpression: "SET #e=:e, causa=:c, actualizadoEn=:a REMOVE leaseUntil, GSI1PK, GSI1SK", ConditionExpression: "attribute_exists(PK) AND #e IN (:pendiente, :encolado, :procesando)", ExpressionAttributeNames: { "#e": "estado" }, ExpressionAttributeValues: { ":e": estado, ":c": causa.slice(0, 120), ":a": new Date().toISOString(), ":pendiente": "PENDIENTE_CARGA", ":encolado": "ENCOLADO", ":procesando": "PROCESANDO" } }));
      return true;
    } catch (error) {
      if (esCondicional(error)) return false;
      throw error;
    }
  }

  async listarVencidos(ahora: string): Promise<IntentoFoto[]> {
    const result = await this.db.send(new QueryCommand({ TableName: nombreTabla(), IndexName: "GSI1", KeyConditionExpression: "GSI1PK=:pk AND GSI1SK < :ahora", ExpressionAttributeValues: { ":pk": "FOTOS_PENDIENTES", ":ahora": `${ahora}#` }, Limit: 50 }));
    return (result.Items ?? []) as unknown as IntentoFoto[];
  }
}

export class FirmadorS3 implements FirmadorCarga {
  private readonly s3 = new S3Client({});
  async firmar(clave: string, mime: string, tamano: number): Promise<string> {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: process.env.BUCKET_MULTIMEDIA!, Key: clave, ContentType: mime, ContentLength: tamano, ServerSideEncryption: "AES256" }), { expiresIn: 300 });
  }
}

export class InspectorS3 {
  private readonly s3 = new S3Client({});
  async inspeccionar(bucket: string, key: string, versionId: string) {
    const salida = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId, Range: "bytes=0-7" }));
    const bytes = salida.Body ? await salida.Body.transformToByteArray() : new Uint8Array();
    return { tamano: Number(salida.ContentRange?.split("/").pop() || salida.ContentLength || 0), mime: salida.ContentType || "", bytes };
  }
}
