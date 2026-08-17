import {
  ErrorAplicacion,
} from "../compartido/respuestas.js";
import type {
  GrupoFase3,
  RepositorioFase3,
  SesionFase3,
} from "./repositorio.js";

export type EtapaListaFase3 =
  | "ranking_f2"
  | "mapa_creatividad"
  | "transicion_creatividad"
  | "inicio_lego"
  | "ranking_f3";

export interface ResultadoRuleta {
  codigo: string;
  emoji: string;
  titulo: string;
  descripcion: string;
  tokens: number;
}

export const DURACION_LEGO_SEGUNDOS = 15;
export const MAX_INTENTOS_RULETA = 3;

export const OPCIONES_RULETA: ResultadoRuleta[] = [
  {
    codigo: "idea-brillante",
    emoji: "💡",
    titulo: "Idea brillante",
    descripcion:
      "La propuesta sorprende al equipo. Ganan 2 tokens.",
    tokens: 2,
  },
  {
    codigo: "colaboracion",
    emoji: "🤝",
    titulo: "Colaboración",
    descripcion:
      "Todos aportaron una pieza clave. Ganan 1 token.",
    tokens: 1,
  },
  {
    codigo: "explicacion-rapida",
    emoji: "🎤",
    titulo: "Explicación rápida",
    descripcion:
      "Expliquen el prototipo en 20 segundos.",
    tokens: 0,
  },
  {
    codigo: "giro-inesperado",
    emoji: "🌀",
    titulo: "Giro inesperado",
    descripcion:
      "Apareció una restricción. Pierden 1 token.",
    tokens: -1,
  },
  {
    codigo: "prototipo-audaz",
    emoji: "🚀",
    titulo: "Prototipo audaz",
    descripcion:
      "La solución tomó un riesgo creativo. Ganan 3 tokens.",
    tokens: 3,
  },
  {
    codigo: "cliente-pregunta",
    emoji: "🧑‍🚀",
    titulo: "Pregunta del cliente",
    descripcion:
      "Mencionen una necesidad concreta de su usuario.",
    tokens: 0,
  },
  {
    codigo: "mirada-usuario",
    emoji: "👀",
    titulo: "Mirada del usuario",
    descripcion:
      "La solución considera al cliente. Ganan 1 token.",
    tokens: 1,
  },
  {
    codigo: "restriccion-creativa",
    emoji: "🧱",
    titulo: "Restricción creativa",
    descripcion:
      "Deben retirar una pieza y adaptar la solución. Pierden 2 tokens.",
    tokens: -2,
  },
];

function segundosRestantes(
  sesion: SesionFase3,
): number {
  if (sesion.timerCorriendo && sesion.timerFin) {
    const fin = Date.parse(sesion.timerFin);

    if (Number.isFinite(fin)) {
      return Math.max(
        0,
        Math.ceil((fin - Date.now()) / 1000),
      );
    }
  }

  return Math.max(
    0,
    Number(sesion.segundosRestantes || 0),
  );
}

function rutaSugerida(fase: string): string {
  if (fase === "f2_ranking") {
    return "../fase2/ranking.html";
  }

  if (fase === "mapa_f3_creatividad") {
    return "../mapa/creatividad.html";
  }

  if (fase === "f3_transicion_creatividad") {
    return "transicion-creatividad.html";
  }

  if (fase === "f3_lego") {
    return "lego.html";
  }

  if (fase === "f3_ranking") {
    return "ranking.html";
  }

  if (
    fase === "mapa_f4_final" ||
    fase.startsWith("f4_")
  ) {
    return "../mapa/final.html";
  }

  return "../fase2/ranking.html";
}

function contarListos(
  grupos: GrupoFase3[],
  campo:
    | "listoF3Ranking"
    | "listoF3Mapa"
    | "listoF3Transicion"
    | "listoInicioF3"
    | "listoF3Salida"
    | "legoCompletado",
): number {
  return grupos.filter(
    (grupo) => Boolean(grupo[campo]),
  ).length;
}

function indiceDeterminista(
  texto: string,
  total: number,
): number {
  let acumulado = 0;

  for (const caracter of texto) {
    acumulado =
      (acumulado * 31 + caracter.charCodeAt(0)) >>> 0;
  }

  return total > 0 ? acumulado % total : 0;
}

async function contexto(
  sesionId: string,
  grupoId: string,
  repositorio: RepositorioFase3,
) {
  const [sesion, grupo, grupos] = await Promise.all([
    repositorio.buscarSesion(sesionId),
    repositorio.buscarGrupo(sesionId, grupoId),
    repositorio.listarGrupos(sesionId),
  ]);

  if (!sesion || !grupo) {
    throw new ErrorAplicacion(
      "No se encontró la sesión o el grupo",
      404,
      "CONTEXTO_NO_ENCONTRADO",
    );
  }

  return {
    sesion,
    grupo,
    grupos,
  };
}

export async function obtenerEstadoFase3(
  sesionId: string,
  grupoId: string,
  repositorio: RepositorioFase3,
) {
  const {
    sesion,
    grupo,
    grupos,
  } = await contexto(
    sesionId,
    grupoId,
    repositorio,
  );

  const restantes = segundosRestantes(sesion);

  return {
    ok: true,
    fase: sesion.fase,
    rutaSugerida: rutaSugerida(sesion.fase),
    timer: {
      corriendo:
        Boolean(sesion.timerCorriendo) &&
        restantes > 0,
      segundosRestantes: restantes,
      expirado:
        Boolean(sesion.timerCorriendo) &&
        restantes === 0,
      duracionInicial: DURACION_LEGO_SEGUNDOS,
    },
    grupo,
    ruleta: {
      opciones: OPCIONES_RULETA,
      intentosUsados: grupo.ruletaLegoIntentos,
      intentosRestantes: Math.max(
        0,
        MAX_INTENTOS_RULETA -
          grupo.ruletaLegoIntentos,
      ),
      ultimoResultado: grupo.ruletaLegoUltimo,
    },
    progreso: {
      rankingF2: {
        completados: contarListos(
          grupos,
          "listoF3Ranking",
        ),
        totalGrupos: sesion.totalGrupos,
      },
      mapaCreatividad: {
        completados: contarListos(
          grupos,
          "listoF3Mapa",
        ),
        totalGrupos: sesion.totalGrupos,
      },
      transicionCreatividad: {
        completados: contarListos(
          grupos,
          "listoF3Transicion",
        ),
        totalGrupos: sesion.totalGrupos,
      },
      inicioLego: {
        completados: contarListos(
          grupos,
          "listoInicioF3",
        ),
        totalGrupos: sesion.totalGrupos,
      },
      lego: {
        completados: contarListos(
          grupos,
          "legoCompletado",
        ),
        conFoto: grupos.filter(
          (item) => item.legoConFoto,
        ).length,
        sinFoto: grupos.filter(
          (item) => item.legoSinFoto,
        ).length,
        totalGrupos: sesion.totalGrupos,
      },
      rankingF3: {
        completados: contarListos(
          grupos,
          "listoF3Salida",
        ),
        totalGrupos: sesion.totalGrupos,
      },
    },
  };
}

interface ConfiguracionLista {
  campo:
    | "listoF3Ranking"
    | "listoF3Mapa"
    | "listoF3Transicion"
    | "listoF3Salida";
  fasesEsperadas: string[];
  nuevaFase: string;
  duracion: number;
}

const CONFIGURACION_LISTA: Record<
  Exclude<EtapaListaFase3, "inicio_lego">,
  ConfiguracionLista
> = {
  ranking_f2: {
    campo: "listoF3Ranking",
    fasesEsperadas: ["f2_ranking"],
    nuevaFase: "mapa_f3_creatividad",
    duracion: 0,
  },
  mapa_creatividad: {
    campo: "listoF3Mapa",
    fasesEsperadas: ["mapa_f3_creatividad"],
    nuevaFase: "f3_transicion_creatividad",
    duracion: 0,
  },
  transicion_creatividad: {
    campo: "listoF3Transicion",
    fasesEsperadas: ["f3_transicion_creatividad"],
    nuevaFase: "f3_lego",
    duracion: DURACION_LEGO_SEGUNDOS,
  },
  ranking_f3: {
    campo: "listoF3Salida",
    fasesEsperadas: ["f3_ranking"],
    nuevaFase: "mapa_f4_final",
    duracion: 0,
  },
};

export async function marcarListoFase3(
  sesionId: string,
  grupoId: string,
  etapa: EtapaListaFase3,
  repositorio: RepositorioFase3,
) {
  if (etapa === "inicio_lego") {
    const sesion = await repositorio.buscarSesion(sesionId);

    if (!sesion) {
      throw new ErrorAplicacion(
        "No se encontró la sesión",
        404,
        "SESION_NO_ENCONTRADA",
      );
    }

    if (sesion.fase !== "f3_lego") {
      return obtenerEstadoFase3(
        sesionId,
        grupoId,
        repositorio,
      );
    }

    await repositorio.marcarListo(
      sesionId,
      grupoId,
      "listoInicioF3",
    );

    const grupos = await repositorio.listarGrupos(
      sesionId,
    );

    const todosListos =
      grupos.length > 0 &&
      grupos.every(
        (grupo) => grupo.listoInicioF3,
      );

    if (todosListos) {
      await repositorio.iniciarTimerLego(
        sesionId,
        DURACION_LEGO_SEGUNDOS,
      );
    }

    return obtenerEstadoFase3(
      sesionId,
      grupoId,
      repositorio,
    );
  }

  const configuracion = CONFIGURACION_LISTA[etapa];

  if (!configuracion) {
    throw new ErrorAplicacion(
      "La etapa indicada no es válida",
      400,
      "ETAPA_INVALIDA",
    );
  }

  const sesion = await repositorio.buscarSesion(sesionId);

  if (!sesion) {
    throw new ErrorAplicacion(
      "No se encontró la sesión",
      404,
      "SESION_NO_ENCONTRADA",
    );
  }

  if (
    !configuracion.fasesEsperadas.includes(
      sesion.fase,
    )
  ) {
    return obtenerEstadoFase3(
      sesionId,
      grupoId,
      repositorio,
    );
  }

  await repositorio.marcarListo(
    sesionId,
    grupoId,
    configuracion.campo,
  );

  const grupos = await repositorio.listarGrupos(
    sesionId,
  );

  const todosListos =
    grupos.length > 0 &&
    grupos.every(
      (grupo) => Boolean(
        grupo[configuracion.campo],
      ),
    );

  if (todosListos) {
    await repositorio.cambiarFase(
      sesionId,
      configuracion.fasesEsperadas,
      configuracion.nuevaFase,
      configuracion.duracion,
    );
  }

  return obtenerEstadoFase3(
    sesionId,
    grupoId,
    repositorio,
  );
}

export async function iniciarFase3(
  sesionId: string,
  grupoId: string,
  repositorio: RepositorioFase3,
) {
  return marcarListoFase3(
    sesionId,
    grupoId,
    "ranking_f2",
    repositorio,
  );
}

export async function completarLego(
  sesionId: string,
  grupoId: string,
  entrada: {
    conFoto?: boolean;
    sinFoto?: boolean;
    trabajoFotoId?: string;
  },
  repositorio: RepositorioFase3,
  fotos?: { verificarProcesada(trabajoId: string, sesionId: string, grupoId: string): Promise<boolean> },
) {
  const { sesion } = await contexto(
    sesionId,
    grupoId,
    repositorio,
  );

  if (sesion.fase !== "f3_lego") {
    return obtenerEstadoFase3(
      sesionId,
      grupoId,
      repositorio,
    );
  }

  const conFoto = Boolean(entrada.conFoto);
  const sinFoto = Boolean(entrada.sinFoto);
  const trabajoFotoId = String(entrada.trabajoFotoId || "").trim();

  if (!conFoto && !sinFoto) {
    throw new ErrorAplicacion(
      "Debes subir una foto o indicar que no pudieron subirla",
      400,
      "FOTO_REQUERIDA",
    );
  }
  if (conFoto && (!trabajoFotoId || !fotos || !(await fotos.verificarProcesada(trabajoFotoId, sesionId, grupoId)))) {
    throw new ErrorAplicacion("La fotografía todavía no está procesada", 409, "FOTO_NO_PROCESADA");
  }
  if (!conFoto && trabajoFotoId) throw new ErrorAplicacion("El trabajo fotográfico no corresponde", 400, "TRABAJO_FOTO_INVALIDO");

  const restantes = segundosRestantes(sesion);

  if (
    sesion.timerCorriendo &&
    restantes > 0
  ) {
    throw new ErrorAplicacion(
      "El tiempo de construcción todavía no termina",
      409,
      "TIMER_ACTIVO",
    );
  }

  await repositorio.completarLego(
    sesionId,
    grupoId,
    conFoto,
    sinFoto,
    conFoto ? trabajoFotoId : undefined,
  );

  const grupos = await repositorio.listarGrupos(
    sesionId,
  );

  const todosCompletaron =
    grupos.length > 0 &&
    grupos.every(
      (grupo) => grupo.legoCompletado,
    );

  if (todosCompletaron) {
    await repositorio.cambiarFase(
      sesionId,
      ["f3_lego"],
      "f3_ranking",
      0,
    );
  }

  return obtenerEstadoFase3(
    sesionId,
    grupoId,
    repositorio,
  );
}

export async function girarRuleta(
  sesionId: string,
  grupoId: string,
  repositorio: RepositorioFase3,
) {
  const {
    sesion,
    grupo,
  } = await contexto(
    sesionId,
    grupoId,
    repositorio,
  );

  if (sesion.fase !== "f3_lego") {
    throw new ErrorAplicacion(
      "La ruleta solo está disponible durante LEGO",
      409,
      "RULETA_NO_DISPONIBLE",
    );
  }

  if (
    grupo.ruletaLegoIntentos >=
    MAX_INTENTOS_RULETA
  ) {
    throw new ErrorAplicacion(
      "Ya utilizaron los tres intentos de la ruleta",
      409,
      "SIN_INTENTOS_RULETA",
    );
  }

  const indice = indiceDeterminista(
    `${grupoId}-${grupo.ruletaLegoIntentos}`,
    OPCIONES_RULETA.length,
  );

  const resultado = OPCIONES_RULETA[indice];

  if (!resultado) {
    throw new ErrorAplicacion(
      "No existen opciones configuradas para la ruleta",
      500,
      "RULETA_SIN_OPCIONES",
    );
  }

  const nuevosTokens = Math.max(
    0,
    grupo.tokens + resultado.tokens,
  );

  const guardado =
    await repositorio.guardarResultadoRuleta(
      sesionId,
      grupoId,
      grupo.ruletaLegoIntentos,
      nuevosTokens,
      resultado.codigo,
    );

  if (!guardado) {
    return girarRuleta(
      sesionId,
      grupoId,
      repositorio,
    );
  }

  return {
    ok: true,
    resultado,
    tokens: nuevosTokens,
    intentosUsados:
      grupo.ruletaLegoIntentos + 1,
    intentosRestantes:
      MAX_INTENTOS_RULETA -
      grupo.ruletaLegoIntentos -
      1,
  };
}

export async function responderAstronauta(
  sesionId: string,
  grupoId: string,
  alternativa: string,
  repositorio: RepositorioFase3,
) {
  const {
    sesion,
    grupo,
  } = await contexto(
    sesionId,
    grupoId,
    repositorio,
  );

  if (sesion.fase !== "f3_lego") {
    throw new ErrorAplicacion(
      "La pregunta no está disponible",
      409,
      "PREGUNTA_NO_DISPONIBLE",
    );
  }

  if (grupo.astronautaLegoRespondida) {
    return {
      ok: true,
      yaRespondida: true,
      correcta:
        grupo.astronautaLegoCorrecta,
      tokens: grupo.tokens,
      recompensa: 0,
    };
  }

  const correcta =
    alternativa.trim().toUpperCase() === "B";

  const recompensa = correcta ? 2 : 0;
  const nuevosTokens =
    grupo.tokens + recompensa;

  const guardado =
    await repositorio.guardarRespuestaAstronauta(
      sesionId,
      grupoId,
      correcta,
      nuevosTokens,
    );

  if (!guardado) {
    const actualizado =
      await repositorio.buscarGrupo(
        sesionId,
        grupoId,
      );

    return {
      ok: true,
      yaRespondida: true,
      correcta: Boolean(
        actualizado?.astronautaLegoCorrecta,
      ),
      tokens:
        actualizado?.tokens ??
        grupo.tokens,
      recompensa: 0,
    };
  }

  return {
    ok: true,
    yaRespondida: false,
    correcta,
    tokens: nuevosTokens,
    recompensa,
  };
}

export async function obtenerRankingFase3(
  sesionId: string,
  grupoId: string,
  repositorio: RepositorioFase3,
) {
  const [
    sesion,
    grupos,
  ] = await Promise.all([
    repositorio.buscarSesion(sesionId),
    repositorio.listarGrupos(sesionId),
  ]);

  if (!sesion) {
    throw new ErrorAplicacion(
      "No se encontró la sesión",
      404,
      "SESION_NO_ENCONTRADA",
    );
  }

  const ranking = [...grupos]
    .sort(
      (a, b) =>
        b.tokens - a.tokens ||
        a.nombreGrupo.localeCompare(
          b.nombreGrupo,
        ),
    )
    .map((grupo, indice) => ({
      posicion: indice + 1,
      grupoId: grupo.grupoId,
      nombreGrupo: grupo.nombreGrupo,
      tokens: grupo.tokens,
      legoConFoto: grupo.legoConFoto,
      legoSinFoto: grupo.legoSinFoto,
      esMiGrupo:
        grupo.grupoId === grupoId,
    }));

  return {
    ok: true,
    fase: sesion.fase,
    rutaSugerida: rutaSugerida(
      sesion.fase,
    ),
    ranking,
  };
}
