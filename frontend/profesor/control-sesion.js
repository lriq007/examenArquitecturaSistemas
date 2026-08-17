if (exigirAccesoProfesor()) {
  const parametros =
    new URLSearchParams(window.location.search);
  const sesionId = parametros.get("id");

  let estadoActual = null;
  let intervalo = null;

  if (!sesionId) {
    window.location.replace("sesiones.html");
  } else {
    document
      .querySelectorAll("[data-accion]")
      .forEach((boton) => {
        boton.addEventListener("click", () =>
          ejecutarAccion(boton.dataset.accion),
        );
      });

    cargarControl();
    intervalo = setInterval(cargarControl, 5000);
    document.getElementById("btnReintentarFoto").addEventListener("click", reintentarFoto);
  }

  function formatoTiempo(segundos) {
    const valor = Math.max(0, Number(segundos || 0));
    const minutos = Math.floor(valor / 60);
    const resto = valor % 60;

    return `${String(minutos).padStart(2, "0")}:${String(
      resto,
    ).padStart(2, "0")}`;
  }

  function habilidadPorFase(fase) {
    if (fase.startsWith("f1")) return "f1";
    if (fase.startsWith("f2") || fase === "mapa_f2_empatia") {
      return "f2";
    }
    if (
      fase.startsWith("f3") ||
      fase === "mapa_f3_creatividad"
    ) {
      return "f3";
    }
    if (
      fase.startsWith("f4") ||
      fase === "mapa_f4_final"
    ) {
      return "f4";
    }
    if (fase.startsWith("f5")) return "f5";
    return "f6";
  }

  function renderEstado(resultado) {
    estadoActual = resultado;
    const { sesion, grupos } = resultado;

    document.getElementById("nombreSesion").textContent =
      sesion.nombre;
    document.getElementById("faseEtiqueta").textContent =
      sesion.fase;
    document.getElementById("timerGrande").textContent =
      formatoTiempo(sesion.segundosRestantes);
    document.getElementById("totalGrupos").textContent =
      String(sesion.totalGrupos);
    document.getElementById("timerEstado").textContent =
      sesion.timerCorriendo ? "En ejecución" : "Detenido";

    const listos = grupos.filter((grupo) => grupo.listo).length;

    document.getElementById("gruposListos").textContent =
      `${listos}/${grupos.length}`;

    document
      .querySelectorAll(".paso")
      .forEach((paso) =>
        paso.classList.toggle(
          "activo",
          paso.dataset.habilidad ===
            habilidadPorFase(sesion.fase),
        ),
      );

    document.getElementById("tablaCodigos").innerHTML =
      grupos
        .map(
          (grupo) => `
            <tr>
              <td>${grupo.nombreGrupo}</td>
              <td class="codigo">${grupo.codigoAcceso}</td>
            </tr>
          `,
        )
        .join("");

    document.getElementById("tablaVerGrupos").innerHTML =
      grupos
        .map(
          (grupo) => `
            <tr>
              <td>${grupo.nombreGrupo}</td>
              <td class="codigo">${grupo.codigoAcceso}</td>
              <td>${grupo.tokens}</td>
              <td>
                <a
                  class="btn-ver"
                  href="../acceso/registro.html?codigo=${encodeURIComponent(
                    grupo.codigoAcceso,
                  )}"
                  target="_blank"
                >
                  Ver grupo
                </a>
              </td>
            </tr>
          `,
        )
        .join("");

    document.getElementById(
      "tablaEstadoGrupos",
    ).innerHTML = grupos
      .map(
        (grupo) => `
          <tr>
            <td>${grupo.nombreGrupo}</td>
            <td>${grupo.tokens}</td>
            <td class="${
              grupo.listo ? "estado-ok" : "estado-no"
            }">
              ${grupo.listo ? "✅" : "—"}
            </td>
            <td>${grupo.temaElegido || "—"}</td>
            <td>${grupo.desafioNombre || "—"}</td>
            <td>${grupo.legoCompletado ? "✅" : "❌"}</td>
            <td>${grupo.pitchCompletado ? "✅" : "❌"}</td>
          </tr>
        `,
      )
      .join("");

    const selector = document.getElementById("trabajoFotoId");
    selector.innerHTML = '<option value="">Selecciona un grupo con fotografía</option>' + grupos.filter((g) => g.trabajoFotoId).map((g) => `<option value="${g.trabajoFotoId}">${g.nombreGrupo} · ${g.trabajoFotoId}</option>`).join("");
  }

  async function cargarControl() {
    try {
      const resultado = await llamarApiProfesor(
        `/api/profesor/sesiones/${encodeURIComponent(
          sesionId,
        )}`,
      );

      renderEstado(resultado);
      document
        .getElementById("errorControl")
        .classList.remove("visible");
    } catch (error) {
      const contenedor =
        document.getElementById("errorControl");

      contenedor.textContent = error.message;
      contenedor.classList.add("visible");
    }
  }

  async function ejecutarAccion(accion) {
    try {
      const resultado = await llamarApiProfesor(
        `/api/profesor/sesiones/${encodeURIComponent(
          sesionId,
        )}/acciones`,
        {
          method: "POST",
          body: JSON.stringify({ accion }),
        },
      );

      renderEstado(resultado);
    } catch (error) {
      const contenedor =
        document.getElementById("errorControl");

      contenedor.textContent = error.message;
      contenedor.classList.add("visible");
    }
  }

  async function reintentarFoto() {
    const trabajoId = document.getElementById("trabajoFotoId").value;
    const archivo = document.getElementById("archivoReintentoFoto").files?.[0];
    const estado = document.getElementById("estadoReintentoFoto");
    if (!trabajoId) { estado.textContent = "Selecciona un grupo con fotografía fallida."; return; }
    if (!archivo || !["image/jpeg", "image/png"].includes(archivo.type) || archivo.size <= 0 || archivo.size > 25 * 1024 * 1024) { estado.textContent = "Selecciona JPEG/PNG de hasta 25 MB."; return; }
    try {
      const resultado = await reintentarFotografiaProfesor(trabajoId, sesionId, archivo);
      await cargarFotografiaFirmada(resultado.urlCarga, archivo);
      estado.textContent = `Fotografía recibida; siguiendo trabajo ${trabajoId}…`;
      for (let i = 0; i < 10; i += 1) {
        await new Promise((resolver) => setTimeout(resolver, 1500));
        const seguimiento = await consultarFotografiaProfesor(trabajoId, sesionId);
        estado.textContent = `${trabajoId}: ${seguimiento.estado}`;
        if (seguimiento.estado === "PROCESADA" || seguimiento.estado === "FALLIDA") return;
      }
      estado.textContent = `${trabajoId}: RECIBIDA; continúa visible para seguimiento.`;
    } catch (error) { estado.textContent = error.message; }
  }

  window.addEventListener("beforeunload", () => {
    if (intervalo) clearInterval(intervalo);
  });
}
