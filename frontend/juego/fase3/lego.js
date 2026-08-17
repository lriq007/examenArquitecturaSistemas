if (exigirSesionGrupo()) {
  const overlay =
    document.getElementById("inicioLegoOverlay");
  const btnListo =
    document.getElementById("btnListoInicioLego");
  const contadorInicio =
    document.getElementById("contadorInicioLego");
  const timer =
    document.getElementById("timer");
  const modalFin =
    document.getElementById("modalFin");
  const formFoto =
    document.getElementById("formFotoLego");
  const inputFoto =
    document.getElementById("fotoLego");
  const sinFoto =
    document.getElementById("sinFotoLego");
  const btnGuardar =
    document.getElementById("btnGuardarLego");
  const previewWrapper =
    document.getElementById("previewFotoWrapper");
  const preview =
    document.getElementById("previewFoto");
  const errorFoto =
    document.getElementById("errorFotoLego");
  const estadoGrupos =
    document.getElementById("estadoGruposLego");
  const detalleGrupos =
    document.getElementById("detalleGruposLego");
  const modalRuleta =
    document.getElementById("modalRuleta");
  const modalPregunta =
    document.getElementById("modalPregunta");
  const btnGirar =
    document.getElementById("btnGirarRuleta");
  const resultadoRuleta =
    document.getElementById("resultadoRuleta");
  const intentosRuleta =
    document.getElementById("intentosRuleta");
  const ultimoResultado =
    document.getElementById("ultimoResultadoRuleta");
  const resultadoPregunta =
    document.getElementById("resultadoPregunta");
  const musica =
    document.getElementById("musicaLego");
  const btnMusica =
    document.getElementById("btnMusicaLego");

  let enviadoInicio = false;
  let enviadoLego = false;
  let modalFinMostrado = false;
  let fotoBase64 = "";
  let trabajoFotoId = "";

  function claveFotoLocal() {
    const grupo = datosGrupoLocal();

    return (
      "fotoLego:" +
      String(
        grupo.grupoId ||
        grupo.id ||
        grupo.codigoAcceso ||
        "actual",
      )
    );
  }

  function formatearTiempo(segundos) {
    const total = Math.max(
      0,
      Number(segundos || 0),
    );

    const minutos = Math.floor(total / 60);
    const resto = total % 60;

    return `${String(minutos).padStart(2, "0")}:${String(
      resto,
    ).padStart(2, "0")}`;
  }

  function bloquearContenido(bloqueado) {
    document
      .querySelectorAll(".blur-target-bloqueado")
      .forEach((elemento) => {
        elemento.classList.toggle(
          "f3-locked",
          bloqueado,
        );
      });

    overlay.style.display =
      bloqueado ? "flex" : "none";
  }

  function renderIdeas(bubbleMap) {
    const lista =
      document.getElementById("ideasList");
    const valores = [];

    Object.values(bubbleMap || {}).forEach(
      (valor) => {
        if (Array.isArray(valor)) {
          valor.forEach((item) => {
            if (String(item || "").trim()) {
              valores.push(
                String(item).trim(),
              );
            }
          });
        } else if (
          String(valor || "").trim()
        ) {
          valores.push(
            String(valor).trim(),
          );
        }
      },
    );

    lista.innerHTML = valores.length
      ? valores
          .slice(0, 10)
          .map(
            (idea) =>
              `<li>${escaparHtmlFase3(idea)}</li>`,
          )
          .join("")
      : "<li>No se ingresaron ideas.</li>";
  }

  function abrirModalFin() {
    if (modalFinMostrado) {
      return;
    }

    modalFinMostrado = true;
    modalFin.classList.add("visible");
  }

  function actualizarEstadoFoto() {
    const hayFoto =
      Boolean(inputFoto.files?.length) ||
      Boolean(fotoBase64);

    btnGuardar.disabled =
      !hayFoto && !sinFoto.checked;

    if (sinFoto.checked) {
      inputFoto.value = "";
      fotoBase64 = "";
      previewWrapper.classList.remove(
        "visible",
      );
    }
  }

  async function reducirFoto(archivo) {
    const dataUrl = await new Promise(
      (resolver, rechazar) => {
        const lector = new FileReader();

        lector.onload = () =>
          resolver(
            String(lector.result || ""),
          );

        lector.onerror = () =>
          rechazar(
            new Error(
              "No fue posible leer la foto",
            ),
          );

        lector.readAsDataURL(archivo);
      },
    );

    const imagen = await new Promise(
      (resolver, rechazar) => {
        const elemento = new Image();

        elemento.onload = () =>
          resolver(elemento);

        elemento.onerror = () =>
          rechazar(
            new Error(
              "La imagen no es válida",
            ),
          );

        elemento.src = dataUrl;
      },
    );

    const maximo = 960;
    const escala = Math.min(
      1,
      maximo /
        Math.max(
          imagen.width,
          imagen.height,
        ),
    );

    const canvas =
      document.createElement("canvas");

    canvas.width = Math.max(
      1,
      Math.round(imagen.width * escala),
    );

    canvas.height = Math.max(
      1,
      Math.round(imagen.height * escala),
    );

    const contexto =
      canvas.getContext("2d");

    if (!contexto) {
      throw new Error(
        "El navegador no pudo procesar la imagen",
      );
    }

    contexto.drawImage(
      imagen,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return canvas.toDataURL(
      "image/jpeg",
      0.78,
    );
  }

  async function marcarInicio() {
    if (enviadoInicio) {
      return;
    }

    enviadoInicio = true;
    btnListo.disabled = true;
    btnListo.textContent =
      "Esperando a los demás equipos...";

    try {
      const estado = await llamarApiJuego(
        "/api/fase3/listo",
        {
          method: "POST",
          body: JSON.stringify({
            etapa: "inicio_lego",
          }),
        },
      );

      renderEstado(estado);
    } catch (error) {
      enviadoInicio = false;
      btnListo.disabled = false;
      btnListo.textContent =
        "⚡ Listo para comenzar";
      mostrarErrorJuego(error);
    }
  }

  function renderEstado(estado) {
    redirigirEstadoFase3(
      estado,
      ["lego.html"],
    );

    document.getElementById(
      "desafioNombre",
    ).textContent =
      estado.grupo?.desafioNombre ||
      "Desafío no seleccionado";

    document.getElementById(
      "desafioDescripcion",
    ).textContent =
      estado.grupo?.desafioDescripcion ||
      "Aún no hay una descripción disponible.";

    renderIdeas(
      estado.grupo?.bubbleMap,
    );

    renderProgresoFase3(
      contadorInicio,
      estado.progreso?.inicioLego,
    );

    const totalInicio =
      estado.progreso?.inicioLego
        ?.totalGrupos || 1;

    const inicioCompleto =
      (
        estado.progreso?.inicioLego
          ?.completados || 0
      ) >= totalInicio;

    if (
      estado.grupo?.listoInicioF3
    ) {
      enviadoInicio = true;
      btnListo.disabled = true;
      btnListo.textContent =
        "Esperando a los demás equipos...";
    }

    if (
      inicioCompleto ||
      estado.timer?.corriendo ||
      estado.timer?.expirado
    ) {
      bloquearContenido(false);
    } else {
      bloquearContenido(true);
    }

    const segundos = Number(
      estado.timer?.segundosRestantes || 0,
    );

    timer.textContent =
      formatearTiempo(segundos);

    if (
      inicioCompleto &&
      segundos === 0 &&
      !estado.timer?.corriendo
    ) {
      abrirModalFin();
    }

    if (estado.timer?.expirado) {
      abrirModalFin();
    }

    const progreso =
      estado.progreso?.lego;

    if (progreso) {
      estadoGrupos.textContent =
        `${progreso.completados}/${progreso.totalGrupos} grupos listos`;

      detalleGrupos.textContent =
        `${progreso.conFoto} con foto · ${progreso.sinFoto} sin foto`;
    }

    intentosRuleta.textContent =
      `Intentos disponibles: ${estado.ruleta?.intentosRestantes ?? 0}/3`;

    ultimoResultado.textContent =
      estado.ruleta?.ultimoResultado
        ? `Último resultado: ${estado.ruleta.ultimoResultado}`
        : "Aún no has lanzado la ruleta.";

    if (
      (
        estado.ruleta
          ?.intentosRestantes || 0
      ) <= 0
    ) {
      btnGirar.disabled = true;
      btnGirar.textContent =
        "Sin intentos disponibles";
    }

    if (
      estado.grupo
        ?.astronautaLegoRespondida
    ) {
      document
        .querySelectorAll(
          "[data-respuesta]",
        )
        .forEach((boton) => {
          boton.disabled = true;
        });

      resultadoPregunta.textContent =
        estado.grupo
          .astronautaLegoCorrecta
          ? "Respuesta correcta. Ya recibieron 2 tokens."
          : "La respuesta ya fue registrada.";
    }

    if (
      estado.grupo?.legoCompletado
    ) {
      enviadoLego = true;
      btnGuardar.disabled = true;
      btnGuardar.textContent =
        "Esperando a los demás equipos...";
      modalFin.classList.add("visible");
    }
  }

  btnListo.addEventListener(
    "click",
    marcarInicio,
  );

  document
    .getElementById("desafioToggle")
    .addEventListener(
      "click",
      () => {
        const cuerpo =
          document.getElementById(
            "desafioBody",
          );

        const icono =
          document.getElementById(
            "desafioIcono",
          );

        const abierto =
          !cuerpo.hasAttribute("hidden");

        if (abierto) {
          cuerpo.setAttribute(
            "hidden",
            "hidden",
          );
          icono.textContent = "▼";
        } else {
          cuerpo.removeAttribute(
            "hidden",
          );
          icono.textContent = "▲";
        }
      },
    );

  inputFoto.addEventListener(
    "change",
    async () => {
      const archivo =
        inputFoto.files?.[0];

      if (!archivo) {
        fotoBase64 = "";
        actualizarEstadoFoto();
        return;
      }

      try {
        fotoBase64 =
          await reducirFoto(archivo);

        preview.src = fotoBase64;
        previewWrapper.classList.add(
          "visible",
        );

        sinFoto.checked = false;
        actualizarEstadoFoto();
      } catch (error) {
        mostrarErrorJuego(error);
      }
    },
  );

  sinFoto.addEventListener(
    "change",
    actualizarEstadoFoto,
  );

  formFoto.addEventListener(
    "submit",
    async (evento) => {
      evento.preventDefault();

      if (enviadoLego) {
        return;
      }

      const conFoto =
        Boolean(fotoBase64);

      const sinFotoMarcada =
        Boolean(sinFoto.checked);

      if (
        !conFoto &&
        !sinFotoMarcada
      ) {
        errorFoto.textContent =
          "Debes subir una foto o marcar que no pudieron subirla.";

        errorFoto.style.display =
          "block";
        return;
      }

      errorFoto.style.display = "none";
      enviadoLego = true;
      btnGuardar.disabled = true;
      btnGuardar.textContent =
        "Guardando...";

      try {
        if (conFoto) {
          const archivo = inputFoto.files?.[0];
          if (!archivo) throw new Error("Selecciona nuevamente la fotografía.");
          const inicio = await iniciarCargaFotografia(archivo);
          trabajoFotoId = inicio.trabajoId;
          localStorage.setItem("trabajoFotoLegoActual", trabajoFotoId);
          await cargarFotografiaFirmada(inicio.urlCarga, archivo);
          errorFoto.textContent = "Fotografía recibida. La estamos procesando de forma segura…";
          errorFoto.style.display = "block";
          let procesada = false;
          for (let intento = 0; intento < 10; intento += 1) {
            await new Promise((resolver) => setTimeout(resolver, 1500));
            const seguimiento = await consultarFotografia(trabajoFotoId);
            if (seguimiento.estado === "PROCESADA") { errorFoto.textContent = `¡Fotografía procesada! Trabajo ${trabajoFotoId}`; procesada = true; break; }
            if (seguimiento.estado === "FALLIDA") throw new Error("La fotografía no pudo procesarse. El profesor puede ayudar a recuperarla.");
          }
          if (!procesada) throw new Error(`La fotografía sigue recibida. Conservamos el trabajo ${trabajoFotoId}; vuelve a intentar el seguimiento antes de continuar.`);
        }

        const estado =
          await llamarApiJuego(
            "/api/fase3/lego/completar",
            {
              method: "POST",
              body: JSON.stringify({
                conFoto,
                sinFoto:
                  sinFotoMarcada,
                trabajoFotoId: conFoto ? trabajoFotoId : undefined,
              }),
            },
          );

        renderEstado(estado);
      } catch (error) {
        enviadoLego = false;
        btnGuardar.disabled = false;
        btnGuardar.textContent =
          "Guardar y continuar";
        mostrarErrorJuego(error);
      }
    },
  );

  document
    .getElementById("btnAbrirRuleta")
    .addEventListener(
      "click",
      () =>
        modalRuleta.classList.add(
          "visible",
        ),
    );

  document
    .getElementById("btnCerrarRuleta")
    .addEventListener(
      "click",
      () =>
        modalRuleta.classList.remove(
          "visible",
        ),
    );

  btnGirar.addEventListener(
    "click",
    async () => {
      btnGirar.disabled = true;
      btnGirar.textContent =
        "Girando...";

      try {
        const resultado =
          await llamarApiJuego(
            "/api/fase3/ruleta/girar",
            {
              method: "POST",
            },
          );

        resultadoRuleta.textContent =
          `${resultado.resultado.emoji} ${resultado.resultado.titulo}: ${resultado.resultado.descripcion}`;

        intentosRuleta.textContent =
          `Intentos disponibles: ${resultado.intentosRestantes}/3`;

        ultimoResultado.textContent =
          resultado.resultado.titulo;

        btnGirar.disabled =
          resultado.intentosRestantes <=
          0;

        btnGirar.textContent =
          btnGirar.disabled
            ? "Sin intentos disponibles"
            : "Lanzar ruleta";
      } catch (error) {
        btnGirar.disabled = false;
        btnGirar.textContent =
          "Lanzar ruleta";
        mostrarErrorJuego(error);
      }
    },
  );

  document
    .getElementById("btnAbrirPregunta")
    .addEventListener(
      "click",
      () =>
        modalPregunta.classList.add(
          "visible",
        ),
    );

  document
    .getElementById("btnCerrarPregunta")
    .addEventListener(
      "click",
      () =>
        modalPregunta.classList.remove(
          "visible",
        ),
    );

  document
    .querySelectorAll(
      "[data-respuesta]",
    )
    .forEach((boton) => {
      boton.addEventListener(
        "click",
        async () => {
          document
            .querySelectorAll(
              "[data-respuesta]",
            )
            .forEach((item) => {
              item.disabled = true;
            });

          try {
            const resultado =
              await llamarApiJuego(
                "/api/fase3/astronauta/responder",
                {
                  method: "POST",
                  body: JSON.stringify({
                    alternativa:
                      boton.dataset
                        .respuesta,
                  }),
                },
              );

            resultadoPregunta.textContent =
              resultado.correcta
                ? "¡Correcto! Ganaron 2 tokens."
                : "Respuesta registrada. La alternativa correcta era B.";
          } catch (error) {
            document
              .querySelectorAll(
                "[data-respuesta]",
              )
              .forEach((item) => {
                item.disabled = false;
              });

            mostrarErrorJuego(error);
          }
        },
      );
    });

  btnMusica.addEventListener(
    "click",
    () => {
      if (musica.paused) {
        musica
          .play()
          .catch(() => {});
        btnMusica.textContent = "🔊";
      } else {
        musica.pause();
        btnMusica.textContent = "🔇";
      }
    },
  );

  crearPollingFase3(
    renderEstado,
    1500,
  );
}
