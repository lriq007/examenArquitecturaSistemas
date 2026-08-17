# Evidencia — Chaos/redrive de fotografías

- Estado estable: `CAOS_FOTOS=false`, cola principal vacía, DLQ vacía y trabajo de control `PROCESADA` una vez.
- Hipótesis: con `CAOS_FOTOS=true` únicamente la consumidora fotográfica falla; las rutas del juego continúan y el mensaje alcanza DLQ tras cuatro recepciones.
- Radio de impacto: una fotografía de prueba y el bulkhead SQS/Lambda fotográfico; sin modificar Global Table, sesiones ajenas ni Analytics.
- Procedimiento seguro: entorno no productivo, habilitar cargas, crear un trabajo trazable, activar caos solo en la Lambda consumidora, observar retry→DLQ, restaurar `CAOS_FOTOS=false`, ejecutar redrive AWS y consultar hasta `PROCESADA`.
- Aserciones ejecutadas: el juego siguió respondiendo; DLQ recibió un mensaje; redrive terminó `PROCESADA`; el resultado Dynamo fue único ante entrega duplicada.
- Recuperación y cleanup: caos restaurado a `false`, colas drenadas, objeto de prueba eliminado y configuración comparada con IaC. La plantilla mantiene `CAOS_FOTOS: "false"` por defecto.

Este experimento requiere credenciales y un entorno desplegado; nunca se ejecuta automáticamente desde pruebas locales ni CI.
