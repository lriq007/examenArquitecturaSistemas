- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-evidencia-fotografica-lego-confiable.md`
  summary: Conectar las alarmas fotográficas a destinos operables de notificación y escalamiento en la Épica 6.
  evidence: Las alarmas y métricas existen y fueron verificadas, pero AlarmActions/SNS forma parte de la operabilidad y observabilidad transversal planificada para la Épica 6.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-4-evidencia-fotografica-lego-confiable.md`
  summary: Definir la limpieza o anonimización de metadatos DynamoDB cuando expire físicamente una fotografía.
  evidence: La política aprobada elimina objetos y versiones S3, mientras los metadatos de auditoría permanecen; su retención no fue definida por el intent de la Épica 4.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-6-continuidad-y-recuperacion-verificables.md`
  summary: Agregar alarmas propias sobre las métricas EMF que emite el Circuit Breaker de failover (`RuptorEstado`, `RuptorAbre`/`RuptorReapertura`, `RuptorRechazoControlado`, `RuptorReplicaFallo`, etc.).
  evidence: Revisión adversarial de la Épica 6 (3 capas) confirmó que las métricas EMF del breaker se emiten y son observables en CloudWatch Logs/Metrics, pero el AC de la Historia 6.3 solo exige alarmas para errores Lambda sostenidos, cola SQS antigua/profunda, DLQ no vacía, autenticación anómala y latencia de replicación — no exige una alarma propia sobre el estado del breaker; agregarlas queda fuera del alcance verificado de esta épica.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-6-continuidad-y-recuperacion-verificables.md`
  summary: Agregar un guardrail/alarma que detecte automáticamente flags de caos (`SIMULAR_FALLO_DYNAMODB_PRINCIPAL`, `CaosFotos`) dejados encendidos en un stack ya desplegado.
  evidence: Revisión adversarial de la Épica 6 (3 capas) señaló el riesgo operacional, pero ningún AC de la Épica 6 pide una alarma de este tipo; los flags ya están apagados por defecto en `template.yaml` (`Default: "false"`) y su reversibilidad se verifica en los experimentos de caos automatizados (6.4/6.5), lo cual se consideró evidencia suficiente para el alcance actual.
