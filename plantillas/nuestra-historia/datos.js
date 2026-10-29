/*
  DATOS v2: este es el único archivo que se cambia para personalizar un pedido.
  Mantené las comas y las comillas. Todo se muestra como texto, no agregues HTML.
  Fechas y textos: escribilos como quieras, por ejemplo "12 de marzo de 2021".
  Fotos: guardalas en imagenes/ y usá rutas relativas, como "imagenes/foto1.jpg".
  Cantidad de momentos: de 1 a 8. La foto es opcional; podés omitirla si no hay.
*/
window.DATOS = {
  version: 2, // No cambiar: identifica el formato actual.
  para: "", // Nombre de quien recibe el regalo.
  de: "", // Nombre de quien lo regala.

  tema: "eros", // eros | dorado | azul-cielo | rosa | atardecer | bosque | lavanda | medianoche | galaxia
  extras: {
    juego: "", // Opcional: "" | "pintar-corazon" | "margarita" | "laberinto"
    sobre: true, // Sin juego se usa el sobre. Si elegís juego, reemplaza al sobre aunque este valor sea true.
    contador: {
      desde: "", // AAAA-MM-DD. Por ejemplo: "2021-03-12". Vacío = ocultar el contador.
      etiqueta: "Juntos desde hace" // Texto que aparece arriba del contador.
    }
  },

  inicio: {
    titulo: "", // Frase de la pantalla inicial.
    boton: "Tocá para empezar" // Texto del botón inicial.
  },

  principal: {
    titulo: "", // Título de la página, por ejemplo "Nuestra historia".
    subtitulo: "" // Una frase breve debajo del título.
  },

  momentos: [
    // Agregá entre 1 y 8 momentos, en orden cronológico.
    // Cada parada puede tener fecha, título, texto y una foto opcional.
    // Si un momento no tiene foto, borrá la propiedad foto y la página se acomoda sola.
    // { fecha: "12 de marzo de 2021", titulo: "El primer encuentro", texto: "Escribí un recuerdo.", foto: "imagenes/foto1.jpg", alt: "Descripción de la foto" }
  ],

  cierre: {
    mensaje: "" // Mensaje corto para cerrar el recorrido.
  },

  firma: "", // Nombre o frase de quien regala.
  audio: null, // El armador carga un MP3 opcional; no se aceptan enlaces ni catálogos.
  colorPrincipal: "" // Vacío usa el color del tema. También admite un color hexadecimal.
};
