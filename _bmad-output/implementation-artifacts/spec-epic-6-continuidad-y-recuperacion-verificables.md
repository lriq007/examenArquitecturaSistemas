---
title: 'Épica 6: Continuidad y recuperación verificables'
type: 'feature'
created: '2026-08-17'
status: 'done'
review_loop_iteration: 0
baseline_commit: 'a2bea3f99ce8e00701cb49e00af0b58e39b136c8'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-baseDatosAvanzadas-examen-2026-08-16/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/patrones-diseno-seleccionados.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El failover de DynamoDB hoy es un mecanismo ad-hoc por instancia sin estados explícitos, sin métricas ni pruebas; Analytics no tiene concurrencia ni alarma propias; no existe logging estructurado ni correlación; las alarmas existentes no notifican a nadie; y los dos experimentos de caos (fallo regional, fallo de la consumidora fotográfica) son manuales, no repetibles y sin evidencia automatizada.

**Approach:** Refactorizar el failover de `baseDatos.ts` en un breaker testeable con estados CERRADO/ABIERTO/SEMI_ABIERTO, umbral de fallos y métricas EMF; completar el aislamiento de Analytics (concurrencia, timeout, alarma); crear un logger/correlación compartido reutilizado por el breaker, la consumidora y `respuestas.ts`; conectar todas las alarmas a un tema SNS nuevo y sumar las que faltan (réplica, Analytics, autenticación anómala); y convertir ambos experimentos manuales en scripts/pruebas Vitest reproducibles, apagados por defecto, que registran estado estable, hipótesis, radio, aserciones, resultado y recuperación.

## Boundaries & Constraints

**Always:** Global Tables activa-activa en `us-east-1`/`us-west-2` como única Golden Copy, sin retirar la réplica nunca; toda inyección de fallo (`SIMULAR_FALLO_DYNAMODB_PRINCIPAL`, `CAOS_FOTOS`) apagada por defecto y reversible; propiedad Terraform/SAM sin solapamiento (AD-8): Terraform posee DynamoDB, SQS/DLQ, sus alarmas y el nuevo tema SNS; SAM posee Lambdas, API Gateway y alarmas de Lambda/API, referenciando el ARN del tema por parámetro; el experimento fotográfico limita su fallo a un único trabajo de prueba (nunca a toda la cola); redacción de tokens/secretos en cualquier log nuevo; usar `LabRole` existente, sin nuevos roles IAM.

**Ask First:** cambiar el umbral/ventana de fallos del breaker o los umbrales de alarma más allá de valores provisionales documentados como pendientes de calibración por prueba de carga; agregar un destinatario real (email/SMS) a la suscripción SNS; ejecutar cualquier experimento contra un entorno ya desplegado con datos reales.

**Never:** Circuit Breaker con estado compartido entre ejecuciones Lambda (AD-9 lo descarta explícitamente); Cache-Aside; declarar "Circuit Breaker" o "Bulkhead" sin la configuración, métrica y prueba que lo respalde; reintentos automáticos adicionales fuera de los ya decididos; ejecutar caos automáticamente desde CI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Fallos bajo umbral | 1..N-1 errores elegibles en primaria (CERRADO) | Reintenta primaria cada vez, sin abrir | Métrica de error emitida, sin transición |
| Umbral superado | N-ésimo error elegible | Transición a ABIERTO, cooldown, usa réplica | Métrica de apertura + evento estructurado |
| Cooldown vigente | Nueva operación durante ABIERTO | Rechazo controlado de primaria, va directo a réplica | Métrica `rechazoControlado` |
| Expira cooldown | Cooldown vencido | Transición a SEMI_ABIERTO, prueba primaria una vez | Éxito → CERRADO; fallo → reabre ABIERTO |
| Contención bulkhead | Saturación simulada de fotos/Analytics | Ruta interactiva de prueba responde dentro del estado estable | Prueba falla si hay degradación cruzada |
| Caos Dynamo activado | `SIMULAR_FALLO_DYNAMODB_PRINCIPAL=true` en entorno acotado | Breaker abre, continuidad por réplica, evidencia registrada | Al terminar, flag vuelve a `false` y breaker cierra |
| Caos consumidora activado | Un trabajo de prueba con `CAOS_FOTOS_TRABAJO_ID` fijado | Reintentos SQS agotados → DLQ, sin duplicar efecto | Otros trabajos en la misma cola no se ven afectados |
| Redrive documentado | Mensaje en DLQ, falla retirada | Redrive mueve el mensaje a la cola principal | Trabajo termina `PROCESADA`, evidencia actualizada |

</frozen-after-approval>

## Code Map

- `backend-serverless/src/compartido/baseDatos.ts:15-236` -- lógica de failover actual (cooldown único, sin estados nombrados, sin umbral, sin métricas, `SIMULAR_FALLO_DYNAMODB_PRINCIPAL` en línea 185); refactorizar en un breaker inyectable y testeable, conservando el `Proxy` exportado (líneas 247-279) como wiring de producción.
- `backend-serverless/src/compartido/observabilidad.ts` (nuevo) -- logger estructurado con correlación (`crearRegistrador`), redacción de secretos y emisor de métricas EMF (`emitirMetricaEMF`) vía `console.log`, sin permisos IAM nuevos.
- `backend-serverless/src/compartido/respuestas.ts:43-59` -- enrutar `responderError` por el logger nuevo con `correlationId` de `event.requestContext.requestId`.
- `backend-serverless/src/fotografias/consumidor.ts:9,24,35,46` -- acotar `CAOS_FOTOS` a un `trabajoId` específico vía `CAOS_FOTOS_TRABAJO_ID`; usar el logger para eventos por trabajo.
- `backend-serverless/src/fotografias/reconciliador.ts:17-33` -- usar el logger/métricas para DLQ y expiración.
- `backend-serverless/template.yaml:907-937` (`FuncionAnalytics`) -- agregar `ReservedConcurrentExecutions`, `Timeout` explícito y alarma propia; `template.yaml:1024-1036` (`AlarmaErroresConsumidorFotos`) -- agregar `AlarmActions`; nuevo parámetro `ArnTemaAlarmas`; nueva alarma de autenticación anómala sobre `ApiBackend` (línea 128); parametrizar `CAOS_FOTOS` (hoy fijo en línea 987) igual que `SimularFalloDynamoPrincipal` (líneas 62-68).
- `main.tf:77-126` (tabla+réplica), `:354-380` (alarmas SQS existentes sin `alarm_actions`) -- agregar `aws_sns_topic.alarmas` + output `arn_tema_alarmas`, `alarm_actions` en ambas alarmas, y alarmas nuevas de latencia/throttle de réplica.
- `backend-serverless/pruebas/arquitectura-seguridad.test.ts` -- patrón existente de aserciones sobre `template.yaml`/`main.tf` como texto; extender con `pruebas/bulkhead-contencion.test.ts` (nuevo) para aislamiento.
- `backend-serverless/pruebas/caos/` (nuevo) -- `failover-dynamodb.test.ts` y `consumidor-fotografias.test.ts`, más `redrive-fotografias.ts` (script de redrive documentado, reutilizado por el segundo).
- `_bmad-output/implementation-artifacts/experimento-chaos-fotografias.md` -- reemplazar por evidencia generada por el script automatizado; nuevo `experimento-chaos-dynamodb.md` análogo para 6.4.

## Tasks & Acceptance

**Execution:**
- [x] `backend-serverless/src/compartido/baseDatos.ts` -- extraer un breaker inyectable con estados `CERRADO|ABIERTO|SEMI_ABIERTO`, contador de fallos consecutivos y `UMBRAL_FALLOS` configurable; mantener el `Proxy`/`nombreTabla()` públicos -- habilita 6.1 y hace testeable el mecanismo.
- [x] `backend-serverless/src/compartido/baseDatos.test.ts` (nuevo) -- clientes falsos por región, cubre las 4 filas de la matriz de estados -- evidencia de Circuit Breaker.
- [x] `backend-serverless/src/compartido/observabilidad.ts` (nuevo) + integración en `baseDatos.ts`, `respuestas.ts`, `consumidor.ts`, `reconciliador.ts` -- logs JSON correlacionables sin secretos y métricas EMF de estado/errores/cola -- cumple 6.3.
- [x] `backend-serverless/template.yaml` -- `ReservedConcurrentExecutions`/`Timeout`/alarma para `FuncionAnalytics`; `AlarmActions` en la alarma existente; parámetro `ArnTemaAlarmas`; alarma de autenticación anómala; parametrizar `CAOS_FOTOS` -- cierra 6.2 y 6.3.
- [x] `main.tf` -- tema SNS + output; `alarm_actions` en alarmas de fotos; alarmas de latencia de réplica/throttle de la tabla -- cierra 6.3 sin romper AD-8.
- [x] `backend-serverless/pruebas/bulkhead-contencion.test.ts` (nuevo) -- asserts estructurales de aislamiento por clase + simulación de saturación fotos/Analytics con ruta interactiva de control -- evidencia de Bulkhead para 6.2.
- [x] `backend-serverless/pruebas/caos/failover-dynamodb.test.ts` + evidencia -- activa `SIMULAR_FALLO_DYNAMODB_PRINCIPAL`, verifica transición de estados y continuidad por réplica, restaura el flag -- cumple 6.4.
- [x] `backend-serverless/src/fotografias/consumidor.ts` + `pruebas/caos/consumidor-fotografias.test.ts` + `redrive-fotografias.ts` + evidencia -- acota el fallo a un trabajo, agota reintentos hasta DLQ, ejecuta redrive documentado, confirma `PROCESADA` sin duplicar -- cumple 6.5.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marcar `epic-6` y 6.1–6.5 `done` solo tras verificar todo.

**Acceptance Criteria:**
- Given un umbral de fallos configurado, when la primaria falla esa cantidad de veces, then el breaker abre, sirve desde la réplica y emite métricas de estado/errores/recuperación, sin retirar la réplica.
- Given saturación simulada de fotos/Analytics, when se ejecuta la prueba de contención, then una ruta interactiva de control permanece dentro del estado estable definido.
- Given cualquier request, sesión, grupo o trabajo fotográfico, when se registra un evento, then el log es correlacionable y no contiene tokens ni secretos.
- Given errores Lambda sostenidos, cola vieja/profunda, DLQ no vacía o latencia de réplica, when se supera el umbral, then una alarma con `AlarmActions` hacia el tema SNS se activa con procedimiento de diagnóstico documentado.
- Given cada experimento apagado por defecto, when se activa explícitamente en alcance acotado, then produce evidencia con estado estable/hipótesis/radio/aserciones/resultado/recuperación y vuelve a apagarse solo.

## Design Notes

Los dos experimentos ejecutan el código real (no dobles) contra el mecanismo de simulación ya existente en cada capa (`SIMULAR_FALLO_DYNAMODB_PRINCIPAL`, `CAOS_FOTOS`), igual que el experimento manual previo de fotografías: esto es lo que permite llamarlos "simulados"/"controlados" en las AC sin necesitar apagar infraestructura real de AWS Academy. `SEMI_ABIERTO` es una transición síncrona dentro de una misma invocación (Lambda no mantiene un temporizador de fondo): se modela y se loggea explícitamente en el momento en que expira el cooldown y se reintenta la primaria, no como un estado persistente adicional. El umbral de alarmas se deja parametrizado con un valor por defecto marcado como provisional; la calibración final es tarea posterior a la prueba de carga (fuera de esta épica).

## Verification

**Commands:**
- `cd backend-serverless && npm run tipos` -- expected: sin errores de tipos
- `cd backend-serverless && npm run pruebas` -- expected: incluye `baseDatos.test.ts`, `bulkhead-contencion.test.ts` y `pruebas/caos/*.test.ts` en verde, con las inyecciones de caos apagadas por defecto tras cada test
- `cd backend-serverless && npm run sam:validar` -- expected: `template.yaml` válido con las nuevas alarmas/parámetro
- `terraform -chdir=. fmt -check && terraform -chdir=. validate` -- expected: `main.tf` válido con el tema SNS y las alarmas nuevas

## Suggested Review Order

**Circuit Breaker de failover DynamoDB (6.1)**

- Punto de entrada: fábrica del breaker con estados explícitos, umbral y guard de misma región.
  [`baseDatos.ts:134`](../../backend-serverless/src/compartido/baseDatos.ts#L134)

- Guard restaurado: nunca "falla" hacia la misma región por mala configuración.
  [`baseDatos.ts:165`](../../backend-serverless/src/compartido/baseDatos.ts#L165)

- Transición SEMI_ABIERTO: prueba la primaria tras el cooldown y ahora se resetea a CERRADO si el error no es elegible.
  [`baseDatos.ts:212`](../../backend-serverless/src/compartido/baseDatos.ts#L212)

- Umbral de fallos consecutivos antes de abrir, configurable sin recompilar.
  [`baseDatos.ts:22`](../../backend-serverless/src/compartido/baseDatos.ts#L22)

- Simulación de fallo reutilizable por el código real y por el experimento de caos 6.4.
  [`baseDatos.ts:283`](../../backend-serverless/src/compartido/baseDatos.ts#L283)

- Wiring de producción: qué cliente es primario/réplica y cómo se arma el Proxy exportado.
  [`baseDatos.ts:334`](../../backend-serverless/src/compartido/baseDatos.ts#L334)

- Parámetros SAM que exponen umbral/cooldown como configuración desplegable.
  [`template.yaml:76`](../../backend-serverless/template.yaml#L76)

**Observabilidad correlacionada (6.3)**

- Logger estructurado con redacción de secretos y correlación por `correlationId`.
  [`observabilidad.ts:86`](../../backend-serverless/src/compartido/observabilidad.ts#L86)

- Métricas EMF vía `console.log`, sin permisos IAM nuevos.
  [`observabilidad.ts:128`](../../backend-serverless/src/compartido/observabilidad.ts#L128)

- Patrón de redacción de secretos, acotado para no ocultar el campo de dominio `clave`.
  [`observabilidad.ts:23`](../../backend-serverless/src/compartido/observabilidad.ts#L23)

- Log de error de fotografías ahora usa el logger con contexto del trabajo cuando existe.
  [`consumidor.ts:59`](../../backend-serverless/src/fotografias/consumidor.ts#L59)

- Reconciliador solo reporta métrica/log cuando la transición realmente ocurrió (no en no-ops).
  [`reconciliador.ts:28`](../../backend-serverless/src/fotografias/reconciliador.ts#L28)

- Errores de API enrutados por el logger compartido con `requestId` de correlación.
  [`respuestas.ts:45`](../../backend-serverless/src/compartido/respuestas.ts#L45)

**Bulkhead y alarmas operables (6.2 / 6.3)**

- Analytics gana concurrencia reservada, timeout y alarma propia, igual que fotografías.
  [`template.yaml:947`](../../backend-serverless/template.yaml#L947)

- Alarmas de fotos/Analytics/autenticación con descripciones honestas sobre su sensibilidad real.
  [`template.yaml:1066`](../../backend-serverless/template.yaml#L1066)

- Tema SNS nuevo (Terraform) que conecta todas las alarmas, sin suscriptor real por diseño.
  [`main.tf:312`](../../main.tf#L312)

- Alarmas nuevas de réplica/throttle de la tabla, todas conectadas al mismo tema.
  [`main.tf:401`](../../main.tf#L401)

- Prueba de contención: ruta interactiva de control permanece estable bajo saturación simulada.
  [`bulkhead-contencion.test.ts:149`](../../backend-serverless/pruebas/bulkhead-contencion.test.ts#L149)

**Experimentos de caos automatizados (6.4 / 6.5)**

- Experimento de indisponibilidad regional: activa, verifica transición de estados y restaura el flag.
  [`failover-dynamodb.test.ts:45`](../../backend-serverless/pruebas/caos/failover-dynamodb.test.ts#L45)

- Experimento del consumidor fotográfico: agota reintentos, DLQ, redrive documentado y `PROCESADA` sin duplicar.
  [`consumidor-fotografias.test.ts:171`](../../backend-serverless/pruebas/caos/consumidor-fotografias.test.ts#L171)

- Fallo controlado acotado a un único trabajo de prueba, nunca a toda la cola.
  [`consumidor.ts:16`](../../backend-serverless/src/fotografias/consumidor.ts#L16)

- Evidencia se escribe siempre (éxito o falla) resolviendo la ruta desde la ubicación del módulo.
  [`evidencia.ts:16`](../../backend-serverless/pruebas/caos/evidencia.ts#L16)

**Periféricos**

- Cobertura directa del wiring de producción del breaker (Proxy real, no solo la fábrica).
  [`baseDatos.produccion.test.ts`](../../backend-serverless/src/compartido/baseDatos.produccion.test.ts#L1)

- Cobertura del `manejador()` real leyendo `CAOS_FOTOS`/`CAOS_FOTOS_TRABAJO_ID` desde el entorno.
  [`consumidor.test.ts`](../../backend-serverless/src/fotografias/consumidor.test.ts#L1)

- Estado de sprint actualizado solo para `epic-6` y sus 5 historias.
  [`sprint-status.yaml:52`](../../_bmad-output/implementation-artifacts/sprint-status.yaml#L52)
