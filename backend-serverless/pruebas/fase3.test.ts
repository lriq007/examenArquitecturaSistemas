import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  GrupoFase3,
  RepositorioFase3,
  SesionFase3,
} from "../src/fase3/repositorio.js";
import {
  completarLego,
  marcarListoFase3,
  responderAstronauta,
} from "../src/fase3/servicio.js";

function grupo(id: string): GrupoFase3 {
  return {
    grupoId: id,
    nombreGrupo: `Grupo ${id}`,
    tokens: 10,
    desafioNombre: "Desafío",
    desafioDescripcion: "Descripción",
    bubbleMap: {},
    listoF3Ranking: false,
    listoF3Mapa: false,
    listoF3Transicion: false,
    listoInicioF3: false,
    listoF3Salida: false,
    legoCompletado: false,
    legoConFoto: false,
    legoSinFoto: false,
    ruletaLegoIntentos: 0,
    ruletaLegoUltimo: "",
    astronautaLegoRespondida: false,
    astronautaLegoCorrecta: false,
  };
}

function memoria(fase = "f2_ranking") {
  const sesion: SesionFase3 = {
    sesionId: "s1",
    fase,
    totalGrupos: 2,
    timerCorriendo: false,
    segundosRestantes: 0,
  };

  const grupos = [
    grupo("g1"),
    grupo("g2"),
  ];

  const repositorio: RepositorioFase3 = {
    async buscarSesion() {
      return { ...sesion };
    },

    async buscarGrupo(_s, id) {
      const encontrado = grupos.find(
        (item) => item.grupoId === id,
      );

      return encontrado
        ? { ...encontrado }
        : null;
    },

    async listarGrupos() {
      return grupos.map(
        (item) => ({ ...item }),
      );
    },

    async marcarListo(_s, id, campo) {
      const encontrado = grupos.find(
        (item) => item.grupoId === id,
      );

      if (encontrado) {
        (
          encontrado as unknown as
            Record<string, unknown>
        )[campo] = true;
      }
    },

    async cambiarFase(
      _s,
      esperadas,
      nueva,
      duracion,
    ) {
      if (!esperadas.includes(sesion.fase)) {
        return false;
      }

      sesion.fase = nueva;
      sesion.segundosRestantes = duracion;
      sesion.timerCorriendo = false;
      delete sesion.timerInicio;
      delete sesion.timerFin;
      return true;
    },

    async iniciarTimerLego(_s, duracion) {
      if (sesion.timerCorriendo) {
        return false;
      }

      sesion.timerCorriendo = true;
      sesion.segundosRestantes = duracion;
      sesion.timerInicio =
        new Date().toISOString();
      sesion.timerFin =
        new Date(
          Date.now() +
            duracion * 1000,
        ).toISOString();
      return true;
    },

    async completarLego(
      _s,
      id,
      conFoto,
      sinFoto,
    ) {
      const encontrado = grupos.find(
        (item) => item.grupoId === id,
      );

      if (
        !encontrado ||
        encontrado.legoCompletado
      ) {
        return false;
      }

      encontrado.legoCompletado = true;
      encontrado.legoConFoto = conFoto;
      encontrado.legoSinFoto = sinFoto;
      return true;
    },

    async guardarResultadoRuleta() {
      return true;
    },

    async guardarRespuestaAstronauta(
      _s,
      id,
      correcta,
      tokens,
    ) {
      const encontrado = grupos.find(
        (item) => item.grupoId === id,
      );

      if (
        !encontrado ||
        encontrado.astronautaLegoRespondida
      ) {
        return false;
      }

      encontrado.astronautaLegoRespondida =
        true;
      encontrado.astronautaLegoCorrecta =
        correcta;
      encontrado.tokens = tokens;
      return true;
    },
  };

  return {
    sesion,
    grupos,
    repositorio,
  };
}

describe("Fase 3", () => {
  it(
    "pasa por mapa, transición y LEGO",
    async () => {
      const estado = memoria();

      for (const id of ["g1", "g2"]) {
        await marcarListoFase3(
          "s1",
          id,
          "ranking_f2",
          estado.repositorio,
        );
      }

      expect(estado.sesion.fase).toBe(
        "mapa_f3_creatividad",
      );

      for (const id of ["g1", "g2"]) {
        await marcarListoFase3(
          "s1",
          id,
          "mapa_creatividad",
          estado.repositorio,
        );
      }

      expect(estado.sesion.fase).toBe(
        "f3_transicion_creatividad",
      );

      for (const id of ["g1", "g2"]) {
        await marcarListoFase3(
          "s1",
          id,
          "transicion_creatividad",
          estado.repositorio,
        );
      }

      expect(estado.sesion.fase).toBe(
        "f3_lego",
      );
    },
  );

  it(
    "inicia el timer al estar todos listos",
    async () => {
      const estado = memoria("f3_lego");

      for (const id of ["g1", "g2"]) {
        await marcarListoFase3(
          "s1",
          id,
          "inicio_lego",
          estado.repositorio,
        );
      }

      expect(
        estado.sesion.timerCorriendo,
      ).toBe(true);

      expect(
        estado.sesion.segundosRestantes,
      ).toBe(15);
    },
  );

  it(
    "pasa al ranking cuando todos completan LEGO",
    async () => {
      const estado = memoria("f3_lego");

      estado.sesion.timerCorriendo = true;
      estado.sesion.timerFin =
        new Date(
          Date.now() - 1000,
        ).toISOString();

      await completarLego(
        "s1",
        "g1",
        { conFoto: true, trabajoFotoId: "foto-g1" },
        estado.repositorio,
        { verificarProcesada: async (id, sesion, grupo) => id === "foto-g1" && sesion === "s1" && grupo === "g1" },
      );

      await completarLego(
        "s1",
        "g2",
        { sinFoto: true },
        estado.repositorio,
      );

      expect(estado.sesion.fase).toBe(
        "f3_ranking",
      );
    },
  );

  it(
    "la pregunta recompensa una vez",
    async () => {
      const estado = memoria("f3_lego");

      const primera =
        await responderAstronauta(
          "s1",
          "g1",
          "B",
          estado.repositorio,
        );

      const segunda =
        await responderAstronauta(
          "s1",
          "g1",
          "B",
          estado.repositorio,
        );

      expect(primera.recompensa).toBe(2);
      expect(segunda.recompensa).toBe(0);
      expect(
        estado.grupos[0]!.tokens,
      ).toBe(12);
    },
  );

  it.each([
    ["ownership cruzado", { conFoto: true, trabajoFotoId: "foto" }, async (): Promise<boolean> => false, "FOTO_NO_PROCESADA"],
    ["trabajo no completado", { conFoto: true, trabajoFotoId: "foto" }, async (): Promise<boolean> => false, "FOTO_NO_PROCESADA"],
    ["sin foto con id", { sinFoto: true, trabajoFotoId: "foto" }, async (): Promise<boolean> => true, "TRABAJO_FOTO_INVALIDO"],
  ])("rechaza %s", async (_caso, entrada, verificarProcesada, codigo) => {
    const estado = memoria("f3_lego"); estado.sesion.timerCorriendo = false;
    await expect(completarLego("s1", "g1", entrada, estado.repositorio, { verificarProcesada })).rejects.toMatchObject({ codigo });
    expect(estado.grupos[0]!.legoCompletado).toBe(false);
  });
});
