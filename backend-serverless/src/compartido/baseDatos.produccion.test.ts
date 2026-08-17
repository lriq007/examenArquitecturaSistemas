import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A diferencia de `baseDatos.test.ts` (que solo prueba la fábrica pura
 * `crearRuptorDynamo` con clientes falsos propios), este archivo ejercita
 * el wiring de producción real: `baseDatos` (el Proxy exportado) y
 * `enviarConFailover`/`ruptorProduccion` tal como los usa cualquier
 * repositorio en producción.
 *
 * Un swap accidental de `clientePrincipal`/`clienteRespaldo` al construir
 * `ruptorProduccion` (o de qué cliente recibe `envolverConSimulacion`) no
 * lo detectaría ningún otro test: aquí se mockea el límite del SDK de AWS
 * (`DynamoDBClient`/`DynamoDBDocumentClient.from`) para que cada cliente
 * construido quede etiquetado por la región con la que se construyó de
 * verdad, y así comprobar empíricamente qué región actúa como primaria.
 */

const mocks = vi.hoisted(() => {
  const sendsPorRegion = new Map<string, any>();
  return { sendsPorRegion };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClienteFalso {
    region: string;
    constructor(config: { region: string }) {
      this.region = config.region;
    }
  }

  return { DynamoDBClient: DynamoDBClienteFalso };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  return {
    DynamoDBDocumentClient: {
      from(clienteBase: { region: string }) {
        if (!mocks.sendsPorRegion.has(clienteBase.region)) {
          mocks.sendsPorRegion.set(
            clienteBase.region,
            vi.fn(async () => ({ Item: { PK: `respuesta-desde-${clienteBase.region}` } })),
          );
        }

        return {
          region: clienteBase.region,
          send: mocks.sendsPorRegion.get(clienteBase.region)!,
        };
      },
    },
  };
});

class ComandoFalso {
  constructor(public input: Record<string, unknown> = {}) {}
}

const REGION_PRINCIPAL = "region-principal-prueba";
const REGION_RESPALDO = "region-respaldo-prueba";

async function importarBaseDatosFresco() {
  vi.resetModules();
  mocks.sendsPorRegion.clear();

  process.env.DYNAMODB_ENDPOINT = ""; // Sin endpoint local: fuerza a construir ruptorProduccion.
  process.env.DYNAMODB_REGION_PRINCIPAL = REGION_PRINCIPAL;
  process.env.DYNAMODB_REGION_RESPALDO = REGION_RESPALDO;
  process.env.UMBRAL_FALLOS_BREAKER = "1"; // Un solo fallo elegible ya abre el breaker en esta prueba.

  return import("./baseDatos.js");
}

describe("baseDatos — wiring de producción real (Proxy + ruptorProduccion)", () => {
  beforeEach(() => {
    delete process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL;
  });

  afterEach(() => {
    delete process.env.DYNAMODB_ENDPOINT;
    delete process.env.DYNAMODB_REGION_PRINCIPAL;
    delete process.env.DYNAMODB_REGION_RESPALDO;
    delete process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL;
    delete process.env.UMBRAL_FALLOS_BREAKER;
  });

  it("en estado estable, baseDatos.send() usa el cliente construido con la región principal configurada", async () => {
    const { baseDatos, estadoRuptorProduccion } = await importarBaseDatosFresco();

    expect(estadoRuptorProduccion()).toBe("CERRADO");

    const resultado = await (baseDatos.send as unknown as (c: unknown) => Promise<any>)(new ComandoFalso({ paso: "estable" }));

    expect(resultado).toEqual({ Item: { PK: `respuesta-desde-${REGION_PRINCIPAL}` } });
    // Ambos clientes se construyen al importar el módulo (wiring), pero solo
    // el de la región principal debe recibir tráfico en estado estable.
    expect(mocks.sendsPorRegion.get(REGION_PRINCIPAL)).toHaveBeenCalledTimes(1);
    expect(mocks.sendsPorRegion.get(REGION_RESPALDO)).toHaveBeenCalledTimes(0);
  });

  it("SIMULAR_FALLO_DYNAMODB_PRINCIPAL=true inyecta el fallo en el cliente de la región principal y continúa por el de la región de respaldo", async () => {
    process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL = "true";

    const { baseDatos } = await importarBaseDatosFresco();

    const resultado = await (baseDatos.send as unknown as (c: unknown) => Promise<any>)(new ComandoFalso({ paso: "fallo-simulado" }));

    expect(resultado).toEqual({ Item: { PK: `respuesta-desde-${REGION_RESPALDO}` } });
    // El cliente construido para la región principal nunca llega a invocarse: el fallo se inyecta antes (envolverConSimulacion).
    expect(mocks.sendsPorRegion.get(REGION_PRINCIPAL)).toHaveBeenCalledTimes(0);
    expect(mocks.sendsPorRegion.get(REGION_RESPALDO)).toHaveBeenCalledTimes(1);
  });

  it("estadoRuptorProduccion() refleja LOCAL cuando hay DYNAMODB_ENDPOINT y el estado real del breaker en caso contrario", async () => {
    vi.resetModules();
    mocks.sendsPorRegion.clear();
    process.env.DYNAMODB_ENDPOINT = "http://localhost:8000";
    process.env.DYNAMODB_REGION_PRINCIPAL = REGION_PRINCIPAL;
    process.env.DYNAMODB_REGION_RESPALDO = REGION_RESPALDO;

    const { estadoRuptorProduccion } = await import("./baseDatos.js");

    expect(estadoRuptorProduccion()).toBe("LOCAL");
  });
});
