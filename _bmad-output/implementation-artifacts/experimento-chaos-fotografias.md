# Evidencia — Chaos: fallo controlado del consumidor fotográfico y redrive (Historia 6.5)

_Generado automáticamente por `npm run pruebas` (Vitest, `backend-serverless/pruebas/caos/`). No editar a mano: refleja la última ejecución real del experimento contra el mecanismo de simulación de producción._

- Estado estable: CAOS_FOTOS=false, cola principal simulada vacía, DLQ vacía; trabajo objetivo y trabajo de control en PENDIENTE_CARGA.
- Hipótesis: Con CAOS_FOTOS=true y CAOS_FOTOS_TRABAJO_ID fijado al trabajo objetivo, solo ese trabajo falla en cada entrega; tras maxReceiveCount entregas el mensaje llega a la DLQ, el reconciliador (suscrito a la propia DLQ) lo marca FALLIDO y drena el mensaje; el redrive autorizado (AD-5: nuevo intento enlazado al anterior, no un redrive crudo de SQS) lo recupera hasta COMPLETADO (PROCESADA) sin duplicar el efecto ni afectar al trabajo de control.
- Fallo inyectado: CAOS_FOTOS=true, CAOS_FOTOS_TRABAJO_ID=trabajo-objetivo-caos (mismo mecanismo de src/fotografias/consumidor.ts), simulando 4 entregas SQS.
- Radio de impacto: Limitado a un único trabajo de prueba (trabajo-objetivo-caos); el trabajo de control en la misma cola se procesa con normalidad en todo momento.
- Aserciones ejecutadas:
  - Estado estable: ambos trabajos (objetivo y control) inician en PENDIENTE_CARGA con CAOS_FOTOS apagado.
  - El trabajo objetivo falló en las 4 entregas simuladas (igual a redrive_policy.maxReceiveCount en main.tf); en ninguna se completó ni se duplicó efecto de dominio.
  - Otros trabajos en la misma cola (control) no se ven afectados: terminan COMPLETADO en la primera entrega, en cada una de las 4 iteraciones sin duplicar el efecto.
  - Al agotar reintentos, el reconciliador (conectado a la DLQ) marca el intento FALLIDO con causa REINTENTOS_AGOTADOS, sin reintentar por sí solo (AD-5).
  - El redrive autorizado (AD-5: nuevo intento enlazado al anterior, vía ServicioFotografias.reintentar) procesa la nueva carga con caos apagado: el trabajo objetivo termina COMPLETADO (externamente PROCESADA) con un único efecto de dominio, sin reanudar directamente el intento terminal.
- Resultado: PASA: reintentos agotados sin duplicar efecto; DLQ y reconciliador marcan FALLIDO/REINTENTOS_AGOTADOS; el redrive autorizado (ServicioFotografias.reintentar + nueva carga) recupera PROCESADA con un único efecto de dominio; el trabajo de control nunca se vio afectado.
- Recuperación: CAOS_FOTOS restaurado a 'false' y CAOS_FOTOS_TRABAJO_ID vacío (afterEach lo refuerza); trabajo objetivo verificado en estado terminal COMPLETADO, con el nuevo intentoId autorizado, tras el redrive.

Última ejecución: 2026-08-17T10:45:05.374Z
