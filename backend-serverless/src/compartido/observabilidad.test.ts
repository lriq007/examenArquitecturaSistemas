import { describe, expect, it, vi } from "vitest";

import { crearRegistrador, emitirMetricaEMF, redactar } from "./observabilidad.js";

describe("observabilidad — redacción de secretos", () => {
  it("redacta claves sensibles en cualquier profundidad, sin importar mayúsculas/minúsculas", () => {
    const redactado = redactar({
      token: "eyJabc123",
      Authorization: "Bearer eyJabc123",
      anidado: { secret: "shh", clave_token: "x", detalle: { contrasena: "1234" } },
      lista: [{ apiKey: "abc" }, { credencial: "def" }],
      inofensivo: "visible",
    }) as Record<string, unknown>;

    expect(redactado.token).toBe("[REDACTADO]");
    expect(redactado.Authorization).toBe("[REDACTADO]");
    expect((redactado.anidado as any).secret).toBe("[REDACTADO]");
    expect((redactado.anidado as any).clave_token).toBe("[REDACTADO]");
    expect((redactado.anidado as any).detalle.contrasena).toBe("[REDACTADO]");
    expect((redactado.lista as any[])[0].apiKey).toBe("[REDACTADO]");
    expect((redactado.lista as any[])[1].credencial).toBe("[REDACTADO]");
    expect(redactado.inofensivo).toBe("visible");
  });
});

describe("observabilidad — crearRegistrador", () => {
  it("emite JSON correlacionable y redacta secretos automáticamente", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const log = crearRegistrador({ correlationId: "req-123", sesionId: "s1" });
    log.info("evento_prueba", { grupoId: "g1", token: "no-deberia-verse" });

    expect(spy).toHaveBeenCalledOnce();
    const registro = JSON.parse(spy.mock.calls[0]![0] as string);

    expect(registro.correlationId).toBe("req-123");
    expect(registro.sesionId).toBe("s1");
    expect(registro.grupoId).toBe("g1");
    expect(registro.evento).toBe("evento_prueba");
    expect(registro.token).toBe("[REDACTADO]");

    spy.mockRestore();
  });

  it("genera un correlationId propio cuando no se entrega uno", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const log = crearRegistrador();
    log.warn("evento_sin_id", {});

    const registro = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(typeof registro.correlationId).toBe("string");
    expect(registro.correlationId.length).toBeGreaterThan(0);

    spy.mockRestore();
  });

  it("hijo() conserva el correlationId del padre salvo que se sobrescriba explícitamente", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const padre = crearRegistrador({ correlationId: "raiz" });
    const hijo = padre.hijo({ trabajoId: "t1" });
    hijo.error("evento_hijo", {});

    const registro = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(registro.correlationId).toBe("raiz");
    expect(registro.trabajoId).toBe("t1");

    spy.mockRestore();
  });
});

describe("observabilidad — emitirMetricaEMF", () => {
  it("emite un documento EMF válido por console.log, sin permisos IAM adicionales", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    emitirMetricaEMF("RuptorEstado", 1, { dimensiones: { estado: "ABIERTO" }, unidad: "Count" });

    expect(spy).toHaveBeenCalledOnce();
    const documento = JSON.parse(spy.mock.calls[0]![0] as string);

    expect(documento._aws.CloudWatchMetrics[0].Namespace).toBe("MisionEmprende");
    expect(documento._aws.CloudWatchMetrics[0].Metrics[0]).toEqual({ Name: "RuptorEstado", Unit: "Count" });
    expect(documento.estado).toBe("ABIERTO");
    expect(documento.RuptorEstado).toBe(1);

    spy.mockRestore();
  });

  it("redacta propiedades sensibles adjuntas a la métrica", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    emitirMetricaEMF("EventoConSecreto", 1, { propiedades: { token: "no-deberia-verse" } });

    const documento = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(documento.token).toBe("[REDACTADO]");

    spy.mockRestore();
  });
});
