# Misión Emprende UDD

Juego educativo serverless desplegado en AWS para la asignatura **Bases de Datos Avanzadas** de la Universidad del Desarrollo. Los alumnos avanzan por 5 fases de emprendimiento en tiempo real, guiados por un profesor desde un panel de control.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Alumno / Profesor                     │
│              Browser → S3 Static Website (HTTP)             │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   API Gateway (HTTP)  │
              └───────────┬───────────┘
                          │
              ┌───────────▼───────────┐
              │   AWS Lambda          │
              │   TypeScript (Node 22)│
              │   acceso / sesiones / │
              │   fase1-5 / profesor  │
              └───────────┬───────────┘
                          │
        ┌─────────────────▼──────────────────┐
        │        DynamoDB Global Tables       │
        │                                     │
        │  us-east-1 (primaria) ←──────────→ │
        │  us-west-2 (réplica)               │
        │                                     │
        │  Single-table design: PK/SK + GSI1 │
        └─────────────────────────────────────┘

IaC: Terraform (infraestructura) + Ansible (build & deploy)
```

**Recursos creados por Terraform (`main.tf`):**
- DynamoDB Global Table `MisionEmprende-prod` con réplica activa-activa en us-west-2
- S3 bucket frontend con static website hosting
- S3 bucket multimedia (imágenes/videos por URL pre-firmada)
- S3 bucket data lake + Athena workgroup (preparado para Big Data)

**Recursos creados por SAM (`backend-serverless/template.yaml`):**
- 8 funciones Lambda (acceso, sesiones, fase1–5, profesor)
- API Gateway HTTP con CORS habilitado

---

## Estructura del repositorio

```
├── main.tf                        # Infraestructura AWS (Terraform)
├── ansible/
│   └── deploy.yml                 # Playbook: build + deploy backend + frontend
├── backend-serverless/
│   ├── template.yaml              # Definición SAM (Lambdas + API Gateway)
│   ├── samconfig.toml             # Configuración de despliegue SAM
│   ├── src/
│   │   ├── acceso/                # Autenticación alumnos y profesor
│   │   ├── sesiones/              # Estado de la sesión activa
│   │   ├── fase1/ … fase5/        # Lógica de cada fase del juego
│   │   ├── profesor/              # Panel de control del profesor
│   │   └── compartido/            # Cliente DynamoDB, JWT, helpers
│   └── package.json
├── frontend/
│   ├── index.html                 # Pantalla de inicio
│   ├── acceso/                    # Login alumnos
│   ├── juego/                     # Fases del juego (alumno)
│   ├── profesor/                  # Panel del profesor
│   └── compartido/js/api.js       # URL del API Gateway (actualizada por Ansible)
```

## Prerrequisitos

Instalar en el sistema antes de continuar:

| Herramienta | Versión mínima | Verificar |
|---|---|---|
| Node.js | 22 | `node --version` |
| AWS CLI | cualquiera | `aws --version` |
| AWS SAM CLI | cualquiera | `sam --version` |
| Terraform | 1.8+ | `terraform --version` |
| Ansible | cualquiera | `ansible --version` |

---

## Credenciales AWS Academy

> **Este proyecto está diseñado para correr sobre AWS Academy.** Las credenciales de Academy expiran cada ~4 horas y deben renovarse al inicio de cada laboratorio.

### Cada vez que inicies un laboratorio:

1. Abre el portal AWS Academy → tu curso → **AWS Details** → **Show**
2. Copia los 3 valores que aparecen
3. Pégalos en `~/.aws/credentials`:

```ini
[default]
aws_access_key_id     = ASIA...
aws_secret_access_key = ...
aws_session_token     = ...
```

4. Verifica que funcionan:

```bash
aws sts get-caller-identity
```

Debe devolver tu `Account` y `UserId`. Si responde `ExpiredTokenException`, vuelve al paso 1.

> No se necesita `~/.aws/config` — la región está definida en `main.tf` y `samconfig.toml`.

---

## Despliegue completo

El despliegue se divide en dos pasos: **Terraform** crea la infraestructura base, y **Ansible** construye y despliega el código.

### Paso 1 — Infraestructura con Terraform

Desde la raíz del repositorio:

```bash
terraform init
terraform apply
```

Confirma con `yes` cuando pregunte.

Al terminar, anota el output `nombre_bucket_frontend`:

```
nombre_bucket_frontend = "mision-emprende-prod-frontend"
url_frontend           = "http://mision-emprende-prod-frontend.s3-website-us-east-1.amazonaws.com"
```

> **Nota AWS Academy:** si `terraform apply` falla en el bloque `replica {}` de DynamoDB con error de permisos, edita `main.tf` y comenta las líneas del bloque `replica { ... }`, luego vuelve a correr `terraform apply`. DynamoDB multi-AZ nativo de us-east-1 cubre igualmente el requisito de arquitectura distribuida.

### Paso 2 — Build y deploy con Ansible

```bash
ansible-playbook ansible/deploy.yml \
  -e "bucket_frontend=mision-emprende-prod-frontend"
```

El playbook hace automáticamente:
1. Instala dependencias Node.js del backend (`npm ci`)
2. Compila las Lambdas TypeScript con SAM (`sam build`)
3. Despliega el backend en AWS (`sam deploy`)
4. Obtiene la URL del API Gateway desde CloudFormation
5. Actualiza `frontend/compartido/js/api.js` con la URL real
6. Sube el frontend al bucket S3
7. Verifica que el API responde

El proceso tarda entre 3 y 7 minutos.

### Verificación

Abre la URL del frontend en el browser:

```
http://mision-emprende-prod-frontend.s3-website-us-east-1.amazonaws.com
```

- Inicia sesión como **profesor** con tus credenciales de Amazon Cognito
- Los **grupos** ingresan con el código de grupo asignado

---

## Re-despliegue (cambios en el código)

Si ya existe la infraestructura y solo cambiaste código:

```bash
ansible-playbook ansible/deploy.yml \
  -e "bucket_frontend=mision-emprende-prod-frontend"
```

No es necesario volver a correr `terraform apply` a menos que hayas modificado `main.tf`.

---

## Arquitectura distribuida — DynamoDB Global Tables

La tabla `MisionEmprende-prod` tiene réplica activa-activa entre:
- `us-east-1` — región primaria
- `us-west-2` — región réplica

Puedes verificarlo en la consola de AWS:
**DynamoDB → Tables → MisionEmprende-prod → Global tables**

Ambas regiones aparecen con estado `Active`. Los datos escritos en cualquiera de las dos se replican automáticamente a la otra (consistencia eventual).

---

## Desarrollo local

El backend puede correrse localmente con DynamoDB Local vía Docker:

```bash
cd backend-serverless

# Levantar DynamoDB local
npm run local:base

# Preparar tabla y datos de prueba
npm run local:preparar

# Iniciar API local (requiere Docker)
npm run local:api
```

La API quedará disponible en `http://localhost:3000`.

Para correr los tests:

```bash
cd backend-serverless
npm run pruebas
```

Para verificar tipos TypeScript:

```bash
cd backend-serverless
npm run tipos
```
