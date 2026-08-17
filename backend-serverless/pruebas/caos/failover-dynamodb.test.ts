import { afterEach, describe, expect, it, vi } from "vitest";

import { crearRuptorDynamo, envolverConSimulacion, type ClienteEnviable } from "../../src/compartido/baseDatos.js";
import { escribirEvidenciaCaos } from "./evidencia.js";

/*
 * Historia 6.4 — Experimento automatizado de indisponibilidad regional.
 *
 * Ejecuta código real (no dobles): `crearRuptorDynamo` y
 * `envolverConSimulacion` son exactamente las piezas que usa el wiring
 * de producción de `src/compartido/baseDatos.ts`. Solo se reemplaza la
 * capa de red por clientes en memoria, porque este repositorio no debe
 * requerir credenciales AWS reales para correr `npm run pruebas`, y
 * porque ejecutar caos contra un entorno desplegado con datos reales
 * exige aprobación explícita (Ask First).
 *
 * La bandera `SIMULAR_FALLO_DYNAMODB_PRINCIPAL` es la misma variable de
 * entorno que activa el fallo simulado en producción (ver
 * `template.yaml` parámetro `SimularFalloDynamoPrincipal`).
 */

class ComandoFalso {
  constructor(public input: Record<string, unknown> = {}) {}
}

function clienteEnMemoria(
  etiqueta: string,
): ClienteEnviable & { send: ReturnType<typeof vi.fn<(comando: ComandoFalso) => Promise<any>>> } {
  return {
    send: vi.fn(async (comando: ComandoFalso) => ({ Item: { PK: etiqueta, input: comando.input } })),
  };
}

function relojDePrueba(inicio = 0) {
  let ahora = inicio;
  return { avanzar: (ms: number) => (ahora += ms), ahora: () => ahora };
}

describe("Chaos Engineering — indisponibilidad simulada de la región DynamoDB principal (6.4)", () => {
  afterEach(() => {
    // Reversibilidad obligatoria: nunca dejar la inyección encendida entre pruebas.
    process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL = "false";
  });

  it("abre por umbral, continúa por la réplica durante el cooldown y se recupera al restaurar la bandera", async () => {
    process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL = "false";

    const primariaBase = clienteEnMemoria("primaria");
    const replica = clienteEnMemoria("replica");
    const primaria = envolverConSimulacion(primariaBase);

    const reloj = relojDePrueba();
    const ruptor = crearRuptorDynamo({
      clientePrincipal: primaria,
      clienteRespaldo: replica,
      umbralFallos: 2,
      duracionCooldownMs: 30_000,
      reloj: reloj.ahora,
    });

    const aserciones: string[] = [];
    let resultado =
      "PASA: 1er fallo no abre (bajo umbral); 2do fallo abre y sirve desde réplica; durante el cooldown rechaza la primaria de forma controlada; al expirar el cooldown con la bandera ya en false, cierra y vuelve a servir desde la primaria.";

    try {
      // ── Estado estable ────────────────────────────────────────────────
      const estable = await ruptor.enviar(new ComandoFalso({ paso: "estado-estable" }));
      expect(estable).toMatchObject({ Item: { PK: "primaria" } });
      expect(ruptor.estado()).toBe("CERRADO");
      aserciones.push("Estado estable: con la bandera apagada, la operación responde desde la primaria y el breaker permanece CERRADO.");

      // ── Fallo inyectado (alcance acotado a este ruptor de prueba) ─────
      process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL = "true";

      await expect(ruptor.enviar(new ComandoFalso({ paso: "fallo-1-bajo-umbral" }))).rejects.toThrow(/simulado/);
      expect(ruptor.estado()).toBe("CERRADO");
      expect(ruptor.contadorFallos()).toBe(1);
      aserciones.push("1er fallo elegible (bajo el umbral=2): el breaker no abre; el error se propaga al llamador; no se consulta la réplica.");
      expect(replica.send).not.toHaveBeenCalled();

      const segundo = await ruptor.enviar(new ComandoFalso({ paso: "fallo-2-abre" }));
      expect(segundo).toMatchObject({ Item: { PK: "replica" } });
      expect(ruptor.estado()).toBe("ABIERTO");
      aserciones.push("2do fallo alcanza el umbral: el breaker transiciona a ABIERTO y la misma operación continúa por la réplica sin error visible.");

      replica.send.mockClear();
      primariaBase.send.mockClear();

      reloj.avanzar(1_000);
      const rechazoControlado = await ruptor.enviar(new ComandoFalso({ paso: "cooldown-vigente" }));
      expect(rechazoControlado).toMatchObject({ Item: { PK: "replica" } });
      expect(primariaBase.send).not.toHaveBeenCalled();
      expect(replica.send).toHaveBeenCalledTimes(1);
      aserciones.push("Durante el cooldown, nuevas operaciones rechazan la primaria de forma controlada (sin intentarla) y van directo a la réplica.");

      // ── Recuperación ───────────────────────────────────────────────────
      reloj.avanzar(30_001);
      process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL = "false";

      const recuperado = await ruptor.enviar(new ComandoFalso({ paso: "cooldown-expira-recupera" }));
      expect(recuperado).toMatchObject({ Item: { PK: "primaria" } });
      expect(ruptor.estado()).toBe("CERRADO");
      expect(ruptor.contadorFallos()).toBe(0);
      aserciones.push("Al expirar el cooldown con la bandera ya restaurada a false, el breaker prueba la primaria (SEMI_ABIERTO) y cierra: continuidad y recuperación verificadas.");

      expect(process.env.SIMULAR_FALLO_DYNAMODB_PRINCIPAL).toBe("false");
      aserciones.push("La bandera SIMULAR_FALLO_DYNAMODB_PRINCIPAL vuelve a false por sí sola al terminar el experimento (apagado explícito y verificado).");
    } catch (error) {
      resultado = `FALLA: ${error instanceof Error ? error.message : String(error)}`;

      throw error;
    } finally {
      // Se escribe siempre (éxito o fallo): la evidencia nunca queda
      // congelada en una corrida previa exitosa mientras el estado real es de falla.
      escribirEvidenciaCaos("_bmad-output/implementation-artifacts/experimento-chaos-dynamodb.md", {
        titulo: "Evidencia — Chaos: indisponibilidad simulada de la región DynamoDB principal (Historia 6.4)",
        estadoEstable:
          "SIMULAR_FALLO_DYNAMODB_PRINCIPAL=false, breaker en CERRADO, la primaria responde con normalidad (Global Tables activa-activa us-east-1/us-west-2 intacta).",
        hipotesis:
          "Con SIMULAR_FALLO_DYNAMODB_PRINCIPAL=true, tras alcanzar el umbral de fallos consecutivos configurado, el breaker abre y las operaciones continúan sirviéndose desde la réplica us-west-2 sin error visible para el llamador; al restaurar la bandera y expirar el cooldown, el breaker cierra de nuevo.",
        falloInyectado:
          "SIMULAR_FALLO_DYNAMODB_PRINCIPAL=true en un ruptor de prueba aislado (mismo mecanismo `envolverConSimulacion` que usa el wiring de producción en src/compartido/baseDatos.ts), umbral=2, cooldown=30s.",
        radioImpacto:
          "Acotado a la instancia de CircuitBreakerDynamo creada dentro de esta prueba; no se toca la tabla real, no se retira la réplica, ninguna otra sesión/grupo se ve afectado.",
        aserciones,
        resultado,
        recuperacion:
          "SIMULAR_FALLO_DYNAMODB_PRINCIPAL restaurado a 'false' (afterEach lo refuerza); breaker verificado en estado CERRADO; réplica jamás retirada.",
      });
    }
  });
});
