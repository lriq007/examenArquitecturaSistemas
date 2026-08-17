# Epic 5 Context: Resultados y KPIs confiables

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

El Profesor puede consultar KPIs verificados de sus propias Sesiones mediante un servicio analítico de solo lectura, sin acceder a información ajena o desactualizada, y el sistema puede evolucionar esos KPIs a lo largo de todo el pipeline (DynamoDB → extractor raw → S3 Data Lake → vistas Athena → servicio Analytics → dashboard) sin romper ninguna etapa ni introducir cifras incompletas o con significados incompatibles.

## Stories

- Story 5.1: Dashboard autorizado de KPIs
- Story 5.2: Evolución contractual de un KPI

## Requirements & Constraints

- Un Profesor autenticado que consulta KPIs de una Sesión propia debe recibir del servicio de solo lectura los mismos valores que las vistas Athena verificadas, y el dashboard debe identificarlos como actuales.
- Una consulta sobre una Sesión ajena se rechaza; una consulta analítica fallida muestra el error correspondiente y nunca presenta datos obsoletos como si fueran el resultado actual.
- Las funciones de Analytics deben operar con permisos IAM mínimos por capacidad.
- Deben existir logs estructurados y métricas correlacionables por Sesión, Grupo, solicitud y recurso consultado, sin exponer tokens ni datos sensibles.
- Un KPI nuevo o un campo agregado exige actualización coordinada de: escritura DynamoDB, extractor raw, vistas SQL dependientes, servicio Analytics y UI; ninguna de esas cinco etapas puede omitir el campo o alterar su significado.
- Un cambio de contrato de KPI se valida con pruebas de contrato writer → extractor → vista → DTO antes del despliegue (gate NFR-20: tipos, pruebas funcionales/arquitectónicas, contratos, seguridad, IaC y comportamiento ante fallos).
- Un cambio incompatible falla con un diagnóstico identificable en las pruebas de contrato; mientras no se complete la migración, una versión incompatible conserva la lectura anterior disponible.

## Technical Decisions

- Analytics es una proyección derivada y de solo lectura respecto del dominio: DynamoDB exporta hacia el data lake S3 y Athena consulta vistas derivadas. Athena/S3 nunca compiten como fuente autoritativa del estado del juego; los resultados de Athena no modifican el estado operacional.
- La autoridad de KPIs y resultados de consulta es Athena (datos derivados, no autoritativos); la Golden Copy operacional sigue siendo DynamoDB Global Tables. El flujo de datos hacia analítica es unidireccional (DynamoDB → S3 Data Lake → Athena).
- Rutas interactivas, fotografías y Analytics mantienen funciones, colas, concurrencia, timeouts y alarmas separados por bulkhead; ninguna consulta Athena se ejecuta dentro de una transición interactiva del juego.
- La autorización usa la misma autoridad de identidad Cognito del resto del sistema: el rol se deriva exclusivamente de `cognito:groups` (`PROFESOR` o `GRUPO`, rechazando identidades con ambos o ninguno), y `sesiones` resuelve y verifica la cadena `sub → profesorId → sesionId` para validar que la Sesión consultada pertenece al Profesor autenticado. `sesionId` recibido por ruta o body nunca sustituye esa verificación.
- Los contratos canónicos versionados viven en `backend-serverless/src/compartido/contratos/`: JSON Schema es la fuente canónica de la que se derivan/verifican tipos TypeScript, fixtures DynamoDB y el catálogo de columnas SQL usado por las vistas Athena. Cada registro/DTO lleva `schemaVersion`; cada frontera valida en runtime y cada lector tolera campos aditivos desconocidos.
- Un cambio incompatible de contrato crea una versión nueva del schema y mantiene disponible la lectura de la versión anterior hasta que las pruebas de contrato writer → extractor → vista → DTO confirmen la migración completa.
- La infraestructura de Analytics (Data Lake S3, Glue/Athena, consumidor asíncrono del extractor) es propiedad de Terraform, igual que DynamoDB, buckets y sus alarmas; SAM posee las Lambdas del servicio Analytics, API Gateway y Cognito. Ningún stack crea alarmas o dashboards que referencien recursos del otro.
- Convenciones transversales aplicables: fechas ISO-8601 UTC, identificadores opacos estables, respuestas JSON con el adaptador de errores compartido, `Authorization: Bearer <access token>`.

## UX & Interaction Patterns

El dashboard centraliza sus llamadas HTTP en `frontend/compartido/js/api.js`, conserva scripts clásicos globales y su orden, y debe identificar explícitamente los KPIs mostrados como actuales/verificados frente a un estado de error o dato no disponible (nunca mostrar un valor obsoleto como si fuera vigente). No existe un contrato UX separado para esta épica; el frontend implementado sirve de referencia y deben conservarse las convenciones ya explícitas del resto del sistema.

## Cross-Story Dependencies

La Story 5.1 depende de la autenticación y autorización por ownership de la Épica 1 (Cognito, derivación de rol desde `cognito:groups`, resolución de la cadena `sub → profesorId → sesionId`). La Story 5.2 formaliza el contrato de extremo a extremo que toda la Épica 5 requiere para que 5.1 devuelva valores confiables; ambas comparten la dependencia de que el pipeline DynamoDB → extractor → Athena → servicio Analytics permanezca sincronizado como una sola unidad de despliegue por cambio de KPI.
