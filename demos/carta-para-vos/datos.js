/*
  Este es el único archivo que tenés que editar para cada pedido.
  Conservá las comas y las comillas. Si no usás música, dejá musica: "".
  Las fotos van en imagenes/ y las rutas se escriben sin una barra al principio.
*/
window.DATOS = {
  para: "Sofi", // Cambiá por el nombre de la persona que recibe el regalo.
  de: "Nico", // Cambiá por el nombre de quien hace el regalo.

  inicio: {
    titulo: "Tengo algo para vos, Sofi", // Título de la pantalla inicial.
    boton: "Tocá para empezar" // Podés cambiar el texto del botón.
  },

  carta: {
    titulo: "Para vos, Sofi", // Título grande de la carta.
    bloques: [
      { texto: "Sofi, después de tantos años todavía me pasa que quiero contarte cualquier pavada apenas me ocurre. Me gusta que con vos hasta un día común termina teniendo algo para recordar." },
      { texto: "Como esa tarde en la plaza, cuando nos quedamos hablando hasta que bajó el sol y terminamos riéndonos de mi gran sentido de la orientación. La verdad, si el plan incluye estar con vos, ya salió bastante bien." },
      { foto: "imagenes/foto1.jpg", alt: "Sofi y Nico abrazados y riéndose en una plaza al atardecer" },
      { texto: "Me encanta que incluso cuando salimos a tomar un café, siempre encuentre algo para mostrarte en el celular: un video tonto, una foto vieja o alguna idea que seguro se me va a olvidar después. Tu cara cuando te tentás de risa vale más que cualquier cosa que te quiera mostrar." },
      { foto: "imagenes/foto2.jpg", alt: "Nico le muestra algo en el celular a Sofi en un café y ella sonríe" },
      { texto: "También guardo con mucho cariño esas caminatas por la costanera, sin apuro y de la mano. Cuando apoyás la cabeza en mi hombro, siento que no hace falta inventar ningún plan para que el día esté bueno." },
      { foto: "imagenes/foto3.jpg", alt: "Sofi y Nico caminan de la mano por la costanera, con ella apoyada en su hombro" },
      { texto: "Gracias por compartir conmigo tus días, tus ocurrencias y hasta mis chistes malos, que ya conocés demasiado bien. Me hace feliz seguir sumando recuerdos con vos, de los importantes y de los más simples." }
    ]
  },

  firma: "Con todo mi cariño, Nico", // Firma que aparece debajo del corazón.
  musica: "musica.mp3", // Escribí "musica.mp3" si vas a subir una canción; si no, dejalo vacío.
  colorPrincipal: "#8b3d52" // Color de botones, corazones y detalles (hexadecimal).
};
