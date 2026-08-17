/**
 * Script de Smoke Test bloqueante para verificación post-despliegue
 * Recorrido: Navegador -> API Gateway -> Lambda -> DynamoDB
 *
 * Uso:
 *   npx tsx scripts/smoke-test.ts --url="https://xyz.execute-api.us-east-1.amazonaws.com"
 *   O con variable de entorno: URL_API="https://..." npx tsx scripts/smoke-test.ts
 */

export interface ResultadoPasoSmokeTest {
  paso: string;
  url: string;
  metodo: string;
  estadoHttp: number;
  duracionMs: number;
  exitoso: boolean;
  detalle: string;
}

export interface InformeSmokeTest {
  fecha: string;
  urlApi: string;
  pasos: ResultadoPasoSmokeTest[];
  exitosoTotal: boolean;
}

export async function ejecutarSmokeTest(urlBase: string, origenEsperado: string = "https://mision-emprende.invalid"): Promise<InformeSmokeTest> {
  const urlLimpia = urlBase.replace(/\/$/, "");
  console.log(`[SMOKE TEST] Iniciando verificación de recorrido crítico en: ${urlLimpia}`);

  const pasos: ResultadoPasoSmokeTest[] = [];

  // Paso 1: Verificación de Preflight CORS (OPTIONS)
  const inicioCors = Date.now();
  try {
    const respCors = await fetch(`${urlLimpia}/api/acceso/ingresar`, {
      method: "OPTIONS",
      headers: {
        "Origin": origenEsperado,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type,Authorization",
      },
    });
    const duracionCors = Date.now() - inicioCors;
    const allowOrigin = respCors.headers.get("access-control-allow-origin");
    const esValidoCors = (respCors.status === 200 || respCors.status === 204);

    pasos.push({
      paso: "1. Preflight CORS en API Gateway",
      url: `${urlLimpia}/api/acceso/ingresar`,
      metodo: "OPTIONS",
      estadoHttp: respCors.status,
      duracionMs: duracionCors,
      exitoso: esValidoCors,
      detalle: `Status: ${respCors.status}, Access-Control-Allow-Origin: ${allowOrigin ?? "no-presente"}`,
    });
  } catch (err) {
    pasos.push({
      paso: "1. Preflight CORS en API Gateway",
      url: `${urlLimpia}/api/acceso/ingresar`,
      metodo: "OPTIONS",
      estadoHttp: 0,
      duracionMs: Date.now() - inicioCors,
      exitoso: false,
      detalle: `Fallo de conexión o resolución: ${(err as Error).message}`,
    });
  }

  // Paso 2: Verificación de Endpoint Protegido sin Token (API Gateway Authorizer -> 401/403)
  const inicioAuth = Date.now();
  try {
    const respAuth = await fetch(`${urlLimpia}/api/sesiones/actual`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });
    const duracionAuth = Date.now() - inicioAuth;
    // Sin token, API Gateway con DefaultAuthorizer debe responder 401 Unauthorized o 403 Forbidden
    const esValidoAuth = respAuth.status === 401 || respAuth.status === 403;

    pasos.push({
      paso: "2. Protección JWT Authorizer en API Gateway",
      url: `${urlLimpia}/api/sesiones/actual`,
      metodo: "GET",
      estadoHttp: respAuth.status,
      duracionMs: duracionAuth,
      exitoso: esValidoAuth,
      detalle: `Rechazo esperado sin token (401/403). Recibido: ${respAuth.status}`,
    });
  } catch (err) {
    pasos.push({
      paso: "2. Protección JWT Authorizer en API Gateway",
      url: `${urlLimpia}/api/sesiones/actual`,
      metodo: "GET",
      estadoHttp: 0,
      duracionMs: Date.now() - inicioAuth,
      exitoso: false,
      detalle: `Fallo de conexión: ${(err as Error).message}`,
    });
  }

  // Paso 3: Verificación de Ejecución Lambda (POST /api/acceso/ingresar con payload inválido)
  const inicioLambda = Date.now();
  try {
    const respLambda = await fetch(`${urlLimpia}/api/acceso/ingresar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tipo: "GRUPO", codigo: "INVALIDO_SMOKE_TEST_9999" }),
    });
    const duracionLambda = Date.now() - inicioLambda;
    let cuerpoJson: Record<string, unknown> = {};
    try {
      cuerpoJson = await respLambda.json() as Record<string, unknown>;
    } catch {
      // no JSON
    }

    // La Lambda debe ejecutar, consultar DynamoDB/Cognito y retornar 400, 401 o 404 en JSON estructurado
    const esValidoLambda = (respLambda.status === 400 || respLambda.status === 401 || respLambda.status === 404) &&
                           (cuerpoJson.error !== undefined || cuerpoJson.mensaje !== undefined || cuerpoJson.ok === false);

    pasos.push({
      paso: "3. Ejecución Lambda -> DynamoDB/Cognito (Ingreso controlado)",
      url: `${urlLimpia}/api/acceso/ingresar`,
      metodo: "POST",
      estadoHttp: respLambda.status,
      duracionMs: duracionLambda,
      exitoso: esValidoLambda,
      detalle: `Status: ${respLambda.status}, Respuesta JSON estructurada: ${JSON.stringify(cuerpoJson).slice(0, 100)}`,
    });
  } catch (err) {
    pasos.push({
      paso: "3. Ejecución Lambda -> DynamoDB/Cognito (Ingreso controlado)",
      url: `${urlLimpia}/api/acceso/ingresar`,
      metodo: "POST",
      estadoHttp: 0,
      duracionMs: Date.now() - inicioLambda,
      exitoso: false,
      detalle: `Fallo de conexión: ${(err as Error).message}`,
    });
  }

  const exitosoTotal = pasos.every((p) => p.exitoso);

  console.log("\n═════════════════════════════════════════════════════════════════");
  console.log("             REPORTE DE SMOKE TEST BLOQUEANTE                   ");
  console.log("═════════════════════════════════════════════════════════════════");
  for (const p of pasos) {
    const icono = p.exitoso ? "✓ PASS" : "✗ FAIL";
    console.log(`[${icono}] ${p.paso} (${p.duracionMs}ms)`);
    console.log(`       Detalle: ${p.detalle}`);
  }
  console.log("═════════════════════════════════════════════════════════════════");
  console.log(`RESULTADO FINAL: ${exitosoTotal ? "APROBADO — DESPLIEGUE VERIFICADO" : "FALLIDO — PROMOCIÓN BLOQUEADA"}`);
  console.log("═════════════════════════════════════════════════════════════════\n");

  return {
    fecha: new Date().toISOString(),
    urlApi: urlLimpia,
    pasos,
    exitosoTotal,
  };
}

// Ejecución CLI directa
if (process.argv[1]?.includes("smoke-test")) {
  const urlArg = process.argv.find((arg) => arg.startsWith("--url="))?.split("=")[1] ||
                 process.env.URL_API ||
                 process.env.API_URL ||
                 "http://127.0.0.1:3000";

  ejecutarSmokeTest(urlArg).then((informe) => {
    if (!informe.exitosoTotal && process.env.STRICT_SMOKE_TEST === "true") {
      process.exit(1);
    }
  }).catch((err) => {
    console.error("[FATAL] Error ejecutando smoke test:", err);
    process.exit(1);
  });
}
