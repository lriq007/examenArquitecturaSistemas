import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => {
  // `servicio.ts` lee ATHENA_WORKGROUP en una constante de módulo, así
  // que debe existir antes de que el import estático de más abajo
  // evalúe ese módulo.
  process.env.ATHENA_WORKGROUP = "wg-test";
  process.env.ATHENA_DATABASE = "mision_emprende_db";

  return {
    startRespuesta: null as { QueryExecutionId?: string } | Error | null,
    estadosCola: [] as string[],
    resultadoQuery: null as unknown,
  };
});

vi.mock("@aws-sdk/client-athena", () => {
  class Comando {
    constructor(public input: Record<string, unknown>) {}
  }

  return {
    AthenaClient: class {
      async send(command: { constructor: { name: string } }) {
        const nombre = command.constructor.name;

        if (nombre === "StartQueryExecutionCommand") {
          if (estado.startRespuesta instanceof Error) throw estado.startRespuesta;
          return estado.startRespuesta ?? { QueryExecutionId: "qid-1" };
        }

        if (nombre === "GetQueryExecutionCommand") {
          const cola = estado.estadosCola;
          const siguiente = cola.length > 1 ? cola.shift()! : (cola[0] ?? "SUCCEEDED");
          return { QueryExecution: { Status: { State: siguiente, StateChangeReason: "motivo de prueba" } } };
        }

        if (nombre === "GetQueryResultsCommand") {
          return (
            estado.resultadoQuery ?? {
              ResultSet: { ResultSetMetadata: { ColumnInfo: [] }, Rows: [{}] },
            }
          );
        }

        throw new Error(`Comando Athena no soportado en la prueba: ${nombre}`);
      }
    },
    StartQueryExecutionCommand: class StartQueryExecutionCommand extends Comando {},
    GetQueryExecutionCommand: class GetQueryExecutionCommand extends Comando {},
    GetQueryResultsCommand: class GetQueryResultsCommand extends Comando {},
  };
});

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../src/compartido/baseDatos.js", () => ({
  baseDatos: { send },
  nombreTabla: () => "tabla",
}));

import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { manejador as manejadorAnalytics } from "../src/analytics/api.js";

async function manejador(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
  return (await manejadorAnalytics(event)) as APIGatewayProxyStructuredResultV2;
}

const SESION_VALIDA = "11111111-1111-4111-a111-111111111111";
const PROFESOR_SUB = "sub-profesor";

function evento(sesionId: string, sub = PROFESOR_SUB): APIGatewayProxyEventV2 {
  return {
    requestContext: {
      http: { path: `/api/analytics/kpis/${sesionId}`, method: "GET" },
      authorizer: { jwt: { claims: { sub, "cognito:groups": "PROFESOR" } } },
    },
  } as unknown as APIGatewayProxyEventV2;
}

/**
 * Fila fixture de `vw_kpis_por_sesion` completa. `schemaVersion` acepta:
 * - un string ("1.0", "2.0", ...): la columna `schema_version` se incluye
 *   con ese valor.
 * - `null`: la columna `schema_version` se omite del todo, simulando una
 *   fila heredada escrita antes de que el contrato existiera.
 */
function filaKpisCompleta(schemaVersion: string | null = "1.0") {
  const columnas = [
    "sesion_id",
    ...(schemaVersion === null ? [] : ["schema_version"]),
    "total_alumnos",
    "grupos_configurados",
    "grupos_en_datos",
    "promedio_tokens",
    "porcentaje_sopa_completada",
    "tiempo_promedio_sopa_segundos",
    "porcentaje_lego_completado",
    "promedio_intentos_ruleta",
    "porcentaje_astronauta_correcto",
    "total_evaluaciones",
    "promedio_peer",
    "promedio_claridad",
    "promedio_creatividad",
    "promedio_viabilidad",
    "promedio_equipo",
    "promedio_presentacion",
  ];

  const valores: Record<string, string> = {
    sesion_id: SESION_VALIDA,
    schema_version: schemaVersion ?? "",
    total_alumnos: "20",
    grupos_configurados: "4",
    grupos_en_datos: "4",
    promedio_tokens: "7.5",
    porcentaje_sopa_completada: "80",
    tiempo_promedio_sopa_segundos: "95",
    porcentaje_lego_completado: "60",
    promedio_intentos_ruleta: "2.1",
    porcentaje_astronauta_correcto: "70",
    total_evaluaciones: "12",
    promedio_claridad: "4.2",
    promedio_creatividad: "4.1",
    promedio_viabilidad: "4.3",
    promedio_equipo: "4.0",
    promedio_presentacion: "4.4",
    promedio_peer: "4.2",
  };

  return {
    ResultSet: {
      ResultSetMetadata: {
        ColumnInfo: columnas.map((nombre) => ({ Name: nombre })),
      },
      Rows: [
        {},
        {
          Data: columnas.map((nombre) => ({ VarCharValue: valores[nombre] })),
        },
      ],
    },
  };
}

describe("ruta completa GET /api/analytics/kpis/:sesionId", () => {
  beforeEach(() => {
    send.mockReset();
    estado.startRespuesta = null;
    estado.estadosCola = [];
    estado.resultadoQuery = null;
    process.env.ATHENA_WORKGROUP = "wg-test";
    process.env.ATHENA_DATABASE = "mision_emprende_db";
  });

  it("rechaza una sesión ajena con 403 antes de tocar Athena", async () => {
    send.mockResolvedValueOnce({ Item: { profesorSub: "otro-profesor" } });

    const respuesta = await manejador(evento(SESION_VALIDA));

    expect(respuesta.statusCode).toBe(403);
    expect(JSON.parse(respuesta.body as string)).toMatchObject({ ok: false, codigo: "ALCANCE_INVALIDO" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rechaza un identificador de sesión con formato inválido con 400 sin consultar autorización", async () => {
    const respuesta = await manejador(evento("no-es-un-uuid"));

    expect(respuesta.statusCode).toBe(400);
    expect(JSON.parse(respuesta.body as string)).toMatchObject({ ok: false, codigo: "SESION_ID_INVALIDO" });
    expect(send).not.toHaveBeenCalled();
  });

  it("responde 404 cuando no existen datos analíticos para la sesión propia", async () => {
    send.mockResolvedValueOnce({ Item: { profesorSub: PROFESOR_SUB } });
    estado.estadosCola = ["SUCCEEDED"];
    estado.resultadoQuery = { ResultSet: { ResultSetMetadata: { ColumnInfo: [] }, Rows: [{}] } };

    const respuesta = await manejador(evento(SESION_VALIDA));

    expect(respuesta.statusCode).toBe(404);
    expect(JSON.parse(respuesta.body as string)).toMatchObject({ ok: false, codigo: "ANALITICA_NO_ENCONTRADA" });
  });

  it("responde 502 cuando la consulta Athena termina en FAILED", async () => {
    send.mockResolvedValueOnce({ Item: { profesorSub: PROFESOR_SUB } });
    estado.estadosCola = ["FAILED"];

    const respuesta = await manejador(evento(SESION_VALIDA));

    expect(respuesta.statusCode).toBe(502);
    expect(JSON.parse(respuesta.body as string)).toMatchObject({ ok: false, codigo: "ATHENA_CONSULTA_FALLIDA" });
  });

  it("responde 504 cuando Athena no concluye dentro del tiempo de espera", async () => {
    vi.useFakeTimers();

    try {
      send.mockResolvedValueOnce({ Item: { profesorSub: PROFESOR_SUB } });
      estado.estadosCola = ["RUNNING"];

      const promesa = manejador(evento(SESION_VALIDA));
      await vi.advanceTimersByTimeAsync(500 * 41);
      const respuesta = await promesa;

      expect(respuesta.statusCode).toBe(504);
      expect(JSON.parse(respuesta.body as string)).toMatchObject({ ok: false, codigo: "ATHENA_TIMEOUT" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("responde 200 con los KPIs verificados, incluyendo schemaVersion y verificado", async () => {
    send.mockResolvedValueOnce({ Item: { profesorSub: PROFESOR_SUB } });
    estado.estadosCola = ["SUCCEEDED"];
    estado.resultadoQuery = filaKpisCompleta();

    const respuesta = await manejador(evento(SESION_VALIDA));

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body as string);
    expect(cuerpo).toMatchObject({
      ok: true,
      sesionId: SESION_VALIDA,
      schemaVersion: "1.0",
      verificado: true,
      totalAlumnos: 20,
      totalGrupos: 4,
    });
    expect(typeof cuerpo.verificadoEn).toBe("string");
    expect(Number.isNaN(Date.parse(cuerpo.verificadoEn))).toBe(false);
  });

  it("responde 200 y trata una fila heredada sin schema_version como versión base 1.0", async () => {
    send.mockResolvedValueOnce({ Item: { profesorSub: PROFESOR_SUB } });
    estado.estadosCola = ["SUCCEEDED"];
    estado.resultadoQuery = filaKpisCompleta(null);

    const respuesta = await manejador(evento(SESION_VALIDA));

    expect(respuesta.statusCode).toBe(200);
    const cuerpo = JSON.parse(respuesta.body as string);
    expect(cuerpo).toMatchObject({
      ok: true,
      sesionId: SESION_VALIDA,
      schemaVersion: "1.0",
      verificado: true,
      totalAlumnos: 20,
    });
  });

  it("responde 409 cuando la fila declara una versión de contrato no soportada", async () => {
    send.mockResolvedValueOnce({ Item: { profesorSub: PROFESOR_SUB } });
    estado.estadosCola = ["SUCCEEDED"];
    estado.resultadoQuery = filaKpisCompleta("2.0");

    const respuesta = await manejador(evento(SESION_VALIDA));

    expect(respuesta.statusCode).toBe(409);
    expect(JSON.parse(respuesta.body as string)).toMatchObject({
      ok: false,
      codigo: "CONTRATO_ANALITICO_INCOMPATIBLE",
    });
  });
});
