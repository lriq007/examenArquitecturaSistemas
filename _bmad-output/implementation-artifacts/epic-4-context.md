# Epic 4 Context: Evidencia fotográfica LEGO confiable

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Grupos y Profesores pueden cargar, procesar, consultar y recuperar fotografías LEGO sin bloquear las rutas interactivas del juego, perder trabajos aceptados ni duplicar efectos ante reintentos o entregas repetidas. El flujo debe conservar la fotografía privada y cifrada, ofrecer estados comprensibles y permitir una recuperación controlada y auditable de fallos.

## Stories

- Story 4.1: Inicio directo y validado de carga fotográfica
- Story 4.2: Aceptación después de persistencia y encolado durable
- Story 4.3: Procesamiento idempotente de fotografías
- Story 4.4: Fallos terminales, DLQ y redrive autorizado
- Story 4.5: Seguimiento comprensible del trabajo fotográfico

## Requirements & Constraints

- Un Grupo autorizado puede cargar directamente una imagen JPEG o PNG de hasta 25 MB. Tipo, tamaño y pertenencia a Sesión/Grupo se validan antes de aceptar el trabajo; el acceso de carga queda limitado a su recurso y no revela el bucket ni recursos ajenos.
- La API solo responde `202 Accepted`, con `trabajoId` y estado externo `RECIBIDA`, después de que la imagen exista en S3 y su evento haya sido entregado durablemente a SQS. Un fallo de persistencia o encolado no puede producir una aceptación falsa y debe quedar observable para reconciliación.
- La entrega al menos una vez de SQS no puede duplicar efectos. El procesamiento debe ser idempotente, usar condiciones para transiciones concurrentes y confirmar atómicamente el efecto de dominio y el estado terminal exitoso.
- Los fallos transitorios usan reintentos acotados; cuando se agotan, el mensaje llega a una DLQ observable. La infraestructura versiona visibilidad, retención, `maxReceiveCount`, alarmas y redrive. La reconciliación terminaliza intentos vencidos o fallidos, pero nunca crea reintentos automáticamente.
- Solo un Profesor autorizado puede iniciar un nuevo intento desde un trabajo fallido, sujeto a límite y auditoría. Grupo y Profesor pueden consultar únicamente trabajos dentro de su identidad y alcance Cognito; el Grupo no recibe excepciones, datos de colas, leases ni diagnósticos internos.
- Todas las fotografías aceptadas deben terminar procesadas o permanecer visibles como fallo recuperable; ninguna repetición debe generar efectos adicionales. Logs y métricas deben correlacionarse por solicitud, Sesión, Grupo y trabajo fotográfico sin registrar tokens ni datos sensibles.
- Fotografías y metadatos permanecen privados y cifrados. La política de retención y eliminación debe estar aprobada antes de habilitar cargas en el entorno objetivo.
- La verificación debe cubrir comportamiento funcional y de seguridad, contratos, configuración IAM/IaC, estructura S3–SQS–Lambda–DLQ, duplicados, fallos parciales y recuperación. La prueba controlada de la consumidora debe demostrar reintentos, llegada a DLQ, aislamiento de otros trabajos, redrive y término en `PROCESADA` sin duplicados; toda inyección queda apagada por defecto.

## Technical Decisions

- Fotografías es un hexágono independiente: `api.ts` adapta entradas, `servicio.ts` contiene aplicación/dominio, un puerto neutral define persistencia y `repositorio.ts` implementa AWS. El dominio no importa AWS ni repositorios de otras capacidades.
- `TRABAJO_FOTO` es el agregado propietario y contiene intentos `INTENTO#id`. Los estados internos avanzan condicionalmente `PENDIENTE_CARGA → ENCOLADO → PROCESANDO → COMPLETADO | FALLIDO | EXPIRADO`; la consulta proyecta el intento más reciente a `RECIBIDA`, `PROCESADA` o `FALLIDA`.
- Cada intento usa una clave S3 inmutable `entradas/{sesionId}/{grupoId}/{trabajoId}/{intentoId}` en un bucket privado, cifrado y con versionado obligatorio. El primer evento registra `versionId` mediante compare-and-set; se deduplica por `bucket + key + versionId` y se rechaza otra versión para la misma clave.
- La consumidora traduce el evento S3 nativo a un comando interno versionado. Los contratos canónicos llevan `schemaVersion`; los eventos internos incluyen identificador, tipo, fecha UTC, identidad de Sesión/Grupo y referencia S3, y toleran campos aditivos.
- `PROCESANDO` se adquiere con un lease condicional `attemptId/leaseUntil`, recuperable tras vencer. El efecto de dominio y `COMPLETADO` se escriben juntos con `TransactWriteItems` sobre ítems propiedad de fotografías.
- Una Lambda reconciliadora programada y conectada a la DLQ registra causas y terminaliza intentos vencidos. El reintento docente crea un intento nuevo enlazado al anterior; no reutiliza ni sobrescribe la clave previa.
- S3, SQS, DLQ, policies, notificación S3→SQS y alarmas de esos recursos pertenecen a Terraform. Lambdas, logs, alarmas Lambda/API, concurrencia, schedule y event source mapping pertenecen a SAM. Terraform entrega a SAM `BucketMultimedia`, `ArnColaFotos` y `ArnDlqFotos`, entre los outputs obligatorios; Ansible orquesta y falla si faltan.
- Las rutas interactivas, fotografías y Analytics mantienen funciones, timeouts, concurrencia y alarmas independientes. El procesamiento fotográfico nunca se ejecuta dentro de una transición interactiva.
- DynamoDB Global Tables en `us-east-1` y `us-west-2` sigue siendo la única Golden Copy. No se presupone consistencia inmediata entre regiones y no se introduce otra fuente autoritativa.

## UX & Interaction Patterns

El frontend conserva scripts clásicos globales y centraliza HTTP en `frontend/compartido/js/api.js`. La carga y el seguimiento deben integrarse con la identidad lúdica de la misión y mostrar estado pendiente, éxito, error y reintento en lenguaje educativo. Solo el Profesor ve la acción de recuperación cuando la proyección es `FALLIDA`; toda actualización de rutas o estados se coordina entre frontend, API y persistencia.

## Cross-Story Dependencies

La épica depende de la autenticación Cognito y autorización por ownership de la Épica 1: API Gateway valida el access token JWT y el backend deriva exclusivamente el rol desde `cognito:groups`, resolviendo las cadenas de identidad mediante `sesiones`. La carga nace en la experiencia de Fase 3, pero su procesamiento queda desacoplado de esa transición. Las pruebas de fallo de consumidor, observabilidad y aislamiento aportan la base fotográfica que profundiza la Épica 6; los contratos estructurales y gates de despliegue se completan en la Épica 7.
