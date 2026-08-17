CREATE OR REPLACE VIEW mision_emprende_db.vw_sesiones AS
SELECT
    sesion_id,
    schema_version,
    CAST(total_alumnos AS BIGINT) AS total_alumnos,
    CAST(total_grupos AS BIGINT) AS total_grupos,
    fase,
    fecha_creacion
FROM mision_emprende_db.mision_raw
WHERE tipo = 'SESION'
  AND sk = 'METADATOS';
