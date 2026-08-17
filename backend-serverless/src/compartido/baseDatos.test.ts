import { describe, expect, it, vi } from "vitest";

import { crearRuptorDynamo, type ClienteEnviable } from "./baseDatos.js";

class ComandoFalso {
  constructor(public input: Record<string, unknown> = {}) {}
}

function errorTransitorio(nombre = "ResourceNotFoundException"): Error {
  const error = new Error(`fallo simulado (${nombre})`);
  error.name = nombre;
  return error;
}

function clienteFalso(): ClienteEnviable & { send: ReturnType<typeof vi.fn<(comando: any) => Promise<any>>> } {
  return { send: vi.fn() };
}

/** Reloj de prueba controlable manualmente, sin temporizadores reales. */
function relojDePrueba(inicio = 0) {
  let ahora = inicio;
  return {
    avanzar(ms: number) {
      ahora += ms;
    },
    ahora: () => ahora,
  };
}

describe("Circuit Breaker de failover DynamoDB (crearRuptorDynamo)", () => {
  it("Fallos bajo umbral: reintenta la primaria en cada llamada, sin abrir ni usar la réplica", async () => {
    const principal = clienteFalso();
    const respaldo = clienteFalso();
    principal.send.mockRejectedValue(errorTransitorio());

    const ruptor = crearRuptorDynamo({
      clientePrincipal: principal,
      clienteRespaldo: respaldo,
      umbralFallos: 3,
    });

    // Fallo 1 de 3: bajo el umbral.
    await expect(ruptor.enviar(new ComandoFalso())).rejects.toThrow(/fallo simulado/);
    expect(ruptor.estado()).toBe("CERRADO");
    expect(ruptor.contadorFallos()).toBe(1);

    // Fallo 2 de 3: sigue bajo el umbral.
    await expect(ruptor.enviar(new ComandoFalso())).rejects.toThrow(/fallo simulado/);
    expect(ruptor.estado()).toBe("CERRADO");
    expect(ruptor.contadorFallos()).toBe(2);

    // La réplica nunca se consulta mientras el breaker permanece CERRADO.
    expect(respaldo.send).not.toHaveBeenCalled();
    expect(principal.send).toHaveBeenCalledTimes(2);
  });

  it("Umbral superado: el N-ésimo fallo elegible abre el breaker y sirve desde la réplica", async () => {
    const principal = clienteFalso();
    const respaldo = clienteFalso();
    principal.send.mockRejectedValue(errorTransitorio());
    respaldo.send.mockResolvedValue({ Item: { PK: "desde-replica" } });

    const ruptor = crearRuptorDynamo({
      clientePrincipal: principal,
      clienteRespaldo: respaldo,
      umbralFallos: 3,
    });

    await expect(ruptor.enviar(new ComandoFalso())).rejects.toThrow(); // 1
    await expect(ruptor.enviar(new ComandoFalso())).rejects.toThrow(); // 2

    // 3er fallo: alcanza el umbral, abre y continúa por la réplica en esta misma llamada.
    const resultado = await ruptor.enviar(new ComandoFalso());

    expect(resultado).toEqual({ Item: { PK: "desde-replica" } });
    expect(ruptor.estado()).toBe("ABIERTO");
    expect(ruptor.contadorFallos()).toBe(3);
    expect(respaldo.send).toHaveBeenCalledTimes(1);
    expect(principal.send).toHaveBeenCalledTimes(3);
  });

  it("Cooldown vigente: rechaza la primaria de forma controlada y va directo a la réplica", async () => {
    const principal = clienteFalso();
    const respaldo = clienteFalso();
    principal.send.mockRejectedValue(errorTransitorio());
    respaldo.send.mockResolvedValue({ Item: { PK: "desde-replica" } });

    const reloj = relojDePrueba();
    const ruptor = crearRuptorDynamo({
      clientePrincipal: principal,
      clienteRespaldo: respaldo,
      umbralFallos: 1,
      duracionCooldownMs: 60_000,
      reloj: reloj.ahora,
    });

    // Un solo fallo ya abre el breaker (umbral=1).
    await ruptor.enviar(new ComandoFalso());
    expect(ruptor.estado()).toBe("ABIERTO");

    principal.send.mockClear();
    respaldo.send.mockClear();

    // Nueva operación dentro de la ventana de cooldown: rechazo controlado de la primaria.
    reloj.avanzar(1_000);
    const resultado = await ruptor.enviar(new ComandoFalso());

    expect(resultado).toEqual({ Item: { PK: "desde-replica" } });
    expect(principal.send).not.toHaveBeenCalled();
    expect(respaldo.send).toHaveBeenCalledTimes(1);
    expect(ruptor.estado()).toBe("ABIERTO");
  });

  it("Expira cooldown: transición a SEMI_ABIERTO; éxito de la primaria cierra el breaker", async () => {
    const principal = clienteFalso();
    const respaldo = clienteFalso();
    respaldo.send.mockResolvedValue({ Item: { PK: "desde-replica" } });

    const reloj = relojDePrueba();
    const ruptor = crearRuptorDynamo({
      clientePrincipal: principal,
      clienteRespaldo: respaldo,
      umbralFallos: 1,
      duracionCooldownMs: 60_000,
      reloj: reloj.ahora,
    });

    principal.send.mockRejectedValueOnce(errorTransitorio());
    await ruptor.enviar(new ComandoFalso());
    expect(ruptor.estado()).toBe("ABIERTO");

    // Expira el cooldown y la primaria ya se recuperó.
    reloj.avanzar(60_001);
    principal.send.mockResolvedValueOnce({ Item: { PK: "desde-primaria" } });

    const resultado = await ruptor.enviar(new ComandoFalso());

    expect(resultado).toEqual({ Item: { PK: "desde-primaria" } });
    expect(ruptor.estado()).toBe("CERRADO");
    expect(ruptor.contadorFallos()).toBe(0);
  });

  it("Expira cooldown: si la primaria vuelve a fallar en SEMI_ABIERTO, reabre y sirve desde la réplica", async () => {
    const principal = clienteFalso();
    const respaldo = clienteFalso();
    respaldo.send.mockResolvedValue({ Item: { PK: "desde-replica" } });
    principal.send.mockRejectedValue(errorTransitorio());

    const reloj = relojDePrueba();
    const ruptor = crearRuptorDynamo({
      clientePrincipal: principal,
      clienteRespaldo: respaldo,
      umbralFallos: 1,
      duracionCooldownMs: 60_000,
      reloj: reloj.ahora,
    });

    await ruptor.enviar(new ComandoFalso());
    expect(ruptor.estado()).toBe("ABIERTO");

    reloj.avanzar(60_001);
    const resultado = await ruptor.enviar(new ComandoFalso());

    expect(resultado).toEqual({ Item: { PK: "desde-replica" } });
    expect(ruptor.estado()).toBe("ABIERTO"); // reabierto tras el intento fallido en SEMI_ABIERTO

    // Un nuevo cooldown completo empieza a correr: sigue rechazando de forma controlada.
    reloj.avanzar(1_000);
    respaldo.send.mockClear();
    principal.send.mockClear();
    await ruptor.enviar(new ComandoFalso());
    expect(principal.send).not.toHaveBeenCalled();
    expect(respaldo.send).toHaveBeenCalledTimes(1);
  });

  it("errores no elegibles para failover se propagan sin abrir el breaker ni tocar la réplica", async () => {
    const principal = clienteFalso();
    const respaldo = clienteFalso();
    const errorValidacion = new Error("ValidationException");
    errorValidacion.name = "ValidationException";
    principal.send.mockRejectedValue(errorValidacion);

    const ruptor = crearRuptorDynamo({
      clientePrincipal: principal,
      clienteRespaldo: respaldo,
      umbralFallos: 1,
    });

    await expect(ruptor.enviar(new ComandoFalso())).rejects.toBe(errorValidacion);
    expect(ruptor.estado()).toBe("CERRADO");
    expect(ruptor.contadorFallos()).toBe(0);
    expect(respaldo.send).not.toHaveBeenCalled();
  });

  it("un éxito de la primaria en CERRADO resetea el contador de fallos consecutivos", async () => {
    const principal = clienteFalso();
    const respaldo = clienteFalso();

    const ruptor = crearRuptorDynamo({
      clientePrincipal: principal,
      clienteRespaldo: respaldo,
      umbralFallos: 3,
    });

    principal.send.mockRejectedValueOnce(errorTransitorio());
    await expect(ruptor.enviar(new ComandoFalso())).rejects.toThrow();
    expect(ruptor.contadorFallos()).toBe(1);

    principal.send.mockResolvedValueOnce({ Item: { PK: "ok" } });
    await ruptor.enviar(new ComandoFalso());
    expect(ruptor.contadorFallos()).toBe(0);
    expect(ruptor.estado()).toBe("CERRADO");
  });
});
