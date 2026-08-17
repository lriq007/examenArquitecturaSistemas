import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const rutaTemplate = resolve("template.yaml");
const rutaPackageJson = resolve("package.json");
const rutaTerraform = resolve("../main.tf");
const rutaFrontendApi = resolve("../frontend/compartido/js/api.js");

const templateYaml = readFileSync(rutaTemplate, "utf8");
const packageJson = JSON.parse(readFileSync(rutaPackageJson, "utf8"));
const terraformHcl = readFileSync(rutaTerraform, "utf8");
const frontendApiJs = readFileSync(rutaFrontendApi, "utf8");

describe("Historia 7.2 — Pruebas estructurales de contratos desplegables (NFR12, NFR21, NFR27, NFR28, NFR29, AR4, AR10, AR12, AR13, AR16)", () => {
  describe("Contrato SAM — Código y Empaquetado", () => {
    it("cada Handler declarado en template.yaml existe como archivo en src/ y exporta la función correspondiente", async () => {
      const lineas = templateYaml.split("\n");
      const handlers: { recurso: string; handler: string }[] = [];
      let recursoActual = "";

      for (const linea of lineas) {
        const matchRecurso = /^ {2}([A-Za-z0-9]+):/.exec(linea);
        if (matchRecurso && matchRecurso[1]) {
          recursoActual = matchRecurso[1];
        }
        const matchHandler = /Handler:\s+(src\/[A-Za-z0-9_\-\/]+\.[A-Za-z0-9_\-]+)/.exec(linea);
        if (matchHandler && matchHandler[1]) {
          handlers.push({
            recurso: recursoActual,
            handler: matchHandler[1],
          });
        }
      }

      // Verificamos que se hayan extraído los 12 handlers
      expect(handlers.length).toBeGreaterThanOrEqual(12);

      for (const { recurso, handler } of handlers) {
        const partes = handler.split(".");
        const rutaArchivo = partes[0] ?? "";
        const nombreFuncion = partes[1] ?? "";
        const rutaTypeScript = resolve(`${rutaArchivo}.ts`);

        expect(
          existsSync(rutaTypeScript),
          `El archivo de origen para el handler "${handler}" del recurso "${recurso}" no existe en ${rutaTypeScript}`
        ).toBe(true);

        const modulo = await import(/* @vite-ignore */ `../../${rutaArchivo}.js`);
        expect(
          typeof (modulo as Record<string, unknown>)[nombreFuncion],
          `El módulo "${rutaArchivo}" no exporta la función "${nombreFuncion}" para el recurso "${recurso}"`
        ).toBe("function");
      }
    });

    it("el script empaquetar:verificar en package.json incluye todos los 12 puntos de entrada", () => {
      const scriptEmpaquetar = packageJson.scripts["empaquetar:verificar"] || "";
      const handlersRequeridos = [
        "src/acceso/api.ts",
        "src/profesor/api.ts",
        "src/sesiones/api.ts",
        "src/fase1/api.ts",
        "src/fase2/api.ts",
        "src/fase3/api.ts",
        "src/fase4/api.ts",
        "src/fase5/api.ts",
        "src/analytics/api.ts",
        "src/fotografias/api.ts",
        "src/fotografias/consumidor.ts",
        "src/fotografias/reconciliador.ts",
      ];

      for (const handler of handlersRequeridos) {
        expect(
          scriptEmpaquetar,
          `El script empaquetar:verificar no incluye "${handler}"`
        ).toContain(handler);
      }
    });

    it("valida estructuralmente authorizers de Cognito y relaciones S3-SQS-Lambda-DLQ en template.yaml", () => {
      expect(templateYaml).toContain("AuthorizerProfesores:");
      expect(templateYaml).toContain("AuthorizerGrupos:");
      expect(templateYaml).toContain("ArnColaFotos:");
      expect(templateYaml).toContain("ArnDlqFotos:");
      expect(templateYaml).toContain("FuncionConsumidorFotografias:");
      expect(templateYaml).toContain("FuncionReconciliadorFotografias:");
      expect(templateYaml).toContain("Type: SQS");
      expect(templateYaml).toContain("Queue: !Ref ArnColaFotos");
    });
  });

  describe("Contrato Frontend — API", () => {
    it("todas las rutas consumidas por frontend/ existen en template.yaml", () => {
      // Rutas conocidas llamadas por los scripts del frontend
      const rutasFrontend = [
        "/api/acceso/ingresar",
        "/api/profesor/ingresar",
        "/api/profesor/sesiones",
        "/api/profesor/sesiones/{sesionId}",
        "/api/profesor/sesiones/{sesionId}/acciones",
        "/api/sesiones/actual",
        "/api/fase1/estado",
        "/api/fase1/iniciar",
        "/api/fase1/modo-equipo",
        "/api/fase1/listo",
        "/api/fase1/finalizar-conocidos",
        "/api/fase1/palabras",
        "/api/fase1/completar",
        "/api/fase1/ranking",
        "/api/fase2/estado",
        "/api/fase2/iniciar",
        "/api/fase2/listo",
        "/api/fase2/seleccion",
        "/api/fase2/asignar-azar",
        "/api/fase2/bubblemap/guardar",
        "/api/fase2/bubblemap/completar",
        "/api/fase2/ranking",
        "/api/fase3/estado",
        "/api/fase3/iniciar",
        "/api/fase3/listo",
        "/api/fase3/lego/completar",
        "/api/fase3/ruleta/girar",
        "/api/fase3/astronauta/responder",
        "/api/fase3/ranking",
        "/api/fase4/estado",
        "/api/fase4/pitch/guardar",
        "/api/fase4/pitch/iniciar",
        "/api/fase5/estado",
        "/api/fase5/evaluar",
        "/api/fase5/ranking",
        "/api/fase5/ranking/listo",
        "/api/fotografias",
        "/api/fotografias/{trabajoId}",
        "/api/profesor/fotografias/{trabajoId}",
        "/api/profesor/fotografias/{trabajoId}/reintento",
        "/api/analytics/kpis/{sesionId}",
      ];

      for (const ruta of rutasFrontend) {
        expect(
          templateYaml,
          `La ruta frontend "${ruta}" no está declarada en template.yaml`
        ).toContain(ruta);
      }
    });

    it("la URL desplegada en api.js está parametrizada para sustitución por Ansible", () => {
      expect(frontendApiJs).toMatch(/API_URL\s*=\s*['"]https?:\/\/.+['"]/);
      // Validar que Ansible tiene la tarea de reemplazo para esta variable
      const ansibleDeploy = readFileSync(resolve("../ansible/deploy.yml"), "utf8");
      expect(ansibleDeploy).toContain("API_URL =");
    });
  });

  describe("Invariantes de Infraestructura y Resiliencia", () => {
    it("DynamoDB Global Tables preserva réplicas activas en us-east-1 y us-west-2", () => {
      expect(terraformHcl).toContain('resource "aws_dynamodb_table" "mision_emprende"');
      expect(terraformHcl).toContain("replica {");
      expect(terraformHcl).toContain("region_name = var.region_replica");
      expect(terraformHcl).toMatch(/variable "region_primaria"[\s\S]*?default\s*=\s*"us-east-1"/);
      expect(terraformHcl).toMatch(/variable "region_replica"[\s\S]*?default\s*=\s*"us-west-2"/);
    });

    it("las inyecciones de fallo y habilitación de fotos están apagadas por defecto", () => {
      expect(templateYaml).toMatch(/SimularFalloDynamoPrincipal:[\s\S]*?Default:\s*"?false"?/);
      expect(templateYaml).toMatch(/CargasFotografiasHabilitadas:[\s\S]*?Default:\s*"false"/);
      expect(terraformHcl).toMatch(/variable "habilitar_cargas_fotografias"[\s\S]*?default\s*=\s*false/);
    });

    it("rechaza Cache-Aside y patrones sin evidencia conforme a la política", () => {
      const archivosSrc = packageJson.name;
      expect(archivosSrc).toBeDefined();
      // No debe existir mención a Cache-Aside como patrón activo
      expect(templateYaml.toLowerCase()).not.toContain("cache-aside");
      expect(templateYaml.toLowerCase()).not.toContain("elasticache");
      expect(terraformHcl.toLowerCase()).not.toContain("aws_elasticache");
    });

    it("respeta las versiones de herramientas aprobadas en el Architecture Spine", () => {
      expect(terraformHcl).toContain('required_version = ">= 1.8"');
      expect(terraformHcl).toContain('version = "~> 5.0"');
      expect(packageJson.devDependencies.typescript).toBe("^7.0.2");
      expect(packageJson.devDependencies.vitest).toBe("^4.1.10");
      expect(packageJson.engines.node).toBe(">=22");
    });
  });
});
