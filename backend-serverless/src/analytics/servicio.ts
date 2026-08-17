import {
  AthenaClient,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  StartQueryExecutionCommand,
} from "@aws-sdk/client-athena";

import { ErrorAplicacion } from "../compartido/respuestas.js";
import { mapearFilaKpis } from "../compartido/contratos/analytics.js";

const athena = new AthenaClient({});

const DATABASE =
  process.env.ATHENA_DATABASE || "mision_emprende_db";

const WORKGROUP = process.env.ATHENA_WORKGROUP;

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function esperarConsulta(
  queryExecutionId: string,
): Promise<void> {
  for (let intento = 0; intento < 40; intento += 1) {
    const respuesta = await athena.send(
      new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId,
      }),
    );

    const estado =
      respuesta.QueryExecution?.Status?.State;

    if (estado === "SUCCEEDED") {
      return;
    }

    if (estado === "FAILED" || estado === "CANCELLED") {
      const motivo =
        respuesta.QueryExecution?.Status?.StateChangeReason ||
        "La consulta de Athena no pudo completarse";

      throw new ErrorAplicacion(
        motivo,
        502,
        "ATHENA_CONSULTA_FALLIDA",
      );
    }

    await esperar(500);
  }

  throw new ErrorAplicacion(
    "Athena tardó demasiado en responder",
    504,
    "ATHENA_TIMEOUT",
  );
}

export async function obtenerKpisSesion(
  sesionId: string,
) {
  if (!WORKGROUP) {
    throw new Error(
      "Falta la variable ATHENA_WORKGROUP",
    );
  }

  const sql = `
    SELECT
      sesion_id,
      schema_version,
      total_alumnos,
      grupos_configurados,
      grupos_en_datos,
      promedio_tokens,
      porcentaje_sopa_completada,
      tiempo_promedio_sopa_segundos,
      porcentaje_lego_completado,
      promedio_intentos_ruleta,
      porcentaje_astronauta_correcto,
      total_evaluaciones,
      promedio_peer,
      promedio_claridad,
      promedio_creatividad,
      promedio_viabilidad,
      promedio_equipo,
      promedio_presentacion
    FROM vw_kpis_por_sesion
    WHERE sesion_id = '${sesionId}'
    LIMIT 1
  `;

  const inicio = await athena.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: {
        Database: DATABASE,
      },
      WorkGroup: WORKGROUP,
    }),
  );

  const queryExecutionId = inicio.QueryExecutionId;

  if (!queryExecutionId) {
    throw new ErrorAplicacion(
      "Athena no entregó un identificador de consulta",
      502,
      "ATHENA_SIN_QUERY_ID",
    );
  }

  await esperarConsulta(queryExecutionId);

  const resultado = await athena.send(
    new GetQueryResultsCommand({
      QueryExecutionId: queryExecutionId,
      MaxResults: 2,
    }),
  );

  const columnas =
    resultado.ResultSet?.ResultSetMetadata?.ColumnInfo || [];

  const fila = resultado.ResultSet?.Rows?.[1];

  if (!fila) {
    throw new ErrorAplicacion(
      "No existen datos analíticos para esta sesión",
      404,
      "ANALITICA_NO_ENCONTRADA",
    );
  }

  const datos: Record<string, string | undefined> = {};

  columnas.forEach((columna, indice) => {
    const nombre = columna.Label || columna.Name;

    if (nombre) {
      datos[nombre] =
        fila.Data?.[indice]?.VarCharValue;
    }
  });

  return mapearFilaKpis(datos, sesionId);
}
