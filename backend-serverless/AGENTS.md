<!-- bmad:context -->
<!-- Verified 2026-08-14 against f7a80cf. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Backend serverless

Backend TypeScript ejecutado como funciones Lambda y desplegado mediante AWS SAM. Cada capacidad separa adaptadores de entrada, reglas del dominio y adaptadores de infraestructura.

## Policy

- No elimines ni debilites el failover entre las regiones principal y de respaldo.
- Sustituye progresivamente el JWT HMAC propio por tokens Cognito para profesores y grupos; no mantengas dos autoridades de identidad permanentes.
- El procesamiento de fotografías LEGO debe responder `202 Accepted`, persistir el trabajo en SQS y enviar fallos agotados a una DLQ.
- Toda capacidad modificada debe quedar cubierta por pruebas funcionales, arquitectónicas y de comportamiento ante fallos.

## Where things are

- Módulos Lambda: `src/`
- Seguridad, respuestas y acceso multirregional: `src/compartido/`
- Contrato desplegable de funciones, rutas y eventos: `template.yaml`
- Pruebas del dominio: `pruebas/`

## Running and verifying

- Al agregar un handler, inclúyelo en `template.yaml` y en la verificación de empaquetado.
- Prueba servicios con repositorios inyectados en memoria; no requieras AWS para verificar reglas de negocio.
- Prueba integración Cognito, permisos IAM, eventos S3/SQS, reintentos, redrive a DLQ y recuperación del Circuit Breaker.
- Mantén los experimentos de caos desactivados por defecto y ejecútalos solo mediante una configuración explícita y acotada.

## Conventions that differ from defaults

- Conserva la dirección `api.ts` → `servicio.ts` → `repositorio.ts`: HTTP pertenece al adaptador, las reglas al servicio y AWS/DynamoDB al repositorio.
- No importes repositorios entre módulos; comparte contratos mediante `src/compartido/`.
- No interpretes ni firmes JWT manualmente en handlers; consume identidad validada por Cognito/API Gateway mediante un adaptador compartido.
- Usa sufijo `.js` en imports relativos TypeScript, conforme a NodeNext.
- Mantén idempotentes las operaciones sujetas a reintentos y las que entregan tokens o recompensas.
- Aplica Bulkhead mediante funciones, colas, concurrencia y límites independientes cuando una carga pesada pueda afectar rutas críticas.

## Known pitfalls

- `empaquetar:verificar` omite actualmente `fase4`, `fase5` y `analytics`.
- `src/compartido/seguridad.ts` usa hoy firmas HMAC propias; no cumple todavía el requisito Cognito.
- El repositorio no contiene actualmente SQS, DLQ, Lambda asíncrona ni pipeline CI/CD.
- El failover con ventana de 60 segundos se aproxima a un Circuit Breaker, pero necesita estados, métricas y pruebas explícitas antes de declararlo implementado.

<!-- /bmad:context -->
