/*
  Este es el único archivo que necesitás editar para cada pedido.
  El index.html y los archivos de nucleo/ y juegos/ quedan fijos.
  Conservá las comas y las comillas. Las fotos van en imagenes/.
  La música es opcional: dejá musica: "" si no la vas a usar.
*/
window.DATOS = {
  para: "", // Nombre de quien recibe el regalo.
  de: "", // Nombre de quien lo regala.

  // Elegí el archivo de juego. Para sumar otro, se agrega su .js en juegos/.
  juego: "pintar-corazon", // "pintar-corazon" | "margarita" | "laberinto"

  inicio: {
    titulo: "", // Frase breve que aparece antes de jugar.
    boton: "Tocá para jugar"
  },

  // Dejá las tres configuraciones. El juego elegido usa solo la suya.
  config: {
    "pintar-corazon": {
      consigna: "Pintá el corazón para desbloquear tu sorpresa",
      coloresPincel: ["#8b3d52", "#e84372"] // Podés cambiar los colores del trazo.
    },
    margarita: {
      consigna: "Arrancá los pétalos y descubrí qué dice el último.",
      cantidadPetalos: 12, // Entre 8 y 16.
      textoMeAma: "Me ama",
      textoNoMeAma: "No me ama"
    },
    laberinto: {
      consigna: "Llegá a mí",
      fotoQuienJuega: "", // Opcional: ruta a una foto dentro de imagenes/.
      fotoQuienRegala: "", // Opcional: ruta a otra foto dentro de imagenes/.
      dificultad: "facil", // "facil" o "media".
      semilla: 2027 // Cambiar este número genera otro recorrido fijo.
    }
  },

  carta: {
    titulo: "", // Título de la carta.
    bloques: [
      // Agregá texto y fotos en el orden en que tienen que aparecer.
      // Máximo 3 fotos. Duplicá una línea y cambiá el número del archivo.
      // { texto: "Escribí acá el primer párrafo." },
      // { foto: "imagenes/foto1.jpg", alt: "Descripción breve de la foto" },
      // { texto: "Escribí acá el siguiente párrafo." }
    ]
  },

  firma: "", // Firma que aparece debajo del corazón.
  musica: "", // Por ejemplo, "musica.mp3". El botón se oculta si queda vacío.
  colorPrincipal: "#8b3d52" // Color principal de los corazones y los detalles.
};
