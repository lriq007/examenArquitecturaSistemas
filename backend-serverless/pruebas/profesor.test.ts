import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/compartido/cognito.js", () => ({
  claveTecnicaGrupo: (codigo: string, grupoId: string) => `${codigo}-${grupoId}-aA1!`,
  crearIdentidadGrupo: vi.fn(async (_usuario: string, grupoId: string) => ({
    username: `grupo-${grupoId}`,
    sub: `sub-${grupoId}`,
  })),
  ingresarProfesorCognito: vi.fn(async () => ({ token: "access-token" })),
  completarClaveProfesor: vi.fn(async () => ({ token: "access-token-nuevo" })),
}));

import type { ItemDynamo, RepositorioProfesor, SesionResumen } from "../src/profesor/repositorio.js";
import { crearIdentidadGrupo } from "../src/compartido/cognito.js";
import {
  crearSesiones,
  ejecutarAccionSesion,
  ingresarProfesor,
  obtenerControlSesion,
} from "../src/profesor/servicio.js";

function repositorioEnMemoria() {
  const items: ItemDynamo[] = [];
  const codigosReservados: string[] = [];
  const provisionamientosFallidos: Array<{ sesionId: string; grupoId: string }> = [];
  let colisionesPendientes = 0;
  const repositorio: RepositorioProfesor = {
    async guardarProfesor() {},
    async guardarItems(nuevos) {
      for (const nuevo of nuevos) {
        const indice = items.findIndex((item) => item.PK === nuevo.PK && item.SK === nuevo.SK);
        if (indice >= 0) items[indice] = nuevo;
        else items.push(nuevo);
      }
    },
    async listarSesiones(): Promise<SesionResumen[]> { return []; },
    async obtenerSesion(sesionId) {
      return items.find((item) => item.PK === `SESION#${sesionId}` && item.SK === "METADATOS") ?? null;
    },
    async listarElementosSesion(sesionId) {
      return items.filter((item) => item.PK === `SESION#${sesionId}`);
    },
    async actualizarSesion() {},
    async guardarVinculoGrupo(vinculo) {
      const grupo = items.find((item) => item.PK === `SESION#${vinculo.sesionId}` && item.SK === `GRUPO#${vinculo.grupoId}`);
      if (grupo) Object.assign(grupo, vinculo, { estadoProvisionamiento: "LISTO" });
    },
    async marcarProvisionamientoFallido(sesionId, grupoId) {
      provisionamientosFallidos.push({ sesionId, grupoId });
      const grupo = items.find((item) => item.PK === `SESION#${sesionId}` && item.SK === `GRUPO#${grupoId}`);
      if (grupo) grupo.estadoProvisionamiento = "FALLIDO";
    },
    async reservarCodigo(codigo) {
      codigosReservados.push(codigo);
      if (colisionesPendientes > 0) {
        colisionesPendientes -= 1;
        return false;
      }
      return true;
    },
    async liberarCodigo() {},
  };
  return {
    repositorio,
    items,
    codigosReservados,
    provisionamientosFallidos,
    simularColisiones(cantidad: number) { colisionesPendientes = cantidad; },
  };
}

function entrada(alumnos = 2) {
  return {
    solicitudId: "11111111-1111-4111-a111-111111111111",
    nombre: "Prueba",
    correoProfesor: "descriptivo@udd.cl",
    facultad: "Ingeniería",
    modoCreacion: "recomendado" as const,
    alumnos: Array.from({ length: alumnos }, (_, indice) => ({
      correo: `a${indice}@udd.cl`, rut: "", nombre: `Alumno ${indice}`,
      apellidoPaterno: "", apellidoMaterno: "", carrera: "Ingeniería",
    })),
  };
}

describe("Profesor y ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(crearIdentidadGrupo).mockImplementation(async (_usuario, grupoId) => ({
      username: `grupo-${grupoId}`,
      sub: `sub-${grupoId}`,
    }));
  });

  it("usa Cognito para login normal y challenge inicial", async () => {
    await expect(ingresarProfesor({ usuario: "p@udd.cl", clave: "Temporal1!" }))
      .resolves.toMatchObject({ ok: true, token: "access-token", rol: "profesor" });
    await expect(ingresarProfesor({ usuario: "p@udd.cl", clave: "", claveNueva: "Nueva123!", sesionChallenge: "sesion" }))
      .resolves.toMatchObject({ token: "access-token-nuevo" });
  });

  it("persiste profesorSub y provisiona vínculo de cada grupo", async () => {
    const memoria = repositorioEnMemoria();
    const resultado = await crearSesiones(entrada(17), "sub-profesor-a", memoria.repositorio);
    expect(resultado.sesiones[0]!.grupos).toHaveLength(3);
    expect(memoria.items.find((item) => item.tipo === "SESION")?.profesorSub).toBe("sub-profesor-a");
    expect(memoria.items.filter((item) => item.tipo === "GRUPO").every((item) => item.estadoProvisionamiento === "LISTO")).toBe(true);
  });

  it("niega lectura y mutación cruzada y también históricos sin owner", async () => {
    const memoria = repositorioEnMemoria();
    const resultado = await crearSesiones(entrada(), "sub-owner", memoria.repositorio);
    const sesionId = resultado.sesiones[0]!.sesionId;
    await expect(obtenerControlSesion(sesionId, "sub-ajeno", memoria.repositorio)).rejects.toMatchObject({ estado: 403 });
    await expect(ejecutarAccionSesion(sesionId, "siguiente_fase", "sub-ajeno", memoria.repositorio)).rejects.toMatchObject({ estado: 403 });
    const sesion = memoria.items.find((item) => item.tipo === "SESION")!;
    delete sesion.profesorSub;
    await expect(obtenerControlSesion(sesionId, "sub-owner", memoria.repositorio)).rejects.toMatchObject({ estado: 403 });
  });

  it("regenera el código cuando la reserva detecta una colisión", async () => {
    const memoria = repositorioEnMemoria();
    memoria.simularColisiones(1);

    const resultado = await crearSesiones(entrada(), "sub-owner", memoria.repositorio);

    expect(memoria.codigosReservados).toHaveLength(2);
    expect(memoria.codigosReservados[1]).not.toBe(memoria.codigosReservados[0]);
    expect(resultado.sesiones[0]!.grupos[0]!.codigoAcceso).toBe(memoria.codigosReservados[1]);
    expect(memoria.items.find((item) => item.tipo === "GRUPO")?.codigoAcceso)
      .toBe(memoria.codigosReservados[1]);
  });

  it.each([
    [{ ...entrada(), modoCreacion: "personalizado" as const, cantidadSesiones: Number.NaN, gruposPorSesion: 1 }, "CANTIDAD_SESIONES_INVALIDA"],
    [{ ...entrada(), modoCreacion: "personalizado" as const, cantidadSesiones: 1, gruposPorSesion: 1.5 }, "GRUPOS_POR_SESION_INVALIDOS"],
  ])("rechaza cantidades no enteras o no finitas", async (entradaInvalida, codigo) => {
    const memoria = repositorioEnMemoria();
    await expect(crearSesiones(entradaInvalida, "sub-owner", memoria.repositorio))
      .rejects.toMatchObject({ estado: 400, codigo });
  });

  it("limita grupos a alumnos y nunca crea grupos vacíos", async () => {
    const memoria = repositorioEnMemoria();
    const resultado = await crearSesiones({
      ...entrada(2), modoCreacion: "personalizado", cantidadSesiones: 1, gruposPorSesion: 30,
    }, "sub-owner", memoria.repositorio);
    expect(resultado.sesiones[0]!.grupos).toHaveLength(2);
    expect(resultado.sesiones[0]!.grupos.every((grupo) => grupo.integrantes.length > 0)).toBe(true);
  });

  it("libera todas las reservas si falla la escritura de items", async () => {
    const memoria = repositorioEnMemoria();
    const liberar = vi.spyOn(memoria.repositorio, "liberarCodigo");
    vi.spyOn(memoria.repositorio, "guardarItems").mockRejectedValue(new Error("Dynamo caído"));
    await expect(crearSesiones(entrada(), "sub-owner", memoria.repositorio)).rejects.toThrow("Dynamo caído");
    expect(liberar).toHaveBeenCalledTimes(1);
  });

  it("reintenta la misma solicitud sin duplicar recursos", async () => {
    const memoria = repositorioEnMemoria();
    const primera = await crearSesiones(entrada(), "sub-owner", memoria.repositorio);
    const cantidadItems = memoria.items.length;
    const segunda = await crearSesiones(entrada(), "sub-owner", memoria.repositorio);
    expect(segunda.sesiones.map((sesion) => sesion.sesionId))
      .toEqual(primera.sesiones.map((sesion) => sesion.sesionId));
    expect(segunda.sesiones[0]!.grupos.map((grupo) => grupo.grupoId))
      .toEqual(primera.sesiones[0]!.grupos.map((grupo) => grupo.grupoId));
    expect(memoria.items).toHaveLength(cantidadItems);
  });

  it("reintenta fallos transitorios con backoff exponencial y jitter", async () => {
    const memoria = repositorioEnMemoria();
    vi.mocked(crearIdentidadGrupo)
      .mockRejectedValueOnce(new Error("transitorio 1"))
      .mockRejectedValueOnce(new Error("transitorio 2"))
      .mockRejectedValueOnce(new Error("transitorio 3"));
    const temporizador = vi.spyOn(globalThis, "setTimeout")
      .mockImplementation(((callback: (...args: unknown[]) => void) => {
        callback();
        return 0 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout);
    vi.spyOn(Math, "random").mockReturnValue(0.5);

    await crearSesiones(entrada(), "sub-owner", memoria.repositorio);

    expect(crearIdentidadGrupo).toHaveBeenCalledTimes(4);
    expect(temporizador.mock.calls.map((llamada) => llamada[1])).toEqual([75, 125, 225]);
    expect(memoria.provisionamientosFallidos).toHaveLength(0);
    expect(memoria.items.find((item) => item.tipo === "GRUPO")?.estadoProvisionamiento).toBe("LISTO");
    temporizador.mockRestore();
    vi.restoreAllMocks();
  });

  it("persiste estado FALLIDO al agotar los reintentos", async () => {
    const memoria = repositorioEnMemoria();
    vi.mocked(crearIdentidadGrupo).mockRejectedValue(new Error("terminal"));
    const temporizador = vi.spyOn(globalThis, "setTimeout")
      .mockImplementation(((callback: (...args: unknown[]) => void) => {
        callback();
        return 0 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout);
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(crearSesiones(entrada(), "sub-owner", memoria.repositorio))
      .rejects.toMatchObject({ estado: 503, codigo: "PROVISIONAMIENTO_INCOMPLETO" });

    expect(crearIdentidadGrupo).toHaveBeenCalledTimes(4);
    expect(temporizador.mock.calls.map((llamada) => llamada[1])).toEqual([50, 100, 200]);
    expect(memoria.provisionamientosFallidos).toHaveLength(1);
    expect(memoria.items.find((item) => item.tipo === "GRUPO")?.estadoProvisionamiento).toBe("FALLIDO");
    temporizador.mockRestore();
    vi.restoreAllMocks();
  });
});
