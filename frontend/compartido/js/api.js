const API_URL = 'https://qu5o7y6hk0.execute-api.us-east-1.amazonaws.com';

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

async function iniciarCargaFotografia(archivo) {
  return llamarApi("/api/fotografias", {
    method: "POST",
    body: JSON.stringify({ mime: archivo.type, tamano: archivo.size }),
  });
}

async function cargarFotografiaFirmada(urlCarga, archivo) {
  const respuesta = await fetch(urlCarga, {
    method: "PUT",
    headers: { "Content-Type": archivo.type, "x-amz-server-side-encryption": "AES256" },
    body: archivo,
  });
  if (!respuesta.ok) throw new Error("No fue posible entregar la fotografía de forma segura.");
}

function consultarFotografia(trabajoId) {
  return llamarApi(`/api/fotografias/${encodeURIComponent(trabajoId)}`);
}

function consultarFotografiaProfesor(trabajoId, sesionId) {
  return llamarApi(`/api/profesor/fotografias/${encodeURIComponent(trabajoId)}?sesionId=${encodeURIComponent(sesionId)}`);
}

function reintentarFotografiaProfesor(trabajoId, sesionId, archivo) {
  return llamarApi(`/api/profesor/fotografias/${encodeURIComponent(trabajoId)}/reintento`, {
    method: "POST",
    body: JSON.stringify({ sesionId, mime: archivo.type, tamano: archivo.size }),
  });
}
