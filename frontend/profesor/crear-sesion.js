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
    // Si la fila viene con delimitador de punto y coma en una sola clave (CSV de Excel en español)
    const clavesOriginales = Object.keys(fila);
    if (clavesOriginales.length === 1 && clavesOriginales[0].includes(";")) {
      const cabeceras = clavesOriginales[0].split(";").map((c) => c.trim().toLowerCase());
      const valores = String(fila[clavesOriginales[0]] ?? "").split(";").map((v) => v.trim());
      const filaTransformada = {};
      cabeceras.forEach((cab, i) => {
        filaTransformada[cab] = valores[i] ?? "";
      });
      return normalizarFila(filaTransformada);
    }

    const normalizarTexto = (t) =>
      String(t || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();

    const obtener = (...claves) => {
      const clavesNorm = claves.map(normalizarTexto);
      for (const clave of clavesNorm) {
        const encontrada = Object.keys(fila).find(
          (columna) => normalizarTexto(columna) === clave || normalizarTexto(columna).includes(clave),
        );

        if (encontrada && fila[encontrada] !== undefined && fila[encontrada] !== null) {
          const val = String(fila[encontrada]).trim();
          if (val) return val;
        }
      }

      return "";
    };

    const nombreCompleto = obtener("nombre completo", "estudiante", "alumno");
    let nombre = obtener("nombre", "nombres", "first name", "name");
    let apellidoPaterno = obtener("apellido paterno", "apellidopaterno", "paterno", "apellido 1", "last name", "apellido");
    let apellidoMaterno = obtener("apellido materno", "apellidomaterno", "materno", "apellido 2");

    // Si viene solo "nombre completo" y no vienen separados
    if (nombreCompleto && !nombre && !apellidoPaterno) {
      const partes = nombreCompleto.split(/\s+/);
      nombre = partes[0] || "";
      apellidoPaterno = partes.slice(1).join(" ") || "";
    }

    return {
      correo: obtener("correo institucional", "correo electronico", "correo", "email", "mail", "e-mail"),
      rut: obtener("rut", "identificacion", "id", "documento", "dni"),
      nombre: nombre || "Estudiante",
      apellidoPaterno: apellidoPaterno || "",
      apellidoMaterno: apellidoMaterno || "",
      carrera: obtener("carrera", "programa", "facultad", "major") || "Ingeniería / Negocios",
    };
  }

  function parsearCsvTexto(texto) {
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lineas.length < 2) return [];
    const separador = lineas[0].includes(";") ? ";" : lineas[0].includes("\t") ? "\t" : ",";
    const cabeceras = lineas[0].split(separador).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    const filas = [];
    for (let i = 1; i < lineas.length; i += 1) {
      const valores = lineas[i].split(separador).map((v) => v.trim().replace(/^["']|["']$/g, ""));
      const fila = {};
      cabeceras.forEach((cab, idx) => {
        fila[cab] = valores[idx] ?? "";
      });
      filas.push(fila);
    }
    return filas;
  }

  archivoExcel.addEventListener(
    "change",
    async (evento) => {
      const archivo = evento.target.files[0];

      if (!archivo) {
        alumnos = [];
        nombreArchivo.textContent = "Ningún archivo seleccionado";
        renderPreview();
        return;
      }

      nombreArchivo.textContent = archivo.name;

      try {
        let filas = [];

        if (typeof XLSX !== "undefined") {
          const contenido = await archivo.arrayBuffer();
          const libro = XLSX.read(contenido, {
            type: "array",
            raw: false,
          });

          const hoja = libro.Sheets[libro.SheetNames[0]];
          filas = XLSX.utils.sheet_to_json(hoja, {
            defval: "",
          });
        } else {
          // Fallback a parser de texto CSV si XLSX no está disponible
          const texto = await archivo.text();
          filas = parsearCsvTexto(texto);
        }

        alumnos = filas
          .map(normalizarFila)
          .filter(
            (alumno) =>
              (alumno.nombre && alumno.nombre !== "Estudiante") ||
              alumno.correo ||
              alumno.rut,
          );

        if (!alumnos.length) {
          throw new Error(
            "El archivo no contiene filas con datos válidos de estudiantes.",
          );
        }

        mostrarMensaje(
          `${alumnos.length} estudiantes cargados correctamente desde ${archivo.name}.`,
          "exito",
        );

        renderPreview();
      } catch (error) {
        alumnos = [];
        renderPreview();

        mostrarMensaje(
          `Error al leer el archivo: ${error.message || "Formato no compatible"}`,
          "error",
        );
      }
    },
  );

  const btnCargarEjemplo = document.getElementById("btnCargarEjemplo");
  const btnDescargarPlantilla = document.getElementById("btnDescargarPlantilla");

  if (btnCargarEjemplo) {
    btnCargarEjemplo.addEventListener("click", () => {
      alumnos = [
        { correo: "matias.gonzalez@udd.cl", rut: "20.123.456-7", nombre: "Matías", apellidoPaterno: "González", apellidoMaterno: "Pérez", carrera: "Ingeniería Comercial" },
        { correo: "sofia.munoz@udd.cl", rut: "20.234.567-8", nombre: "Sofía", apellidoPaterno: "Muñoz", apellidoMaterno: "Rojas", carrera: "Diseño" },
        { correo: "lucas.silva@udd.cl", rut: "20.345.678-9", nombre: "Lucas", apellidoPaterno: "Silva", apellidoMaterno: "Castro", carrera: "Ingeniería Civil" },
        { correo: "valentina.torres@udd.cl", rut: "20.456.789-0", nombre: "Valentina", apellidoPaterno: "Torres", apellidoMaterno: "López", carrera: "Periodismo" },
        { correo: "diego.morales@udd.cl", rut: "20.567.890-1", nombre: "Diego", apellidoPaterno: "Morales", apellidoMaterno: "Soto", carrera: "Arquitectura" },
        { correo: "camila.herrera@udd.cl", rut: "20.678.901-2", nombre: "Camila", apellidoPaterno: "Herrera", apellidoMaterno: "Díaz", carrera: "Psicología" },
        { correo: "benjamin.castro@udd.cl", rut: "20.789.012-3", nombre: "Benjamín", apellidoPaterno: "Castro", apellidoMaterno: "Vargas", carrera: "Ingeniería Comercial" },
        { correo: "isidora.araya@udd.cl", rut: "20.890.123-4", nombre: "Isidora", apellidoPaterno: "Araya", apellidoMaterno: "Fuentes", carrera: "Publicidad" },
      ];
      archivoExcel.removeAttribute("required");
      nombreArchivo.textContent = "Nómina de ejemplo cargada (8 estudiantes)";
      mostrarMensaje("8 estudiantes de prueba cargados correctamente.", "exito");
      renderPreview();
    });
  }

  if (btnDescargarPlantilla) {
    btnDescargarPlantilla.addEventListener("click", () => {
      const csvContent = "data:text/csv;charset=utf-8," +
        "RUT,Nombre,Apellido Paterno,Apellido Materno,Correo,Carrera\n" +
        "20.123.456-7,Matías,González,Pérez,matias.gonzalez@udd.cl,Ingeniería Comercial\n" +
        "20.234.567-8,Sofía,Muñoz,Rojas,sofia.munoz@udd.cl,Diseño\n" +
        "20.345.678-9,Lucas,Silva,Castro,lucas.silva@udd.cl,Ingeniería Civil\n" +
        "20.456.789-0,Valentina,Torres,López,valentina.torres@udd.cl,Periodismo\n" +
        "20.567.890-1,Diego,Morales,Soto,diego.morales@udd.cl,Arquitectura\n" +
        "20.678.901-2,Camila,Herrera,Díaz,camila.herrera@udd.cl,Psicología\n";
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", "plantilla_estudiantes.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

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

      function generarUUID() {
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          return crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      try {
        const claveSolicitud = "solicitudCrearSesiones";
        const solicitudId = localStorage.getItem(claveSolicitud) || generarUUID();
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
