import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQSEvent } from "aws-lambda";
import { procesarLote } from "./consumidor.js";

function mensaje(id: string, versionId = "v1") {
  return { messageId: id, body: JSON.stringify({ Records: [{ eventID: id, eventTime: "2026-08-16T12:00:00Z", s3: { bucket: { name: "privado" }, object: { key: `entradas/s/g/t-${id}/i-${id}`, versionId } } }] }) };
}

function evento(...mensajes: ReturnType<typeof mensaje>[]): SQSEvent { return { Records: mensajes as SQSEvent["Records"] }; }

function repo(): any {
  return {
    crear: vi.fn(), obtener: vi.fn(async (id: string) => ({ trabajoId: id, intentoId: id.replace("t-", "i-"), tamano: 3, mime: "image/jpeg" })), listarVencidos: vi.fn(), fallar: vi.fn().mockResolvedValue(true),
    registrarVersionYEncolar: vi.fn().mockResolvedValue("NUEVO"),
    adquirirLease: vi.fn().mockResolvedValue(true), completar: vi.fn().mockResolvedValue(undefined),
  };
}
const jpeg = { inspeccionar: vi.fn().mockResolvedValue({ tamano: 3, mime: "image/jpeg", bytes: new Uint8Array([255, 216, 255]) }) };

describe("consumidor fotográfico", () => {
  it("reporta solo el registro fallido y aísla los demás mensajes", async () => {
    const memoria = repo(); memoria.registrarVersionYEncolar.mockResolvedValueOnce("VERSION_CONFLICTIVA").mockResolvedValueOnce("NUEVO");
    const salida = await procesarLote(evento(mensaje("malo", "v2"), mensaje("bueno")), memoria, false, jpeg, "privado");
    expect(salida.batchItemFailures).toEqual([{ itemIdentifier: "malo" }]); expect(memoria.completar).toHaveBeenCalledTimes(1);
  });

  it("la inyección controlada apagada permite completar y encendida provoca reintento", async () => {
    const normal = repo(); expect((await procesarLote(evento(mensaje("ok")), normal, false, jpeg, "privado")).batchItemFailures).toEqual([]); expect(normal.completar).toHaveBeenCalledOnce();
    const caos = repo(); expect((await procesarLote(evento(mensaje("caos")), caos, true, jpeg, "privado", "t-caos")).batchItemFailures).toEqual([{ itemIdentifier: "caos" }]); expect(caos.completar).not.toHaveBeenCalled();
  });

  it("CAOS_FOTOS sin trabajoId fijado no afecta ningún mensaje (nunca a toda la cola)", async () => {
    const r = repo();
    expect((await procesarLote(evento(mensaje("a"), mensaje("b")), r, true, jpeg, "privado", "")).batchItemFailures).toEqual([]);
    expect(r.completar).toHaveBeenCalledTimes(2);
  });

  it("CAOS_FOTOS acotado a un trabajoId no afecta otros trabajos en la misma cola", async () => {
    const r = repo();
    const salida = await procesarLote(evento(mensaje("afectado"), mensaje("libre")), r, true, jpeg, "privado", "t-afectado");
    expect(salida.batchItemFailures).toEqual([{ itemIdentifier: "afectado" }]);
    expect(r.completar).toHaveBeenCalledTimes(1);
  });

  it("rechaza bucket ajeno antes de persistir", async () => { const r = repo(); expect((await procesarLote(evento(mensaje("x")), r, false, jpeg, "esperado")).batchItemFailures).toEqual([{ itemIdentifier: "x" }]); expect(r.registrarVersionYEncolar).not.toHaveBeenCalled(); });

  it.each([
    [{ tamano: 4, mime: "image/jpeg", bytes: new Uint8Array([255,216,255]) }],
    [{ tamano: 3, mime: "image/gif", bytes: new Uint8Array([255,216,255]) }],
    [{ tamano: 3, mime: "image/jpeg", bytes: new Uint8Array([1,2,3]) }],
  ])("rechaza tamaño, tipo o magic bytes inválidos", async (objeto) => { const r = repo(); const lector = { inspeccionar: vi.fn().mockResolvedValue(objeto) }; expect((await procesarLote(evento(mensaje("x")), r, false, lector, "privado")).batchItemFailures).toEqual([{ itemIdentifier: "x" }]); expect(r.completar).not.toHaveBeenCalled(); });

  it("acepta PNG válido y consume el contrato versionado", async () => { const r = repo(); r.obtener.mockResolvedValue({ trabajoId: "t-png", intentoId: "i-png", tamano: 8, mime: "image/png" }); const lector = { inspeccionar: vi.fn().mockResolvedValue({ tamano: 8, mime: "image/png", bytes: new Uint8Array([137,80,78,71,13,10,26,10]) }) }; expect((await procesarLote(evento(mensaje("png")), r, false, lector, "privado")).batchItemFailures).toEqual([]); expect(r.completar).toHaveBeenCalledOnce(); });

  it("un duplicado con lease no adquirido no repite efecto", async () => { const r = repo(); r.registrarVersionYEncolar.mockResolvedValue("DUPLICADO"); r.adquirirLease.mockResolvedValue(false); await procesarLote(evento(mensaje("dup")), r, false, jpeg, "privado"); expect(r.completar).not.toHaveBeenCalled(); });
});

/*
 * `manejador()` es lo que Lambda invoca realmente en producción: lee
 * CAOS_FOTOS/CAOS_FOTOS_TRABAJO_ID/BUCKET_MULTIMEDIA de process.env y
 * los pasa posicionalmente a `procesarLote`. Los tests de arriba solo
 * llaman `procesarLote` con argumentos explícitos, así que nunca
 * ejercitan ese cableado: un swap de los dos últimos argumentos
 * (CAOS_TRABAJO_ID/BUCKET_MULTIMEDIA) compilaría igual y no lo
 * detectarían. Estas pruebas importan el módulo dinámicamente después
 * de fijar las variables de entorno (los `const` de nivel de módulo se
 * evalúan una sola vez) y mockean `./repositorio.js` para no requerir AWS real.
 */
describe("consumidor fotográfico — manejador() real (lee process.env)", () => {
  const obtener = vi.fn(async (id: string) => ({ trabajoId: id, intentoId: id.replace("t-", "i-"), tamano: 3, mime: "image/jpeg" }));
  const registrarVersionYEncolar = vi.fn().mockResolvedValue("NUEVO");
  const adquirirLease = vi.fn().mockResolvedValue(true);
  const completar = vi.fn().mockResolvedValue(undefined);
  const inspeccionar = vi.fn().mockResolvedValue({ tamano: 3, mime: "image/jpeg", bytes: new Uint8Array([255, 216, 255]) });

  beforeEach(() => {
    vi.resetModules();
    obtener.mockClear();
    registrarVersionYEncolar.mockClear().mockResolvedValue("NUEVO");
    adquirirLease.mockClear().mockResolvedValue(true);
    completar.mockClear();
    inspeccionar.mockClear().mockResolvedValue({ tamano: 3, mime: "image/jpeg", bytes: new Uint8Array([255, 216, 255]) });

    vi.doMock("./repositorio.js", () => ({
      RepositorioFotografiasDynamo: class {
        crear = vi.fn();
        obtener = obtener;
        registrarVersionYEncolar = registrarVersionYEncolar;
        adquirirLease = adquirirLease;
        completar = completar;
        fallar = vi.fn().mockResolvedValue(true);
        listarVencidos = vi.fn().mockResolvedValue([]);
      },
      InspectorS3: class {
        inspeccionar = inspeccionar;
      },
    }));
  });

  afterEach(() => {
    vi.doUnmock("./repositorio.js");
    delete process.env.CAOS_FOTOS;
    delete process.env.CAOS_FOTOS_TRABAJO_ID;
    delete process.env.BUCKET_MULTIMEDIA;
  });

  it("con CAOS_FOTOS=true y CAOS_FOTOS_TRABAJO_ID fijado, manejador() acota el fallo a ese trabajo", async () => {
    process.env.CAOS_FOTOS = "true";
    process.env.CAOS_FOTOS_TRABAJO_ID = "t-afectado";
    process.env.BUCKET_MULTIMEDIA = "privado";

    const { manejador } = await import("./consumidor.js");
    const salida = await manejador(evento(mensaje("afectado"), mensaje("libre")));

    expect(salida.batchItemFailures).toEqual([{ itemIdentifier: "afectado" }]);
    expect(completar).toHaveBeenCalledTimes(1);
  });

  it("con CAOS_FOTOS=true sin CAOS_FOTOS_TRABAJO_ID, manejador() no afecta ningún mensaje", async () => {
    process.env.CAOS_FOTOS = "true";
    process.env.BUCKET_MULTIMEDIA = "privado";

    const { manejador } = await import("./consumidor.js");
    const salida = await manejador(evento(mensaje("a"), mensaje("b")));

    expect(salida.batchItemFailures).toEqual([]);
    expect(completar).toHaveBeenCalledTimes(2);
  });

  it("con CAOS_FOTOS=false, manejador() procesa con normalidad aunque CAOS_FOTOS_TRABAJO_ID esté fijado", async () => {
    process.env.CAOS_FOTOS = "false";
    process.env.CAOS_FOTOS_TRABAJO_ID = "t-ok";
    process.env.BUCKET_MULTIMEDIA = "privado";

    const { manejador } = await import("./consumidor.js");
    const salida = await manejador(evento(mensaje("ok")));

    expect(salida.batchItemFailures).toEqual([]);
    expect(completar).toHaveBeenCalledOnce();
  });
});
