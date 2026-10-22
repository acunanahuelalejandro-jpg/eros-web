/* Juego: arrancá los pétalos de la margarita. El último siempre dice «Me ama». */
(() => {
  "use strict";
  window.JUEGOS = window.JUEGOS || {};
  window.JUEGOS.margarita = {
    iniciar(contenedor, config, alGanar) {
      const cfg = config && typeof config === "object" ? config : {};
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
      const petals = [];
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
          if (won || petal.disabled) return;
          petal.disabled = true;
          petal.classList.add("is-picked");
          remaining -= 1;
          removed += 1;
          status.textContent = remaining ? "Quedan " + remaining + (remaining === 1 ? " pétalo." : " pétalos.") : "La margarita ya tiene una respuesta.";
          if (remaining === 0) {
            won = true;
            verdict.textContent = textoMeAma;
            window.setTimeout(alGanar, 720);
          } else {
            verdict.textContent = removed % 2 === 0 ? textoMeAma : textoNoMeAma;
            window.setTimeout(() => petal.remove(), 740);
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
      return { destruir() { won = true; } };
    },
    destruir() {}
  };
})();
