import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

interface HallazgoSecreto {
  archivo: string;
  linea: number;
  tipo: string;
  fragmento: string;
}

const REGLAS_SECRETOS: { tipo: string; patron: RegExp }[] = [
  {
    tipo: "AWS_ACCESS_KEY_ID",
    patron: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    tipo: "AWS_SECRET_ACCESS_KEY_POSIBLE",
    patron: /(?:aws_secret_access_key|aws_sec_key|secret_key)\s*[:=]\s*['"][A-Za-z0-9\/+=]{20,40}['"]/i,
  },
  {
    tipo: "CLAVE_PRIVADA",
    patron: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    tipo: "JWT_SECRETO_HARCODEADO",
    patron: /(?:jwt_secret|jwtSecret|secreto_jwt)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  },
  {
    tipo: "PASSWORD_PROFE_HARCODEADO",
    patron: /\bprofe123\b/i,
  },
];

const EXTENSIONES_PERMITIDAS = new Set([
  ".ts", ".js", ".json", ".yaml", ".yml", ".tf", ".html", ".css", ".md", ".sh",
]);

const DIRECTORIOS_IGNORADOS = new Set([
  "node_modules", ".git", ".terraform", "dist", ".verificacion", ".aws-sam",
  "_bmad", "_bmad-output", "documentosProyecto", ".agents", ".claude",
]);

export function escanearArchivos(raiz: string): HallazgoSecreto[] {
  const hallazgos: HallazgoSecreto[] = [];

  function explorar(dirActual: string) {
    const entradas = readdirSync(dirActual);
    for (const entrada of entradas) {
      if (DIRECTORIOS_IGNORADOS.has(entrada)) continue;
      const rutaCompleta = join(dirActual, entrada);
      const stat = statSync(rutaCompleta);

      if (stat.isDirectory()) {
        explorar(rutaCompleta);
      } else if (stat.isFile()) {
        const tieneExtValida = Array.from(EXTENSIONES_PERMITIDAS).some((ext) => entrada.endsWith(ext));
        if (!tieneExtValida) continue;

        // Ignorar scripts de prueba o de escaneo que contengan las definiciones de los patrones
        const rutaRelativa = relative(raiz, rutaCompleta).replace(/\\/g, "/");
        if (rutaRelativa.includes("escanear-secretos.ts") || rutaRelativa.includes("arquitectura-seguridad.test.ts")) {
          continue;
        }

        const contenido = readFileSync(rutaCompleta, "utf8");
        const lineas = contenido.split("\n");

        lineas.forEach((linea, index) => {
          for (const regla of REGLAS_SECRETOS) {
            if (regla.patron.test(linea)) {
              hallazgos.push({
                archivo: rutaRelativa,
                linea: index + 1,
                tipo: regla.tipo,
                fragmento: linea.trim().slice(0, 80),
              });
            }
          }
        });
      }
    }
  }

  explorar(raiz);
  return hallazgos;
}

export function ejecutarEscaneoSecretos(raiz: string = resolve("..")): boolean {
  console.log(`[ESCANEO SECRETOS] Iniciando análisis en ${raiz}...`);
  const hallazgos = escanearArchivos(raiz);

  if (hallazgos.length > 0) {
    console.error(`[ERROR] Se detectaron ${hallazgos.length} posibles secretos o credenciales fijas:`);
    for (const h of hallazgos) {
      console.error(`  - ${h.archivo}:${h.linea} [${h.tipo}]: ${h.fragmento}`);
    }
    return false;
  }

  console.log(`[OK] Escaneo de secretos completado: 0 credenciales o secretos detectados.`);
  return true;
}

// Ejecución directa por CLI
if (process.argv[1]?.includes("escanear-secretos")) {
  const exito = ejecutarEscaneoSecretos();
  if (!exito) {
    process.exit(1);
  }
}
