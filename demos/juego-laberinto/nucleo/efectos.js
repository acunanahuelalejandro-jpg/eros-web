/* Efectos compartidos: lluvia de corazones y explosión final en canvas. */
(() => {
  "use strict";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function iniciarLluvia(contenedor, reducida) {
    if (!contenedor || contenedor.dataset.iniciada === "si") return;
    contenedor.dataset.iniciada = "si";
    const cantidad = reducida ? 12 : 100;
    for (let i = 0; i < cantidad; i += 1) {
      const heart = document.createElement("span");
      const duracion = reducida ? 28 + Math.random() * 12 : 9 + Math.random() * 9;
      const vaiven = reducida ? 9 : 34;
      heart.className = "ambient-heart";
      heart.textContent = i % 2 === 0 ? "♥" : "♡";
      heart.style.setProperty("--x", Math.random() * 100 + "%");
      heart.style.setProperty("--size", 14 + Math.random() * 24 + "px");
      heart.style.setProperty("--duration", duracion + "s");
      heart.style.setProperty("--delay", -Math.random() * duracion + "s");
      heart.style.setProperty("--alpha", (reducida ? .2 + Math.random() * .18 : .25 + Math.random() * .45).toFixed(2));
      heart.style.setProperty("--mid-sway", (Math.random() - .5) * vaiven + "px");
      heart.style.setProperty("--sway", (Math.random() - .5) * vaiven + "px");
      heart.style.setProperty("--turn", (Math.random() - .5) * (reducida ? 26 : 78) + "deg");
      heart.style.setProperty("--heart-color", i % 3 === 0 ? "#e84372" : "var(--wine)");
      contenedor.appendChild(heart);
    }
  }

  function dibujarCorazon(ctx, tamano) {
    const escala = tamano / 32;
    ctx.beginPath();
    ctx.moveTo(0, 12 * escala);
    ctx.bezierCurveTo(-19 * escala, 0, -15 * escala, -13 * escala, -7 * escala, -12 * escala);
    ctx.bezierCurveTo(-2 * escala, -12 * escala, 0, -8 * escala, 0, -5 * escala);
    ctx.bezierCurveTo(0, -8 * escala, 4 * escala, -12 * escala, 9 * escala, -12 * escala);
    ctx.bezierCurveTo(18 * escala, -12 * escala, 19 * escala, 0, 0, 12 * escala);
    ctx.closePath();
    ctx.fill();
  }

  function explotar(canvas, colorPrincipal, alTerminar) {
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) {
      window.setTimeout(alTerminar, reducedMotion.matches ? 3000 : 2400);
      return;
    }
    const reducida = reducedMotion.matches;
    const cantidad = reducida ? 28 : 110;
    const duracion = reducida ? 3000 : 2450;
    const palette = [colorPrincipal || "#8b3d52", "#e84372", "#f4b8c1", "#b75a71"];
    const corazones = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.hidden = false;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < cantidad; i += 1) {
      const angulo = Math.random() * Math.PI * 2;
      const velocidad = (reducida ? 45 : 100) + Math.random() * (reducida ? 95 : 320);
      corazones.push({
        x: w / 2, y: h / 2,
        vx: Math.cos(angulo) * velocidad,
        vy: Math.sin(angulo) * velocidad - (reducida ? 28 : 70),
        size: (reducida ? 18 : 17) + Math.random() * (reducida ? 12 : 26),
        giro: Math.random() * Math.PI * 2,
        rotacion: (Math.random() - .5) * (reducida ? 2 : 5),
        gravedad: reducida ? 120 : 260 + Math.random() * 180,
        color: palette[Math.floor(Math.random() * palette.length)]
      });
    }
    let anterior = performance.now();
    const inicio = anterior;
    function cuadro(ahora) {
      const dt = Math.min((ahora - anterior) / 1000, .04);
      anterior = ahora;
      const progreso = Math.min((ahora - inicio) / duracion, 1);
      ctx.clearRect(0, 0, w, h);
      corazones.forEach((p) => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += p.gravedad * dt;
        p.giro += p.rotacion * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.giro);
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, (progreso - .58) / .42));
        ctx.fillStyle = p.color;
        dibujarCorazon(ctx, p.size);
        ctx.restore();
      });
      if (progreso < 1) window.requestAnimationFrame(cuadro);
      else {
        ctx.clearRect(0, 0, w, h);
        canvas.hidden = true;
        if (typeof alTerminar === "function") alTerminar();
      }
    }
    window.requestAnimationFrame(cuadro);
  }

  function corazonAlTocar(layer, event, reducida) {
    if (!layer || reducida) return;
    const heart = document.createElement("span");
    heart.className = "tap-heart";
    heart.textContent = "♡";
    heart.style.left = event.clientX + "px";
    heart.style.top = event.clientY + "px";
    heart.addEventListener("animationend", () => heart.remove(), { once: true });
    layer.appendChild(heart);
  }

  window.NucleoEfectos = { iniciarLluvia, explotar, corazonAlTocar };
})();
