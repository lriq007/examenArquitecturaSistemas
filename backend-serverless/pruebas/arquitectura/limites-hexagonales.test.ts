import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  analizarReglasHexagonales,
  obtenerArchivosTypeScript,
} from "./analizador-arquitectura.js";

const directorioSrc = resolve("src");

describe("Historia 7.1 — Pruebas de límites hexagonales (NFR13, NFR26, AR1, AD-1)", () => {
  const archivos = obtenerArchivosTypeScript(directorioSrc, true);

  it("encuentra y analiza todos los archivos TypeScript en src/ (mínimo 20 archivos)", () => {
    expect(archivos.length).toBeGreaterThanOrEqual(20);
  });

  it("cumple la regla NFR26: todos los imports relativos en TypeScript terminan en .js o .json", () => {
    const archivosObj = archivos.map((ruta) => ({ ruta }));
    const violaciones = analizarReglasHexagonales(archivosObj, directorioSrc)
      .filter((v) => v.regla === "NFR26_IMPORTS_RELATIVOS_JS");

    if (violaciones.length > 0) {
      const resumen = violaciones.map((v) => `${v.archivo}:${v.linea} -> ${v.detalle}`).join("\n");
      expect.unreachable(`Se encontraron imports relativos sin .js:\n${resumen}`);
    }
    expect(violaciones).toHaveLength(0);
  });

  it("cumple la regla AR1/AD-1: ningún servicio.ts importa directamente @aws-sdk o baseDatos.js", () => {
    const archivosObj = archivos.map((ruta) => ({ ruta }));
    const violaciones = analizarReglasHexagonales(archivosObj, directorioSrc)
      .filter((v) => v.regla === "AR1_SERVICIO_SIN_AWS_SDK");

    expect(violaciones).toHaveLength(0);
  });

  it("cumple la regla AR1/AD-1: no existen dependencias inversas desde servicio.ts o repositorio.ts hacia api.ts", () => {
    const archivosObj = archivos.map((ruta) => ({ ruta }));
    const violaciones = analizarReglasHexagonales(archivosObj, directorioSrc)
      .filter((v) =>
        v.regla === "AR1_SIN_DEPENDENCIA_INVERSA_SERVICIO_API" ||
        v.regla === "AR1_REPOSITORIO_SIN_API" ||
        v.regla === "AR1_REPOSITORIO_SIN_SERVICIO"
      );

    expect(violaciones).toHaveLength(0);
  });

  it("cumple la regla NFR26: ningún módulo importa repositorios de otras capacidades", () => {
    const archivosObj = archivos.map((ruta) => ({ ruta }));
    const violaciones = analizarReglasHexagonales(archivosObj, directorioSrc)
      .filter((v) => v.regla === "NFR26_REPOSITORIOS_NO_COMPARTIDOS");

    expect(violaciones).toHaveLength(0);
  });

  it("cumple la regla AR1: api.ts no accede directamente a baseDatos.ts", () => {
    const archivosObj = archivos.map((ruta) => ({ ruta }));
    const violaciones = analizarReglasHexagonales(archivosObj, directorioSrc)
      .filter((v) => v.regla === "AR1_API_SIN_BASE_DATOS_DIRECTA");

    expect(violaciones).toHaveLength(0);
  });

  it("los puntos de entrada Lambda exportan la función manejador", async () => {
    const entryPoints = [
      "../../src/acceso/api.js",
      "../../src/profesor/api.js",
      "../../src/sesiones/api.js",
      "../../src/fase1/api.js",
      "../../src/fase2/api.js",
      "../../src/fase3/api.js",
      "../../src/fase4/api.js",
      "../../src/fase5/api.js",
      "../../src/analytics/api.js",
      "../../src/fotografias/api.js",
      "../../src/fotografias/consumidor.js",
      "../../src/fotografias/reconciliador.js",
    ];

    for (const ep of entryPoints) {
      const modulo = await import(/* @vite-ignore */ ep);
      expect(typeof modulo.manejador).toBe("function");
    }
  });
});
