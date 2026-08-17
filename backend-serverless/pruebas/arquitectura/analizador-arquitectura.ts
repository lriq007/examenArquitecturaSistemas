import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export interface ViolacionArquitectonica {
  regla: string;
  archivo: string;
  linea?: number;
  detalle: string;
}

export interface ImportEncontrado {
  especificador: string;
  linea: number;
  declaracionCompleta: string;
}

/**
 * Extrae todos los imports estáticos y dinámicos (import / export from) de un contenido TypeScript.
 */
export function extraerImports(contenido: string): ImportEncontrado[] {
  const lineas = contenido.split("\n");
  const imports: ImportEncontrado[] = [];

  const patronImport = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
  const patronImportDinamico = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  lineas.forEach((linea, index) => {
    // Ignorar líneas de comentario completas
    const lineaLimpia = linea.trim();
    if (lineaLimpia.startsWith("//") || lineaLimpia.startsWith("/*") || lineaLimpia.startsWith("*")) {
      return;
    }

    let match: RegExpExecArray | null;
    const patronEstatico = new RegExp(patronImport.source, "g");
    while ((match = patronEstatico.exec(linea)) !== null) {
      const especificador = match[1];
      if (especificador) {
        imports.push({
          especificador,
          linea: index + 1,
          declaracionCompleta: linea.trim(),
        });
      }
    }

    const patronDinamico = new RegExp(patronImportDinamico.source, "g");
    while ((match = patronDinamico.exec(linea)) !== null) {
      const especificador = match[1];
      if (especificador) {
        imports.push({
          especificador,
          linea: index + 1,
          declaracionCompleta: linea.trim(),
        });
      }
    }
  });

  return imports;
}

/**
 * Obtiene recursivamente todos los archivos `.ts` de un directorio excluyendo `.test.ts`.
 */
export function obtenerArchivosTypeScript(dir: string, excluirTests = true): string[] {
  const archivos: string[] = [];

  function explorar(directorioActual: string) {
    const entradas = readdirSync(directorioActual);
    for (const entrada of entradas) {
      const rutaCompleta = join(directorioActual, entrada);
      const stats = statSync(rutaCompleta);

      if (stats.isDirectory()) {
        explorar(rutaCompleta);
      } else if (stats.isFile() && entrada.endsWith(".ts")) {
        if (excluirTests && entrada.endsWith(".test.ts")) {
          continue;
        }
        archivos.push(rutaCompleta);
      }
    }
  }

  explorar(dir);
  return archivos;
}

/**
 * Analiza un conjunto de archivos contra las reglas de arquitectura hexagonal del proyecto.
 */
export function analizarReglasHexagonales(
  archivosOContenidos: { ruta: string; contenido?: string }[],
  directorioBase: string = resolve("src")
): ViolacionArquitectonica[] {
  const violaciones: ViolacionArquitectonica[] = [];

  for (const item of archivosOContenidos) {
    const rutaRelativa = relative(directorioBase, item.ruta).replace(/\\/g, "/");
    const contenido = item.contenido ?? readFileSync(item.ruta, "utf8");
    const imports = extraerImports(contenido);
    const segmentos = rutaRelativa.split("/");
    const capacidad = segmentos[0];
    const nombreArchivo = segmentos[segmentos.length - 1];

    for (const imp of imports) {
      const spec = imp.especificador;

      // 1. Regla: Exigir .js en imports relativos (o .json)
      if (spec.startsWith("./") || spec.startsWith("../")) {
        const tieneExtensionValida = spec.endsWith(".js") || spec.endsWith(".json");
        if (!tieneExtensionValida) {
          violaciones.push({
            regla: "NFR26_IMPORTS_RELATIVOS_JS",
            archivo: rutaRelativa,
            linea: imp.linea,
            detalle: `El import relativo "${spec}" no termina en .js conforme a las convenciones TypeScript/NodeNext.`,
          });
        }
      }

      // 2. Regla: Aislamiento de servicio respecto de AWS SDK y Base de Datos directa
      if (nombreArchivo === "servicio.ts") {
        if (spec.startsWith("@aws-sdk/") || spec.includes("baseDatos")) {
          violaciones.push({
            regla: "AR1_SERVICIO_SIN_AWS_SDK",
            archivo: rutaRelativa,
            linea: imp.linea,
            detalle: `El servicio de dominio no debe importar directamente "${spec}". Debe usar puertos y repositorios inyectados.`,
          });
        }

        // Regla: No dependencia inversa servicio -> api
        if (spec.includes("api.js") || spec.includes("api.ts") || spec.includes("./api")) {
          violaciones.push({
            regla: "AR1_SIN_DEPENDENCIA_INVERSA_SERVICIO_API",
            archivo: rutaRelativa,
            linea: imp.linea,
            detalle: `El servicio no debe depender del adaptador de entrada api ("${spec}").`,
          });
        }
      }

      // 3. Regla: Aislamiento de adaptador api respecto de Base de Datos y Repositorio directo
      if (nombreArchivo === "api.ts") {
        if (spec.includes("baseDatos")) {
          violaciones.push({
            regla: "AR1_API_SIN_BASE_DATOS_DIRECTA",
            archivo: rutaRelativa,
            linea: imp.linea,
            detalle: `El adaptador HTTP api no debe interactuar directamente con la base de datos ("${spec}").`,
          });
        }
      }

      // 4. Regla: Repositorio no debe importar servicio ni api
      if (nombreArchivo === "repositorio.ts") {
        if (spec.includes("servicio.js") || spec.includes("servicio.ts") || spec.includes("./servicio")) {
          violaciones.push({
            regla: "AR1_REPOSITORIO_SIN_SERVICIO",
            archivo: rutaRelativa,
            linea: imp.linea,
            detalle: `El repositorio de salida no debe depender de la capa de servicio ("${spec}").`,
          });
        }
        if (spec.includes("api.js") || spec.includes("api.ts") || spec.includes("./api")) {
          violaciones.push({
            regla: "AR1_REPOSITORIO_SIN_API",
            archivo: rutaRelativa,
            linea: imp.linea,
            detalle: `El repositorio de salida no debe depender del adaptador api ("${spec}").`,
          });
        }
      }

      // 5. Regla: Prohibición de importar repositorios de otras capacidades
      if (spec.includes("/repositorio.js") || spec.includes("/repositorio.ts") || spec.includes("/repositorio")) {
        // Verificar si importa un repositorio fuera de su propia capacidad
        const esImportMismaCapacidad = spec.startsWith("./repositorio") || spec === "./repositorio.js";
        if (!esImportMismaCapacidad) {
          violaciones.push({
            regla: "NFR26_REPOSITORIOS_NO_COMPARTIDOS",
            archivo: rutaRelativa,
            linea: imp.linea,
            detalle: `La capacidad "${capacidad}" importa directamente el repositorio ajeno "${spec}". Debe comunicarse mediante puertos neutrales.`,
          });
        }
      }
    }
  }

  return violaciones;
}
