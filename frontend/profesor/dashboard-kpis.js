if (exigirAccesoProfesor()) {
  const parametros =
    new URLSearchParams(window.location.search);

  const sesionId = parametros.get("id");

  const mensaje =
    document.getElementById("mensaje");

  const contenido =
    document.getElementById("contenidoKpis");

  document
    .getElementById("cerrarProfesor")
    .addEventListener("click", (evento) => {
      evento.preventDefault();
      cerrarAccesoProfesor();
    });

  if (!sesionId) {
    window.location.replace("sesiones.html");
  } else {
    cargarKpis();
  }

  function numero(valor, decimales = 1) {
    if (valor === null || valor === undefined) {
      return "Sin datos";
    }

    return Number(valor).toLocaleString(
      "es-CL",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimales,
      },
    );
  }

  function porcentaje(valor) {
    if (valor === null || valor === undefined) {
      return "Sin datos";
    }

    return `${numero(valor, 1)}%`;
  }

  function tiempo(valor) {
    if (valor === null || valor === undefined) {
      return "Sin datos";
    }

    const total = Math.max(
      0,
      Math.round(Number(valor)),
    );

    const minutos = Math.floor(total / 60);
    const segundos = total % 60;

    return `${minutos}:${String(segundos).padStart(2, "0")}`;
  }

  function limitarPorcentaje(valor) {
    if (valor === null || valor === undefined) {
      return 0;
    }

    return Math.min(
      100,
      Math.max(0, Number(valor)),
    );
  }

  function pintarBarra(idBarra, idValor, valor) {
    const barra =
      document.getElementById(idBarra);

    const texto =
      document.getElementById(idValor);

    barra.style.width =
      `${limitarPorcentaje(valor)}%`;

    texto.textContent =
      porcentaje(valor);
  }

  function renderPeer(criterios) {
    const contenedor =
      document.getElementById("criteriosPeer");

    const elementos = [
      ["Claridad", criterios?.claridad],
      ["Creatividad", criterios?.creatividad],
      ["Viabilidad", criterios?.viabilidad],
      ["Trabajo en equipo", criterios?.equipo],
      ["Presentación", criterios?.presentacion],
    ];

    const existenDatos =
      elementos.some(([, valor]) =>
        valor !== null &&
        valor !== undefined
      );

    if (!existenDatos) {
      contenedor.innerHTML = `
        <div class="sin-datos">
          Aún no existen evaluaciones Peer
          para esta sesión.
        </div>
      `;
      return;
    }

    contenedor.innerHTML =
      elementos
        .map(([nombre, valor]) => {
          const porcentajeBarra =
            valor === null ||
            valor === undefined
              ? 0
              : (Number(valor) / 5) * 100;

          return `
            <div class="criterio">
              <div class="criterio-encabezado">
                <span>${nombre}</span>
                <strong>
                  ${
                    valor === null ||
                    valor === undefined
                      ? "Sin datos"
                      : `${numero(valor, 2)} / 5`
                  }
                </strong>
              </div>

              <div class="barra">
                <div
                  class="barra-fill"
                  style="width: ${limitarPorcentaje(
                    porcentajeBarra,
                  )}%"
                ></div>
              </div>
            </div>
          `;
        })
        .join("");
  }

  function render(resultado) {
    document.getElementById(
      "subtituloSesion",
    ).textContent =
      `Sesión ${resultado.sesionId}`;

    document.getElementById(
      "totalAlumnos",
    ).textContent =
      numero(resultado.totalAlumnos, 0);

    document.getElementById(
      "totalGrupos",
    ).textContent =
      numero(resultado.totalGrupos, 0);

    document.getElementById(
      "promedioTokens",
    ).textContent =
      numero(resultado.promedioTokens, 1);

    document.getElementById(
      "porcentajeSopa",
    ).textContent =
      porcentaje(resultado.porcentajeSopa);

    document.getElementById(
      "tiempoSopa",
    ).textContent =
      tiempo(resultado.tiempoPromedioSopa);

    document.getElementById(
      "porcentajeLego",
    ).textContent =
      porcentaje(resultado.porcentajeLego);

    document.getElementById(
      "porcentajeAstronauta",
    ).textContent =
      porcentaje(resultado.porcentajeAstronauta);

    document.getElementById(
      "promedioPeer",
    ).textContent =
      resultado.promedioPeer === null ||
      resultado.promedioPeer === undefined
        ? "Sin datos"
        : `${numero(resultado.promedioPeer, 2)} / 5`;

    document.getElementById(
      "totalEvaluaciones",
    ).textContent =
      `${numero(
        resultado.totalEvaluaciones,
        0,
      )} evaluaciones`;

    pintarBarra(
      "barraSopa",
      "valorBarraSopa",
      resultado.porcentajeSopa,
    );

    pintarBarra(
      "barraLego",
      "valorBarraLego",
      resultado.porcentajeLego,
    );

    pintarBarra(
      "barraAstronauta",
      "valorBarraAstronauta",
      resultado.porcentajeAstronauta,
    );

    renderPeer(resultado.criteriosPeer);

    document.getElementById(
      "verificadoEn",
    ).textContent =
      resultado.verificadoEn
        ? `(${new Date(
            resultado.verificadoEn,
          ).toLocaleString("es-CL", {
            dateStyle: "short",
            timeStyle: "short",
          })})`
        : "";

    contenido.hidden = false;
  }

  async function cargarKpis() {
    // Nunca se mezcla un resultado previo con un error: el
    // contenido permanece oculto hasta confirmar un KPI actual.
    contenido.hidden = true;

    try {
      mensaje.className = "mensaje";
      mensaje.textContent = "";

      const resultado =
        await llamarApiProfesor(
          `/api/analytics/kpis/${encodeURIComponent(
            sesionId,
          )}`,
        );

      render(resultado);
    } catch (error) {
      contenido.hidden = true;
      mensaje.textContent = error.message;
      mensaje.className =
        "mensaje visible error";
    }
  }
}

async function cargarUltimaActualizacion() {
  const elemento =
    document.getElementById("ultimaActualizacion");

  if (!elemento) return;

  try {
    const respuesta = await fetch(
      `../datos/ultima-actualizacion.json?t=${Date.now()}`,
      { cache: "no-store" },
    );

    if (!respuesta.ok) {
      throw new Error("Sin registro");
    }

    const datos = await respuesta.json();

    const fecha = new Date(datos.actualizadoEn);

    elemento.textContent =
      `Última actualización del Data Lake: ${
        fecha.toLocaleString("es-CL", {
          dateStyle: "short",
          timeStyle: "short",
        })
      }`;
  } catch {
    elemento.textContent =
      "Última actualización del Data Lake: sin información";
  }
}

cargarUltimaActualizacion();
