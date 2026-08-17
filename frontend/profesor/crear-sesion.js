if (exigirAccesoProfesor()) {
  const formulario =
    document.getElementById("formCrearSesion");
  const archivoExcel =
    document.getElementById("archivoExcel");
  const nombreArchivo =
    document.getElementById("nombreArchivo");
  const previewCard =
    document.getElementById("previewCard");
  const previewContenido =
    document.getElementById("previewContenido");
  const personalizado =
    document.getElementById("personalizado");
  const botonCrear =
    document.getElementById("botonCrear");
  const mensaje =
    document.getElementById("mensaje");
  const codesCard =
    document.getElementById("codesCard");
  const sesionesCreadas =
    document.getElementById("sesionesCreadas");

  let alumnos = [];

  const correoGuardado =
    localStorage.getItem("correoProfesor");

  if (correoGuardado) {
    document.getElementById("correoProfesor").value =
      correoGuardado;
  }

  document
    .getElementById("cerrarProfesor")
    .addEventListener("click", (evento) => {
      evento.preventDefault();
      cerrarAccesoProfesor();
    });

  function mostrarMensaje(texto, tipo) {
    mensaje.textContent = texto;
    mensaje.className = `mensaje visible ${tipo}`;
  }

  function modoActual() {
    return (
      document.querySelector(
        'input[name="modoCreacion"]:checked',
      )?.value || "recomendado"
    );
  }

  function gruposRecomendados(total) {
    return Math.max(1, Math.ceil(total / 8));
  }

  function alumnosSesion(total, sesiones, indice) {
    return (
      Math.floor(total / sesiones) +
      (indice < total % sesiones ? 1 : 0)
    );
  }

  function actualizarPersonalizado() {
    personalizado.classList.toggle(
      "visible",
      modoActual() === "personalizado",
    );
  }

  function renderPreview() {
    actualizarPersonalizado();

    if (!alumnos.length) {
      previewCard.classList.remove("visible");
      return;
    }

    previewCard.classList.add("visible");
    const modo = modoActual();

    if (modo === "recomendado") {
      previewContenido.innerHTML = `
        <div class="preview-grid">
          <div class="preview-box">
            <strong>${alumnos.length}</strong>
            <span>Total de estudiantes cargados</span>
          </div>

          <div class="preview-box">
            <strong>${gruposRecomendados(alumnos.length)}</strong>
            <span>Grupos que se crearán</span>
          </div>

          <div class="preview-box">
            <strong>1</strong>
            <span>Sesión única</span>
          </div>
        </div>
      `;
    }

    if (modo === "dividir_dos") {
      const sala1 = Math.ceil(alumnos.length / 2);
      const sala2 = alumnos.length - sala1;

      previewContenido.innerHTML = `
        <div class="preview-grid">
          <div class="preview-box">
            <strong>Sala 1</strong>
            <span>${sala1} estudiantes asignados</span>
            <span>${gruposRecomendados(sala1)} grupos</span>
          </div>

          <div class="preview-box">
            <strong>Sala 2</strong>
            <span>${sala2} estudiantes asignados</span>
            <span>${gruposRecomendados(sala2)} grupos</span>
          </div>

          <div class="preview-box">
            <strong>2</strong>
            <span>Sesiones independientes</span>
          </div>
        </div>
      `;
    }

    if (modo === "personalizado") {
      const cantidad = Math.max(
        1,
        Number(
          document.getElementById("cantidadSesiones").value,
        ),
      );

      const grupos = Math.max(
        1,
        Number(
          document.getElementById("gruposPorSesion").value,
        ),
      );

      let cajas = "";

      for (let indice = 0; indice < cantidad; indice += 1) {
        cajas += `
          <div class="preview-box">
            <strong>Sesión ${indice + 1}</strong>
            <span>
              ${alumnosSesion(alumnos.length, cantidad, indice)}
              estudiantes
            </span>
            <span>${grupos} grupos</span>
          </div>
        `;
      }

      previewContenido.innerHTML = `
        <div class="preview-grid">${cajas}</div>
      `;
    }
  }

  function normalizarFila(fila) {
    const obtener = (...claves) => {
      for (const clave of claves) {
        const encontrada = Object.keys(fila).find(
          (columna) =>
            columna.trim().toLowerCase() ===
            clave.toLowerCase(),
        );

        if (encontrada) {
          return String(fila[encontrada] ?? "").trim();
        }
      }

      return "";
    };

    return {
      correo: obtener("Correo", "Email"),
      rut: obtener("RUT", "Rut"),
      nombre: obtener("Nombre", "Nombres"),
      apellidoPaterno: obtener(
        "Apellido Paterno",
        "ApellidoPaterno",
      ),
      apellidoMaterno: obtener(
        "Apellido Materno",
        "ApellidoMaterno",
      ),
      carrera: obtener("Carrera"),
    };
  }

  archivoExcel.addEventListener(
    "change",
    async (evento) => {
      const archivo = evento.target.files[0];

      if (!archivo) {
        alumnos = [];
        nombreArchivo.textContent =
          "Ningún archivo seleccionado";
        renderPreview();
        return;
      }

      nombreArchivo.textContent = archivo.name;

      try {
        const contenido = await archivo.arrayBuffer();
        const libro = XLSX.read(contenido, {
          type: "array",
        });

        const hoja = libro.Sheets[libro.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(hoja, {
          defval: "",
        });

        alumnos = filas
          .map(normalizarFila)
          .filter(
            (alumno) =>
              alumno.nombre ||
              alumno.correo ||
              alumno.rut,
          );

        if (!alumnos.length) {
          throw new Error(
            "El archivo no contiene estudiantes válidos.",
          );
        }

        mostrarMensaje(
          `${alumnos.length} estudiantes cargados correctamente.`,
          "exito",
        );

        renderPreview();
      } catch (error) {
        alumnos = [];
        renderPreview();

        mostrarMensaje(
          error.message || "No fue posible leer el archivo.",
          "error",
        );
      }
    },
  );

  document
    .querySelectorAll('input[name="modoCreacion"]')
    .forEach((radio) =>
      radio.addEventListener("change", renderPreview),
    );

  [
    "cantidadSesiones",
    "gruposPorSesion",
  ].forEach((id) => {
    document
      .getElementById(id)
      .addEventListener("input", renderPreview);
  });

  formulario.addEventListener(
    "submit",
    async (evento) => {
      evento.preventDefault();

      if (!alumnos.length) {
        mostrarMensaje(
          "Debes cargar el archivo de estudiantes.",
          "error",
        );
        return;
      }

      const correoProfesor = document
        .getElementById("correoProfesor")
        .value.trim()
        .toLowerCase();

      botonCrear.disabled = true;
      botonCrear.textContent = "Creando...";

      try {
      const claveSolicitud = "solicitudCrearSesiones";
      const solicitudId = localStorage.getItem(claveSolicitud) || crypto.randomUUID();
      localStorage.setItem(claveSolicitud, solicitudId);
      const resultado = await llamarApiProfesor(
          "/api/profesor/sesiones",
          {
            method: "POST",
          body: JSON.stringify({
              solicitudId,
              nombre: document
                .getElementById("nombreSesion")
                .value.trim(),
              correoProfesor,
              facultad: document
                .getElementById("facultad")
                .value,
              modoCreacion: modoActual(),
              cantidadSesiones: Number(
                document.getElementById("cantidadSesiones")
                  .value,
              ),
              gruposPorSesion: Number(
                document.getElementById("gruposPorSesion")
                  .value,
              ),
              alumnos,
            }),
          },
      );
      localStorage.removeItem(claveSolicitud);

        localStorage.setItem(
          "correoProfesor",
          correoProfesor,
        );

        renderSesionesCreadas(resultado.sesiones);
        codesCard.classList.add("visible");
        codesCard.scrollIntoView({
          behavior: "smooth",
        });

        mostrarMensaje(
          "Sesión creada correctamente.",
          "exito",
        );
      } catch (error) {
        mostrarMensaje(error.message, "error");
      } finally {
        botonCrear.disabled = false;
        botonCrear.textContent = "Crear sesión";
      }
    },
  );

  function renderSesionesCreadas(sesiones) {
    sesionesCreadas.innerHTML = sesiones
      .map(
        (sesion) => `
          <h3 style="margin-top: 20px;">
            ${sesion.nombre}
          </h3>

          <table class="codes-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Código de acceso</th>
                <th>Integrantes</th>
              </tr>
            </thead>

            <tbody>
              ${sesion.grupos
                .map(
                  (grupo) => `
                    <tr>
                      <td>${grupo.nombreGrupo}</td>
                      <td class="codigo">
                        ${grupo.codigoAcceso}
                      </td>
                      <td>
                        ${
                          grupo.integrantes.length
                            ? `<ul class="lista-integrantes">
                                ${grupo.integrantes
                                  .map(
                                    (alumno) => `
                                      <li>
                                        ${alumno.nombre}
                                        ${alumno.apellidoPaterno}
                                        ${alumno.apellidoMaterno}
                                      </li>
                                    `,
                                  )
                                  .join("")}
                              </ul>`
                            : "Sin alumnos asignados"
                        }
                      </td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        `,
      )
      .join("");
  }

  renderPreview();
}
