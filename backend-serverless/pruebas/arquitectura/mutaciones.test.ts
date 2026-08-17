import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { analizarReglasHexagonales } from "./analizador-arquitectura.js";

const directorioSrc = resolve("src");

describe("Historia 7.1 — Mutaciones deliberadas por regla arquitectónica (NFR30)", () => {
  it("falla y diagnostica ante una mutación de import relativo sin extensión .js", () => {
    const archivoMutado = {
      ruta: resolve(directorioSrc, "fase1/servicio.ts"),
      contenido: `
        import { RepositorioFase1 } from "./repositorio";
        export class ServicioFase1 {}
      `,
    };

    const violaciones = analizarReglasHexagonales([archivoMutado], directorioSrc);
    expect(violaciones.length).toBeGreaterThan(0);
    const violacion = violaciones.find((v) => v.regla === "NFR26_IMPORTS_RELATIVOS_JS");
    expect(violacion).toBeDefined();
    expect(violacion?.archivo).toContain("fase1/servicio.ts");
    expect(violacion?.detalle).toContain("./repositorio");
  });

  it("falla y diagnostica ante una mutación que introduce @aws-sdk en servicio.ts", () => {
    const archivoMutado = {
      ruta: resolve(directorioSrc, "sesiones/servicio.ts"),
      contenido: `
        import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
        import { RepositorioSesiones } from "./repositorio.js";
        export class ServicioSesiones {}
      `,
    };

    const violaciones = analizarReglasHexagonales([archivoMutado], directorioSrc);
    expect(violaciones.length).toBeGreaterThan(0);
    const violacion = violaciones.find((v) => v.regla === "AR1_SERVICIO_SIN_AWS_SDK");
    expect(violacion).toBeDefined();
    expect(violacion?.archivo).toContain("sesiones/servicio.ts");
    expect(violacion?.detalle).toContain("@aws-sdk/client-dynamodb");
  });

  it("falla y diagnostica ante una mutación con dependencia inversa servicio.ts -> api.ts", () => {
    const archivoMutado = {
      ruta: resolve(directorioSrc, "profesor/servicio.ts"),
      contenido: `
        import { manejador } from "./api.js";
        export class ServicioProfesor {}
      `,
    };

    const violaciones = analizarReglasHexagonales([archivoMutado], directorioSrc);
    expect(violaciones.length).toBeGreaterThan(0);
    const violacion = violaciones.find((v) => v.regla === "AR1_SIN_DEPENDENCIA_INVERSA_SERVICIO_API");
    expect(violacion).toBeDefined();
    expect(violacion?.archivo).toContain("profesor/servicio.ts");
  });

  it("falla y diagnostica ante una mutación donde api.ts usa baseDatos directa", () => {
    const archivoMutado = {
      ruta: resolve(directorioSrc, "acceso/api.ts"),
      contenido: `
        import { ejecutarOperacionDynamo } from "../compartido/baseDatos.js";
        export const manejador = async () => {};
      `,
    };

    const violaciones = analizarReglasHexagonales([archivoMutado], directorioSrc);
    expect(violaciones.length).toBeGreaterThan(0);
    const violacion = violaciones.find((v) => v.regla === "AR1_API_SIN_BASE_DATOS_DIRECTA");
    expect(violacion).toBeDefined();
    expect(violacion?.archivo).toContain("acceso/api.ts");
  });

  it("falla y diagnostica ante una mutación que importa repositorios de otras capacidades", () => {
    const archivoMutado = {
      ruta: resolve(directorioSrc, "fase2/servicio.ts"),
      contenido: `
        import { RepositorioSesiones } from "../sesiones/repositorio.js";
        export class ServicioFase2 {}
      `,
    };

    const violaciones = analizarReglasHexagonales([archivoMutado], directorioSrc);
    expect(violaciones.length).toBeGreaterThan(0);
    const violacion = violaciones.find((v) => v.regla === "NFR26_REPOSITORIOS_NO_COMPARTIDOS");
    expect(violacion).toBeDefined();
    expect(violacion?.archivo).toContain("fase2/servicio.ts");
    expect(violacion?.detalle).toContain("../sesiones/repositorio.js");
  });

  it("vuelve a pasar limpiamente (0 violaciones) cuando la mutación es retirada", () => {
    const archivoLimpio = {
      ruta: resolve(directorioSrc, "fase1/servicio.ts"),
      contenido: `
        import { RepositorioFase1 } from "./repositorio.js";
        import { PuertosSesiones } from "../compartido/alcance.js";
        export class ServicioFase1 {
          constructor(private repo: RepositorioFase1) {}
        }
      `,
    };

    const violaciones = analizarReglasHexagonales([archivoLimpio], directorioSrc);
    expect(violaciones).toHaveLength(0);
  });
});
