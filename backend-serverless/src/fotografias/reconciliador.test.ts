import type { ScheduledEvent, SQSEvent } from "aws-lambda";
import { describe, expect, it, vi } from "vitest";
import { reconciliar } from "./reconciliador.js";

const mensaje = (messageId: string, claves: unknown[]) => ({ messageId, body: JSON.stringify({ Records: claves.map((key) => ({ s3: { object: { key } } })) }) });
const eventoSqs = (...records: ReturnType<typeof mensaje>[]) => ({ Records: records }) as unknown as SQSEvent;

describe("reconciliador fotográfico", () => {
  it("terminaliza todos los Records S3 del mensaje DLQ", async () => {
    const repo = { fallar: vi.fn().mockResolvedValue(true), listarVencidos: vi.fn() };
    const salida = await reconciliar(eventoSqs(mensaje("m1", ["entradas/s/g/t1/i1", "entradas/s/g/t2/i2"])), repo);
    expect(salida).toEqual({ batchItemFailures: [] });
    expect(repo.fallar).toHaveBeenNthCalledWith(1, "t1", "i1", "REINTENTOS_AGOTADOS");
    expect(repo.fallar).toHaveBeenNthCalledWith(2, "t2", "i2", "REINTENTOS_AGOTADOS");
  });

  it.each([[["otro/s/g/t/i"]], [["entradas/s/g/t"]], [[null]], [[]]])("reporta mensaje malformed para reintento parcial", async (claves: unknown[]) => {
    const repo = { fallar: vi.fn(), listarVencidos: vi.fn() };
    expect(await reconciliar(eventoSqs(mensaje("malo", claves)), repo)).toEqual({ batchItemFailures: [{ itemIdentifier: "malo" }] });
  });

  it("usa cutoff de quince minutos y expira todos los vencidos", async () => {
    const repo = { fallar: vi.fn().mockResolvedValue(true), listarVencidos: vi.fn().mockResolvedValue([{ trabajoId: "t", intentoId: "i" }]) };
    await reconciliar({} as ScheduledEvent, repo, new Date("2026-08-16T12:30:00.000Z"));
    expect(repo.listarVencidos).toHaveBeenCalledWith("2026-08-16T12:15:00.000Z");
    expect(repo.fallar).toHaveBeenCalledWith("t", "i", "INTENTO_VENCIDO", "EXPIRADO");
  });
});
