import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const template = readFileSync("template.yaml", "utf8");
const terraform = readFileSync("../main.tf", "utf8");

describe("arquitectura de seguridad desplegable", () => {
  it("declara Cognito, authorizers separados y Grupo como protección por defecto", () => {
    expect(template).toContain("DefaultAuthorizer: AuthorizerGrupos");
    expect(template).toContain("AuthorizerProfesores:");
    expect(template).toContain("AuthorizerGrupos:");
    expect(template).toContain("AccessTokenValidity: 8");
    expect(template).toContain('"POST /api/acceso/ingresar"');
    expect(template).toContain("ThrottlingRateLimit: 2");
  });

  it("solo deja públicos los dos ingresos y protege Profesor/Analytics con su authorizer", () => {
    expect((template.match(/Authorizer: NONE/g) ?? [])).toHaveLength(2);
    expect((template.match(/Authorizer: AuthorizerProfesores/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it("no conserva secretos HMAC, clave global ni rol académico amplio", () => {
    const autoridadesHeredadas = [
      "Clave" + "Token",
      "ClaveAcceso" + "Profesor",
      "CLAVE_" + "TOKEN",
      "CLAVE_ACCESO_" + "PROFESOR",
      "Lab" + "Role",
      "profe" + "123",
    ];
    for (const autoridad of autoridadesHeredadas) expect(template).not.toContain(autoridad);
  });

  it("empaqueta todos los handlers declarados", () => {
    const packageJson = readFileSync("package.json", "utf8");
    for (const modulo of ["acceso", "profesor", "sesiones", "fase1", "fase2", "fase3", "fase4", "fase5", "analytics"]) {
      expect(packageJson).toContain(`src/${modulo}/api.ts`);
    }
  });

  it("preserva Global Tables activa-activa y expone frontend HTTPS", () => {
    expect(terraform).toContain("replica {");
    expect(terraform).toContain("region_name = var.region_replica");
    expect(terraform).toContain('viewer_protocol_policy = "redirect-to-https"');
    expect(terraform).toContain('value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"');
    expect(terraform).toContain('origin_access_control_origin_type = "s3"');
    expect(terraform).toContain("bucket_regional_domain_name");
    expect(terraform).not.toContain("aws_s3_bucket_website_configuration");
    expect(terraform).toContain("block_public_policy     = true");
  });
});
