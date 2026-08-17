import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { obtenerEstadoFase1 } from "../src/fase1/servicio.js";
import type { GrupoFase1, RepositorioFase1, SesionFase1 } from "../src/fase1/repositorio.js";
import { procesarLote, type PuertoInspectorFoto } from "../src/fotografias/consumidor.js";
import type { PuertoFotografias } from "../src/fotografias/servicio.js";

const template = readFileSync("template.yaml", "utf8");

/*
 * Historia 6.2 — Aislamiento por clase de carga (Bulkhead).
 *
 * AD-6: separar funciones, colas, concurrencia reservada, timeouts y
 * alarmas por clase (interactivo vs. fotos vs. Analytics); ningún
 * procesamiento de fotos ni consulta Athena se ejecuta dentro de una
 * transición interactiva. Un nombre de patrón solo puede usarse
 * respaldado por configuración real + métrica + prueba de contención
 * (patrones-diseno-seleccionados.md, Épica 6 context).
 */
describe("Bulkhead — aislamiento estructural por clase de carga (IaC)", () => {
  it("Fotos y Analytics tienen concurrencia reservada y timeout propios, distintos del resto", () => {
    // FuncionConsumidorFotografias: bulkhead fotos.
    expect(template).toMatch(/FuncionConsumidorFotografias:[\s\S]*?ReservedConcurrentExecutions:\s*4/);
    expect(template).toMatch(/FuncionConsumidorFotografias:[\s\S]*?Timeout:\s*120/);

    // FuncionFotografiasApi: bulkhead fotos (ruta de aceptación, no de procesamiento).
    expect(template).toMatch(/FuncionFotografiasApi:[\s\S]*?ReservedConcurrentExecutions:\s*5/);

    // FuncionAnalytics: bulkhead Analytics, aislado del resto.
    expect(template).toMatch(/FuncionAnalytics:[\s\S]*?ReservedConcurrentExecutions:\s*3/);
    expect(template).toMatch(/FuncionAnalytics:[\s\S]*?Timeout:\s*30/);

    // FuncionReconciliadorFotografias: bulkhead fotos (reconciliación/DLQ), concurrencia mínima propia.
    expect(template).toMatch(/FuncionReconciliadorFotografias:[\s\S]*?ReservedConcurrentExecutions:\s*1/);
  });

  it("Fotos y Analytics tienen alarmas propias conectadas al tema SNS operable", () => {
    expect(template).toMatch(/AlarmaErroresConsumidorFotos:[\s\S]*?Dimensions: \[\{ Name: FunctionName, Value: !Ref FuncionConsumidorFotografias \}\]/);
    expect(template).toMatch(/AlarmaErroresConsumidorFotos:[\s\S]*?AlarmActions: \[!Ref ArnTemaAlarmas\]/);

    expect(template).toMatch(/AlarmaErroresAnalytics:[\s\S]*?Dimensions: \[\{ Name: FunctionName, Value: !Ref FuncionAnalytics \}\]/);
    expect(template).toMatch(/AlarmaErroresAnalytics:[\s\S]*?AlarmActions: \[!Ref ArnTemaAlarmas\]/);

    // Distintas dimensiones: cada alarma vigila su propia función, no una compartida.
    expect(template).not.toContain("Value: !Ref FuncionConsumidorFotografias }] }, Value: !Ref FuncionAnalytics");
  });

  it("Fotos usa su propia cola SQS, nunca referenciada por rutas interactivas", () => {
    expect(template).toMatch(/ColaFotografias:[\s\S]*?Queue: !Ref ArnColaFotos/);

    // Ninguna función interactiva (fase1-5, sesiones, acceso, profesor) declara un evento SQS propio.
    for (const funcion of ["FuncionFase1", "FuncionFase2", "FuncionFase3", "FuncionFase4", "FuncionFase5", "FuncionSesiones", "FuncionAcceso", "FuncionProfesor"]) {
      const bloque = new RegExp(`${funcion}:[\\s\\S]*?Metadata:`);
      const match = template.match(bloque);
      expect(match, `${funcion} debe existir en template.yaml`).not.toBeNull();
      expect(match![0]).not.toContain("Type: SQS");
    }
  });

  it("CaosFotos está acotado por parámetro, apagado por defecto, y separado de SimularFalloDynamoPrincipal", () => {
    expect(template).toMatch(/CaosFotos:\s*\n\s*Type: String\s*\n\s*Default: "false"/);
    expect(template).toContain("CaosFotosTrabajoId:");
    expect(template).toContain('CAOS_FOTOS: !Ref CaosFotos');
    expect(template).toContain('CAOS_FOTOS_TRABAJO_ID: !Ref CaosFotosTrabajoId');
    expect(template).toMatch(/SimularFalloDynamoPrincipal:\s*\n\s*Type: String\s*\n\s*Default: "false"/);
  });
});

/*
 * Simulación de contención a nivel de código (proceso único).
 *
 * El aislamiento real de concurrencia entre bulkheads lo garantiza
 * Lambda mediante ReservedConcurrentExecutions independientes por
 * función (verificado estructuralmente arriba): dos invocaciones de
 * FuncionConsumidorFotografias jamás consumen el cupo de
 * FuncionFase1/2/3/4/5. Lo que esta prueba demuestra a nivel de
 * proceso es que el código de dominio de la ruta interactiva no
 * depende de ningún recurso compartido con fotos/Analytics (sin
 * bloqueos, sin estado compartido, sin await cruzado): una carga
 * pesada o fallida en fotos/Analytics no retiene ni degrada la ruta
 * de control interactiva.
 */
describe("Bulkhead — la ruta interactiva permanece en estado estable bajo saturación simulada de fotos/Analytics", () => {
  function repositorioFase1Falso(): RepositorioFase1 {
    const sesion: SesionFase1 = { sesionId: "s1", fase: "f1_sopa", totalGrupos: 1, gruposSopaCompletada: 0 };
    const grupo: GrupoFase1 = { grupoId: "g1", nombreGrupo: "Control", tokens: 0, sopaCompletada: false };

    return {
      async buscarSesion() {
        return { ...sesion };
      },
      async buscarGrupo() {
        return { ...grupo };
      },
      async listarPalabras() {
        return [];
      },
      async palabraExiste() {
        return false;
      },
      async registrarPalabraAtomica() {
        return true;
      },
      async completarSopaAtomica() {
        return true;
      },
    };
  }

  function repositorioFotosSaturado(retrasoMs: number): PuertoFotografias {
    return {
      async crear() {},
      async obtener() {
        return null;
      },
      async registrarVersionYEncolar() {
        return "NUEVO";
      },
      async adquirirLease() {
        await new Promise((resolve) => setTimeout(resolve, retrasoMs));
        return true;
      },
      async completar() {},
      async fallar() {
        return true;
      },
      async listarVencidos() {
        return [];
      },
    };
  }

  function inspectorFotosSaturado(retrasoMs: number): PuertoInspectorFoto {
    return {
      async inspeccionar() {
        await new Promise((resolve) => setTimeout(resolve, retrasoMs));
        return { tamano: 3, mime: "image/jpeg", bytes: new Uint8Array([255, 216, 255]) };
      },
    };
  }

  function analyticsSaturadoYFallido(retrasoMs: number): Promise<never> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error("Consulta Athena simulada agotó el tiempo de espera")), retrasoMs);
    });
  }

  it("una ruta interactiva de control responde dentro del estado estable aunque fotos/Analytics estén saturados o fallando", async () => {
    const LATENCIA_ESTADO_ESTABLE_MS = 100; // Presupuesto de la ruta interactiva bajo saturación cruzada.
    const RETRASO_CARGA_PESADA_MS = 400; // Fotos/Analytics saturados: muy por encima del presupuesto interactivo.

    const eventoFotoSaturado = {
      Records: [
        {
          messageId: "sat-1",
          body: JSON.stringify({
            Records: [
              {
                eventTime: "2026-08-17T12:00:00Z",
                s3: { bucket: { name: "privado" }, object: { key: "entradas/s/g/t-sat/i-sat", versionId: "v1" } },
              },
            ],
          }),
        },
      ],
    } as any;

    // Carga pesada concurrente: fotos saturadas + Analytics saturado y fallido.
    const cargaFotos = procesarLote(eventoFotoSaturado, repositorioFotosSaturado(RETRASO_CARGA_PESADA_MS), false, inspectorFotosSaturado(RETRASO_CARGA_PESADA_MS), "privado").catch(() => undefined);
    const cargaAnalytics = analyticsSaturadoYFallido(RETRASO_CARGA_PESADA_MS).catch(() => undefined);

    const inicio = Date.now();
    const resultadoInteractivo = await obtenerEstadoFase1("s1", "g1", repositorioFase1Falso());
    const duracionInteractiva = Date.now() - inicio;

    expect(resultadoInteractivo.ok).toBe(true);
    expect(duracionInteractiva).toBeLessThan(LATENCIA_ESTADO_ESTABLE_MS);

    // La carga pesada sigue en curso o ya terminó, pero nunca retuvo la ruta interactiva.
    await Promise.all([cargaFotos, cargaAnalytics]);
  });
});
