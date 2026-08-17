import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/compartido/baseDatos.js", () => ({ baseDatos: { send }, nombreTabla: () => "tabla" }));

import { repositorioAcceso } from "../src/acceso/repositorio.js";

describe("lectura eventual de código", () => {
  beforeEach(() => send.mockReset());

  it("reintenta dos veces el GSI antes de encontrar el Grupo", async () => {
    send.mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({ Items: [{
      sesionId: "s1", grupoId: "g1", nombreGrupo: "Grupo", codigoAcceso: "ABC123",
      cognitoUsername: "grupo-g1", grupoSub: "sub-g1", estadoProvisionamiento: "LISTO",
    }] });
    const temporizador = vi.spyOn(globalThis, "setTimeout")
      .mockImplementation(((callback: (...args: unknown[]) => void) => {
        callback(); return 0 as unknown as NodeJS.Timeout;
      }) as typeof setTimeout);
    await expect(repositorioAcceso.buscarPorCodigo("ABC123")).resolves.toMatchObject({ grupoId: "g1" });
    expect(send).toHaveBeenCalledTimes(3);
    expect(temporizador.mock.calls.map((llamada) => llamada[1])).toEqual([40, 80]);
    temporizador.mockRestore();
  });

  it("trata vínculo incompleto como inexistente", async () => {
    send.mockResolvedValue({ Items: [{ sesionId: "s1", grupoId: "g1", codigoAcceso: "ABC123" }] });
    await expect(repositorioAcceso.buscarPorCodigo("ABC123")).resolves.toBeNull();
  });
});
