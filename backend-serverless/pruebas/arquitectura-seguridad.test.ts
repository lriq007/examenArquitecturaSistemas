import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync("template.yaml", "utf8");
const terraform = readFileSync("../main.tf", "utf8");

describe("arquitectura de seguridad desplegable", () => {
  it("no usa anchors, aliases ni merges YAML incompatibles con CloudFormation", () => {
    expect(template).not.toMatch(/&[A-Za-z_]/);
    expect(template).not.toMatch(/\*[A-Za-z_]/);
    expect(template).not.toContain("<<:");
  });
  it("declara Cognito, authorizers separados y Grupo como protección por defecto", () => {
    expect(template).toContain("DefaultAuthorizer: AuthorizerGrupos");
    expect(template).toContain("AuthorizerProfesores:");
    expect(template).toContain("AuthorizerGrupos:");
    expect(template).toContain("AccessTokenValidity: 8");
    expect(template).toContain('"POST /api/acceso/ingresar"');
    expect(template).toContain("ThrottlingRateLimit: 2");
  });

  it("solo deja públicos los dos ingresos y protege Profesor/Analytics con su authorizer", () => {
    expect((template.match(/Authorizer: NONE/g) ?? [])).toHaveLength(2);
    expect((template.match(/Authorizer: AuthorizerProfesores/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("no conserva secretos HMAC, clave global ni rol académico amplio", () => {
    const autoridadesHeredadas = [
      "Clave" + "Token",
      "ClaveAcceso" + "Profesor",
      "CLAVE_" + "TOKEN",
      "CLAVE_ACCESO_" + "PROFESOR",
      "profe" + "123",
    ];
    for (const autoridad of autoridadesHeredadas) expect(template).not.toContain(autoridad);
  });

  it("empaqueta todos los handlers declarados", () => {
    const packageJson = readFileSync("package.json", "utf8");
    for (const modulo of ["acceso", "profesor", "sesiones", "fase1", "fase2", "fase3", "fase4", "fase5", "analytics"]) {
      expect(packageJson).toContain(`src/${modulo}/api.ts`);
    }
  });

  it("preserva Global Tables activa-activa y expone frontend HTTPS", () => {
    expect(terraform).toContain("replica {");
    expect(terraform).toContain("region_name = var.region_replica");
    expect(terraform).toContain('viewer_protocol_policy = "redirect-to-https"');
    expect(terraform).toContain('"https://${aws_cloudfront_distribution.frontend[0].domain_name}"');
    expect(terraform).toContain('origin_access_control_origin_type = "s3"');
    expect(terraform).toContain("bucket_regional_domain_name");
    expect(terraform).toContain('variable "modo_academy"');
    expect(terraform).toMatch(/variable "modo_academy"[\s\S]*?default\s*=\s*false/);
    expect(terraform).toContain("block_public_policy     = true");
  });

  it("aísla la adaptación Academy y conserva productivo como modo predeterminado", () => {
    expect(template).toContain("AllowedValues: [productivo, academy]");
    expect(template).toContain("Condition: EsProductivo");
    expect(template).toContain('arn:aws:iam::${AWS::AccountId}:role/LabRole');
    expect((template.match(/Role: !If \[EsAcademy/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect(template).toContain("OrigenCorsProductivoConfirmado:");
    expect(template).toContain("!Equals [!Ref OrigenCors, !Ref OrigenCorsProductivoConfirmado]");
    expect(template).not.toContain("!Split");
    expect(template).not.toContain("!Select");
    expect(terraform).toContain('resource "aws_s3_bucket_website_configuration" "frontend_academy"');
    expect(terraform).toContain('Sid       = "LecturaPublicaSoloFrontendAcademy"');
    expect(terraform).toContain('Action    = "s3:GetObject"');
    expect(terraform).toContain('Resource  = "${aws_s3_bucket.frontend.arn}/*"');
    expect(terraform).toMatch(/resource "aws_s3_bucket_public_access_block" "multimedia"[\s\S]*?block_public_policy\s*=\s*true[\s\S]*?restrict_public_buckets\s*=\s*true/);
    expect(terraform).toMatch(/resource "aws_s3_bucket_public_access_block" "datalake"[\s\S]*?block_public_policy\s*=\s*true[\s\S]*?restrict_public_buckets\s*=\s*true/);
    expect(terraform).toContain("count  = var.modo_academy ? 0 : 1");
  });

  it("aplica la política aprobada de retención fotográfica sin habilitar cargas por defecto", () => {
    expect(terraform).toContain('id     = "retencion-fotografias-30-dias"');
    expect(terraform).toContain('filter { prefix = "entradas/" }');
    expect(terraform).toMatch(/expiration\s*\{\s*days\s*=\s*30\s*\}/);
    expect(terraform).toMatch(/noncurrent_version_expiration\s*\{\s*noncurrent_days\s*=\s*1\s*\}/);
    expect(terraform).toContain("expired_object_delete_marker = true");
    expect(terraform).toContain("message_retention_seconds = 1209600");
    expect(terraform).toMatch(/variable "habilitar_cargas_fotografias"[\s\S]*?default\s*=\s*false/);
  });

  it("conecta un tema SNS de alarmas operables sin solapar propiedad Terraform/SAM (AD-8)", () => {
    // Terraform posee el tema y lo publica por output; SAM solo lo referencia por parámetro.
    expect(terraform).toContain('resource "aws_sns_topic" "alarmas"');
    expect(terraform).toContain('output "arn_tema_alarmas"');
    expect(terraform).not.toContain("aws_sns_topic_subscription"); // Sin destinatario real por defecto (Ask First).

    expect(template).toContain("ArnTemaAlarmas:");
    expect(template).not.toContain('resource "aws_sns_topic"');
  });

  it("conecta AlarmActions al tema SNS en todas las alarmas operables nuevas y existentes", () => {
    // SAM: Lambda/API.
    expect(template).toMatch(/AlarmaErroresConsumidorFotos:[\s\S]*?AlarmActions: \[!Ref ArnTemaAlarmas\]/);
    expect(template).toMatch(/AlarmaErroresAnalytics:[\s\S]*?AlarmActions: \[!Ref ArnTemaAlarmas\]/);
    expect(template).toMatch(/AlarmaAutenticacionAnomala:[\s\S]*?AlarmActions: \[!Ref ArnTemaAlarmas\]/);

    // Terraform: SQS/DLQ y Global Tables.
    expect(terraform).toMatch(/resource "aws_cloudwatch_metric_alarm" "fotografias_dlq"[\s\S]*?alarm_actions\s*=\s*\[aws_sns_topic\.alarmas\.arn\]/);
    expect(terraform).toMatch(/resource "aws_cloudwatch_metric_alarm" "fotografias_antiguedad"[\s\S]*?alarm_actions\s*=\s*\[aws_sns_topic\.alarmas\.arn\]/);
    expect(terraform).toMatch(/resource "aws_cloudwatch_metric_alarm" "replica_latencia"[\s\S]*?alarm_actions\s*=\s*\[aws_sns_topic\.alarmas\.arn\]/);
    expect(terraform).toMatch(/resource "aws_cloudwatch_metric_alarm" "tabla_throttle_lectura"[\s\S]*?alarm_actions\s*=\s*\[aws_sns_topic\.alarmas\.arn\]/);
    expect(terraform).toMatch(/resource "aws_cloudwatch_metric_alarm" "tabla_throttle_escritura"[\s\S]*?alarm_actions\s*=\s*\[aws_sns_topic\.alarmas\.arn\]/);
  });

  it("documenta un procedimiento de diagnóstico en cada alarma operable nueva", () => {
    for (const bloque of [
      /AlarmaErroresAnalytics:[\s\S]*?AlarmDescription: >[\s\S]*?Diagnóstico/,
      /AlarmaAutenticacionAnomala:[\s\S]*?AlarmDescription: >[\s\S]*?Diagnóstico/,
    ]) {
      expect(template).toMatch(bloque);
    }

    for (const nombre of ["replica_latencia", "tabla_throttle_lectura", "tabla_throttle_escritura"]) {
      const bloque = new RegExp(`resource "aws_cloudwatch_metric_alarm" "${nombre}"[\\s\\S]*?Diagnóstico`);
      expect(terraform).toMatch(bloque);
    }
  });
});
