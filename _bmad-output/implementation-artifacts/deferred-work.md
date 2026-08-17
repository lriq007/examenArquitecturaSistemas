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

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-5-resultados-kpis-confiables.md`
  summary: `mapearFilaKpis` coerciona silenciosamente columnas numéricas malformadas/ausentes (`total_alumnos`, `promedio_tokens`, etc.) a `0`/`null` sin diagnóstico, mientras `schema_version` sí falla explícito.
  evidence: Revisión adversarial (blind-hunter) de la Épica 5; el patrón `numeroONull` es preexistente (ya vivía en `analytics/servicio.ts` antes de este cambio, solo se relocalizó al contrato) y no fue introducido por esta historia.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-5-resultados-kpis-confiables.md`
  summary: `obtenerKpisSesion` sigue construyendo el `WHERE sesion_id = '${sesionId}'` de Athena por interpolación de string en vez de una consulta parametrizada.
  evidence: Revisión adversarial (blind-hunter) de la Épica 5; el patrón es preexistente al cambio y hoy está mitigado por la validación de formato UUID en `analytics/api.ts` antes de invocar el servicio; endurecerlo es una mejora independiente de esta historia.

- source_spec: `_bmad-output/implementation-artifacts/spec-epic-5-resultados-kpis-confiables.md`
  summary: Definir el proceso de migración/rollout para una futura versión de contrato analítico incompatible (`1.1`/`2.0`), más allá de la validación puntual ya implementada.
  evidence: Revisión adversarial (blind-hunter) de la Épica 5; los criterios de aceptación de la Historia 5.2 solo exigen que hoy exista una versión (`1.0`), que un campo aditivo se tolere y que una versión incompatible falle identificable — no exigen diseñar el proceso operativo para una migración futura real, que aún no existe.
