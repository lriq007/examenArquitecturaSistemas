import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/*
 * Raíz del repositorio, resuelta relativa a la ubicación de este propio
 * módulo (no a process.cwd()) usando `__dirname`: este archivo vive en
 * `backend-serverless/pruebas/caos/`, tres niveles bajo la raíz del
 * repositorio. Así el resultado no depende de desde dónde se invoque
 * vitest (p. ej. `cd backend-serverless && npm run pruebas` vs.
 * ejecutarlo desde la raíz del monorepo). Se usa `__dirname` en vez de
 * `import.meta.url` porque `tsc --noEmit` trata este proyecto como
 * CommonJS (sin `"type": "module"` en package.json) y rechaza
 * `import.meta` fuera de salida ESM, aunque Vitest ejecute los tests
 * como ESM en tiempo de ejecución.
 */
const RAIZ_REPOSITORIO = resolve(__dirname, "..", "..", "..");

/**
 * Escribe la evidencia de un experimento de Chaos Engineering como
 * Markdown legible, con las seis secciones exigidas por AD-9 y la
 * Épica 6: estado estable, hipótesis, fallo inyectado, radio de
 * impacto, aserciones, resultado y recuperación.
 *
 * El archivo se regenera en cada ejecución de `npm run pruebas`: el
 * contenido siempre refleja la última corrida real del experimento
 * (código real contra el mecanismo de simulación ya existente), no un
 * documento redactado a mano.
 */
export interface EvidenciaCaos {
  titulo: string;
  estadoEstable: string;
  hipotesis: string;
  falloInyectado: string;
  radioImpacto: string;
  aserciones: string[];
  resultado: string;
  recuperacion: string;
}

export function escribirEvidenciaCaos(rutaRelativaDesdeRaizProyecto: string, evidencia: EvidenciaCaos): string {
  const ruta = resolve(RAIZ_REPOSITORIO, rutaRelativaDesdeRaizProyecto);

  mkdirSync(dirname(ruta), { recursive: true });

  const contenido = [
    `# ${evidencia.titulo}`,
    "",
    "_Generado automáticamente por `npm run pruebas` (Vitest, `backend-serverless/pruebas/caos/`). No editar a mano: refleja la última ejecución real del experimento contra el mecanismo de simulación de producción._",
    "",
    `- Estado estable: ${evidencia.estadoEstable}`,
    `- Hipótesis: ${evidencia.hipotesis}`,
    `- Fallo inyectado: ${evidencia.falloInyectado}`,
    `- Radio de impacto: ${evidencia.radioImpacto}`,
    "- Aserciones ejecutadas:",
    ...evidencia.aserciones.map((aserto) => `  - ${aserto}`),
    `- Resultado: ${evidencia.resultado}`,
    `- Recuperación: ${evidencia.recuperacion}`,
    "",
    `Última ejecución: ${new Date().toISOString()}`,
    "",
  ].join("\n");

  writeFileSync(ruta, contenido, "utf8");

  return ruta;
}
