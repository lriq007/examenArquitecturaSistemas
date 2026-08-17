import { ErrorAplicacion } from "../respuestas.js";

export const VERSION_CONTRATO_ANALITICA = "1.0" as const;

export const VERSIONES_ANALITICA_SOPORTADAS: readonly string[] = [
  VERSION_CONTRATO_ANALITICA,
];

export interface ItemSesionAnalitica {
  tipo: "SESION";
  schemaVersion: typeof VERSION_CONTRATO_ANALITICA;
  sesionId: string;
  fase: string;
  totalGrupos: number;
  totalAlumnos: number;
  fechaCreacion: string;
}

export function construirItemSesionAnalitica(datos: {
  sesionId: string;
  fase: string;
  totalGrupos: number;
  totalAlumnos: number;
  fechaCreacion: string;
}): ItemSesionAnalitica {
  return {
    tipo: "SESION",
    schemaVersion: VERSION_CONTRATO_ANALITICA,
    sesionId: datos.sesionId,
    fase: datos.fase,
    totalGrupos: datos.totalGrupos,
    totalAlumnos: datos.totalAlumnos,
    fechaCreacion: datos.fechaCreacion,
  };
}

export interface ItemGrupoAnalitico {
  tipo: "GRUPO";
  schemaVersion: typeof VERSION_CONTRATO_ANALITICA;
  sesionId: string;
  grupoId: string;
  nombreGrupo: string;
  tokens: number;
  sopaCompletada: boolean;
  legoCompletado: boolean;
}

export function construirItemGrupoAnalitico(datos: {
  sesionId: string;
  grupoId: string;
  nombreGrupo: string;
  tokens: number;
  sopaCompletada: boolean;
  legoCompletado: boolean;
}): ItemGrupoAnalitico {
  return {
    tipo: "GRUPO",
    schemaVersion: VERSION_CONTRATO_ANALITICA,
    sesionId: datos.sesionId,
    grupoId: datos.grupoId,
    nombreGrupo: datos.nombreGrupo,
    tokens: datos.tokens,
    sopaCompletada: datos.sopaCompletada,
    legoCompletado: datos.legoCompletado,
  };
}

export interface CamposEvaluacionAnalitica {
  schemaVersion: typeof VERSION_CONTRATO_ANALITICA;
  grupoEvaluadoId: string;
  grupoEvaluadorId: string;
  claridad: number;
  creatividad: number;
  viabilidad: number;
  equipo: number;
  presentacion: number;
  automatica: boolean;
}

export function construirCamposEvaluacionAnalitica(datos: {
  grupoEvaluadoId: string;
  grupoEvaluadorId: string;
  claridad: number;
  creatividad: number;
  viabilidad: number;
  equipo: number;
  presentacion: number;
  automatica: boolean;
}): CamposEvaluacionAnalitica {
  return {
    schemaVersion: VERSION_CONTRATO_ANALITICA,
    grupoEvaluadoId: datos.grupoEvaluadoId,
    grupoEvaluadorId: datos.grupoEvaluadorId,
    claridad: datos.claridad,
    creatividad: datos.creatividad,
    viabilidad: datos.viabilidad,
    equipo: datos.equipo,
    presentacion: datos.presentacion,
    automatica: datos.automatica,
  };
}

export interface CriteriosPeerKpis {
  claridad: number | null;
  creatividad: number | null;
  viabilidad: number | null;
  equipo: number | null;
  presentacion: number | null;
}

export interface DtoKpisSesion {
  ok: true;
  sesionId: string;
  schemaVersion: string;
  verificado: true;
  verificadoEn: string;
  totalAlumnos: number;
  totalGrupos: number;
  gruposEnDatos: number;
  promedioTokens: number | null;
  porcentajeSopa: number | null;
  tiempoPromedioSopa: number | null;
  porcentajeLego: number | null;
  promedioIntentosRuleta: number | null;
  porcentajeAstronauta: number | null;
  totalEvaluaciones: number;
  promedioPeer: number | null;
  criteriosPeer: CriteriosPeerKpis;
}

function numeroONull(valor: string | undefined): number | null {
  if (valor === undefined || valor === "") {
    return null;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Mapea una fila de `vw_kpis_por_sesion` (columna Athena -> valor de texto)
 * al DTO de KPIs. Una fila sin `schema_version` es una fila heredada
 * (escrita antes de que existiera este contrato): se lee como la versión
 * base `VERSION_CONTRATO_ANALITICA` ("lectura anterior"), no como un
 * error. Solo una versión presente pero no reconocida es incompatible.
 * Tolera columnas adicionales desconocidas (no las lee).
 */
export function mapearFilaKpis(
  datos: Record<string, string | undefined>,
  sesionId: string,
): DtoKpisSesion {
  const schemaVersionCruda = datos.schema_version;

  if (schemaVersionCruda && !VERSIONES_ANALITICA_SOPORTADAS.includes(schemaVersionCruda)) {
    throw new ErrorAplicacion(
      `La versión de contrato analítico "${schemaVersionCruda}" no está soportada`,
      409,
      "CONTRATO_ANALITICO_INCOMPATIBLE",
    );
  }

  const schemaVersion = schemaVersionCruda || VERSION_CONTRATO_ANALITICA;

  return {
    ok: true,
    sesionId: datos.sesion_id || sesionId,
    schemaVersion,
    verificado: true,
    verificadoEn: new Date().toISOString(),

    totalAlumnos: numeroONull(datos.total_alumnos) ?? 0,
    totalGrupos: numeroONull(datos.grupos_configurados) ?? 0,
    gruposEnDatos: numeroONull(datos.grupos_en_datos) ?? 0,

    promedioTokens: numeroONull(datos.promedio_tokens),
    porcentajeSopa: numeroONull(datos.porcentaje_sopa_completada),
    tiempoPromedioSopa: numeroONull(datos.tiempo_promedio_sopa_segundos),
    porcentajeLego: numeroONull(datos.porcentaje_lego_completado),
    promedioIntentosRuleta: numeroONull(datos.promedio_intentos_ruleta),
    porcentajeAstronauta: numeroONull(datos.porcentaje_astronauta_correcto),

    totalEvaluaciones: numeroONull(datos.total_evaluaciones) ?? 0,
    promedioPeer: numeroONull(datos.promedio_peer),

    criteriosPeer: {
      claridad: numeroONull(datos.promedio_claridad),
      creatividad: numeroONull(datos.promedio_creatividad),
      viabilidad: numeroONull(datos.promedio_viabilidad),
      equipo: numeroONull(datos.promedio_equipo),
      presentacion: numeroONull(datos.promedio_presentacion),
    },
  };
}
