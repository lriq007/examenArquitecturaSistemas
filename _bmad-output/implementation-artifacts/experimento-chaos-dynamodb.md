# Evidencia — Chaos: indisponibilidad simulada de la región DynamoDB principal (Historia 6.4)

_Generado automáticamente por `npm run pruebas` (Vitest, `backend-serverless/pruebas/caos/`). No editar a mano: refleja la última ejecución real del experimento contra el mecanismo de simulación de producción._

- Estado estable: SIMULAR_FALLO_DYNAMODB_PRINCIPAL=false, breaker en CERRADO, la primaria responde con normalidad (Global Tables activa-activa us-east-1/us-west-2 intacta).
- Hipótesis: Con SIMULAR_FALLO_DYNAMODB_PRINCIPAL=true, tras alcanzar el umbral de fallos consecutivos configurado, el breaker abre y las operaciones continúan sirviéndose desde la réplica us-west-2 sin error visible para el llamador; al restaurar la bandera y expirar el cooldown, el breaker cierra de nuevo.
- Fallo inyectado: SIMULAR_FALLO_DYNAMODB_PRINCIPAL=true en un ruptor de prueba aislado (mismo mecanismo `envolverConSimulacion` que usa el wiring de producción en src/compartido/baseDatos.ts), umbral=2, cooldown=30s.
- Radio de impacto: Acotado a la instancia de CircuitBreakerDynamo creada dentro de esta prueba; no se toca la tabla real, no se retira la réplica, ninguna otra sesión/grupo se ve afectado.
- Aserciones ejecutadas:
  - Estado estable: con la bandera apagada, la operación responde desde la primaria y el breaker permanece CERRADO.
  - 1er fallo elegible (bajo el umbral=2): el breaker no abre; el error se propaga al llamador; no se consulta la réplica.
  - 2do fallo alcanza el umbral: el breaker transiciona a ABIERTO y la misma operación continúa por la réplica sin error visible.
  - Durante el cooldown, nuevas operaciones rechazan la primaria de forma controlada (sin intentarla) y van directo a la réplica.
  - Al expirar el cooldown con la bandera ya restaurada a false, el breaker prueba la primaria (SEMI_ABIERTO) y cierra: continuidad y recuperación verificadas.
  - La bandera SIMULAR_FALLO_DYNAMODB_PRINCIPAL vuelve a false por sí sola al terminar el experimento (apagado explícito y verificado).
- Resultado: PASA: 1er fallo no abre (bajo umbral); 2do fallo abre y sirve desde réplica; durante el cooldown rechaza la primaria de forma controlada; al expirar el cooldown con la bandera ya en false, cierra y vuelve a servir desde la primaria.
- Recuperación: SIMULAR_FALLO_DYNAMODB_PRINCIPAL restaurado a 'false' (afterEach lo refuerza); breaker verificado en estado CERRADO; réplica jamás retirada.

Última ejecución: 2026-08-17T07:56:01.135Z
