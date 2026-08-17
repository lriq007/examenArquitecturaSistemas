import {
  randomBytes,
  createHash,
} from "node:crypto";

import {
  ErrorAplicacion,
} from "../compartido/respuestas.js";
import {
  claveTecnicaGrupo,
  completarClaveProfesor,
  crearIdentidadGrupo,
  ingresarProfesorCognito,
} from "../compartido/cognito.js";
import type {
  AlumnoEntrada,
  ItemDynamo,
  RepositorioProfesor,
} from "./repositorio.js";

export type ModoCreacion =
  | "recomendado"
  | "dividir_dos"
  | "personalizado";

export interface CrearSesionesEntrada {
  solicitudId: string;
  nombre: string;
  correoProfesor: string;
  facultad: string;
  modoCreacion: ModoCreacion;
  cantidadSesiones?: number;
  gruposPorSesion?: number;
  alumnos: AlumnoEntrada[];
}

export type AccionSesion =
  | "siguiente_fase"
  | "fase_anterior"
  | "iniciar_timer"
  | "detener_timer"
  | "reiniciar_timer"
  | "timer_10";

const FASES_ORDEN = [
  "f1_bienvenida",
  "f1_conocidos",
  "f1_pre_sopa",
  "f1_sopa",
  "f1_ranking",
  "mapa_f2_empatia",
  "f2_transicion",
  "f2_tematicas",
  "f2_transicion_empatia",
  "f2_bubblemap",
  "f2_ranking",
  "mapa_f3_creatividad",
  "f3_transicion_creatividad",
  "f3_lego",
  "f3_ranking",
  "mapa_f4_final",
  "f4_transicion_comunicacion",
  "f4_construccion_pitch",
  "f4_orden_pitch",
  "f4_presentacion_pitch",
  "f5_transicion_apoyo",
  "f5_evaluacion_pitch",
  "f6_ranking",
  "reflexion",
] as const;

const TIEMPOS_POR_FASE: Record<string, number> = {
  f1_bienvenida: 0,
  f1_conocidos: 10,
  f1_pre_sopa: 0,
  f1_sopa: 60,
  f1_ranking: 0,
  mapa_f2_empatia: 0,
  f2_transicion: 0,
  f2_tematicas: 120,
  f2_transicion_empatia: 0,
  f2_bubblemap: 60,
  f2_ranking: 0,
  mapa_f3_creatividad: 0,
  f3_transicion_creatividad: 0,
  f3_lego: 15,
  f3_ranking: 0,
  mapa_f4_final: 0,
  f4_transicion_comunicacion: 0,
  f4_construccion_pitch: 120,
  f4_orden_pitch: 0,
  f4_presentacion_pitch: 90,
  f5_transicion_apoyo: 0,
  f5_evaluacion_pitch: 90,
  f6_ranking: 0,
  reflexion: 0,
};

export async function ingresarProfesor(entrada: {
  usuario: string;
  clave: string;
  claveNueva?: string;
  sesionChallenge?: string;
}) {
  const usuario = entrada.usuario.trim();
  if (!usuario) throw new ErrorAplicacion("No fue posible iniciar sesión", 401, "CREDENCIALES_INVALIDAS");

  const resultado = entrada.sesionChallenge && entrada.claveNueva
    ? await completarClaveProfesor(usuario, entrada.claveNueva, entrada.sesionChallenge)
    : await ingresarProfesorCognito(usuario, entrada.clave);

  return { ok: true, ...resultado, rol: "profesor" as const };
}

function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}

function validarAlumno(
  alumno: AlumnoEntrada,
  indice: number,
): AlumnoEntrada {
  const normalizado: AlumnoEntrada = {
    correo: String(alumno.correo || "")
      .trim()
      .toLowerCase(),
    rut: String(alumno.rut || "").trim(),
    nombre: String(alumno.nombre || "").trim(),
    apellidoPaterno: String(
      alumno.apellidoPaterno || "",
    ).trim(),
    apellidoMaterno: String(
      alumno.apellidoMaterno || "",
    ).trim(),
    carrera: String(alumno.carrera || "").trim(),
  };

  if (!normalizado.nombre) {
    throw new ErrorAplicacion(
      `El alumno de la fila ${indice + 2} no tiene nombre`,
      400,
      "ALUMNO_SIN_NOMBRE",
    );
  }

  return normalizado;
}

function repartirEquitativamente<T>(
  elementos: T[],
  cantidad: number,
): T[][] {
  const resultado: T[][] = [];
  let inicio = 0;

  for (let indice = 0; indice < cantidad; indice += 1) {
    const base = Math.floor(elementos.length / cantidad);
    const extra =
      indice < elementos.length % cantidad ? 1 : 0;
    const fin = inicio + base + extra;

    resultado.push(elementos.slice(inicio, fin));
    inicio = fin;
  }

  return resultado;
}

function codigoAcceso(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);

  return Array.from(
    bytes as Uint8Array,
    (byte: number) =>
      alfabeto[byte % alfabeto.length] ?? "A",
  ).join("");
}

function idDeterminista(semilla: string): string {
  const hex = createHash("sha256").update(semilla).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function codigoDeterminista(semilla: string): string {
  return createHash("sha256").update(semilla).digest("base64url")
    .toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6).padEnd(6, "A");
}

function gruposRecomendados(
  totalAlumnos: number,
): number {
  return Math.max(1, Math.ceil(totalAlumnos / 8));
}

function calcularSegundosRestantes(
  sesion: ItemDynamo,
): number {
  if (!sesion.timerCorriendo || !sesion.timerFin) {
    return Number(sesion.segundosRestantes || 0);
  }

  const fin = new Date(String(sesion.timerFin)).getTime();
  const restantes = Math.ceil((fin - Date.now()) / 1000);

  return Math.max(restantes, 0);
}

export async function crearSesiones(
  entrada: CrearSesionesEntrada,
  profesorSub: string,
  repositorio: RepositorioProfesor,
) {
  const solicitudId = String(entrada.solicitudId || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(solicitudId)) {
    throw new ErrorAplicacion("Falta un identificador idempotente válido", 400, "SOLICITUD_ID_INVALIDA");
  }
  const nombre = String(entrada.nombre || "").trim();
  const correoProfesor = normalizarCorreo(
    String(entrada.correoProfesor || ""),
  );
  const facultad = String(entrada.facultad || "").trim();

  if (!nombre) {
    throw new ErrorAplicacion(
      "Debes ingresar un nombre para la sesión",
      400,
      "NOMBRE_REQUERIDO",
    );
  }

  if (!correoProfesor || !correoProfesor.includes("@")) {
    throw new ErrorAplicacion(
      "Debes ingresar un correo de profesor válido",
      400,
      "CORREO_INVALIDO",
    );
  }

  if (!facultad) {
    throw new ErrorAplicacion(
      "Debes seleccionar una facultad",
      400,
      "FACULTAD_REQUERIDA",
    );
  }

  const alumnos = (entrada.alumnos || []).map(
    validarAlumno,
  );

  if (!alumnos.length) {
    throw new ErrorAplicacion(
      "El archivo no contiene estudiantes",
      400,
      "SIN_ALUMNOS",
    );
  }

  const modo = entrada.modoCreacion || "recomendado";

  let cantidadSesiones = 1;

  if (modo === "dividir_dos") {
    cantidadSesiones = 2;
  } else if (modo === "personalizado") {
    const solicitadas = Number(entrada.cantidadSesiones);
    if (!Number.isInteger(solicitadas) || solicitadas < 1 || solicitadas > 10) {
      throw new ErrorAplicacion("La cantidad de sesiones debe ser un entero entre 1 y 10", 400, "CANTIDAD_SESIONES_INVALIDA");
    }
    cantidadSesiones = Math.min(solicitadas, alumnos.length);
  }

  const alumnosPorSesion = repartirEquitativamente(
    alumnos,
    cantidadSesiones,
  );

  const ahora = new Date().toISOString();
  const items: ItemDynamo[] = [];
  const codigosGenerados = new Set<string>();
  const siguienteCodigoUnico = (): string => {
    for (;;) {
      const candidato = codigoAcceso();
      if (!codigosGenerados.has(candidato)) {
        codigosGenerados.add(candidato);
        return candidato;
      }
    }
  };
  const respuestaSesiones: Array<{
    sesionId: string;
    nombre: string;
    grupos: Array<{
      grupoId: string;
      nombreGrupo: string;
      codigoAcceso: string;
      integrantes: AlumnoEntrada[];
    }>;
  }> = [];

  await repositorio.guardarProfesor(
    profesorSub,
    correoProfesor,
    facultad,
  );

  alumnosPorSesion.forEach(
    (alumnosSesion, indiceSesion) => {
      const sesionId = idDeterminista(`${profesorSub}:${solicitudId}:sesion:${indiceSesion}`);

      const nombreSesion =
        cantidadSesiones === 1
          ? nombre
          : `${nombre} - Sala ${indiceSesion + 1}`;

      const cantidadGrupos =
        modo === "personalizado"
          ? (() => {
              const solicitados = Number(entrada.gruposPorSesion);
              if (!Number.isInteger(solicitados) || solicitados < 1 || solicitados > 30) {
                throw new ErrorAplicacion("Los grupos por sesión deben ser un entero entre 1 y 30", 400, "GRUPOS_POR_SESION_INVALIDOS");
              }
              return Math.min(solicitados, alumnosSesion.length);
            })()
          : gruposRecomendados(alumnosSesion.length);

      const grupos = Array.from(
        { length: cantidadGrupos },
        (_, indiceGrupo) => ({
          grupoId: idDeterminista(`${profesorSub}:${solicitudId}:sesion:${indiceSesion}:grupo:${indiceGrupo}`),
          nombreGrupo: `Grupo ${indiceGrupo + 1}`,
          codigoAcceso: codigoDeterminista(`${profesorSub}:${solicitudId}:codigo:${indiceSesion}:${indiceGrupo}`),
          integrantes: [] as AlumnoEntrada[],
        }),
      );

      alumnosSesion.forEach((alumno, indiceAlumno) => {
        const grupo = grupos[indiceAlumno % grupos.length];

        if (grupo) {
          grupo.integrantes.push(alumno);
        }
      });

      items.push({
        PK: `SESION#${sesionId}`,
        SK: "METADATOS",
        GSI1PK: `PROFESOR_SUB#${profesorSub}`,
        profesorSub,
        GSI1SK: `SESION#${ahora}#${sesionId}`,
        tipo: "SESION",
        sesionId,
        nombre: nombreSesion,
        correoProfesor,
        facultad,
        fase: "f1_bienvenida",
        totalGrupos: grupos.length,
        totalAlumnos: alumnosSesion.length,
        gruposSopaCompletada: 0,
        timerCorriendo: false,
        segundosRestantes: 0,
        timerInicio: null,
        timerFin: null,
        inicioFaseHabilitado: false,
        fechaCreacion: ahora,
      });

      grupos.forEach((grupo) => {
        items.push({
          PK: `SESION#${sesionId}`,
          SK: `GRUPO#${grupo.grupoId}`,
          GSI1PK: `CODIGO#${grupo.codigoAcceso}`,
          GSI1SK: `GRUPO#${grupo.grupoId}`,
          tipo: "GRUPO",
          sesionId,
          grupoId: grupo.grupoId,
          nombreGrupo: grupo.nombreGrupo,
          codigoAcceso: grupo.codigoAcceso,
          tokens: 10,
          sopaCompletada: false,
          listoF1: false,
          listoF2: false,
          listoF3: false,
          listoF4: false,
          listoF5: false,
          listoF6: false,
          temaElegido: "",
          desafioNombre: "",
          legoCompletado: false,
          pitchCompletado: false,
          estadoProvisionamiento: "PENDIENTE",
        });

        grupo.integrantes.forEach((alumno, indiceIntegrante) => {
          const alumnoId = idDeterminista(
            `${profesorSub}:${solicitudId}:alumno:${indiceSesion}:${grupo.grupoId}:${indiceIntegrante}`,
          );

          items.push({
            PK: `SESION#${sesionId}`,
            SK: `ALUMNO#${alumnoId}`,
            tipo: "ALUMNO",
            alumnoId,
            sesionId,
            grupoId: grupo.grupoId,
            correo: alumno.correo,
            rut: alumno.rut,
            nombre: alumno.nombre,
            apellidoPaterno: alumno.apellidoPaterno,
            apellidoMaterno: alumno.apellidoMaterno,
            carrera: alumno.carrera,
          });
        });
      });

      respuestaSesiones.push({
        sesionId,
        nombre: nombreSesion,
        grupos,
      });
    },
  );

  let fallosProvisionamiento = 0;
  for (const sesion of respuestaSesiones) {
    for (const grupo of sesion.grupos) {
      let reservado = false;
      for (let intento = 0; intento < 10 && !reservado; intento += 1) {
        reservado = await repositorio.reservarCodigo(
          grupo.codigoAcceso,
          sesion.sesionId,
          grupo.grupoId,
        );
        if (!reservado) grupo.codigoAcceso = siguienteCodigoUnico();
      }
      if (!reservado) {
        throw new ErrorAplicacion("No fue posible reservar un código único", 503, "CODIGOS_AGOTADOS");
      }
      const itemGrupo = items.find(
        (item) => item.PK === `SESION#${sesion.sesionId}` && item.SK === `GRUPO#${grupo.grupoId}`,
      );
      if (itemGrupo) {
        itemGrupo.codigoAcceso = grupo.codigoAcceso;
        itemGrupo.GSI1PK = `CODIGO#${grupo.codigoAcceso}`;
      }
    }
  }

  try {
    await repositorio.guardarItems(items);
  } catch (error) {
    await Promise.allSettled(respuestaSesiones.flatMap((sesion) =>
      sesion.grupos.map((grupo) => repositorio.liberarCodigo(
        grupo.codigoAcceso,
        sesion.sesionId,
        grupo.grupoId,
      )),
    ));
    throw error;
  }

  for (const sesion of respuestaSesiones) {
    for (const grupo of sesion.grupos) {
      const username = `grupo-${grupo.grupoId}`;
      let ultimoError: unknown;
      for (let intento = 0; intento < 4; intento += 1) {
        try {
          const identidad = await crearIdentidadGrupo(
            username,
            grupo.grupoId,
            claveTecnicaGrupo(grupo.codigoAcceso, grupo.grupoId),
          );
          await repositorio.guardarVinculoGrupo({
            sesionId: sesion.sesionId,
            grupoId: grupo.grupoId,
            grupoSub: identidad.sub,
            cognitoUsername: username,
          });
          ultimoError = undefined;
          break;
        } catch (error) {
          ultimoError = error;
          if (intento < 3) {
            await new Promise((resolver) => setTimeout(
              resolver,
              Math.min(1000, 50 * 2 ** intento) + Math.floor(Math.random() * 50),
            ));
          }
        }
      }
      if (ultimoError) {
        await repositorio.marcarProvisionamientoFallido(sesion.sesionId, grupo.grupoId);
        fallosProvisionamiento += 1;
      }
    }
  }

  if (fallosProvisionamiento > 0) {
    throw new ErrorAplicacion(
      "El provisionamiento de uno o más grupos no concluyó; puede reintentarse",
      503,
      "PROVISIONAMIENTO_INCOMPLETO",
    );
  }

  return {
    ok: true,
    correoProfesor,
    sesiones: respuestaSesiones,
  };
}

export async function listarSesionesProfesor(
  profesorSub: string,
  repositorio: RepositorioProfesor,
) {
  const sesiones = await repositorio.listarSesiones(profesorSub);

  return {
    ok: true,
    sesiones,
  };
}

export async function obtenerControlSesion(
  sesionId: string,
  profesorSub: string,
  repositorio: RepositorioProfesor,
) {
  const elementos =
    await repositorio.listarElementosSesion(sesionId);

  const sesion = elementos.find(
    (item) => item.SK === "METADATOS",
  );

  if (!sesion) {
    throw new ErrorAplicacion(
      "No se encontró la sesión",
      404,
      "SESION_NO_ENCONTRADA",
    );
  }
  if (String(sesion.profesorSub || "") !== profesorSub) {
    throw new ErrorAplicacion("Acceso no autorizado", 403, "ALCANCE_INVALIDO");
  }

  const grupos = elementos
    .filter((item) => item.tipo === "GRUPO")
    .map((item) => ({
      grupoId: String(item.grupoId || ""),
      nombreGrupo: String(item.nombreGrupo || "Grupo"),
      codigoAcceso: String(item.codigoAcceso || ""),
      tokens: Number(item.tokens || 0),
      listo: (() => {
        const faseActual = String(sesion.fase || "");

        if (faseActual === "f1_conocidos") {
          return Boolean(item.listoConocidos);
        }

        if (faseActual === "f1_pre_sopa") {
          return Boolean(item.listoF1);
        }

        if (
          faseActual === "f1_sopa" ||
          faseActual === "f1_ranking"
        ) {
          return Boolean(item.sopaCompletada);
        }

        return Boolean(
          item.listoF2 ||
            item.listoF3 ||
            item.listoF4 ||
            item.listoF5 ||
            item.listoF6,
        );
      })(),
      temaElegido: String(item.temaElegido || ""),
      desafioNombre: String(item.desafioNombre || ""),
      legoCompletado: Boolean(item.legoCompletado),
      pitchCompletado: Boolean(item.pitchCompletado),
    }))
    .sort((a, b) =>
      a.nombreGrupo.localeCompare(b.nombreGrupo),
    );

  const alumnos = elementos.filter(
    (item) => item.tipo === "ALUMNO",
  );

  const gruposConIntegrantes = grupos.map((grupo) => ({
    ...grupo,
    totalIntegrantes: alumnos.filter(
      (alumno) => alumno.grupoId === grupo.grupoId,
    ).length,
  }));

  return {
    ok: true,
    sesion: {
      sesionId,
      nombre: String(sesion.nombre || "Sesión"),
      fase: String(sesion.fase || "f1_bienvenida"),
      timerCorriendo: Boolean(sesion.timerCorriendo),
      segundosRestantes:
        calcularSegundosRestantes(sesion),
      totalGrupos: grupos.length,
      totalAlumnos: alumnos.length,
      fechaCreacion: String(sesion.fechaCreacion || ""),
    },
    grupos: gruposConIntegrantes,
  };
}

export async function ejecutarAccionSesion(
  sesionId: string,
  accion: AccionSesion,
  profesorSub: string,
  repositorio: RepositorioProfesor,
) {
  const sesion = await repositorio.obtenerSesion(sesionId);

  if (!sesion) {
    throw new ErrorAplicacion(
      "No se encontró la sesión",
      404,
      "SESION_NO_ENCONTRADA",
    );
  }
  if (String(sesion.profesorSub || "") !== profesorSub) {
    throw new ErrorAplicacion("Acceso no autorizado", 403, "ALCANCE_INVALIDO");
  }

  const faseActual = String(
    sesion.fase || "f1_bienvenida",
  );

  const indiceActual = FASES_ORDEN.indexOf(
    faseActual as (typeof FASES_ORDEN)[number],
  );

  const ahora = new Date();
  const cambios: Record<string, unknown> = {};

  if (accion === "siguiente_fase") {
    if (
      indiceActual < 0 ||
      indiceActual >= FASES_ORDEN.length - 1
    ) {
      throw new ErrorAplicacion(
        "La sesión ya está en la última fase",
        400,
        "ULTIMA_FASE",
      );
    }

    const nuevaFase =
      FASES_ORDEN[indiceActual + 1] ?? faseActual;

    cambios.fase = nuevaFase;
    cambios.segundosRestantes =
      TIEMPOS_POR_FASE[nuevaFase] || 0;
    cambios.timerCorriendo = false;
    cambios.timerInicio = null;
    cambios.timerFin = null;
  }

  if (accion === "fase_anterior") {
    if (indiceActual <= 0) {
      throw new ErrorAplicacion(
        "La sesión ya está en la primera fase",
        400,
        "PRIMERA_FASE",
      );
    }

    const nuevaFase =
      FASES_ORDEN[indiceActual - 1] ?? faseActual;

    cambios.fase = nuevaFase;
    cambios.segundosRestantes =
      TIEMPOS_POR_FASE[nuevaFase] || 0;
    cambios.timerCorriendo = false;
    cambios.timerInicio = null;
    cambios.timerFin = null;
  }

  if (accion === "iniciar_timer") {
    const segundos = Math.max(
      0,
      calcularSegundosRestantes(sesion) ||
        TIEMPOS_POR_FASE[faseActual] ||
        0,
    );

    cambios.segundosRestantes = segundos;
    cambios.timerCorriendo = segundos > 0;
    cambios.timerInicio =
      segundos > 0 ? ahora.toISOString() : null;
    cambios.timerFin =
      segundos > 0
        ? new Date(
            ahora.getTime() + segundos * 1000,
          ).toISOString()
        : null;
  }

  if (accion === "detener_timer") {
    cambios.segundosRestantes =
      calcularSegundosRestantes(sesion);
    cambios.timerCorriendo = false;
    cambios.timerInicio = null;
    cambios.timerFin = null;
  }

  if (accion === "reiniciar_timer") {
    cambios.segundosRestantes =
      TIEMPOS_POR_FASE[faseActual] || 0;
    cambios.timerCorriendo = false;
    cambios.timerInicio = null;
    cambios.timerFin = null;
  }

  if (accion === "timer_10") {
    cambios.segundosRestantes = 10;
    cambios.timerCorriendo = true;
    cambios.timerInicio = ahora.toISOString();
    cambios.timerFin = new Date(
      ahora.getTime() + 10_000,
    ).toISOString();
  }

  if (!Object.keys(cambios).length) {
    throw new ErrorAplicacion(
      "Acción no válida",
      400,
      "ACCION_INVALIDA",
    );
  }

  await repositorio.actualizarSesion(
    sesionId,
    cambios,
  );

  return obtenerControlSesion(sesionId, profesorSub, repositorio);
}
