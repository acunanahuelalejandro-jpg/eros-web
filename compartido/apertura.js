/* Una sola apertura por página. El juego tiene prioridad, incluso en datos.js antiguos. */
(() => {
  'use strict';
  function elegirApertura(datos) {
    const juego = datos?.extras?.juego;
    return typeof juego === 'string' && juego.trim() ? 'juego' : 'sobre';
  }
  window.ErosApertura = Object.freeze({ elegirApertura });
})();
