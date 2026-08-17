import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  construirCamposEvaluacionAnalitica,
  construirItemGrupoAnalitico,
  construirItemSesionAnalitica,
  mapearFilaKpis,
  VERSION_CONTRATO_ANALITICA,
} from "../src/compartido/contratos/analytics.js";

// Rutas resueltas desde la ubicación de este archivo (no del cwd del
// proceso), para que la prueba sea independiente de desde dónde se invoque
// `vitest`. Este archivo vive en backend-serverless/pruebas/, y las
// vistas SQL viven en <raíz-del-repo>/analytics/. `__dirname` (en vez de
// `import.meta.url`) porque el proyecto compila con module: "NodeNext" sin
// "type": "module" en package.json, es decir, en modo CommonJS.
const directorioAnalytics = join(__dirname, "..", "..", "analytics");

const rawSql = readFileSync(join(directorioAnalytics, "01_crear_tabla_raw.sql"), "utf8");
const vwSesiones = readFileSync(join(directorioAnalytics, "02_vw_sesiones.sql"), "utf8");
const vwGrupos = readFileSync(join(directorioAnalytics, "03_vw_grupos.sql"), "utf8");
const vwEvaluaciones = readFileSync(join(directorioAnalytics, "04_vw_evaluaciones.sql"), "utf8");
const vwKpis = readFileSync(join(directorioAnalytics, "05_vw_kpis_por_sesion.sql"), "utf8");

function clavesDe(...objetos: object[]): string[] {
  const claves = new Set<string>();
  for (const objeto of objetos) {
    for (const clave of Object.keys(objeto)) claves.add(clave);
  }
  return [...claves];
}

describe("contrato analítico writer -> extractor -> vista -> DTO", () => {
  it("cada atributo que producen los constructores del contrato tiene un path_extractor en 01_crear_tabla_raw.sql", () => {
    const itemSesion = construirItemSesionAnalitica({
      sesionId: "s1",
      fase: "f1_bienvenida",
      totalGrupos: 2,
      totalAlumnos: 10,
      fechaCreacion: "2026-01-01T00:00:00.000Z",
    });

    const itemGrupo = construirItemGrupoAnalitico({
      sesionId: "s1",
      grupoId: "g1",
      nombreGrupo: "Grupo 1",
      tokens: 10,
      sopaCompletada: false,
      legoCompletado: false,
    });

    const camposEvaluacion = construirCamposEvaluacionAnalitica({
      grupoEvaluadoId: "g1",
      grupoEvaluadorId: "g2",
      claridad: 4,
      creatividad: 4,
      viabilidad: 4,
      equipo: 4,
      presentacion: 4,
      automatica: false,
    });

    for (const clave of clavesDe(itemSesion, itemGrupo, camposEvaluacion)) {
      expect(rawSql, `falta el path_extractor de "${clave}" en 01_crear_tabla_raw.sql`).toContain(`(Item ${clave})`);
    }
  });

  it("propaga schema_version en las 4 vistas SQL dependientes", () => {
    const vistas: Array<[string, string]> = [
      ["02_vw_sesiones.sql", vwSesiones],
      ["03_vw_grupos.sql", vwGrupos],
      ["04_vw_evaluaciones.sql", vwEvaluaciones],
      ["05_vw_kpis_por_sesion.sql", vwKpis],
    ];

    for (const [nombre, contenido] of vistas) {
      expect(contenido, `${nombre} no propaga schema_version`).toContain("schema_version");
    }
  });

  it("mapearFilaKpis tolera una columna aditiva desconocida sin romper el resto del KPI", () => {
    const fila = {
      schema_version: VERSION_CONTRATO_ANALITICA,
      sesion_id: "s1",
      total_alumnos: "10",
      grupos_configurados: "2",
      grupos_en_datos: "2",
      promedio_tokens: "5",
      campo_futuro_desconocido: "valor-que-no-existía-al-escribir-este-contrato",
    };

    const dto = mapearFilaKpis(fila, "s1");

    expect(dto).toMatchObject({
      ok: true,
      sesionId: "s1",
      schemaVersion: VERSION_CONTRATO_ANALITICA,
      verificado: true,
      totalAlumnos: 10,
      totalGrupos: 2,
      gruposEnDatos: 2,
      promedioTokens: 5,
    });
    expect(typeof dto.verificadoEn).toBe("string");
  });

  it("lee una fila heredada sin schema_version como la versión base (lectura anterior), no como error", () => {
    const dto = mapearFilaKpis({ sesion_id: "s1", total_alumnos: "10" }, "s1");

    expect(dto).toMatchObject({
      ok: true,
      sesionId: "s1",
      schemaVersion: VERSION_CONTRATO_ANALITICA,
      verificado: true,
      totalAlumnos: 10,
    });
  });

  it("rechaza schema_version presente pero no soportada con diagnóstico identificable", () => {
    expect(() => mapearFilaKpis({ sesion_id: "s1", schema_version: "9.9" }, "s1")).toThrowError(
      expect.objectContaining({ estado: 409, codigo: "CONTRATO_ANALITICO_INCOMPATIBLE" }),
    );
  });
});
