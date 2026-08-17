const API_URL = localStorage.getItem("urlApi") || "";

async function llamarApi(ruta, opciones = {}) {
  const token = localStorage.getItem("tokenAcceso");

  const headers = {
    "Content-Type": "application/json",
    ...(opciones.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const respuesta = await fetch(`${API_URL}${ruta}`, {
    ...opciones,
    headers,
  });

  let datos;

  try {
    datos = await respuesta.json();
  } catch {
    datos = {
      error: "El servidor devolvió una respuesta inválida.",
    };
  }

  if (!respuesta.ok) {
    throw new Error(
      datos.error ||
      datos.mensaje ||
      "Ocurrió un error al comunicarse con el servidor."
    );
  }

  return datos;
}

function guardarSesionGrupo(resultado, codigo) {
  localStorage.setItem("tokenAcceso", resultado.token);
  localStorage.setItem("sesionId", String(resultado.sesionId));
  localStorage.setItem("codigoGrupo", codigo.trim().toUpperCase());
  localStorage.setItem("grupoActual", JSON.stringify(resultado.grupo));
}

function obtenerGrupoGuardado() {
  const grupo = localStorage.getItem("grupoActual");

  if (!grupo) return null;

  try {
    return JSON.parse(grupo);
  } catch {
    localStorage.removeItem("grupoActual");
    return null;
  }
}

function cerrarSesionGrupo() {
  localStorage.removeItem("tokenAcceso");
  localStorage.removeItem("sesionId");
  localStorage.removeItem("codigoGrupo");
  localStorage.removeItem("grupoActual");
}
