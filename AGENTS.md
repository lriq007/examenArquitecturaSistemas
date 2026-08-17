<!-- bmad:context -->
<!-- Verified 2026-08-14 against f7a80cf. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## Misión Emprende UDD

Plataforma educativa serverless que continúa el proyecto de Bases de Datos Avanzadas como proyecto de Arquitectura de Sistemas. Utiliza TypeScript/Lambda, API Gateway, DynamoDB Global Tables y un frontend HTML/CSS/JavaScript. Los PDF de `documentosProyecto/` conservan decisiones y planificación histórica, pero el código actual prevalece cuando describen estados ya superados.

## Policy

- Preserva la réplica activa-activa de DynamoDB entre `us-east-1` y `us-west-2`; es un valor arquitectónico obligatorio.
- Implementa únicamente patrones enseñados por el profesor y solo cuando resuelvan un problema concreto; documenta la necesidad, el trade-off y la evidencia de verificación.
- Patrones permitidos: Retry con backoff y jitter, Circuit Breaker, Bulkhead, Throttling, Queue-Based Load Leveling, Clean Architecture, Hexagonal, MVC, Observer, Plugins, CQRS, Event Sourcing, Saga, 2PC, Outbox, Cache-Aside, Golden Copy, Productor-Consumidor, Fan-out, BFF, Strangler Fig, Canary, Blue-Green, módulos Terraform y Sidecar/Lambda Extensions.
- No implementes Cache-Aside en este proyecto salvo que cambie explícitamente el requisito; fue descartado por escala y complejidad.
- Implementa autenticación JWT administrada por Amazon Cognito para profesores y grupos de estudiantes.
- Implementa el flujo de fotografías LEGO como procesamiento asíncrono mediante S3, SQS, Lambda consumidora y DLQ.
- Incorpora Chaos Engineering, pruebas arquitectónicas y una estrategia CI/CD verificable.
- No presentes patrones o capacidades planificadas como implementadas sin código, pruebas y evidencia ejecutable.

## Where things are

- Infraestructura base y réplica multirregional: `main.tf`
- Despliegue completo: `ansible/deploy.yml`
- Backend serverless y reglas específicas: `backend-serverless/AGENTS.md`
- Contrato frontend/API: `frontend/compartido/js/api.js` y helpers `frontend/juego/*-comun.js`
- Pipeline DynamoDB–Athena: `analytics/` y `backend-serverless/src/analytics/`
- Antecedentes y decisiones históricas: `documentosProyecto/`

## Running and verifying

- No consideres suficiente `npm run verificar`: actualmente el empaquetado omite Fase 4, Fase 5 y Analytics; verifica todos los handlers de `backend-serverless/template.yaml`.
- Para cada cambio arquitectónico, prueba reglas de dependencia, contratos entre capas, seguridad, configuración IaC y comportamiento ante fallos.
- Ejecuta Chaos Engineering mediante fallas controladas y recuperables; registra estado estable, hipótesis, radio de impacto, resultado y recuperación.
- Antes de declarar listo el despliegue, valida SAM, Terraform y el flujo navegador–API Gateway–Lambda–DynamoDB.
- La estrategia CI/CD debe ejecutar automáticamente tipos, pruebas, pruebas arquitectónicas, validaciones IaC, empaquetado y controles de seguridad antes de desplegar.

## Conventions that differ from defaults

- Mantén reglas del juego y estado autoritativo en el backend; el frontend solo presenta, conserva sesión y calcula visualmente tiempos derivados del servidor.
- Trata DynamoDB Global Tables como Golden Copy distribuida; no introduzcas otra fuente autoritativa ni dependas de consistencia inmediata entre regiones.
- Al cambiar estados o rutas sugeridas, actualiza coordinadamente backend, frontend y valores persistidos en DynamoDB.
- Al agregar datos para KPIs, actualiza escritura DynamoDB, extractores de `analytics/01_crear_tabla_raw.sql`, vistas dependientes, servicio Analytics y UI.
- Conserva el frontend como scripts clásicos globales; respeta su orden de carga mientras no se migren juntos todos sus consumidores.

## Known pitfalls

- El Informe 2 declara implementados Throttling y JWT Authorizers, pero el código actual no los contiene.
- La idempotencia actual no constituye por sí sola un Outbox; no uses ambos nombres como equivalentes.
- La simulación actual de fallo DynamoDB ayuda al Chaos Engineering, pero no reemplaza un experimento automatizado con aserciones.
- No fijes manualmente la URL desplegada en `frontend/compartido/js/api.js`; `ansible/deploy.yml` la reemplaza.
- Verifica los PDF y `backend-serverless/README.md` contra el código antes de actuar; describen etapas anteriores.

<!-- /bmad:context -->
