import { describe, expect, it, vi } from "vitest";
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
    const caos = repo(); expect((await procesarLote(evento(mensaje("caos")), caos, true, jpeg, "privado")).batchItemFailures).toEqual([{ itemIdentifier: "caos" }]); expect(caos.completar).not.toHaveBeenCalled();
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
