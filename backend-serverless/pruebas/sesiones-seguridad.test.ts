import { describe, expect, it } from "vitest";
import { obtenerSesionActual } from "../src/sesiones/servicio.js";
import type { RepositorioSesiones } from "../src/sesiones/repositorio.js";

function repositorio(vinculado: boolean): RepositorioSesiones {
  return {
    async buscarVinculoGrupo(sub) {
      return vinculado && sub === "sub-grupo" ? { sesionId: "s1", grupoId: "g1" } : null;
    },
    async buscarSesion(id) {
      return id === "s1" ? { sesionId: id, fase: "f1", timerCorriendo: false, segundosRestantes: 0, totalGrupos: 1 } : null;
    },
    async buscarGrupo(sesionId, grupoId) {
      return sesionId === "s1" && grupoId === "g1" ? { grupoId, nombreGrupo: "Grupo", tokens: 10 } : null;
    },
  };
}

describe("alcance de Grupo", () => {
  it("resuelve la pareja exclusivamente desde el sub persistido", async () => {
    await expect(obtenerSesionActual("sub-grupo", repositorio(true))).resolves.toMatchObject({
      sesion: { sesionId: "s1" }, grupo: { grupoId: "g1" },
    });
  });

  it("niega identidad sin vínculo sin filtrar recursos", async () => {
    await expect(obtenerSesionActual("sub-ajeno", repositorio(false))).rejects.toMatchObject({
      estado: 403, codigo: "ALCANCE_INVALIDO",
    });
  });
});
