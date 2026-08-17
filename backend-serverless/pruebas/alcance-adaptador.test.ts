import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/compartido/baseDatos.js", () => ({
  baseDatos: { send },
  nombreTabla: () => "tabla",
}));

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { contextoGrupoDesdeEvento, exigirSesionProfesor } from "../src/compartido/alcance.js";

const eventoGrupo = {
  requestContext: { authorizer: { jwt: { claims: { sub: "sub-g", "cognito:groups": "GRUPO" } } } },
} as unknown as APIGatewayProxyEventV2;

describe("adaptador de alcance persistido", () => {
  beforeEach(() => send.mockReset());

  it("resuelve vínculo completo de Grupo", async () => {
    send.mockResolvedValue({ Item: { sesionId: "s1", grupoId: "g1" } });
    await expect(contextoGrupoDesdeEvento(eventoGrupo)).resolves.toEqual({ sub: "sub-g", sesionId: "s1", grupoId: "g1" });
  });

  it.each([{}, { Item: { sesionId: "s1" } }, { Item: { grupoId: "g1" } }])(
    "niega vínculo ausente o incompleto", async (respuesta) => {
      send.mockResolvedValue(respuesta);
      await expect(contextoGrupoDesdeEvento(eventoGrupo)).rejects.toMatchObject({ estado: 403, codigo: "ALCANCE_INVALIDO" });
    },
  );

  it("autoriza Analytics solo al owner y niega ajeno o histórico", async () => {
    send.mockResolvedValueOnce({ Item: { profesorSub: "sub-p" } });
    await expect(exigirSesionProfesor("sub-p", "s1")).resolves.toBeUndefined();
    send.mockResolvedValueOnce({ Item: { profesorSub: "otro" } });
    await expect(exigirSesionProfesor("sub-p", "s1")).rejects.toMatchObject({ estado: 403 });
    send.mockResolvedValueOnce({ Item: { nombre: "histórica" } });
    await expect(exigirSesionProfesor("sub-p", "s1")).rejects.toMatchObject({ estado: 403 });
  });
});
