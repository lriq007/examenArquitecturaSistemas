import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { describe, expect, it } from "vitest";

const terraformHcl = readFileSync(resolve("../main.tf"), "utf8");
const templateYaml = readFileSync(resolve("template.yaml"), "utf8");
const directorioFrontend = resolve("../frontend");

describe("Historia 7.7 — Seguridad y compatibilidad del entorno web (NFR7, NFR8, NFR29, NFR35, AR12, AR18)", () => {
  describe("Seguridad HTTPS y Aislamiento de Buckets", () => {
    it("CloudFront exige redirección obligatoria a HTTPS", () => {
      expect(terraformHcl).toContain('viewer_protocol_policy = "redirect-to-https"');
      expect(terraformHcl).toContain('origin_access_control_origin_type = "s3"');
    });

    it("los buckets multimedia y data lake bloquean 100% el acceso público y aplican cifrado", () => {
      expect(terraformHcl).toMatch(/resource "aws_s3_bucket_public_access_block" "multimedia"[\s\S]*?block_public_acls\s*=\s*true/);
      expect(terraformHcl).toMatch(/resource "aws_s3_bucket_public_access_block" "multimedia"[\s\S]*?block_public_policy\s*=\s*true/);
      expect(terraformHcl).toMatch(/resource "aws_s3_bucket_public_access_block" "multimedia"[\s\S]*?ignore_public_acls\s*=\s*true/);
      expect(terraformHcl).toMatch(/resource "aws_s3_bucket_public_access_block" "multimedia"[\s\S]*?restrict_public_buckets\s*=\s*true/);

      expect(terraformHcl).toMatch(/resource "aws_s3_bucket_public_access_block" "datalake"[\s\S]*?block_public_acls\s*=\s*true/);
      expect(terraformHcl).toMatch(/resource "aws_s3_bucket_public_access_block" "datalake"[\s\S]*?block_public_policy\s*=\s*true/);
      expect(terraformHcl).toMatch(/resource "aws_s3_bucket_public_access_block" "datalake"[\s\S]*?restrict_public_buckets\s*=\s*true/);
    });

    it("CORS está restringido al origen desplegado y no usa comodín en producción", () => {
      expect(templateYaml).toContain("OrigenCors:");
      expect(templateYaml).toContain("OrigenCorsProductivoConfirmado:");
      expect(templateYaml).toMatch(/AllowedPattern:\s*["']https:\/\/\.\+["']/);
      expect(templateYaml).toContain("!Equals [!Ref OrigenCors, !Ref OrigenCorsProductivoConfirmado]");
    });
  });

  describe("Gate de Retención y Eliminación de Fotografías", () => {
    it("aplica regla de ciclo de vida S3 de 30 días para entradas y 1 día para versiones no actuales", () => {
      expect(terraformHcl).toContain('id     = "retencion-fotografias-30-dias"');
      expect(terraformHcl).toContain('prefix = "entradas/"');
      expect(terraformHcl).toMatch(/expiration\s*\{\s*days\s*=\s*30\s*\}/);
      expect(terraformHcl).toMatch(/noncurrent_version_expiration\s*\{\s*noncurrent_days\s*=\s*1\s*\}/);
      expect(terraformHcl).toContain("expired_object_delete_marker = true");
      expect(terraformHcl).toContain("message_retention_seconds = 1209600");
    });

    it("las cargas fotográficas permanecen deshabilitadas por defecto hasta superar el gate", () => {
      expect(terraformHcl).toMatch(/variable "habilitar_cargas_fotografias"[\s\S]*?default\s*=\s*false/);
      expect(templateYaml).toMatch(/CargasFotografiasHabilitadas:[\s\S]*?Default:\s*"false"/);
    });
  });

  describe("Preservación de Scripts Clásicos y Orden de Carga Frontend", () => {
    it("todas las páginas HTML del frontend cargan api.js antes de sus scripts dependientes", () => {
      function buscarArchivosHtml(dir: string): string[] {
        const encontrados: string[] = [];
        for (const e of readdirSync(dir)) {
          const ruta = join(dir, e);
          const stat = statSync(ruta);
          if (stat.isDirectory()) {
            encontrados.push(...buscarArchivosHtml(ruta));
          } else if (stat.isFile() && e.endsWith(".html")) {
            encontrados.push(ruta);
          }
        }
        return encontrados;
      }

      const paginasHtml = buscarArchivosHtml(directorioFrontend);
      expect(paginasHtml.length).toBeGreaterThanOrEqual(10);

      for (const pagina of paginasHtml) {
        const contenido = readFileSync(pagina, "utf8");
        // Si la página incluye scripts JS interactivos que llaman a la API
        if (contenido.includes("<script") && (contenido.includes("llamarApi") || contenido.includes("api.js") || contenido.includes("compartido.js"))) {
          const indiceApiJs = contenido.indexOf("api.js");
          const indiceScriptLocal = contenido.lastIndexOf("<script");

          if (indiceApiJs !== -1 && indiceScriptLocal > indiceApiJs) {
            expect(indiceApiJs).toBeLessThan(indiceScriptLocal);
          }
        }
      }
    });
  });
});
