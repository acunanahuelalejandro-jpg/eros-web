/*
  Demo ficticia de Sofi y Nico. Para un pedido, editá los datos en este archivo.
  El juego activo se elige con el campo juego. Solo se carga ese archivo de juegos/.
*/
window.DATOS = {
  para: "Sofi",
  de: "Nico",
  juego: "pintar-corazon",
  inicio: {
    titulo: "Tengo un juego para vos, Sofi",
    boton: "Tocá para jugar"
  },
  config: {
    "pintar-corazon": {
      consigna: "Pintá el corazón para desbloquear tu sorpresa",
      coloresPincel: ["#8b3d52", "#e84372"]
    },
    margarita: {
      consigna: "Arrancá los pétalos y descubrí qué dice el último.",
      cantidadPetalos: 12,
      textoMeAma: "Me ama",
      textoNoMeAma: "No me ama"
    },
    laberinto: {
      consigna: "Llegá a mí",
      fotoQuienJuega: "imagenes/foto1.jpg",
      fotoQuienRegala: "imagenes/foto2.jpg",
      dificultad: "facil",
      semilla: 2027
    }
  },
  carta: {
    titulo: "Para vos, Sofi",
    bloques: [
      { texto: "Sofi, después de tantos años todavía me pasa que quiero contarte cualquier pavada apenas me ocurre. Me gusta que con vos hasta un día común termina teniendo algo para recordar. Como esa tarde en la plaza, cuando nos quedamos hablando hasta que bajó el sol y terminamos riéndonos de mi gran sentido de la orientación." },
      { foto: "imagenes/foto1.jpg", alt: "Sofi y Nico abrazados y riéndose en una plaza al atardecer" },
      { texto: "Me encanta que incluso cuando salimos a tomar un café, siempre encuentre algo para mostrarte en el celular: un video tonto, una foto vieja o alguna idea que seguro se me va a olvidar después. Tu cara cuando te tentás de risa vale más que cualquier cosa que te quiera mostrar." },
      { foto: "imagenes/foto2.jpg", alt: "Nico le muestra algo en el celular a Sofi en un café y ella sonríe" },
      { texto: "También guardo con mucho cariño esas caminatas por la costanera, sin apuro y de la mano. Cuando apoyás la cabeza en mi hombro, siento que no hace falta inventar ningún plan para que el día esté bueno." },
      { foto: "imagenes/foto3.jpg", alt: "Sofi y Nico caminan de la mano por la costanera, con ella apoyada en su hombro" },
      { texto: "Gracias por compartir conmigo tus días, tus ocurrencias y hasta mis chistes malos, que ya conocés demasiado bien. Me hace feliz seguir sumando recuerdos con vos, de los importantes y de los más simples." }
    ]
  },
  firma: "Con todo mi cariño, Nico",
  musica: "musica.mp3",
  colorPrincipal: "#8b3d52"
};
