/*
  Este es el único archivo que tenés que editar para cada pedido.
  Conservá las comas y las comillas. Si no usás música, dejá musica: "".
  Las fotos van dentro de imagenes/ y las rutas se escriben sin una barra al principio.
*/
window.DATOS = {
  para: "", // Nombre de quien recibe el regalo.
  de: "", // Nombre de quien hace el regalo.

  inicio: {
    titulo: "", // Frase breve que aparece antes de abrir la carta.
    boton: "Tocá para empezar" // Podés cambiar el texto del botón.
  },

  carta: {
    titulo: "", // Título grande de la carta.
    bloques: [
      // Agregá los textos y fotos en el orden en que querés que aparezcan.
      // Para un párrafo: { texto: "Escribí acá el párrafo." },
      // Para una foto: { foto: "imagenes/foto1.jpg", alt: "Descripción de la foto" }
    ]
  },

  firma: "", // Firma que aparece debajo del corazón.
  musica: "", // Escribí "musica.mp3" si vas a subir una canción; si no, dejalo vacío.
  colorPrincipal: "#8b3d52" // Color de botones, corazones y detalles (código hexadecimal).
};
