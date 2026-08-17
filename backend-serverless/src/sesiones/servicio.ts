import { ErrorAplicacion } from "../compartido/respuestas.js";
import type { RepositorioSesiones } from "./repositorio.js";

export async function obtenerSesionActual(
  grupoSub: string,
  repositorio: RepositorioSesiones,
) {
  const vinculo = await repositorio.buscarVinculoGrupo(grupoSub);
  if (!vinculo) {
    throw new ErrorAplicacion("Acceso no autorizado", 403, "ALCANCE_INVALIDO");
  }
  const { sesionId, grupoId } = vinculo;
  const [sesion, grupo] = await Promise.all([
    repositorio.buscarSesion(sesionId),
    repositorio.buscarGrupo(sesionId, grupoId),
  ]);

  if (!sesion || !grupo) {
    throw new ErrorAplicacion("No se encontró la sesión o el grupo", 404, "CONTEXTO_NO_ENCONTRADO");
  }

  return {
    ok: true,
    sesion,
    grupo,
  };
}
