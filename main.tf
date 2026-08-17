terraform {
  required_version = ">= 1.8"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ── Proveedor primario (us-east-1) ──────────────────────────────────────────
provider "aws" {
  region = var.region_primaria
}

# ── Proveedor réplica (us-west-2) ───────────────────────────────────────────
# Necesario para que Terraform cree recursos en la región de réplica.
provider "aws" {
  alias  = "replica"
  region = var.region_replica
}

data "aws_caller_identity" "actual" {}

# ── Variables ────────────────────────────────────────────────────────────────
variable "entorno" {
  description = "Entorno de despliegue"
  type        = string
  default     = "prod"
}

variable "region_primaria" {
  description = "Región AWS principal"
  type        = string
  default     = "us-east-1"
}

variable "region_replica" {
  description = "Región AWS para réplica DynamoDB"
  type        = string
  default     = "us-west-2"
}

variable "nombre_tabla" {
  description = "Nombre de la tabla DynamoDB"
  type        = string
  default     = "MisionEmprende-prod"
}

variable "habilitar_cargas_fotografias" {
  description = "Habilita S3→SQS solo después de aprobar formalmente retención/eliminación"
  type        = bool
  default     = false
}

variable "modo_academy" {
  description = "Activa explícitamente S3 Static Website para AWS Academy; por defecto conserva CloudFront privado"
  type        = bool
  default     = false
}

locals {
  prefijo = "mision-emprende-${var.entorno}-${data.aws_caller_identity.actual.account_id}"
  tags = {
    Proyecto = "MisionEmprendeUDD"
    Entorno  = var.entorno
    IaC      = "Terraform"
  }
}

# ════════════════════════════════════════════════════════════════════════════
# DynamoDB — Tabla principal con réplica (Global Tables v2)
#
# La réplica activa-activa es una invariancia arquitectónica y no se omite.
# ════════════════════════════════════════════════════════════════════════════
resource "aws_dynamodb_table" "mision_emprende" {
  name         = var.nombre_tabla
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  # Réplica requiere streams habilitados internamente — AWS lo gestiona en Global Tables v2.
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "PK"
    type = "S"
  }
  attribute {
    name = "SK"
    type = "S"
  }
  attribute {
    name = "GSI1PK"
    type = "S"
  }
  attribute {
    name = "GSI1SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  # PITR habilitado — requerido para DynamoDB Export to S3 (examen Big Data)
  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  # Réplica activa-activa en us-west-2 (Global Tables v2)
  replica {
    region_name = var.region_replica
  }

  tags = local.tags
}

# ════════════════════════════════════════════════════════════════════════════
# S3 — Frontend (privado, servido por CloudFront)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_s3_bucket" "frontend" {
  bucket = "${local.prefijo}-frontend"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = !var.modo_academy
  ignore_public_acls      = true
  restrict_public_buckets = !var.modo_academy
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ════════════════════════════════════════════════════════════════════════════
resource "aws_cloudfront_origin_access_control" "frontend" {
  count                             = var.modo_academy ? 0 : 1
  name                              = "${local.prefijo}-frontend-oac"
  description                       = "Acceso privado de CloudFront al bucket frontend"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront entrega el sitio exclusivamente mediante HTTPS al navegador.
resource "aws_cloudfront_distribution" "frontend" {
  count               = var.modo_academy ? 0 : 1
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend-privado"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend[0].id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend-privado"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate { cloudfront_default_certificate = true }
  tags = local.tags
}

resource "aws_s3_bucket_policy" "frontend" {
  count  = var.modo_academy ? 0 : 1
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipalReadOnly"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.frontend[0].arn
        }
      }
    }]
  })
}

resource "aws_s3_bucket_website_configuration" "frontend_academy" {
  count  = var.modo_academy ? 1 : 0
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

resource "aws_s3_bucket_policy" "frontend_academy" {
  count  = var.modo_academy ? 1 : 0
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "LecturaPublicaSoloFrontendAcademy"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

# ════════════════════════════════════════════════════════════════════════════
# S3 — Multimedia (imágenes y videos, acceso por URL pre-firmada)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_s3_bucket" "multimedia" {
  bucket = "${local.prefijo}-multimedia"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "multimedia" {
  bucket = aws_s3_bucket.multimedia.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "multimedia" {
  bucket = aws_s3_bucket.multimedia.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "multimedia" {
  bucket = aws_s3_bucket.multimedia.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "multimedia" {
  bucket = aws_s3_bucket.multimedia.id

  rule {
    id     = "retencion-fotografias-30-dias"
    status = "Enabled"

    filter { prefix = "entradas/" }

    expiration { days = 30 }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }

  }

  rule {
    id     = "limpiar-delete-markers-fotografias"
    status = "Enabled"
    filter { prefix = "entradas/" }
    expiration { expired_object_delete_marker = true }
  }

  depends_on = [aws_s3_bucket_versioning.multimedia]
}

resource "aws_s3_bucket_cors_configuration" "multimedia" {
  bucket = aws_s3_bucket.multimedia.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["PUT"]
    allowed_origins = [var.modo_academy ? "http://${aws_s3_bucket_website_configuration.frontend_academy[0].website_endpoint}" : "https://${aws_cloudfront_distribution.frontend[0].domain_name}"]
    max_age_seconds = 3000
  }
}

# ════════════════════════════════════════════════════════════════════════════
# SNS — Tema de alarmas operables (Épica 6, AD-9)
#
# Terraform posee el tema y sus outputs (AD-8); SAM solo lo referencia por ARN
# vía el parámetro ArnTemaAlarmas. Sin suscriptores reales por defecto: agregar
# un email/SMS real requiere aprobación explícita (Ask First).
# ════════════════════════════════════════════════════════════════════════════
resource "aws_sns_topic" "alarmas" {
  name = "${local.prefijo}-alarmas"
  tags = local.tags
}

# Cola y DLQ son bulkheads propios del procesamiento fotográfico. La activación
# del evento permanece bloqueada por defecto hasta aprobar la política de retención.
resource "aws_sqs_queue" "fotografias_dlq" {
  name                      = "${local.prefijo}-fotografias-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
  tags                      = local.tags
}

resource "aws_sqs_queue" "fotografias" {
  name                       = "${local.prefijo}-fotografias"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.fotografias_dlq.arn
    maxReceiveCount     = 4
  })
  tags = local.tags
}

resource "aws_sqs_queue_policy" "fotografias" {
  queue_url = aws_sqs_queue.fotografias.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "S3SoloBucketMultimedia", Effect = "Allow",
      Principal = { Service = "s3.amazonaws.com" }, Action = "sqs:SendMessage",
      Resource  = aws_sqs_queue.fotografias.arn,
      Condition = {
        ArnEquals    = { "aws:SourceArn" = aws_s3_bucket.multimedia.arn }
        StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.actual.account_id }
      }
    }]
  })
}

resource "aws_s3_bucket_notification" "fotografias" {
  count  = var.habilitar_cargas_fotografias ? 1 : 0
  bucket = aws_s3_bucket.multimedia.id
  queue {
    queue_arn     = aws_sqs_queue.fotografias.arn
    events        = ["s3:ObjectCreated:Put"]
    filter_prefix = "entradas/"
  }
  depends_on = [aws_sqs_queue_policy.fotografias]
}

resource "aws_cloudwatch_metric_alarm" "fotografias_dlq" {
  alarm_name          = "${local.prefijo}-fotografias-dlq-visible"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.fotografias_dlq.name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_description   = "Existen fotografías que agotaron sus reintentos. Diagnóstico: revisar el reconciliador (CloudWatch Logs) y evaluar redrive autorizado (AD-5)."
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "fotografias_antiguedad" {
  alarm_name          = "${local.prefijo}-fotografias-antiguedad"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  dimensions          = { QueueName = aws_sqs_queue.fotografias.name }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 300
  comparison_operator = "GreaterThanThreshold"
  alarm_description   = "La cola fotográfica no está drenando a tiempo. Diagnóstico: revisar errores/concurrencia de FuncionConsumidorFotografias en CloudWatch Logs."
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

# ════════════════════════════════════════════════════════════════════════════
# Alarmas de Global Tables (Épica 6, AD-9): latencia de replicación y
# throttling de la tabla. Umbrales provisionales, pendientes de calibración
# por prueba de carga (fuera de esta épica).
# ════════════════════════════════════════════════════════════════════════════
resource "aws_cloudwatch_metric_alarm" "replica_latencia" {
  alarm_name          = "${local.prefijo}-replica-latencia"
  namespace           = "AWS/DynamoDB"
  metric_name         = "ReplicationLatency"
  dimensions          = { TableName = aws_dynamodb_table.mision_emprende.name, ReceivingRegion = var.region_replica }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 5000
  comparison_operator = "GreaterThanThreshold"
  alarm_description   = "Latencia de replicación Global Tables hacia la réplica por encima de lo esperado (umbral provisional). Diagnóstico: consola DynamoDB > Global Tables > estado de la réplica."
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "tabla_throttle_lectura" {
  alarm_name          = "${local.prefijo}-tabla-throttle-lectura"
  namespace           = "AWS/DynamoDB"
  metric_name         = "ReadThrottleEvents"
  dimensions          = { TableName = aws_dynamodb_table.mision_emprende.name }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_description   = "Solicitudes de lectura limitadas (throttled) contra la tabla principal. Diagnóstico: revisar el estado del Circuit Breaker (CloudWatch Logs/EMF RuptorEstado) y considerar failover."
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

resource "aws_cloudwatch_metric_alarm" "tabla_throttle_escritura" {
  alarm_name          = "${local.prefijo}-tabla-throttle-escritura"
  namespace           = "AWS/DynamoDB"
  metric_name         = "WriteThrottleEvents"
  dimensions          = { TableName = aws_dynamodb_table.mision_emprende.name }
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_description   = "Solicitudes de escritura limitadas (throttled) contra la tabla principal. Diagnóstico: revisar el estado del Circuit Breaker (CloudWatch Logs/EMF RuptorEstado) y considerar failover."
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alarmas.arn]
}

# ════════════════════════════════════════════════════════════════════════════
# S3 — Data Lake para Athena (examen Big Data)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_s3_bucket" "datalake" {
  bucket = "${local.prefijo}-datalake"
  tags   = merge(local.tags, { Uso = "BigData-Athena" })
}

resource "aws_s3_bucket_public_access_block" "datalake" {
  bucket = aws_s3_bucket.datalake.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Carpeta lógica para resultados de queries Athena
resource "aws_s3_object" "athena_resultados" {
  bucket  = aws_s3_bucket.datalake.id
  key     = "athena-resultados/"
  content = ""
}

# ════════════════════════════════════════════════════════════════════════════
# Athena — Base de datos para KPIs (examen)
# ════════════════════════════════════════════════════════════════════════════
resource "aws_athena_database" "mision_emprende" {
  name   = "mision_emprende_db"
  bucket = aws_s3_bucket.datalake.id

  force_destroy = true
}

resource "aws_athena_workgroup" "mision_emprende" {
  name = "${local.prefijo}-workgroup"

  configuration {
    result_configuration {
      output_location = "s3://${aws_s3_bucket.datalake.bucket}/athena-resultados/"
    }
  }

  tags = local.tags
}

# ════════════════════════════════════════════════════════════════════════════
# Outputs
# ════════════════════════════════════════════════════════════════════════════
output "url_frontend" {
  description = "URL del frontend según modo productivo o AWS Academy"
  value       = var.modo_academy ? "http://${aws_s3_bucket_website_configuration.frontend_academy[0].website_endpoint}" : "https://${aws_cloudfront_distribution.frontend[0].domain_name}"
}

output "id_cloudfront" {
  description = "ID de distribución para invalidaciones del despliegue"
  value       = var.modo_academy ? "" : aws_cloudfront_distribution.frontend[0].id
}

output "nombre_bucket_frontend" {
  description = "Nombre del bucket S3 del frontend"
  value       = aws_s3_bucket.frontend.id
}

output "nombre_bucket_multimedia" {
  description = "Nombre del bucket S3 de multimedia"
  value       = aws_s3_bucket.multimedia.id
}

output "nombre_bucket_datalake" {
  description = "Nombre del bucket S3 del data lake"
  value       = aws_s3_bucket.datalake.id
}

output "nombre_tabla_dynamodb" {
  description = "Nombre de la tabla DynamoDB"
  value       = aws_dynamodb_table.mision_emprende.name
}

output "arn_tabla_dynamodb" {
  description = "ARN de la tabla DynamoDB"
  value       = aws_dynamodb_table.mision_emprende.arn
}

output "arn_cola_fotos" {
  description = "ARN de la cola SQS de fotografías"
  value       = aws_sqs_queue.fotografias.arn
}

output "arn_dlq_fotos" {
  description = "ARN de la DLQ de fotografías"
  value       = aws_sqs_queue.fotografias_dlq.arn
}

output "cargas_fotografias_habilitadas" {
  description = "Gate de retención aplicado al evento S3→SQS"
  value       = var.habilitar_cargas_fotografias
}

output "arn_tema_alarmas" {
  description = "ARN del tema SNS de alarmas operables (parámetro ArnTemaAlarmas de SAM); sin suscriptores reales por defecto"
  value       = aws_sns_topic.alarmas.arn
}
