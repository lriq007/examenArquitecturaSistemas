# Seguridad y Compatibilidad del Entorno Web

**Historia:** 7.7 (NFR7, NFR8, NFR29, NFR35, AR12, AR18)  
**Propósito:** Definir los requisitos de seguridad perimetral, aislamiento de datos, ciclo de vida de almacenamiento y matriz de compatibilidad de cliente para la plataforma Misión Emprende UDD.

---

## 1. Seguridad del Entorno Web y Red

### A. HTTPS y Cifrado en Tránsito
- En entornos no locales (producción), el frontend se sirve obligatoriamente mediante HTTPS a través de **Amazon CloudFront** con política `redirect-to-https` y certificados TLS administrados por AWS Certificate Manager.
- En API Gateway HTTP API, todas las invocaciones exigen TLS 1.2+ y rechazan conexiones HTTP en texto plano.

### B. Restricción Estricta de CORS
- API Gateway y CloudFront restringen CORS exclusivamente al dominio autorizado (`OrigenCors`), rechazando comodines (`*`) fuera de entornos locales.
- Preflight `OPTIONS` valida `Origin`, `Access-Control-Request-Method` (`GET, POST, OPTIONS`) y headers (`Authorization, Content-Type`).

### C. Aislamiento y Cifrado de Buckets S3
- **Bucket Frontend (`mision-emprende-frontend-*`):** Acceso público restringido mediante Origin Access Control (OAC) en CloudFront; solo lectura en modo Academy.
- **Bucket Multimedia (`mision-emprende-multimedia-*`):** 100% privado con `Block Public Access` (4 configuraciones en `true`). Cifrado en reposo SSE-S3 (`aws:kms` o AES-256). Acceso exclusivo mediante URLs prefirmadas de corta expiración (300 segundos).
- **Bucket Data Lake (`mision-emprende-datalake-*`):** 100% privado con `Block Public Access`. Cifrado en reposo. Acceso restringido al motor de Athena y Lambdas de analítica.

---

## 2. Gate de Retención y Eliminación de Fotografías

Para cumplir con normativas de privacidad estudiantil y optimización de costos en S3:

1. **Regla de Ciclo de Vida S3 (`retencion-fotografias-30-dias`):**
   - Prefijo: `entradas/`
   - Expiración de objetos actuales: 30 días tras su creación.
   - Expiración de versiones no actuales (S3 Versioning): 1 día.
   - Eliminación automática de marcadores de borrado expirados (`expired_object_delete_marker = true`).
2. **Retención de Mensajes SQS:**
   - Retención máxima en cola: 14 días (`message_retention_seconds = 1209600`).
3. **Gate de Habilitación:**
   - La variable `habilitar_cargas_fotografias` permanece en `false` por defecto.
   - El despliegue de notificaciones S3->SQS está condicionado a la aprobación formal de esta política.

---

## 3. Matriz Mínima de Compatibilidad (Navegador y Resolución)

Para las pruebas de usuario y E2E, los recorridos críticos de las 5 fases del juego deben operar sin distorsión ni errores en la siguiente matriz mínima:

### Navegadores Soportados:
| Navegador | Versión Mínima | Plataformas |
| --- | --- | --- |
| **Google Chrome / Chromium** | 120+ | Windows, macOS, Linux, ChromeOS |
| **Mozilla Firefox** | 120+ | Windows, macOS, Linux |
| **Apple Safari** | 17+ | macOS, iOS, iPadOS |
| **Microsoft Edge** | 120+ | Windows, macOS |

### Resoluciones de Pantalla Homologadas:
| Formato | Resolución | Contexto de Uso |
| --- | --- | --- |
| **Escritorio Estándar** | `1920 x 1080` (16:9) | Proyector de aula / Sala de computación |
| **Laptop Educativa** | `1366 x 768` (16:9) | Notebooks de estudiantes y profesores |
| **Tablet / Portátil Pequeño** | `1024 x 768` (4:3) | Tablets institucionales |

---

## 4. Convención de Scripts Clásicos en Frontend

- El frontend no utiliza bundler (Webpack/Vite) por diseño.
- Se preservan scripts clásicos globales cargados en orden secuencial en cada página HTML:
  1. `frontend/compartido/js/api.js` (comunicación HTTP y gestión de token en `localStorage`).
  2. `frontend/juego/compartido.js` / helpers específicos de fase.
  3. Script de lógica de la pantalla particular.
- El backend mantiene el estado autoritativo y los tiempos calculados desde marcas temporales del servidor (AD-3).
