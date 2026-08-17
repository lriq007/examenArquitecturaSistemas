---
title: 'Épica 4: Evidencia fotográfica LEGO confiable'
type: 'feature'
created: '2026-08-16'
status: 'done'
review_loop_iteration: 0
baseline_commit: '23c1721ff0ca66e4e039aa908df4716a1919bedb'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-baseDatosAvanzadas-examen-2026-08-16/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La plataforma no conserva ni procesa fotografías LEGO: el frontend solo guarda una versión base64 local y el backend registra un booleano, sin aceptación durable, idempotencia, seguimiento ni recuperación.

**Approach:** Implementar las historias 4.1–4.5 como un hexágono fotográfico asíncrono integrado con Cognito: carga directa privada a S3, entrega S3→SQS, procesamiento idempotente con DynamoDB, DLQ/reconciliación/reintento docente, proyección segura y UI de seguimiento.

## Boundaries & Constraints

**Always:** Preservar DynamoDB Global Tables activa-activa como Golden Copy; derivar rol y alcance exclusivamente del JWT Cognito y vínculos persistidos; mantener scripts frontend clásicos; usar claves S3 inmutables y versionadas; aceptar externamente solo tras persistencia y encolado; aplicar condiciones, leases y transacción para impedir efectos duplicados; separar recursos Terraform de cómputo SAM; cifrar, privatizar, observar y limitar concurrencia; dejar toda inyección de fallos apagada por defecto; documentar necesidad, trade-off y evidencia de los patrones usados.

**Ask First:** Habilitar cargas en un entorno objetivo antes del despliegue y su verificación; cambiar la política aprobada de retención/eliminación; cambiar contratos públicos ajenos a fotografías; ampliar la implementación al experimento integral de la Historia 6.5.

**Never:** Cache-Aside; otra fuente autoritativa; confiar en identidad enviada por el cliente; esperar sincrónicamente a S3/SQS dentro de una transición del juego; exponer bucket, colas, leases o excepciones; reutilizar una clave o intento fallido; crear reintentos automáticos; marcar capacidades sin código, pruebas y evidencia.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Inicio válido | Grupo autorizado, JPEG/PNG ≤25 MB | Crea trabajo/intento `PENDIENTE_CARGA` y URL firmada acotada | No revela bucket ni credenciales |
| Inicio inválido | MIME, tamaño o alcance inválido | Rechaza antes de persistir | 4xx estable y seguro |
| Aceptación durable | Objeto versionado y evento entregado a SQS | CAS a `ENCOLADO`; consulta responde 202 `RECIBIDA` | Sin confirmación no devuelve 202; causa observable |
| Entrega repetida | Mismo bucket/key/versionId o lease activo | Un solo efecto y resultado estable | Otra versión para la clave se rechaza |
| Fallo terminal | Reintentos agotados o intento vencido | DLQ y reconciliación a `FALLIDO`/`EXPIRADO` | Aísla otros trabajos; no auto-reintenta |
| Recuperación | Profesor dueño, fallo y cupo disponible | Nuevo intento enlazado/auditado | Grupo, tercero o límite agotado: 403/409 |
| Consulta | Grupo/Profesor dentro de alcance | `RECIBIDA`, `PROCESADA` o `FALLIDA` | Oculta detalles internos y recursos ajenos |

</frozen-after-approval>

## Code Map

- `backend-serverless/src/compartido/{seguridad,alcance,respuestas}.ts` -- autenticación, ownership y errores reutilizables; no confiar en IDs del body.
- `backend-serverless/src/fotografias/` -- nuevo hexágono: APIs, servicio, puerto/repositorio AWS, consumidor S3, reconciliador y contratos versionados.
- `backend-serverless/src/profesor/repositorio.ts` -- referencia para condiciones y `TransactWriteItems`, sin acoplar dominios.
- `backend-serverless/template.yaml` -- authorizers por rol, funciones/API, SQS mapping, schedule, concurrencia, IAM, logs y alarmas.
- `main.tf` -- bucket multimedia endurecido, colas/DLQ, policy, notificación, alarmas y outputs; conservar Global Table.
- `ansible/deploy.yml` -- validar/aplicar outputs Terraform, pasarlos a SAM y convertir smoke en gate.
- `frontend/compartido/js/api.js`, `frontend/juego/{fase3-comun,lego}.js` -- contrato API, PUT firmado y seguimiento de Grupo.
- `frontend/profesor/{control-sesion.html,control-sesion.js}` -- estado y reintento solo para Profesor.
- `backend-serverless/package.json` y pruebas `backend-serverless/src/**/*.test.ts` -- empaquetado completo y evidencia funcional/arquitectónica.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- cerrar épica e historias únicamente tras verificar todo.

## Tasks & Acceptance

**Execution:**
- [x] `backend-serverless/src/fotografias/` y `src/compartido/contratos/` -- implementar dominio/puertos, validación, proyección, APIs Cognito, presignado, CAS/versionId, lease, transacción, consumidor, reconciliación, auditoría y reintento limitado.
- [x] `main.tf` -- configurar S3 privado/cifrado/versionado, SQS/DLQ con redrive y límites, notificación/policy restringida, alarmas y outputs sin alterar la réplica global.
- [x] `backend-serverless/template.yaml` -- declarar funciones aisladas, rutas por authorizer, variables, IAM mínimo, mapping con fallos parciales, schedule, concurrencia, logs y alarmas.
- [x] `ansible/deploy.yml` y `backend-serverless/package.json` -- conectar outputs, empaquetar todos los handlers y hacer bloqueantes validaciones/smoke pertinentes.
- [x] `frontend/compartido/js/api.js`, `frontend/juego/lego.js`, `frontend/profesor/control-sesion.*` -- integrar inicio, PUT, aceptación/polling, estados educativos y reintento autorizado sin romper scripts globales.
- [x] `backend-serverless/src/**/*.test.ts` y pruebas estructurales/chaos controlado -- cubrir matriz, seguridad, IaC, duplicados, fallos parciales, DLQ, aislamiento, redrive y recuperación; inyección off por defecto.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- marcar `epic-4` y 4.1–4.5 `done` solo con todas las verificaciones exitosas.

**Acceptance Criteria:**
- Given una fotografía aceptada, when ocurren duplicados, concurrencia o fallos transitorios, then termina procesada una vez o queda visible y recuperable sin bloquear el juego.
- Given identidades Cognito de Grupo o Profesor, when operan sobre fotografías, then solo acceden a su alcance y solo el Profesor puede crear un intento posterior auditado.
- Given la infraestructura desplegable, when se inspecciona y valida, then S3→SQS→Lambda→DLQ, reconciliación, alarmas, cifrado, IAM, bulkheads y outputs coinciden entre Terraform, SAM y Ansible.
- Given estados internos o fallos, when la UI consulta, then muestra únicamente estados educativos coherentes y no expone internals.

## Spec Change Log

- 2026-08-16: Política aprobada: fotografías y versiones anteriores se eliminan a los 30 días; mensajes DLQ se conservan 14 días; cargas permanecen desactivadas por defecto hasta despliegue y verificación.
- 2026-08-16: Adaptación AWS Academy autorizada: `LabRole` preexistente para Lambdas y S3 Static Website público solo para frontend, activables explícitamente; productivo continúa como valor predeterminado.

## Design Notes

La aceptación se observa mediante un endpoint posterior a la carga: iniciar no promete procesamiento; el PUT firmado persiste; S3 entrega durablemente a SQS; la consulta/confirmación solo emite 202 cuando DynamoDB refleja `ENCOLADO`. El reconciliador terminaliza y registra, mientras el reintento docente crea otra clave e intento.

La retención se implementa como una regla lifecycle limitada a `entradas/`: objetos actuales y versiones anteriores expiran tras 30 días. La DLQ conserva mensajes 14 días. El trade-off aceptado es una ventana operativa acotada para investigación y recuperación a cambio de evitar conservación indefinida de evidencia; `habilitar_cargas_fotografias` continúa en `false` por defecto hasta verificar el despliegue.

La adaptación Academy es reversible y no cambia negocio ni datos: `ModoDespliegue=academy` selecciona `LabRole` sin crear roles o managed policies, y `modo_academy=true` sustituye CloudFront/OAC por S3 Website. La policy pública permite únicamente `s3:GetObject` sobre el bucket frontend; multimedia y data lake conservan bloqueo público. El trade-off es HTTP y lectura pública del frontend en el laboratorio; producción mantiene roles mínimos, bucket privado y CloudFront HTTPS por defecto.

## Verification

**Commands:**
- `cd backend-serverless && npm run tipos && npm run pruebas && npm run empaquetar:verificar && npm run sam:validar && npm run sam:build` -- todos los handlers, tipos, tests y SAM válidos.
- `terraform fmt -check -recursive && terraform init -backend=false && terraform validate` -- IaC formateada y válida.
- `find frontend -name '*.js' -print0 | xargs -0 -n1 node --check` -- scripts clásicos sintácticamente válidos.
- `ansible-playbook --syntax-check ansible/deploy.yml -i ansible/inventory/hosts.yml` -- orquestación válida.

**Manual checks (if no CLI):**
- Verificar que la política de retención siga bloqueando la habilitación del entorno hasta contar con aprobación explícita.

## Suggested Review Order

**Flujo asíncrono e idempotencia**

- El servicio define estados, ownership, reintentos y proyección externa.
  [`servicio.ts:30`](../../backend-serverless/src/fotografias/servicio.ts#L30)

- El consumidor valida contrato, versión y contenido S3 antes del efecto único.
  [`consumidor.ts:24`](../../backend-serverless/src/fotografias/consumidor.ts#L24)

- El repositorio concentra CAS, leases, transacción y terminalización condicional.
  [`repositorio.ts:38`](../../backend-serverless/src/fotografias/repositorio.ts#L38)

**Integración con el juego y recuperación**

- Fase 3 exige fotografía procesada y persiste el vínculo autoritativo.
  [`servicio.ts:498`](../../backend-serverless/src/fase3/servicio.ts#L498)

- El Grupo conserva el trabajo y bloquea avance mientras permanezca pendiente.
  [`lego.js:519`](../../frontend/juego/fase3/lego.js#L519)

- El Profesor descubre, recarga y sigue intentos fallidos autorizados.
  [`control-sesion.js:191`](../../frontend/profesor/control-sesion.js#L191)

**Infraestructura y despliegue**

- SAM separa modo productivo y Academy sin degradar roles mínimos por defecto.
  [`template.yaml:70`](../../backend-serverless/template.yaml#L70)

- Terraform conecta S3, retención, SQS, DLQ y notificación sin tocar Global Tables.
  [`main.tf:271`](../../main.tf#L271)

- Los gates bloquean antes de cualquier mutación y el smoke valida el resultado.
  [`deploy.yml:38`](../../ansible/deploy.yml#L38)

**Evidencia**

- Las pruebas cubren aislamiento, contenido real, duplicados y fallos parciales.
  [`consumidor.test.ts:22`](../../backend-serverless/src/fotografias/consumidor.test.ts#L22)

- El experimento registra hipótesis, DLQ, redrive, duplicado y recuperación.
  [`experimento-chaos-fotografias.md:1`](./experimento-chaos-fotografias.md#L1)
