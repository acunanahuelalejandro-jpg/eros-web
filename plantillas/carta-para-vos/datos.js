/*
  CONTRATO v2: este es el único archivo que vas a editar para cada pedido.
  Conservá comas y comillas. Los textos se muestran como texto, no admiten HTML.
  Fotos: guardalas en imagenes/ y usá rutas relativas, sin una barra inicial.
*/
window.DATOS = {
  version: 2,
  para: "", // Nombre de quien recibe el regalo.
  de: "", // Nombre de quien regala.

  tema: "eros", // eros | dorado | azul-cielo | rosa | atardecer | bosque | lavanda | medianoche | galaxia
  extras: {
    juego: "", // "" | "pintar-corazon" | "margarita" | "laberinto". Queda reservado para el armador.
    sobre: true, // true muestra el sobre animado; false abre la carta directamente.
    contador: {
      desde: "", // Formato AAAA-MM-DD. Ejemplo: "2021-03-12". Vacío = no mostrar contador.
      etiqueta: "Juntos desde hace" // Texto que aparece arriba del contador.
    }
  },

  inicio: {
    titulo: "", // Frase breve que aparece antes del sobre o de la carta.
    boton: "Tocá para empezar"
  },

  carta: {
    titulo: "", // Título grande de la carta.
    bloques: [
      // Agregá textos y fotos en el orden en que querés que aparezcan.
      // Texto: { texto: "Escribí acá un párrafo." }
      // Foto:  { foto: "imagenes/foto1.jpg", alt: "Descripción de la foto" }
      // Se aceptan hasta 3 fotos. Podés dejar la lista vacía.
    ]
  },

  firma: "", // Firma debajo del corazón final.
  musica: "", // Por ejemplo "musica.mp3". Vacío = sin música ni botón.
  colorPrincipal: "" // Vacío usa el color del tema; también acepta un hexadecimal como "#8b3d52".
};
