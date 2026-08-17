# Epic 6 Context: Continuidad y recuperación verificables

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Profesores y Grupos deben tener una experiencia estable ante fallos controlados, mientras el equipo gana capacidad real de observar, contener y recuperar tres frentes: Global Tables de DynamoDB, cargas interactivas del juego, y el pipeline de trabajos fotográficos. La épica no busca agregar resiliencia nueva, sino hacer verificable —con configuración, métricas y pruebas ejecutables— la resiliencia que ya existe de forma parcial (failover con enfriamiento, aislamiento por clase de carga, cola con DLQ), evitando declarar patrones como "Circuit Breaker" o "Bulkhead" sin evidencia que los respalde.

## Stories

- Story 6.1: Failover mediante Circuit Breaker observable
- Story 6.2: Aislamiento por clase de carga
- Story 6.3: Observabilidad correlacionada y alertas operables
- Story 6.4: Experimento automatizado de indisponibilidad regional
- Story 6.5: Experimento automatizado del consumidor fotográfico

## Requirements & Constraints

- El failover de DynamoDB debe transitar por estados explícitos, rechazar de forma controlada durante la indisponibilidad de la región principal y recuperarse verificablemente, usando siempre la réplica existente en la segunda región; nunca se retira una réplica para facilitar un despliegue ni se asume consistencia inmediata entre regiones (los flujos deben tolerar lecturas temporalmente obsoletas).
- Rutas interactivas del juego, procesamiento fotográfico y consultas Analytics deben desplegarse con funciones, timeouts, concurrencia y alarmas independientes; el procesamiento de fotos o las consultas Athena nunca se ejecutan dentro de una transición interactiva del juego. Debe existir una prueba de contención (saturación controlada de fotos/Analytics) que demuestre que las rutas críticas permanecen dentro de un estado estable definido.
- Deben existir logs estructurados y métricas correlacionables por Sesión, Grupo, solicitud y trabajo fotográfico, sin exponer tokens, secretos ni datos sensibles.
- Deben configurarse alertas operables (con procedimiento de diagnóstico) ante: errores sostenidos de Lambda, cola SQS antigua o profunda, DLQ no vacía, autenticación anómala y latencia de replicación de Global Tables. Los SLO y umbrales cuantitativos se fijan después de la prueba de carga y antes de producción, no de forma arbitraria.
- Todo experimento de caos debe declarar estado estable, hipótesis, fallo inyectado, radio de impacto, aserciones, resultado y recuperación; debe estar desactivado por defecto, activarse explícitamente en un entorno acotado, ser reversible y no afectar recursos fuera del alcance declarado. Al terminar, la inyección vuelve a quedar desactivada por defecto y el sistema retorna observablemente al estado estable.
- El primer experimento simula indisponibilidad de la región DynamoDB principal y verifica continuidad por réplica, impacto acotado y retorno al estado estable.
- El segundo experimento provoca de forma controlada el fallo de la Lambda consumidora de fotografías: debe comprobar reintentos acotados de SQS, traslado a DLQ, ausencia de efectos de dominio duplicados, redrive documentado y recuperación hasta el estado `PROCESADA`, limitando su impacto a un único trabajo de prueba.
- Un nombre de patrón (Circuit Breaker, Bulkhead) solo puede usarse cuando está respaldado por configuración real, métricas y pruebas específicas de apertura/rechazo/recuperación o de contención; en caso contrario se describe como mecanismo acotado, no como el patrón completo.
- Conectar las alarmas del bulkhead fotográfico (ya emitidas por CloudWatch) a destinos operables de notificación/escalamiento (SNS u otro mecanismo de alerta real) queda explícitamente dentro de esta épica: las alarmas existen y fueron verificadas, pero aún no tienen `AlarmActions` conectadas a un destino operable.

## Technical Decisions

- La única Golden Copy es DynamoDB Global Tables activa-activa en `us-east-1` y `us-west-2`, esquema single-table `PK/SK` / `GSI1PK/GSI1SK`. El failover ya existe como mecanismo de conmutación con enfriamiento por instancia y una bandera de simulación controlada, pero Lambda no comparte ese estado entre ejecuciones: por diseño no será un Circuit Breaker distribuido completo, sino un mecanismo acotado y observable por instancia al que esta épica debe agregarle estados explícitos, métricas y pruebas para poder llamarlo Circuit Breaker con evidencia.
- Separación de propiedad de infraestructura sin solapamiento: Terraform posee DynamoDB, buckets, SQS/DLQ, políticas de cola, notificación S3→SQS, Athena y las alarmas de esos mismos recursos; SAM posee API Gateway, Cognito, Lambdas, log groups, alarmas de Lambda/API, concurrencia reservada, schedules y event source mappings. Ningún stack crea alarmas o dashboards que referencien recursos del otro stack; una vista combinada de observabilidad, si se necesita, es un stack posterior y separado. `dev` y `prod` son stacks independientes.
- El aislamiento por clase de carga (bulkhead) se logra separando funciones, colas, concurrencia reservada/máxima, timeouts y alarmas por clase (interactivo vs. fotos vs. Analytics); es un mecanismo complementario mientras no exista evidencia (config + métricas + prueba de contención) que permita llamarlo Bulkhead implementado.
- Los experimentos de caos son código versionado y reproducible (no demostraciones manuales), con evidencia mínima de logs, estados persistidos y conteos de recepción/redrive; no se crean experimentos separados para simular caídas completas de S3 o SQS en este alcance.
- Patrones descartados explícitamente para esta épica y que no deben reintroducirse: Circuit Breaker distribuido con estado compartido entre Lambdas, Cache-Aside, Outbox tradicional, 2PC, CQRS completo.
- Retry con backoff exponencial y jitter, throttling en el borde de API Gateway e idempotencia de comandos críticos son mecanismos ya decididos en otras épicas de los que esta épica depende para no duplicar efectos durante failover, contención o redrive; no se rediseñan aquí, solo se observan y se prueban ante fallo.

## Cross-Story Dependencies

- Historia 6.1 (Circuit Breaker de failover) es prerequisito conceptual de la Historia 6.4 (experimento de indisponibilidad regional): el experimento demuestra en la práctica los estados y la recuperación que 6.1 debe exponer con métricas.
- Historia 6.3 (observabilidad y alertas) provee las métricas/alarmas sobre las que se apoyan las aserciones de los experimentos de caos de las Historias 6.4 y 6.5 (antigüedad/profundidad de cola, DLQ no vacía, latencia de réplica, errores sostenidos).
- Historia 6.5 depende del pipeline S3–SQS–Lambda–DLQ de fotografías ya implementado en la Épica 4; es el experimento de caos íntegro para el consumidor fotográfico diferido desde esa épica.
- La conexión de las alarmas fotográficas del bulkhead (Historia 6.2/6.3) a un destino operable de notificación (SNS u otro) es trabajo diferido desde la Épica 4 hacia esta épica, y debe completarse para que las alertas de 6.3 sean accionables y no solo visibles en CloudWatch.
- Historia 6.2 (aislamiento por clase de carga) debe completarse antes de que la prueba de contención pueda usarse como evidencia en 6.3 de que las rutas interactivas permanecen en estado estable bajo saturación de fotos/Analytics.
