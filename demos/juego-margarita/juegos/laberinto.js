/* Juego: arrastrá el avatar por un laberinto generado siempre con la misma semilla. */
(() => {
  "use strict";
  window.JUEGOS = window.JUEGOS || {};
  const safeFile = (value) => {
    const path = typeof value === "string" ? value.trim().replace(/\\/g, "/") : "";
    return !path || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split("/").includes("..") ? "" : path;
  };
  const dirs = [[-1,0,0,2],[0,1,1,3],[1,0,2,0],[0,-1,3,1]];
  function crearLaberinto(size, semilla) {
    const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => ({ walls: [true,true,true,true], seen: false })));
    let seed = (Number(semilla) >>> 0) || 1;
    const random = (max) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
    const stack = [[0,0]];
    grid[0][0].seen = true;
    while (stack.length) {
      const [r,c] = stack[stack.length - 1];
      const choices = dirs.map(([dr,dc,wall,back]) => ({ r:r+dr,c:c+dc,wall,back }))
        .filter((n) => n.r >= 0 && n.c >= 0 && n.r < size && n.c < size && !grid[n.r][n.c].seen);
      if (!choices.length) { stack.pop(); continue; }
      const next = choices[random(choices.length)];
      grid[r][c].walls[next.wall] = false;
      grid[next.r][next.c].walls[next.back] = false;
      grid[next.r][next.c].seen = true;
      stack.push([next.r,next.c]);
    }
    const queue = [[0,0]];
    const parent = new Map([["0,0", null]]);
    for (let i = 0; i < queue.length; i += 1) {
      const [r,c] = queue[i];
      if (r === size - 1 && c === size - 1) break;
      dirs.forEach(([dr,dc,wall]) => {
        const nr = r + dr, nc = c + dc, key = nr + "," + nc;
        if (nr >= 0 && nc >= 0 && nr < size && nc < size && !grid[r][c].walls[wall] && !parent.has(key)) {
          parent.set(key, [r,c]); queue.push([nr,nc]);
        }
      });
    }
    const solution = [];
    let at = [size - 1,size - 1];
    while (at) { solution.push(at); at = parent.get(at[0] + "," + at[1]); }
    solution.reverse();
    return { grid, solution };
  }
  window.JUEGOS.laberinto = {
    iniciar(contenedor, config, alGanar, opciones) {
      const cfg = config && typeof config === "object" ? config : {};
      const size = cfg.dificultad === "media" ? 11 : 7;
      const generated = crearLaberinto(size, cfg.semilla);
      const { grid, solution } = generated;
      const wrap = document.createElement("div");
      const canvas = document.createElement("canvas");
      canvas.className = "maze-canvas";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "Laberinto. Arrastrá el círculo desde el inicio hasta la meta siguiendo los pasillos.");
      const help = document.createElement("p");
      help.className = "maze-help";
      help.textContent = "Mantené apretado el círculo y arrastralo por los pasillos hasta la meta.";
      wrap.append(canvas, help);
      contenedor.replaceChildren(wrap);
      const ctx = canvas.getContext("2d");
      if (!ctx) return { destruir() {} };
      const options = opciones || {};
      const color = options.color || "#8b3d52";
      const images = [cfg.fotoQuienJuega, cfg.fotoQuienRegala].map((path) => {
        const safe = safeFile(path);
        if (!safe) return null;
        const image = new Image();
        image.onload = draw;
        image.src = safe;
        return image;
      });
      let dpr = 1, width = 0, board = 0, cell = 0, pad = 0;
      let player = [0,0];
      let dragging = false, previous = null, won = false, destroyed = false, observer = null;

      function positionOf(r,c) { return { x:pad + c * cell + cell / 2, y:pad + r * cell + cell / 2 }; }
      function avatar(image, point, label, fallback) {
        const radius = cell * .34;
        ctx.save();
        ctx.beginPath(); ctx.arc(point.x,point.y,radius,0,Math.PI*2); ctx.clip();
        ctx.fillStyle = "#fffdfb"; ctx.fillRect(point.x-radius,point.y-radius,radius*2,radius*2);
        if (image && image.complete && image.naturalWidth) {
          const ratio = Math.max(radius*2/image.naturalWidth,radius*2/image.naturalHeight);
          const iw = image.naturalWidth * ratio, ih = image.naturalHeight * ratio;
          ctx.drawImage(image,point.x-iw/2,point.y-ih/2,iw,ih);
        } else {
          ctx.fillStyle = fallback;
          ctx.font = "bold " + Math.max(15,cell*.48) + "px DM Sans, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("♥",point.x,point.y+1);
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(point.x,point.y,radius,0,Math.PI*2);
        ctx.lineWidth = Math.max(2,cell*.055); ctx.strokeStyle = label === "start" ? color : "#315b70"; ctx.stroke();
      }
      function draw() {
        if (!ctx || destroyed || !width) return;
        ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.clearRect(0,0,width,width);
        ctx.fillStyle = "rgba(255,253,251,.9)"; ctx.fillRect(pad,pad,board,board);
        ctx.beginPath();
        solution.forEach(([r,c],index) => {
          const point = positionOf(r,c);
          if (!index) ctx.moveTo(point.x,point.y); else ctx.lineTo(point.x,point.y);
        });
        ctx.strokeStyle = "rgba(232,67,114,.12)"; ctx.lineWidth = cell*.34; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
        ctx.beginPath();
        for (let r=0;r<size;r+=1) for (let c=0;c<size;c+=1) {
          const x=pad+c*cell, y=pad+r*cell, walls=grid[r][c].walls;
          if (walls[0]) { ctx.moveTo(x,y); ctx.lineTo(x+cell,y); }
          if (walls[1]) { ctx.moveTo(x+cell,y); ctx.lineTo(x+cell,y+cell); }
          if (walls[2]) { ctx.moveTo(x,y+cell); ctx.lineTo(x+cell,y+cell); }
          if (walls[3]) { ctx.moveTo(x,y); ctx.lineTo(x,y+cell); }
        }
        ctx.strokeStyle = "rgba(139,61,82,.76)"; ctx.lineWidth = Math.max(2.5,cell*.065); ctx.lineCap = "round"; ctx.stroke();
        const start = positionOf(0,0), goal = positionOf(size-1,size-1);
        ctx.beginPath(); ctx.arc(goal.x,goal.y,cell*.43,0,Math.PI*2); ctx.fillStyle = "rgba(220,236,245,.8)"; ctx.fill();
        avatar(images[1],goal,"goal","#315b70");
        avatar(images[0],positionOf(player[0],player[1]),"start",color);
      }
      function resize() {
        if (destroyed) return;
        const rect=canvas.getBoundingClientRect();
        if (!rect.width) return;
        width=Math.min(rect.width,520); dpr=Math.min(window.devicePixelRatio||1,2);
        canvas.width=Math.round(width*dpr); canvas.height=Math.round(width*dpr);
        pad=width*.055; board=width-pad*2; cell=board/size; draw();
      }
      function toCell(point) {
        const c=Math.floor((point.x-pad)/cell), r=Math.floor((point.y-pad)/cell);
        if (r<0||c<0||r>=size||c>=size) return null;
        return [r,c];
      }
      function canMove(from,to) {
        const dr=to[0]-from[0], dc=to[1]-from[1];
        const d=dirs.find(([rr,cc])=>rr===dr&&cc===dc);
        return Boolean(d && !grid[from[0]][from[1]].walls[d[2]]);
      }
      function moveTo(next) {
        if (!next || won) return;
        if (next[0]===player[0]&&next[1]===player[1]) return;
        if (canMove(player,next)) {
          player=next; draw();
          if (player[0]===size-1&&player[1]===size-1) {
            won=true; help.textContent="¡Llegaste! Tu sorpresa ya está lista.";
            window.setTimeout(() => { if (!destroyed) alGanar(); }, 280);
          }
        }
      }
      function localPoint(event) {
        const rect=canvas.getBoundingClientRect();
        return {x:event.clientX-rect.left,y:event.clientY-rect.top};
      }
      function onDown(event) {
        if (won) return;
        const point=localPoint(event), cellAt=toCell(point);
        if (!cellAt || cellAt[0]!==player[0]||cellAt[1]!==player[1]) return;
        dragging=true; previous=point;
        try { canvas.setPointerCapture(event.pointerId); } catch (_) {}
      }
      function onMove(event) {
        if (!dragging||won) return;
        const point=localPoint(event), dx=point.x-previous.x, dy=point.y-previous.y;
        const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/(cell*.18)));
        for (let i=1;i<=steps;i+=1) {
          const sample={x:previous.x+dx*i/steps,y:previous.y+dy*i/steps};
          moveTo(toCell(sample));
          if (won) break;
        }
        previous=point;
      }
      function onUp() { dragging=false; previous=null; }
      canvas.addEventListener("pointerdown",onDown);
      canvas.addEventListener("pointermove",onMove);
      canvas.addEventListener("pointerup",onUp);
      canvas.addEventListener("pointercancel",onUp);
      if ("ResizeObserver" in window) { observer=new ResizeObserver(resize); observer.observe(canvas); }
      else window.addEventListener("resize",resize);
      resize();
      return { destruir() { destroyed=true; if(observer) observer.disconnect(); else window.removeEventListener("resize",resize); } };
    },
    destruir() {}
  };
})();
