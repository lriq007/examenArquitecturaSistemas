# Configuración de Reglas de Protección de Ramas y Rulesets (GitHub Actions)

**Objetivo:** Garantizar que ningún cambio ingrese a `main` sin haber sido revisado mediante Pull Request y validado por la totalidad de los gates de integración continua (Historia 7.3, NFR31).

---

## 1. Configuración de Rulesets / Branch Protection en GitHub

Para aplicar la gobernanza definida en el **Architecture Spine (AD-10)**, el repositorio debe configurar las siguientes restricciones en `Settings -> Branches` o `Settings -> Rules -> Rulesets`:

### Parámetros de la Regla:

- **Target branch:** `main` (o patrón `refs/heads/main`).
- **Enforcement status:** `Active`.

### Políticas y Gates Obligatorios:

1. **Restrict direct pushes:**
   - Habilitar: `Restrict pushes that create matching branches` / `Block direct pushes`.
   - **Efecto:** Ningún desarrollador puede hacer `git push origin main` directamente. Todo cambio debe originarse en una rama de feature y proponerse mediante Pull Request.

2. **Require a pull request before merging:**
   - `Required approvals:` Mínimo 1 aprobación humana.
   - `Dismiss stale pull request approvals when new commits are pushed:` Habilitado (si se agregan commits nuevos, se requiere re-aprobar).
   - `Require review from Code Owners:` Opcional / Recomendado.

3. **Require status checks to pass before merging (Gates Bloqueantes):**
   - `Require branches to be up to date before merging:` Habilitado.
   - **Status Checks requeridos:**
     - `Verificación de Tipos, Pruebas, Contratos, IaC y Seguridad` (job del workflow `.github/workflows/ci.yml`).
   - **Comportamiento:** Si falla cualquiera de los pasos (`npm run tipos`, `npm run pruebas`, `npm run empaquetar:verificar`, `sam validate`, `sam build`, `terraform fmt/validate`, `ansible syntax-check`, `escanear:secretos`), el merge a `main` permanece **bloqueado**.

4. **Do not allow bypass:**
   - Habilitar: `Do not allow bypassing the above settings` (incluye administradores del repositorio).

---

## 2. Matriz de Gates Ejecutados en CI

| Gate | Herramienta | Condición de Aprobación |
| --- | --- | --- |
| **Instalación limpia** | `npm ci` | Lockfile intacto y dependencias resueltas |
| **Tipos estáticos** | `tsc --noEmit` | Cero errores de tipado TypeScript |
| **Pruebas y Arquitectura** | `vitest run` | 100% de tests unitarios, hexagonales y de caos aprobados |
| **Empaquetado de Handlers** | `esbuild` | Generación exitosa de los 12 bundles declarados en SAM |
| **Escaneo de Secretos** | `tsx scripts/escanear-secretos.ts` | Cero claves o tokens persistidos |
| **Validación SAM** | `sam validate --lint` | Plantilla SAM válida y conforme a linter |
| **Construcción SAM** | `sam build` | Artefactos Lambda construidos correctamente |
| **Formato Terraform** | `terraform fmt -check` | HCL canónico y formateado |
| **Validación Terraform** | `terraform validate` | Sintaxis y referencias de recursos coherentes |
| **Sintaxis Ansible** | `ansible-playbook --syntax-check` | Playbook YAML libre de errores sintácticos |

---

## 3. Verificación de Bloqueo

Cualquier commit o PR que intente violar un límite arquitectónico (ej. import sin `.js`, dependencia inversa) o falle un contrato de infraestructura será bloqueado automáticamente en GitHub antes del merge, protegiendo la rama `main` y el pipeline de producción.
