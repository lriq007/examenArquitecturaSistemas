CREATE OR REPLACE VIEW mision_emprende_db.vw_grupos AS
SELECT
    sesion_id,
    grupo_id,
    nombre_grupo,
    schema_version,
    CAST(tokens AS DOUBLE) AS tokens,

    COALESCE(sopa_completada, false) AS sopa_completada,
    CAST(sopa_tiempo_segundos AS DOUBLE) AS sopa_tiempo_segundos,

    COALESCE(lego_completado, false) AS lego_completado,
    CAST(ruleta_lego_intentos AS DOUBLE) AS ruleta_lego_intentos,

    astronauta_lego_respondida,
    astronauta_lego_correcta,

    COALESCE(recompensa_peer_otorgada, false) AS recompensa_peer_otorgada
FROM mision_emprende_db.mision_raw
WHERE tipo = 'GRUPO'
  AND sk LIKE 'GRUPO#%';
