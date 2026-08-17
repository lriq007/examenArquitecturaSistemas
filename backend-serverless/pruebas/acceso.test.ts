import { describe, expect, it, vi } from "vitest";

vi.mock("../src/compartido/cognito.js", () => ({
  claveTecnicaGrupo: () => "tecnica-aA1!",
  tokenGrupo: vi.fn(async () => "access-token-cognito"),
}));

import { ingresarConCodigo } from "../src/acceso/servicio.js";
import type { RepositorioAcceso } from "../src/acceso/repositorio.js";

function repo(grupo: Awaited<ReturnType<RepositorioAcceso["buscarPorCodigo"]>>): RepositorioAcceso {
  return {
    async buscarPorCodigo() { return grupo; },
    async actualizarNombre() {},
  };
}

describe("fachada de ingreso de Grupo", () => {
  it("conserva el contrato y oculta Cognito", async () => {
    const resultado = await ingresarConCodigo("ABC123", "Equipo", repo({
      sesionId: "s1", grupoId: "g1", nombreGrupo: "Grupo", codigoAcceso: "ABC123",
      cognitoUsername: "interno", grupoSub: "sub-g1", estadoProvisionamiento: "LISTO",
    }));
    expect(resultado).toEqual({
      ok: true,
      token: "access-token-cognito",
      sesionId: "s1",
      grupo: { id: "g1", nombre: "Equipo" },
    });
  });

  it.each([null, {
    sesionId: "s1", grupoId: "g1", nombreGrupo: "Grupo", codigoAcceso: "ABC123",
    cognitoUsername: "", grupoSub: "", estadoProvisionamiento: "FALLIDO",
  }])("usa el mismo error neutro para código inexistente o identidad no lista", async (grupo) => {
    await expect(ingresarConCodigo("ABC123", "", repo(grupo))).rejects.toMatchObject({
      estado: 401, codigo: "INGRESO_INVALIDO", message: "Código de grupo inválido",
    });
  });
});
