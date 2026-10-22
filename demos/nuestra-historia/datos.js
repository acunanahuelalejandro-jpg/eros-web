/*
  Demo de ejemplo de esta plantilla: Sofi y Nico son una pareja ficticia.
  Para un pedido real, copiá la carpeta plantillas/nuestra-historia/ y editá este datos.js.
  Solo hay tres fotos de pareja disponibles en los demos actuales; los momentos que no tienen
  foto quedan intencionalmente sin imagen para que puedas sumar las fotos correspondientes.
*/
window.DATOS = {
  version: 2,
  para: "Sofi",
  de: "Nico",
  tema: "eros",
  extras: {
    juego: "",
    sobre: true,
    contador: {
      desde: "2021-03-12",
      etiqueta: "Juntos desde hace"
    }
  },
  inicio: {
    titulo: "Tengo un recorrido para vos, Sofi",
    boton: "Tocá para empezar"
  },
  principal: {
    titulo: "Nuestra historia",
    subtitulo: "Seis momentos que todavía nos gusta volver a contar."
  },
  momentos: [
    {
      fecha: "12 de marzo de 2021",
      titulo: "Una charla en la plaza",
      texto: "Nos conocimos en una plaza y terminamos hablando mucho más de lo previsto. Me fui a casa con ganas de volver a verte.",
      foto: "imagenes/foto1.jpg",
      alt: "Sofi y Nico abrazados y riéndose en una plaza al atardecer"
    },
    {
      fecha: "3 de abril de 2021",
      titulo: "Café y una pantalla",
      texto: "En nuestro primer café largo te mostré algo en el celular y nos quedamos tentados de risa. Todavía no me acuerdo qué era; sí me acuerdo de tu cara.",
      foto: "imagenes/foto2.jpg",
      alt: "Nico le muestra algo en el celular a Sofi en un café y ella sonríe"
    },
    {
      fecha: "18 de junio de 2021",
      titulo: "La costanera, sin apuro",
      texto: "Caminamos de la mano junto al río y apoyaste la cabeza en mi hombro. No hacía falta hablar todo el tiempo para que el paseo estuviera buenísimo.",
      foto: "imagenes/foto3.jpg",
      alt: "Sofi y Nico caminan de la mano por la costanera, con ella apoyada en su hombro"
    },
    {
      fecha: "9 de julio de 2022",
      titulo: "Unos días en las sierras",
      texto: "Nos fuimos a las sierras con pocas cosas planeadas y muchas ganas de pasear. Entre los caminos y las paradas para mirar el paisaje, el viaje se nos pasó volando."
    },
    {
      fecha: "22 de septiembre de 2023",
      titulo: "Cocinar juntos",
      texto: "Una noche nos pusimos a cocinar algo que ninguno sabía hacer del todo. Quedó medio desparejo, nos reímos un montón y al final repetimos."
    },
    {
      fecha: "12 de marzo de 2024",
      titulo: "Una cena para celebrar",
      texto: "Para nuestro aniversario salimos a cenar y brindamos por todo lo que fuimos armando, de a poco y a nuestra manera. Volví contento de saber que todavía nos esperan un montón de planes."
    }
  ],
  cierre: {
    mensaje: "Me gusta nuestra historia tal como es: hecha de planes, charlas y esos momentos simples que se quedan con uno."
  },
  firma: "Con cariño, Nico",
  musica: "musica.mp3",
  colorPrincipal: ""
};
