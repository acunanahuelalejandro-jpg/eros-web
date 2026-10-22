/* Juego: pintá el corazón con el dedo o el mouse. */
(() => {
  "use strict";
  window.JUEGOS = window.JUEGOS || {};
  window.JUEGOS["pintar-corazon"] = {
    iniciar(contenedor, config, alGanar, opciones) {
      const cfg = config && typeof config === "object" ? config : {};
      const colores = Array.isArray(cfg.coloresPincel) ? cfg.coloresPincel.filter((c) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(String(c))) : [];
      const colorPrincipal = opciones && opciones.color || "#8b3d52";
      const pincel = colores.length ? colores : [colorPrincipal, "#e84372"];
      const wrap = document.createElement("div");
      wrap.className = "paint-game";
      const canvas = document.createElement("canvas");
      canvas.className = "paint-canvas";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Contorno de corazón para pintar arrastrando el dedo o el mouse");
      const progress = document.createElement("div");
      progress.className = "paint-progress";
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", "Progreso para completar el corazón");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "85");
      progress.setAttribute("aria-valuenow", "0");
      const progressLabel = document.createElement("span");
      progressLabel.className = "paint-progress-label";
      progressLabel.textContent = "Corazón pintado: 0%";
      const track = document.createElement("div");
      track.className = "paint-progress-track";
      const fill = document.createElement("div");
      fill.className = "paint-progress-fill";
      track.appendChild(fill);
      progress.append(progressLabel, track);
      const status = document.createElement("p");
      status.className = "flower-progress";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.textContent = "Arrastrá el dedo o el mouse por el corazón.";
      wrap.append(canvas, progress, status);
      contenedor.replaceChildren(wrap);
      const ctx = canvas.getContext("2d");
      if (!ctx) { status.textContent = "Podés abrir tu sorpresa con el enlace que va a aparecer."; return { destruir() {} }; }

      let width = 0;
      let height = 0;
      let dpr = 1;
      let path = null;
      let drawing = false;
      let last = null;
      let strokes = [];
      let visited = new Set();
      let cells = [];
      let finishing = false;
      let destroyed = false;
      let raf = 0;
      let observer = null;
      let brushColor = pincel[0];

      function makePath(w, h) {
        const p = new Path2D();
        const cx = w / 2;
        const cy = h * .49;
        const r = Math.min(w * .37, h * .4);
        p.moveTo(cx, cy + r * .92);
        p.bezierCurveTo(cx - r * .2, cy + r * .78, cx - r * 1.05, cy + r * .12, cx - r * .98, cy - r * .42);
        p.bezierCurveTo(cx - r * .92, cy - r * 1.04, cx - r * .22, cy - r * 1.03, cx, cy - r * .52);
        p.bezierCurveTo(cx + r * .22, cy - r * 1.03, cx + r * .92, cy - r * 1.04, cx + r * .98, cy - r * .42);
        p.bezierCurveTo(cx + r * 1.05, cy + r * .12, cx + r * .2, cy + r * .78, cx, cy + r * .92);
        p.closePath();
        return p;
      }
      function createCells() {
        cells = [];
        visited = new Set();
        const step = Math.max(9, width / 22);
        let id = 0;
        for (let y = height * .09; y < height * .92; y += step) {
          for (let x = width * .08; x < width * .92; x += step) {
            if (ctx.isPointInPath(path, x, y)) cells.push({ id: id++, x: x + step / 2, y: y + step / 2, step });
          }
        }
        strokes.forEach((stroke) => {
          for (let i = 1; i < stroke.points.length; i += 1) markSegment(stroke.points[i - 1], stroke.points[i], false);
          if (stroke.points.length === 1) markSegment(stroke.points[0], stroke.points[0], false);
        });
        refreshProgress();
      }
      function markSegment(a, b, checkWin) {
        if (!a || !b || !cells.length) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        const radius = Math.max(15, width * .105);
        const samples = Math.max(1, Math.ceil(distance / (radius * .3)));
        for (let s = 0; s <= samples; s += 1) {
          const t = s / samples;
          const x = a.x + dx * t;
          const y = a.y + dy * t;
          cells.forEach((cell) => {
            if (!visited.has(cell.id) && Math.hypot(cell.x - x, cell.y - y) <= radius + cell.step * .38) visited.add(cell.id);
          });
        }
        refreshProgress(checkWin);
      }
      function refreshProgress(checkWin) {
        const percent = cells.length ? Math.min(100, Math.round(visited.size / cells.length * 100)) : 0;
        const shown = Math.min(percent, 85);
        progress.setAttribute("aria-valuenow", String(shown));
        progressLabel.textContent = "Corazón pintado: " + shown + "%";
        fill.style.transform = "scaleX(" + (shown / 85) + ")";
        if (checkWin && percent >= 85 && !finishing) finishPainting();
      }
      function draw() {
        if (!ctx || destroyed || !width || !height) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.save();
        ctx.fillStyle = "rgba(255,255,255,.64)";
        ctx.fill(path);
        ctx.strokeStyle = "rgba(139,61,82,.6)";
        ctx.lineWidth = Math.max(3, width * .012);
        ctx.lineJoin = "round";
        ctx.stroke(path);
        ctx.clip(path);
        strokes.forEach((stroke) => {
          if (!stroke.points.length) return;
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          for (let i = 1; i < stroke.points.length; i += 1) ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = Math.max(18, width * .2);
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke();
          if (stroke.points.length === 1) {
            ctx.beginPath();
            ctx.arc(stroke.points[0].x, stroke.points[0].y, Math.max(9, width * .1), 0, Math.PI * 2);
            ctx.fillStyle = stroke.color;
            ctx.fill();
          }
        });
        if (finishing) {
          const elapsed = Math.min((performance.now() - finishStart) / 620, 1);
          ctx.globalAlpha = elapsed;
          ctx.fillStyle = pincel[(strokes.length) % pincel.length];
          ctx.fill(path);
          ctx.globalAlpha = 1;
          if (elapsed < 1) raf = window.requestAnimationFrame(draw);
        }
        ctx.restore();
      }
      let finishStart = 0;
      function finishPainting() {
        if (finishing) return;
        finishing = true;
        drawing = false;
        status.textContent = "¡Listo! El corazón ya está completo.";
        finishStart = performance.now();
        raf = window.requestAnimationFrame(() => {
          draw();
          window.setTimeout(() => { if (!destroyed) alGanar(); }, 650);
        });
      }
      function resize() {
        if (destroyed) return;
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        width = rect.width;
        height = rect.height;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        path = makePath(width, height);
        createCells();
        draw();
      }
      function point(event) {
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }
      function onDown(event) {
        if (finishing || !ctx) return;
        const p = point(event);
        if (!ctx.isPointInPath(path, p.x, p.y)) return;
        drawing = true;
        last = p;
        brushColor = pincel[strokes.length % pincel.length];
        strokes.push({ color: brushColor, points: [p] });
        try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
        markSegment(p, p, true);
        draw();
      }
      function onMove(event) {
        if (!drawing || finishing) return;
        const p = point(event);
        const current = strokes[strokes.length - 1];
        current.points.push(p);
        markSegment(last, p, true);
        last = p;
        draw();
      }
      function onUp() { drawing = false; last = null; }
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
      if ("ResizeObserver" in window) { observer = new ResizeObserver(resize); observer.observe(canvas); }
      else window.addEventListener("resize", resize);
      resize();
      return { destruir() { destroyed = true; if (observer) observer.disconnect(); else window.removeEventListener("resize", resize); window.cancelAnimationFrame(raf); } };
    },
    destruir() {}
  };
})();
