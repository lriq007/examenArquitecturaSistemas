/**
 * Script de demostración automatizada de regresión bloqueada y promoción corregida (Historia 7.6)
 *
 * Flujo:
 *   1. Inyecta una regresión controlada (violación arquitectónica / de tipos)
 *   2. Ejecuta los gates de CI y comprueba el BLOQUEO inequívoco
 *   3. Corrige la regresión en la misma rama
 *   4. Ejecuta los gates de CI y comprueba el DESBLOQUEO y aprobación
 *   5. Genera evidencia documentada ejecutable.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DemostracionResultado {
  fecha: string;
  regresionInyectada: string;
  bloqueoConfirmado: boolean;
  salidaBloqueo: string;
  correccionConfirmada: boolean;
  salidaCorreccion: string;
}

export function ejecutarDemostracionRegresion(): DemostracionResultado {
  console.log("═════════════════════════════════════════════════════════════════");
  console.log("   DEMOSTRACIÓN DE REGRESIÓN BLOQUEADA Y PROMOCIÓN CORREGIDA    ");
  console.log("═════════════════════════════════════════════════════════════════\n");

  const rutaArchivoTest = resolve("src/fase1/servicio.ts");
  const contenidoOriginal = readFileSync(rutaArchivoTest, "utf8");

  let bloqueoConfirmado = false;
  let salidaBloqueo = "";
  let correccionConfirmada = false;
  let salidaCorreccion = "";

  try {
    // ── FASE 1: Inyección de Regresión Deliberada ─────────────────────────────
    console.log("[FASE 1] Inyectando regresión deliberada: import relativo sin extensión .js en servicio.ts...");
    const contenidoConRegresion = `import { RepositorioFase1 } from "./repositorio";\n` + contenidoOriginal;
    writeFileSync(rutaArchivoTest, contenidoConRegresion, "utf8");

    console.log("[FASE 1] Ejecutando gates de verificación de CI...");
    try {
      execSync("npm run pruebas pruebas/arquitectura/limites-hexagonales.test.ts", {
        cwd: resolve("."),
        encoding: "utf8",
        stdio: "pipe",
      });
      console.error("[FALLO INESPERADO] Los gates NO bloquearon la regresión.");
    } catch (err: any) {
      bloqueoConfirmado = true;
      salidaBloqueo = (err.stdout || "") + (err.stderr || "");
      console.log("✓ [BLOQUEO CONFIRMADO] Los gates de CI fallaron y bloquearon el commit/PR:");
      console.log("  Detalle:", salidaBloqueo.split("\n").filter((l: string) => l.includes("FAIL") || l.includes("Error") || l.includes("violaciones") || l.includes("NFR26")).join("\n  "));
    }

    // ── FASE 2: Corrección de la Regresión ────────────────────────────────────
    console.log("\n[FASE 2] Corrigiendo regresión en la misma rama (restaurando código conforme)...");
    writeFileSync(rutaArchivoTest, contenidoOriginal, "utf8");

    console.log("[FASE 2] Re-ejecutando gates de verificación de CI...");
    try {
      const output = execSync("npm run pruebas pruebas/arquitectura/limites-hexagonales.test.ts", {
        cwd: resolve("."),
        encoding: "utf8",
        stdio: "pipe",
      });
      correccionConfirmada = true;
      salidaCorreccion = output;
      console.log("✓ [DESBLOQUEO CONFIRMADO] Los gates pasaron al 100% tras la corrección.");
    } catch (err: any) {
      console.error("[FALLO] Los gates fallaron después de corregir:", err);
    }
  } finally {
    // Restaurar siempre el archivo
    writeFileSync(rutaArchivoTest, contenidoOriginal, "utf8");
  }

  console.log("\n═════════════════════════════════════════════════════════════════");
  console.log(`DEMOSTRACIÓN FINALIZADA: ${bloqueoConfirmado && correccionConfirmada ? "EXITOSA (GOBERNANZA VALIDADA)" : "FALLIDA"}`);
  console.log("═════════════════════════════════════════════════════════════════\n");

  return {
    fecha: new Date().toISOString(),
    regresionInyectada: "Import relativo sin extensión .js (violación NFR26)",
    bloqueoConfirmado,
    salidaBloqueo,
    correccionConfirmada,
    salidaCorreccion,
  };
}

if (process.argv[1]?.includes("demostrar-regresion")) {
  const resultado = ejecutarDemostracionRegresion();
  if (!resultado.bloqueoConfirmado || !resultado.correccionConfirmada) {
    process.exit(1);
  }
}
