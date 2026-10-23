/* Juego: arrancá los pétalos de la margarita. El último siempre dice «Me ama». */
(() => {
  "use strict";
  window.JUEGOS = window.JUEGOS || {};
  window.JUEGOS.margarita = {
    iniciar(contenedor, config, alGanar, opciones) {
      const cfg = config && typeof config === "object" ? config : {};
      const demo = cfg.demo === true || opciones?.demo === true;
      const rawCount = Number.parseInt(cfg.cantidadPetalos, 10);
      const total = Number.isFinite(rawCount) ? Math.max(8, Math.min(16, rawCount)) : 12;
      const textoMeAma = typeof cfg.textoMeAma === "string" && cfg.textoMeAma.trim() ? cfg.textoMeAma.trim() : "Me ama";
      const textoNoMeAma = typeof cfg.textoNoMeAma === "string" && cfg.textoNoMeAma.trim() ? cfg.textoNoMeAma.trim() : "No me ama";
      const root = document.createElement("div");
      root.className = "flower-game";
      const verdict = document.createElement("p");
      verdict.className = "flower-verdict";
      verdict.textContent = textoMeAma;
      verdict.setAttribute("aria-live", "polite");
      const stage = document.createElement("div");
      stage.className = "flower-stage";
      stage.setAttribute("role", "group");
      stage.setAttribute("aria-label", "Margarita con " + total + " pétalos. Tocá cada pétalo para arrancarlo.");
      const status = document.createElement("p");
      status.className = "flower-progress";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent = "Quedan " + total + " pétalos.";
      let remaining = total;
      let removed = 0;
      let won = false;
      let destroyed = false;
      const petals = [];
      const timers = new Set();
      function later(callback, delay) {
        const id = window.setTimeout(() => {
          timers.delete(id);
          if (!destroyed) callback();
        }, delay);
        timers.add(id);
        return id;
      }
      for (let i = 0; i < total; i += 1) {
        const angle = i * 360 / total;
        const rad = (angle - 90) * Math.PI / 180;
        const petal = document.createElement("button");
        petal.type = "button";
        petal.className = "flower-petal";
        petal.setAttribute("aria-label", "Arrancar pétalo " + (i + 1));
        petal.style.left = (50 + Math.cos(rad) * 31) + "%";
        petal.style.top = (50 + Math.sin(rad) * 31) + "%";
        petal.style.setProperty("--angle", angle + "deg");
        petal.style.setProperty("--fall-x", ((i % 2 ? 1 : -1) * (24 + i % 4 * 10)) + "px");
        petal.addEventListener("click", () => {
          if (destroyed || won || petal.disabled) return;
          petal.disabled = true;
          petal.classList.add("is-picked");
          remaining -= 1;
          removed += 1;
          status.textContent = remaining ? "Quedan " + remaining + (remaining === 1 ? " pétalo." : " pétalos.") : "La margarita ya tiene una respuesta.";
          if (remaining === 0) {
            won = true;
            verdict.textContent = textoMeAma;
            later(alGanar, 720);
          } else {
            verdict.textContent = removed % 2 === 0 ? textoMeAma : textoNoMeAma;
            later(() => petal.remove(), 740);
          }
        });
        petals.push(petal);
        stage.appendChild(petal);
      }
      const center = document.createElement("div");
      center.className = "flower-center";
      center.textContent = "✿";
      center.setAttribute("aria-hidden", "true");
      stage.appendChild(center);
      root.append(verdict, stage, status);
      contenedor.replaceChildren(root);
      if (demo && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        let next = 0;
        // Calculamos las pausas para que el último pétalo y su cierre lleguen en ~5,1 s.
        const interval = Math.max(180, Math.round((5100 - 120 - 720) / (total - 1)));
        const removeNext = () => {
          if (destroyed || next >= petals.length) return;
          petals[next++].click();
          if (next < petals.length) later(removeNext, interval);
        };
        later(removeNext, 120);
      }
      return { destruir() { destroyed = true; won = true; timers.forEach(window.clearTimeout); timers.clear(); } };
    },
    destruir() {}
  };
})();
