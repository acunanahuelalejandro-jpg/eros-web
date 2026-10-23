/* Compatibilidad para páginas anteriores que todavía cargan pedido.js. */
(() => {
  if (window.ErosArmador || document.querySelector('script[data-eros-armador]')) return;
  const script = document.createElement('script');
  script.dataset.erosArmador = '';
  script.src = new URL('armador.js', document.currentScript.src).href;
  script.onload = () => document.dispatchEvent(new Event('eros-armador-disponible'));
  document.head.append(script);
})();
