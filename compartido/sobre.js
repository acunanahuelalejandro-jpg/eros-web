/* Sobre animado reutilizable para todos los modelos Eros Web. */
(() => {
  "use strict";
  const style = document.createElement("style");
  style.id = "eros-envelope-styles";
  style.textContent = "\n.envelope-screen{display:grid;min-height:100svh;place-items:center;padding:max(28px,env(safe-area-inset-top)) 18px max(32px,env(safe-area-inset-bottom));text-align:center;background:transparent}\n.envelope-content{width:min(100%,440px);margin:auto}\n.envelope-button{position:relative;display:block;width:min(86vw,360px);aspect-ratio:1.58;margin:0 auto;padding:0;overflow:visible;border:0;border-radius:17px;background:transparent;cursor:pointer;perspective:900px}\n.envelope-back,.envelope-letter-shape,.envelope-pocket,.envelope-flap{position:absolute;display:block}\n.envelope-back{inset:0;border:1px solid rgba(var(--wine-rgb),.16);border-radius:17px;background:linear-gradient(145deg,var(--pink-pale),var(--blue));box-shadow:var(--shadow)}\n.envelope-letter-shape{z-index:1;right:8%;bottom:8%;left:8%;height:82%;border:1px solid var(--line);border-radius:9px;background:var(--paper);box-shadow:0 5px 14px rgba(0,0,0,.1);transition:transform .8s cubic-bezier(.2,.75,.24,1)}\n.envelope-letter-shape::before{content:\"\";position:absolute;top:24%;left:18%;width:64%;height:2px;border-radius:2px;background:var(--line);box-shadow:0 17px 0 var(--line),0 34px 0 var(--line)}\n.envelope-pocket{z-index:3;inset:42% 0 0;border-radius:0 0 16px 16px;background:linear-gradient(145deg,var(--pink-pale),var(--blue));clip-path:polygon(0 0,50% 60%,100% 0,100% 100%,0 100%)}\n.envelope-flap{z-index:4;top:0;right:0;left:0;height:62%;border-radius:16px 16px 0 0;background:var(--pink);clip-path:polygon(0 0,100% 0,50% 100%);transform-origin:50% 0;transition:transform .62s ease;backface-visibility:hidden}\n.envelope-seal{position:absolute;z-index:5;top:43%;left:50%;display:grid;width:52px;height:52px;place-items:center;border:2px solid rgba(255,255,255,.7);border-radius:50%;color:var(--button-ink);background:var(--wine);box-shadow:0 4px 12px rgba(0,0,0,.16);font-size:1.65rem;transform:translate(-50%,-50%);transition:opacity .25s ease,transform .25s ease}\n.envelope-button.is-opening .envelope-flap{transform:rotateX(180deg)}\n.envelope-button.is-opening .envelope-letter-shape{transform:translateY(-72%)}\n.envelope-button.is-opening .envelope-seal{opacity:0;transform:translate(-50%,-50%) scale(.6)}\n.envelope-caption{margin:18px 0 0;color:var(--wine);font-family:\"Playfair Display\",Georgia,serif;font-size:1.25rem}\n@media(prefers-reduced-motion:reduce){.envelope-button.is-opening{opacity:.35;transition:opacity .16s ease}.envelope-button.is-opening .envelope-flap,.envelope-button.is-opening .envelope-letter-shape,.envelope-button.is-opening .envelope-seal{transform:none;transition:none}}\n";
  document.head.appendChild(style);

  function nodo(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function montar(root, alAbrir, opciones = {}) {
    if (!root) return null;
    root.replaceChildren();
    root.setAttribute("aria-label", "Un sobre para vos");
    const content = nodo("div", "envelope-content");
    const button = nodo("button", "envelope-button");
    button.type = "button";
    button.setAttribute("aria-label", "Tocá para abrir el sobre");
    button.setAttribute("aria-expanded", "false");
    const back = nodo("span", "envelope-back");
    const letter = nodo("span", "envelope-letter-shape");
    const pocket = nodo("span", "envelope-pocket");
    const flap = nodo("span", "envelope-flap");
    const seal = nodo("span", "envelope-seal", "♥");
    [back, letter, pocket, flap, seal].forEach((part) => part.setAttribute("aria-hidden", "true"));
    button.append(back, letter, pocket, flap, seal);
    content.append(button, nodo("p", "envelope-caption", "Tocá para abrir"));
    root.appendChild(content);
    let opened = false;
    let timer = 0;
    let demoTimer = 0;
    button.addEventListener("click", () => {
      if (opened) return;
      opened = true;
      button.setAttribute("aria-expanded", "true");
      button.classList.add("is-opening");
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      timer = window.setTimeout(() => {
        if (typeof alAbrir === "function") alAbrir();
      }, reduced ? 180 : 900);
    });
    return {
      mostrar() {
        root.hidden = false;
        button.focus({ preventScroll: true });
        if (opciones.demo === true && !opened) {
          const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          demoTimer = window.setTimeout(() => { demoTimer = 0; if (!opened) button.click(); }, reduced ? 0 : 650);
        }
      },
      ocultar() {
        // Ocultar el sobre también cancela una apertura automática o pendiente.
        window.clearTimeout(timer);
        window.clearTimeout(demoTimer);
        timer = 0;
        demoTimer = 0;
        root.hidden = true;
      },
      enfocar() { button.focus({ preventScroll: true }); },
      destruir() { window.clearTimeout(timer); window.clearTimeout(demoTimer); root.replaceChildren(); root.hidden = true; }
    };
  }

  window.ErosSobre = Object.freeze({ montar });
})();
