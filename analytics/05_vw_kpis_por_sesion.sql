CREATE OR REPLACE VIEW mision_emprende_db.vw_kpis_por_sesion AS

WITH grupos AS (
    SELECT
        sesion_id,

        COUNT(*) AS grupos_en_datos,

        AVG(tokens) AS promedio_tokens,

        100.0 * AVG(
            CASE
                WHEN sopa_completada THEN 1.0
                ELSE 0.0
            END
        ) AS porcentaje_sopa_completada,

        AVG(sopa_tiempo_segundos) AS tiempo_promedio_sopa_segundos,

        100.0 * AVG(
            CASE
                WHEN lego_completado THEN 1.0
                ELSE 0.0
            END
        ) AS porcentaje_lego_completado,

        AVG(ruleta_lego_intentos) AS promedio_intentos_ruleta,

        100.0 * AVG(
            CASE
                WHEN astronauta_lego_respondida = true THEN
                    CASE
                        WHEN astronauta_lego_correcta = true THEN 1.0
                        ELSE 0.0
                    END
                ELSE NULL
            END
        ) AS porcentaje_astronauta_correcto

    FROM mision_emprende_db.vw_grupos
    GROUP BY sesion_id
),

evaluaciones AS (
    SELECT
        sesion_id,

        COUNT(*) AS total_evaluaciones,

        AVG(claridad) AS promedio_claridad,
        AVG(creatividad) AS promedio_creatividad,
        AVG(viabilidad) AS promedio_viabilidad,
        AVG(equipo) AS promedio_equipo,
        AVG(presentacion) AS promedio_presentacion,

        AVG(
            (
                claridad +
                creatividad +
                viabilidad +
                equipo +
                presentacion
            ) / 5.0
        ) AS promedio_peer

    FROM mision_emprende_db.vw_evaluaciones
    GROUP BY sesion_id
)

SELECT
    s.sesion_id,
    s.schema_version AS schema_version,
    s.fecha_creacion,
    s.fase,
    s.total_alumnos,
    s.total_grupos AS grupos_configurados,

    COALESCE(g.grupos_en_datos, 0) AS grupos_en_datos,

    g.promedio_tokens,
    g.porcentaje_sopa_completada,
    g.tiempo_promedio_sopa_segundos,
    g.porcentaje_lego_completado,
    g.promedio_intentos_ruleta,
    g.porcentaje_astronauta_correcto,

    COALESCE(e.total_evaluaciones, 0) AS total_evaluaciones,

    e.promedio_peer,
    e.promedio_claridad,
    e.promedio_creatividad,
    e.promedio_viabilidad,
    e.promedio_equipo,
    e.promedio_presentacion

FROM mision_emprende_db.vw_sesiones s
LEFT JOIN grupos g
    ON s.sesion_id = g.sesion_id
LEFT JOIN evaluaciones e
    ON s.sesion_id = e.sesion_id;
