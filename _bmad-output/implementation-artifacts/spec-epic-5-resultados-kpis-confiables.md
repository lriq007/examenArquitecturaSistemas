---
title: 'Épica 5: Resultados y KPIs confiables'
type: 'feature'
created: '2026-08-17'
status: 'done'
review_loop_iteration: 1
baseline_commit: 'a2bea3f99ce8e00701cb49e00af0b58e39b136c8'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-baseDatosAvanzadas-examen-2026-08-16/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** El dashboard de KPIs y el pipeline DynamoDB→S3→Athena→Analytics ya existen y ya exigen ownership real (`exigirSesionProfesor`), pero ningún ítem analítico ni el DTO llevan `schemaVersion`, no hay pruebas de contrato writer→extractor→vista→DTO, y el dashboard no distingue explícitamente un resultado actual verificado de un error (deja `contenidoKpis` visible junto al mensaje de error).

**Approach:** Introducir un contrato canónico versionado en `compartido/contratos/analytics.ts` (constructores de ítems + mapeo de fila Athena a DTO), propagar `schemaVersion` por escritura→extractor raw→vistas→servicio, marcar el DTO como verificado/actual, corregir el dashboard para nunca mezclar error con datos previos, y cubrir todo con pruebas de contrato y de ruta completa. No se agregan KPIs nuevos.

## Boundaries & Constraints

**Always:** DynamoDB Global Tables sigue siendo la Golden Copy; Analytics es de solo lectura y jamás escribe estado de juego; `exigirSesionProfesor` se ejecuta antes de cualquier consulta Athena; cada ítem analítico (SESIÓN/GRUPO/EVALUACIÓN) y el DTO de KPIs llevan `schemaVersion`; los lectores toleran campos aditivos desconocidos; fechas ISO-8601 UTC; el servicio nunca cachea resultados de Athena entre solicitudes.

**Ask First:** cambiar el export manual (`actualizar_datalake.sh`) por un mecanismo continuo; modificar retención/política del bucket data lake; agregar `ajv` u otra librería de validación runtime si el chequeo manual de versión no bastara.

**Never:** KPIs nuevos no exigidos por los criterios de aceptación; caché de resultados Athena en el servicio; ejecutar Athena dentro de una transición interactiva del juego; otra fuente de verdad para el estado del juego que no sea DynamoDB.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Owner consulta KPIs | Profesor autenticado, sesión propia con datos | 200 con KPIs, `schemaVersion` y `verificado: true` | N/A |
| Sesión ajena | Profesor autenticado, sesión de otro profesor | Se rechaza antes de tocar Athena | 403 `ALCANCE_INVALIDO` |
| Sin datos analíticos | Sesión propia sin fila en `vw_kpis_por_sesion` | Nunca se presenta como resultado actual | 404 `ANALITICA_NO_ENCONTRADA` |
| Athena falla o expira | Query `FAILED`/`CANCELLED`/timeout | No se presentan datos obsoletos como actuales | 502/504 (códigos Athena existentes) |
| Fila heredada (previa a este cambio) | Fila con `schema_version` ausente (ítem escrito antes de existir el contrato) | Se lee como versión base `1.0` ("lectura anterior"); KPI se sirve igual | N/A |
| Contrato incompatible | Fila con `schema_version` presente pero no soportada (p. ej. `"2.0"`) | No se presenta como dato actual, diagnóstico identificable | 409 `CONTRATO_ANALITICO_INCOMPATIBLE` |
| Campo aditivo nuevo | Fila con columna desconocida adicional | Se ignora; el resto del KPI se sirve igual | N/A |

</frozen-after-approval>

## Code Map

- `backend-serverless/src/compartido/contratos/analytics.ts` (nuevo) -- `VERSION_CONTRATO_ANALITICA`, `VERSIONES_ANALITICA_SOPORTADAS`, constructores puros `construirItemSesionAnalitica`/`construirItemGrupoAnalitico`/`construirCamposEvaluacionAnalitica`, y `mapearFilaKpis(datos, sesionId)` (mapeo fila Athena → DTO, valida versión). Sigue el patrón de `contratos/fotografias.ts`.
- `backend-serverless/src/compartido/contratos/analytics.schema.json` (nuevo) -- JSON Schema hermano documentando forma de ítems SESIÓN/GRUPO/EVALUACIÓN y del DTO, `additionalProperties: true`, como en `fotografias.schema.json`.
- `backend-serverless/src/profesor/servicio.ts:346-393` -- reemplazar los literales `items.push({...tipo:"SESION"...})`/`{...tipo:"GRUPO"...})` por los constructores del contrato (agrega `schemaVersion`).
- `backend-serverless/src/fase5/repositorio.ts:126-166` (`crearEvaluacion`) -- agregar `schemaVersion` al `UpdateExpression`/`ExpressionAttributeValues` vía el contrato.
- `analytics/01_crear_tabla_raw.sql` -- columna `schema_version STRING` + `'ion.schema_version.path_extractor' = '(Item schemaVersion)'`.
- `analytics/02_vw_sesiones.sql`, `03_vw_grupos.sql`, `04_vw_evaluaciones.sql` -- propagar `schema_version`.
- `analytics/05_vw_kpis_por_sesion.sql` -- exponer `s.schema_version AS schema_version` en el `SELECT` final.
- `backend-serverless/src/analytics/servicio.ts:78-100,144-205` -- agregar `schema_version` al `SELECT`; reemplazar el mapeo manual final por `mapearFilaKpis` del contrato (agrega `schemaVersion`, `verificado: true`, `verificadoEn`); lanzar `CONTRATO_ANALITICO_INCOMPATIBLE` (409) si la versión no está soportada.
- `backend-serverless/src/analytics/api.ts` -- sin cambio estructural; confirmar que `exigirSesionProfesor` sigue precediendo la consulta.
- `frontend/profesor/dashboard-kpis.js:234-252` (`cargarKpis`) -- ocultar `contenido` antes de mostrar error (nunca mezclar datos previos con un error); `frontend/profesor/dashboard-kpis.html` -- agregar elemento para el badge "actual/verificado"; `dashboard-kpis.js:render` -- pintarlo con `resultado.verificadoEn`.
- `backend-serverless/pruebas/analytics.test.ts` (nuevo) -- ruta completa del handler: 403 ajena, 400 UUID inválido, 404 sin datos, 502/504 Athena, 200 éxito con `schemaVersion`/`verificado`; mockea `@aws-sdk/client-athena` y `../src/compartido/baseDatos.js` como en `pruebas/cognito-adaptador.test.ts` y `pruebas/alcance-adaptador.test.ts`.
- `backend-serverless/pruebas/analytics-contrato.test.ts` (nuevo) -- (a) cruza las claves de los constructores del contrato contra los `(Item X)` de `01_crear_tabla_raw.sql` (texto, como `arquitectura-seguridad.test.ts`); (b) confirma `schema_version` presente en las 4 vistas SQL (texto); (c) `mapearFilaKpis` tolera columna aditiva desconocida; (d) `mapearFilaKpis` falla identificable ante versión ausente/incompatible.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marcar `epic-5`, `5-1-dashboard-autorizado-de-kpis` y `5-2-evolucion-contractual-de-un-kpi` `done` solo tras verificar todo.

## Tasks & Acceptance

**Execution:**
- [x] `backend-serverless/src/compartido/contratos/analytics.ts` -- crear contrato versionado (constructores + `mapearFilaKpis` + validación de versión) -- fuente canónica única para escritura, extractor y servicio.
- [x] `backend-serverless/src/compartido/contratos/analytics.schema.json` -- documentar el contrato -- paridad con el patrón de fotografías.
- [x] `backend-serverless/src/profesor/servicio.ts`, `backend-serverless/src/fase5/repositorio.ts` -- usar los constructores del contrato al escribir ítems SESIÓN/GRUPO/EVALUACIÓN -- cada registro lleva `schemaVersion`.
- [x] `analytics/01_crear_tabla_raw.sql`..`05_vw_kpis_por_sesion.sql` -- propagar `schema_version` desde el extractor hasta la vista de KPIs -- contrato visible en cada etapa SQL.
- [x] `backend-serverless/src/analytics/servicio.ts` -- consumir `mapearFilaKpis`, exponer `schemaVersion`/`verificado`/`verificadoEn`, rechazar versión incompatible -- DTO fiel a las vistas verificadas.
- [x] `frontend/profesor/dashboard-kpis.{html,js}` -- badge de "actual/verificado" y ocultar contenido ante cualquier error -- nunca mostrar dato obsoleto como vigente.
- [x] `backend-serverless/pruebas/analytics.test.ts`, `backend-serverless/pruebas/analytics-contrato.test.ts` -- cubrir la matriz I/O y el contrato writer→extractor→vista→DTO -- evidencia de las historias 5.1 y 5.2.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marcar `epic-5`, `5-1-*` y `5-2-*` `done` -- solo tras `npm run verificar` en verde.

**Acceptance Criteria:**
- Given un Profesor autenticado y una Sesión propia, when consulta sus KPIs, then el servicio devuelve los mismos valores que las vistas Athena verificadas y el dashboard los identifica como actuales.
- Given una Sesión ajena o una consulta analítica fallida, when se solicita el KPI, then se rechaza el acceso o se muestra el error correspondiente y no se presentan datos obsoletos como resultado actual.
- Given un campo aditivo nuevo en el contrato, when se ejecutan las pruebas de contrato, then escritura, extractor, vistas, servicio y UI lo toleran sin romperse y `schemaVersion` se conserva en cada etapa.
- Given una omisión o versión incompatible en cualquier etapa, when se ejecutan las pruebas writer→extractor→vista→DTO, then el cambio falla con un diagnóstico identificable (`CONTRATO_ANALITICO_INCOMPATIBLE` o el atributo faltante nombrado).

## Spec Change Log

- 2026-08-17: Revisión adversarial (blind-hunter + edge-case-hunter + verification-gap, en paralelo) detectó que la fila "Contrato incompatible" original de la matriz I/O trataba `schema_version` ausente igual que una versión presente-pero-no-soportada, ambas con 409. Eso contradice la propia AC ("una versión incompatible conserva lectura anterior hasta completar la migración"): todo ítem SESIÓN/GRUPO/EVALUACIÓN escrito antes de esta historia carece de `schemaVersion` por definición, así que la redacción original habría rechazado con 409 el KPI de cada Sesión preexistente. Se corrigió la matriz: fila ausente = heredada, se lee como `1.0` ("lectura anterior"); solo una versión explícita y no reconocida es "incompatible" y produce 409. KEEP: el resto del contrato (constructores en `analytics.ts`, propagación `schema_version` por SQL, badge del dashboard, suites de prueba) se mantiene sin cambios — funcionó correctamente en la primera implementación.

## Design Notes

No hay Athena real disponible en este entorno de pruebas (solo DynamoDB local vía docker-compose), así que las "pruebas de contrato" son estructurales: (1) cruzan por texto los nombres de atributo que el writer produce contra los `path_extractor` del `.sql` del extractor -- una omisión real en cualquiera de los dos lados hace fallar el test nombrando el atributo; (2) verifican por texto que las vistas SQL sigan seleccionando `schema_version`; (3) ejercitan `mapearFilaKpis` con filas fixture (incluida una con columna aditiva desconocida y otra con versión incompatible) sin llamar a AWS. Esto replica para Analytics el mismo patrón textual ya usado en `pruebas/arquitectura-seguridad.test.ts` sobre `template.yaml`/`main.tf`.

`verificado`/`verificadoEn` en el DTO no implican frescura en tiempo real (Analytics es una proyección batch derivada, AD-7): significan que la respuesta es el resultado vigente de la consulta Athena recién ejecutada, nunca un valor cacheado o previo mostrado tras un error.

## Verification

**Commands:**
- `cd backend-serverless && npm run tipos && npm run pruebas && npm run empaquetar:verificar && npm run sam:validar && npm run sam:build` -- tipos, pruebas (incluidas las nuevas de contrato) y empaquetado/SAM en verde.
- `find frontend -name '*.js' -print0 | xargs -0 -n1 node --check` -- scripts clásicos del dashboard sintácticamente válidos.

**Manual checks (if no CLI):**
- Confirmar visualmente que, al forzar un error (sesión inexistente en la URL del dashboard), `contenidoKpis` permanece oculto y solo se ve el mensaje de error.

## Suggested Review Order

**Contrato canónico versionado**

- Punto de entrada: constructores puros del contrato (SESIÓN/GRUPO/EVALUACIÓN), fuente única de `schemaVersion` para todo el pipeline.
  [`analytics.ts:19`](../../backend-serverless/src/compartido/contratos/analytics.ts#L19)

- Mapeo de fila Athena a DTO: trata `schema_version` ausente como versión base (lectura anterior), solo rechaza una versión presente-pero-no-soportada.
  [`analytics.ts:148`](../../backend-serverless/src/compartido/contratos/analytics.ts#L148)

- Lista de versiones soportadas, hoy un único elemento — el punto de extensión para una futura v1.1/v2.0.
  [`analytics.ts:5`](../../backend-serverless/src/compartido/contratos/analytics.ts#L5)

**Escritura DynamoDB adopta el contrato**

- El ítem SESIÓN se construye con el contrato en vez de un literal inline.
  [`servicio.ts:356`](../../backend-serverless/src/profesor/servicio.ts#L356)

- El ítem GRUPO idem, agrega `schemaVersion` en el momento de creación.
  [`servicio.ts:380`](../../backend-serverless/src/profesor/servicio.ts#L380)

- La evaluación Peer usa una `UpdateExpression` estática (no generada dinámicamente) que ahora también fija `schemaVersion`.
  [`repositorio.ts:127`](../../backend-serverless/src/fase5/repositorio.ts#L127)

**Extractor raw y vistas Athena**

- Nueva columna `schema_version` con su `path_extractor` sobre el atributo DynamoDB `schemaVersion`.
  [`01_crear_tabla_raw.sql:5`](../../analytics/01_crear_tabla_raw.sql#L5)

- Las tres vistas base propagan la columna sin transformarla.
  [`02_vw_sesiones.sql:4`](../../analytics/02_vw_sesiones.sql#L4)

- La vista de KPIs expone la versión de la fila SESIÓN como parte del resultado agregado.
  [`05_vw_kpis_por_sesion.sql:72`](../../analytics/05_vw_kpis_por_sesion.sql#L72)

**Servicio Analytics**

- `obtenerKpisSesion` selecciona `schema_version` y delega el mapeo al contrato en vez de construir el DTO a mano.
  [`servicio.ts:73`](../../backend-serverless/src/analytics/servicio.ts#L73)

**Dashboard: nunca mezclar error con datos previos**

- `cargarKpis` oculta el contenido antes de cada consulta y de nuevo ante cualquier error, evitando un KPI obsoleto visible junto al mensaje de error.
  [`dashboard-kpis.js:246`](../../frontend/profesor/dashboard-kpis.js#L246)

- El badge "resultado actual verificado" se pinta con `verificadoEn` solo dentro del contenido ya mostrado con éxito.
  [`dashboard-kpis.js:232`](../../frontend/profesor/dashboard-kpis.js#L232)

**Evidencia**

- Ruta completa del handler: ownership, formato inválido, sin datos, fallos Athena, fila heredada y versión incompatible.
  [`analytics.test.ts:155`](../../backend-serverless/pruebas/analytics.test.ts#L155)

- Contrato writer→extractor→vista→DTO: cruce de atributos contra el SQL, propagación en las 4 vistas, tolerancia a campo aditivo y a fila heredada.
  [`analytics-contrato.test.ts:36`](../../backend-serverless/pruebas/analytics-contrato.test.ts#L36)
