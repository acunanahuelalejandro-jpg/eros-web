/*
  Demo ficticia de Sofi y Nico para mostrar cómo queda el Álbum de recuerdos.
  Solo hay tres fotos de pareja disponibles en las demos actuales: por eso se repiten
  las imágenes que tenemos, con distintos epígrafes. En un pedido real se reemplaza
  este archivo y se ponen las fotos del cliente dentro de imagenes/.
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
    titulo: "Guardé algunos momentos para vos, Sofi",
    boton: "Tocá para empezar"
  },
  principal: {
    titulo: "Nuestro álbum",
    subtitulo: "Doce recuerdos para mirar sin apuro."
  },
  fotos: [
    { src: "imagenes/foto1.jpg", alt: "Sofi y Nico abrazados frente al río mientras atardece", epigrafe: "Nos quedamos mirando el río hasta que bajó el sol." },
    { src: "imagenes/foto2.jpg", alt: "Nico le muestra algo en el celular a Sofi en un café y ella sonríe", epigrafe: "El café se enfrió mientras nos tentábamos con el celular." },
    { src: "imagenes/foto3.jpg", alt: "Nico abraza a Sofi en un parque y ella se ríe mirando hacia él", epigrafe: "Una caminata entre árboles que terminó en esta foto." },
    { src: "imagenes/foto1.jpg", alt: "Sofi y Nico se abrazan junto al río al caer la tarde", epigrafe: "La tarde ya se estaba yendo y seguimos charlando." },
    { src: "imagenes/foto2.jpg", alt: "Sofi sonríe mientras Nico le muestra algo en el celular", epigrafe: "Tu cara cuando viste el video sigue siendo mi parte favorita." },
    { src: "imagenes/foto3.jpg", alt: "Nico tiene un brazo alrededor de Sofi en un parque", epigrafe: "Nos habíamos propuesto seguir caminando un rato más." },
    { src: "imagenes/foto1.jpg", alt: "Nico y Sofi se abrazan junto al río al atardecer", epigrafe: "La cámara se movió un poco, pero el abrazo quedó perfecto." },
    { src: "imagenes/foto2.jpg", alt: "Sofi y Nico comparten un café y miran el celular", epigrafe: "Un café, una historia en el teléfono y vos tentada de risa." },
    { src: "imagenes/foto3.jpg", alt: "Sofi se ríe mientras Nico la abraza bajo los árboles", epigrafe: "Ese rato en el parque terminó siendo uno de mis favoritos." },
    { src: "imagenes/foto1.jpg", alt: "Sofi y Nico se abrazan frente al río cuando atardece", epigrafe: "Un abrazo al lado del río, antes de volver a casa." },
    { src: "imagenes/foto2.jpg", alt: "Sofi mira a Nico con una sonrisa en un café", epigrafe: "Hay charlas que arrancan con cualquier cosa y se quedan todo el día." },
    { src: "imagenes/foto3.jpg", alt: "Sofi y Nico se ríen juntos bajo los árboles de un parque", epigrafe: "Cierro el álbum con esta risa tuya que me encanta." }
  ],
  automatico: 0,
  cierre: {
    mensaje: "Me gusta volver a estos momentos y acordarme de todo lo que compartimos. Ojalá sigamos sumando muchos más, a nuestra manera."
  },
  firma: "Con cariño, Nico",
  musica: "musica.mp3",
  colorPrincipal: ""
};
