/* Música compartida. El primer toque habilita la reproducción en celulares. */
(() => {
  "use strict";
  let audio = null;
  let boton = null;
  let texto = null;
  let disponible = false;

  function actualizar() {
    if (!audio || !boton) return;
    const pausada = audio.paused;
    boton.setAttribute("aria-pressed", String(!pausada));
    boton.setAttribute("aria-label", pausada ? "Reproducir música" : "Pausar música");
    if (texto) texto.textContent = pausada ? "Reproducir música" : "Pausar música";
  }
  function ocultar() {
    disponible = false;
    if (audio) audio.pause();
    if (boton) boton.hidden = true;
  }
  function conectar(ruta, elementoAudio, elementoBoton) {
    audio = elementoAudio;
    boton = elementoBoton;
    texto = document.getElementById("musicText");
    disponible = Boolean(ruta && audio && boton);
    boton.hidden = !disponible;
    if (!disponible) return;
    audio.src = ruta;
    audio.addEventListener("play", actualizar);
    audio.addEventListener("pause", actualizar);
    audio.addEventListener("error", ocultar, { once: true });
    boton.addEventListener("click", () => {
      if (!disponible) return;
      if (audio.paused) iniciar();
      else audio.pause();
      actualizar();
    });
    actualizar();
  }
  function iniciar() {
    if (!disponible || !audio) return;
    try {
      const intento = audio.play();
      if (intento && typeof intento.catch === "function") intento.catch(() => actualizar());
    } catch (_) { actualizar(); }
  }
  window.NucleoMusica = { conectar, iniciar };
})();
