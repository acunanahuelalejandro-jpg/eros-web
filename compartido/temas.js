/* Sistema común de temas. Solo se aceptan nombres incluidos en esta lista. */
(() => {
  "use strict";

  const temas = Object.freeze({
    eros: {
      fondo: "radial-gradient(ellipse at 18% 12%, #ffe7e8 0, transparent 36%), radial-gradient(ellipse at 90% 86%, #e3f1f7 0, transparent 34%), #fff8f5", base: "#fff8f5",
      tarjeta: "#fffdfb", principal: "#8b3d52", secundario: "#dcecf5",
      texto: "#302b31", textoSuave: "#665f67", borde: "#eadfe0",
      sombra: "0 18px 50px rgba(75,48,57,.12)", corazones: "#a9445d",
      acentoClaro: "#ffe9eb", botonTexto: "#ffffff", colorScheme: "light"
    },
    dorado: {
      fondo: "radial-gradient(ellipse at 12% 10%, #fff0ca 0, transparent 36%), radial-gradient(ellipse at 92% 84%, #f8e8c8 0, transparent 34%), #fffaf0", base: "#fffaf0",
      tarjeta: "#fffdf7", principal: "#76502a", secundario: "#c29a54",
      texto: "#302a22", textoSuave: "#62594d", borde: "#e8dcc7",
      sombra: "0 18px 50px rgba(84,62,30,.14)", corazones: "#a57937",
      acentoClaro: "#f8ebd0", botonTexto: "#ffffff", colorScheme: "light"
    },
    "azul-cielo": {
      fondo: "radial-gradient(ellipse at 12% 10%, #dff1f8 0, transparent 36%), radial-gradient(ellipse at 92% 86%, #e9f6fb 0, transparent 34%), #f5fbfe", base: "#f5fbfe",
      tarjeta: "#ffffff", principal: "#315f78", secundario: "#79b6d1",
      texto: "#263943", textoSuave: "#536975", borde: "#d6e6ed",
      sombra: "0 18px 50px rgba(42,79,98,.14)", corazones: "#4e8eaa",
      acentoClaro: "#e4f2f7", botonTexto: "#ffffff", colorScheme: "light"
    },
    rosa: {
      fondo: "radial-gradient(ellipse at 12% 10%, #ffe3eb 0, transparent 36%), radial-gradient(ellipse at 90% 86%, #fff0f4 0, transparent 34%), #fff7f9", base: "#fff7f9",
      tarjeta: "#fffdfd", principal: "#87334e", secundario: "#dc829c",
      texto: "#382630", textoSuave: "#675660", borde: "#eed8e0",
      sombra: "0 18px 50px rgba(93,48,66,.14)", corazones: "#c75778",
      acentoClaro: "#fbe7ed", botonTexto: "#ffffff", colorScheme: "light"
    },
    atardecer: {
      fondo: "radial-gradient(ellipse at 10% 12%, #ffdfc8 0, transparent 37%), radial-gradient(ellipse at 92% 82%, #f6d9dc 0, transparent 34%), #fff6ef", base: "#fff6ef",
      tarjeta: "#fffaf6", principal: "#874346", secundario: "#dc916a",
      texto: "#3d2c2c", textoSuave: "#685654", borde: "#eedbd2",
      sombra: "0 18px 50px rgba(102,57,48,.14)", corazones: "#c9605b",
      acentoClaro: "#f8e6dc", botonTexto: "#ffffff", colorScheme: "light"
    },
    bosque: {
      fondo: "radial-gradient(ellipse at 12% 10%, #e1eddf 0, transparent 36%), radial-gradient(ellipse at 90% 86%, #eef2df 0, transparent 34%), #f5f8f1", base: "#f5f8f1",
      tarjeta: "#fcfdf9", principal: "#3e654a", secundario: "#91ad82",
      texto: "#28352a", textoSuave: "#576258", borde: "#d9e3d5",
      sombra: "0 18px 50px rgba(49,76,53,.14)", corazones: "#638766",
      acentoClaro: "#e8efe5", botonTexto: "#ffffff", colorScheme: "light"
    },
    lavanda: {
      fondo: "radial-gradient(ellipse at 12% 10%, #e9e0f4 0, transparent 36%), radial-gradient(ellipse at 90% 86%, #f2eafa 0, transparent 34%), #faf7fd", base: "#faf7fd",
      tarjeta: "#fefcff", principal: "#624779", secundario: "#a98fc5",
      texto: "#30283a", textoSuave: "#5e5668", borde: "#e3d9ed",
      sombra: "0 18px 50px rgba(70,54,91,.14)", corazones: "#8e70ab",
      acentoClaro: "#f0eafb", botonTexto: "#ffffff", colorScheme: "light"
    },
    medianoche: {
      fondo: "radial-gradient(ellipse at 12% 10%, #26334b 0, transparent 40%), radial-gradient(ellipse at 90% 86%, #30263e 0, transparent 38%), #111722", base: "#111722",
      tarjeta: "#202a38", principal: "#f0b4ce", secundario: "#96c9e5",
      texto: "#f7f5fa", textoSuave: "#c9d0dc", borde: "#465263",
      sombra: "0 20px 56px rgba(0,0,0,.42)", corazones: "#ff91b8",
      acentoClaro: "#303244", botonTexto: "#291522", colorScheme: "dark"
    },
    galaxia: {
      fondo: "radial-gradient(ellipse at 18% 8%, #342448 0, transparent 42%), radial-gradient(ellipse at 84% 78%, #202e4e 0, transparent 42%), #11101d", base: "#11101d",
      tarjeta: "#211d32", principal: "#e9bbff", secundario: "#a9a4ff",
      texto: "#faf8ff", textoSuave: "#d0cbe3", borde: "#514766",
      sombra: "0 20px 60px rgba(0,0,0,.46)", corazones: "#e7a6ff",
      acentoClaro: "#30263d", botonTexto: "#24172d", colorScheme: "dark"
    }
  });

  const validarColor = (valor) => typeof valor === "string" && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(valor.trim());
  const aRgb = (color) => {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split("").map((parte) => parte + parte).join("");
    return [0, 2, 4].map((indice) => parseInt(hex.slice(indice, indice + 2), 16)).join(",");
  };
  const query = new URLSearchParams(window.location.search);
  const datos = window.DATOS && typeof window.DATOS === "object" ? window.DATOS : {};
  const nombreConfigurado = typeof datos.tema === "string" && Object.hasOwn(temas, datos.tema) ? datos.tema : "eros";
  const nombreEnUrl = query.get("tema");
  const nombreInicial = query.has("tema") ? (Object.hasOwn(temas, nombreEnUrl) ? nombreEnUrl : "eros") : nombreConfigurado;
  const override = validarColor(datos.colorPrincipal) ? datos.colorPrincipal.trim() : "";
  const root = document.documentElement;
  let actual = "eros";

  function sincronizarEstrellas(nombre) {
    const existente = document.getElementById("galaxyStars");
    if (nombre !== "galaxia") {
      if (existente) existente.remove();
      return;
    }
    if (existente || !document.body) return;
    const estrellas = document.createElement("div");
    estrellas.className = "galaxy-stars";
    estrellas.id = "galaxyStars";
    estrellas.setAttribute("aria-hidden", "true");
    document.body.insertBefore(estrellas, document.body.firstChild);
  }

  function aplicar(nombre) {
    const valido = typeof nombre === "string" && Object.hasOwn(temas, nombre);
    actual = valido ? nombre : "eros";
    const paleta = temas[actual];
    const principal = override || paleta.principal;
    root.dataset.theme = actual;
    root.style.colorScheme = paleta.colorScheme;
    root.style.setProperty("--theme-background", paleta.fondo);
    root.style.setProperty("--cream", paleta.base);
    root.style.setProperty("--paper", paleta.tarjeta);
    root.style.setProperty("--wine", principal);
    root.style.setProperty("--wine-rgb", aRgb(principal));
    root.style.setProperty("--pink", paleta.secundario);
    root.style.setProperty("--pink-pale", paleta.acentoClaro);
    root.style.setProperty("--blue", paleta.secundario);
    root.style.setProperty("--blue-deep", paleta.principal);
    root.style.setProperty("--ink", paleta.texto);
    root.style.setProperty("--muted", paleta.textoSuave);
    root.style.setProperty("--line", paleta.borde);
    root.style.setProperty("--shadow", paleta.sombra);
    root.style.setProperty("--heart-color", paleta.corazones);
    root.style.setProperty("--button-ink", paleta.botonTexto);
    sincronizarEstrellas(actual);
    return actual;
  }

  window.ErosTemas = Object.freeze({
    nombres: Object.freeze(Object.keys(temas)),
    aplicar,
    actual: () => actual
  });
  aplicar(nombreInicial);
})();
