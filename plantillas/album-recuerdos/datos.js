/*
  DATOS v2: este es el único archivo que se edita para personalizar un pedido.
  Conservá las comas y las comillas. Los textos se muestran como texto plano.
  Guardá las fotos del pedido en la carpeta imagenes/ y usá rutas relativas.
  Podés usar de 3 a 12 fotos. Si faltan archivos, el álbum muestra un espacio suave.
*/
window.DATOS = {
  version: 2, // Dejalo en 2.
  para: "", // Nombre de quien recibe el regalo.
  de: "", // Nombre de quien lo regala.

  tema: "eros", // eros | dorado | azul-cielo | rosa | atardecer | bosque | lavanda | medianoche | galaxia

  extras: {
    juego: "", // Opcional: "" | "pintar-corazon" | "margarita" | "laberinto"
    sobre: true, // true muestra el sobre; false lo salta.
    contador: {
      desde: "", // Fecha de inicio AAAA-MM-DD. Vacío = no mostrar contador.
      etiqueta: "Juntos desde hace"
    }
  },

  inicio: {
    titulo: "", // Frase que aparece antes de empezar.
    boton: "Tocá para empezar"
  },

  principal: {
    titulo: "", // Título de la página del álbum.
    subtitulo: "" // Una frase breve debajo del título.
  },

  fotos: [
    // Agregá entre 3 y 12 fotos en el orden en que querés mostrarlas.
    // src: nombre del archivo dentro de imagenes/
    // alt: descripción de la foto para accesibilidad.
    // epigrafe: frase corta que aparece debajo de esa foto.
    { src: "imagenes/foto1.jpg", alt: "", epigrafe: "" },
    { src: "imagenes/foto2.jpg", alt: "", epigrafe: "" },
    { src: "imagenes/foto3.jpg", alt: "", epigrafe: "" }
  ],

  automatico: 0, // 0 = pasar manualmente. Si querés avance automático, poné segundos, por ejemplo 6.

  cierre: {
    mensaje: "" // Mensaje corto que aparece al llegar a la última foto.
  },

  firma: "", // Nombre o frase de quien regala.
  musica: "musica.mp3", // Archivo de audio junto al index.html. "" = sin música.
  colorPrincipal: "" // Vacío usa el color del tema. También acepta un color hexadecimal.
};
