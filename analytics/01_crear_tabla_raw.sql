CREATE EXTERNAL TABLE IF NOT EXISTS mision_emprende_db.mision_raw (
    pk STRING,
    sk STRING,
    tipo STRING,
    schema_version STRING,

    sesion_id STRING,
    grupo_id STRING,
    nombre_grupo STRING,

    tokens DECIMAL(38,10),

    sopa_completada BOOLEAN,
    sopa_tiempo_segundos DECIMAL(38,10),

    lego_completado BOOLEAN,
    ruleta_lego_intentos DECIMAL(38,10),
    astronauta_lego_respondida BOOLEAN,
    astronauta_lego_correcta BOOLEAN,

    grupo_evaluado_id STRING,
    grupo_evaluador_id STRING,
    claridad DECIMAL(38,10),
    creatividad DECIMAL(38,10),
    viabilidad DECIMAL(38,10),
    equipo DECIMAL(38,10),
    presentacion DECIMAL(38,10),
    automatica BOOLEAN,

    total_alumnos DECIMAL(38,10),
    total_grupos DECIMAL(38,10),
    fase STRING,
    fecha_creacion STRING,

    recompensa_peer_otorgada BOOLEAN
)
ROW FORMAT SERDE
    'com.amazon.ionhiveserde.IonHiveSerDe'
WITH SERDEPROPERTIES (
    'ion.pk.path_extractor' = '(Item PK)',
    'ion.sk.path_extractor' = '(Item SK)',
    'ion.tipo.path_extractor' = '(Item tipo)',
    'ion.schema_version.path_extractor' = '(Item schemaVersion)',

    'ion.sesion_id.path_extractor' = '(Item sesionId)',
    'ion.grupo_id.path_extractor' = '(Item grupoId)',
    'ion.nombre_grupo.path_extractor' = '(Item nombreGrupo)',

    'ion.tokens.path_extractor' = '(Item tokens)',

    'ion.sopa_completada.path_extractor' = '(Item sopaCompletada)',
    'ion.sopa_tiempo_segundos.path_extractor' = '(Item sopaTiempoSegundos)',

    'ion.lego_completado.path_extractor' = '(Item legoCompletado)',
    'ion.ruleta_lego_intentos.path_extractor' = '(Item ruletaLegoIntentos)',
    'ion.astronauta_lego_respondida.path_extractor' = '(Item astronautaLegoRespondida)',
    'ion.astronauta_lego_correcta.path_extractor' = '(Item astronautaLegoCorrecta)',

    'ion.grupo_evaluado_id.path_extractor' = '(Item grupoEvaluadoId)',
    'ion.grupo_evaluador_id.path_extractor' = '(Item grupoEvaluadorId)',
    'ion.claridad.path_extractor' = '(Item claridad)',
    'ion.creatividad.path_extractor' = '(Item creatividad)',
    'ion.viabilidad.path_extractor' = '(Item viabilidad)',
    'ion.equipo.path_extractor' = '(Item equipo)',
    'ion.presentacion.path_extractor' = '(Item presentacion)',
    'ion.automatica.path_extractor' = '(Item automatica)',

    'ion.total_alumnos.path_extractor' = '(Item totalAlumnos)',
    'ion.total_grupos.path_extractor' = '(Item totalGrupos)',
    'ion.fase.path_extractor' = '(Item fase)',
    'ion.fecha_creacion.path_extractor' = '(Item fechaCreacion)',

    'ion.recompensa_peer_otorgada.path_extractor' = '(Item recompensaPeerOtorgada)'
)
STORED AS ION
LOCATION 's3://mision-emprende-prod-312607746740-datalake/dynamodb-export/AWSDynamoDB/01786425027417-07071f52/data/';
