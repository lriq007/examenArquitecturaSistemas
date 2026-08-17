CREATE OR REPLACE VIEW mision_emprende_db.vw_evaluaciones AS
SELECT
    REPLACE(pk, 'SESION#', '') AS sesion_id,
    grupo_evaluado_id,
    grupo_evaluador_id,
    schema_version,

    CAST(claridad AS DOUBLE) AS claridad,
    CAST(creatividad AS DOUBLE) AS creatividad,
    CAST(viabilidad AS DOUBLE) AS viabilidad,
    CAST(equipo AS DOUBLE) AS equipo,
    CAST(presentacion AS DOUBLE) AS presentacion,

    automatica
FROM mision_emprende_db.mision_raw
WHERE pk LIKE 'SESION#%'
  AND sk LIKE 'EVAL#%';
