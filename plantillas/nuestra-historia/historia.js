/* Nuestra historia: reconstrucción de datos y controles permanentes separados. */
(() => {
  'use strict';
  const isPreview = new URLSearchParams(location.search).get('preview') === '1';
  if (isPreview) document.documentElement.classList.add('eros-preview-mode');
  let current = null, lastData = null;
  const gameModules = new Map();
  function loadGameModule(name) {
    if (window.JUEGOS?.[name]) return Promise.resolve(window.JUEGOS[name]);
    if (!gameModules.has(name)) gameModules.set(name, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../../plantillas/juegos-interactivos/juegos/' + name + '.js';
      script.onload = () => window.JUEGOS?.[name]?.iniciar ? resolve(window.JUEGOS[name]) : reject(new Error('Juego no disponible'));
      script.onerror = () => { gameModules.delete(name); script.remove(); reject(new Error('Juego no disponible')); };
      document.head.append(script);
    }));
    return gameModules.get(name);
  }
  function mount(data, savedScroll) {
      const text = (value) => typeof value === "string" ? value.trim() : "";
      const safeFile = (value) => {
        const path = text(value).replace(/\\/g, "/");
        if (window.ErosPagina?.activa && window.ErosPagina.esRecursoPermitido(path)) return path;
        if (isPreview && path.startsWith("blob:") && new URL(path).origin === location.origin) return path;
        if (!path || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split("/").includes("..")) return "";
        return path;
      };
      const para = text(data.para);
      const de = text(data.de);
      const extras = data.extras && typeof data.extras === "object" ? data.extras : {};
      const principal = data.principal && typeof data.principal === "object" ? data.principal : {};
      const inicio = data.inicio && typeof data.inicio === "object" ? data.inicio : {};
      const cierre = data.cierre && typeof data.cierre === "object" ? data.cierre : {};
      const startTitle = text(inicio.titulo) || (para ? "Un recorrido para " + para : "Un recorrido para vos");
      const startLabel = text(inicio.boton) || "Tocá para empezar";
      const rawTitle = text(principal.titulo);
      const rawSubtitle = text(principal.subtitulo);
      const title = rawTitle || (para ? "Nuestra historia, " + para : (isPreview ? "Nuestra historia para Nombre" : "Nuestra historia"));
      const subtitle = rawSubtitle || (isPreview ? "Un recorrido por momentos importantes…" : "");
      const preferredColor = text(data.colorPrincipal);
      const customColor = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(preferredColor) ? preferredColor : "";
      const apertura = window.ErosApertura.elegirApertura(data);
      const rawGame = text(extras.juego);
      const gameName = ["pintar-corazon", "margarita", "laberinto"].includes(rawGame) ? rawGame : "";
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const intro = document.getElementById("introScreen");
      const startButton = document.getElementById("startButton");
      const gameScreen = document.getElementById("gameScreen");
      const gamePrompt = document.getElementById("gamePrompt");
      const gameRecipient = document.getElementById("gameRecipient");
      const gameStage = document.getElementById("gameStage");
      const gameStatus = document.getElementById("gameStatus");
      const rescueButton = document.getElementById("rescueButton");
      const envelopeScreen = document.getElementById("envelopeScreen");
      const contentScreen = document.getElementById("contentScreen");
      const titleNode = document.getElementById("storyTitle");
      const subtitleNode = document.getElementById("storySubtitle");
      const closingMessage = document.getElementById("closingMessage");
      const signatureNode = document.getElementById("signature");
      const siteFooter = document.getElementById("siteFooter");
      const counterRoot = document.getElementById("togetherCounter");
      const momentList = document.getElementById("momentList");
      const timeline = document.getElementById("timeline");
      const routeSvg = document.getElementById("timelineRoute");
      const ambientLayer = document.getElementById("ambientHearts");
      const tapLayer = document.getElementById("tapHeartLayer");
      const confettiLayer = document.getElementById("confettiLayer");
      const audio = document.getElementById("backgroundMusic");
      const musicToggle = document.getElementById("musicToggle");
      const music = window.ErosAudio?.montar(audio, musicToggle, data.audio?.src);
      music?.escucharApertura(envelopeScreen);
      const photoDialog = document.getElementById("photoDialog");
      const lightboxImage = document.getElementById("lightboxImage");
      const effectsCanvas = document.getElementById("effectsCanvas");
      const validMoments = Array.isArray(data.momentos) ? data.momentos.slice(0, 8).filter((moment) => moment && typeof moment === "object") : [];
      if (isPreview) while (validMoments.length < 8) validMoments.push({});
      let gameInstance = null;
      let gameTimer = 0;
      let gameFinished = false;
      let contentShown = false;
      let routeFrame = 0;
      let confettiTimer = 0;
      let routeGeometry = null;
      let startHandled = false;
      let active = true, revealObserver = null, openFrame = 0, jumpFrame = 0;
      let effects = null, gameGeneration = 0;
      const generatedEvents = new AbortController();

      if (window.ErosTemas) {
        const query = new URLSearchParams(location.search);
        window.ErosTemas.aplicar(!isPreview && query.has('tema') ? query.get('tema') : text(data.tema));
      }
      if (customColor) {
        const hex = customColor.length === 4 ? customColor.slice(1).split("").map((part) => part + part).join("") : customColor.slice(1);
        const rgb = [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)).join(",");
        document.documentElement.style.setProperty("--wine", customColor);
        document.documentElement.style.setProperty("--wine-rgb", rgb);
      }
      document.title = title + " | Eros Web";
      document.getElementById("introTitle").textContent = startTitle;
      startButton.textContent = startLabel;
      titleNode.textContent = title;
      subtitleNode.textContent = subtitle;
      const rawClosingMessage = text(cierre.mensaje);
      const rawSignature = text(data.firma);
      closingMessage.textContent = rawClosingMessage || (isPreview ? "Acá va tu mensaje final…" : "");
      signatureNode.textContent = rawSignature || (isPreview ? "Tu firma" : "");
      siteFooter.textContent = de ? "Hecho con ♡ por " + de + " · Eros Web" : "Eros Web";
      subtitleNode.hidden = !subtitle;
      closingMessage.hidden = !rawClosingMessage && !isPreview;
      signatureNode.hidden = !rawSignature && !isPreview;
      titleNode.classList.toggle("preview-example", isPreview && !rawTitle && !para);
      subtitleNode.classList.toggle("preview-example", isPreview && !rawSubtitle);
      closingMessage.classList.toggle("preview-example", isPreview && !rawClosingMessage);
      signatureNode.classList.toggle("preview-example", isPreview && !rawSignature);
      gameRecipient.hidden = !para;
      gameRecipient.textContent = "";
      if (para) {
        gameRecipient.textContent = "Un juego para " + para;
        gameRecipient.hidden = false;
      }
      gamePrompt.textContent = para ? "Un juego para " + para : "Una sorpresa antes de nuestra historia";
      const counter = window.ErosContador?.montar(counterRoot, extras.contador);
      let envelope = apertura === 'sobre' ? window.ErosSobre?.montar(envelopeScreen, () => { if (active) openContent(); }, { demo:isPreview }) : null;

      const doodlePaths = [
        ["doodle-heart", "M44 70 C38 65 13 48 9 32 C5 17 17 9 29 12 C36 14 41 19 44 26 C48 17 57 10 68 12 C80 15 84 27 79 38 C74 53 55 66 44 70 Z"],
        ["doodle-echo", "M43 67 C31 58 15 45 13 32 C11 23 16 17 24 16"],
        ["doodle-vein", "M22 25 C28 19 35 22 39 29 M51 25 C57 19 64 20 68 26"],
        ["doodle-spark", "M7 43l-4 1 M11 54l-3 3 M80 47l4 1 M76 58l3 3"]
      ];
      function createDoodle() {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "photo-heart-doodle");
        svg.setAttribute("viewBox", "0 0 88 82");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        doodlePaths.forEach(([name, d]) => {
          const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("class", name);
          path.setAttribute("d", d);
          svg.appendChild(path);
        });
        return svg;
      }

      function createPhotoPlaceholder(index) {
        const placeholder = document.createElement("span");
        placeholder.className = "preview-photo-empty";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", "Lugar para la foto del momento " + index);
        const icon = document.createElement("span");
        icon.className = "preview-photo-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "♡";
        const label = document.createElement("span");
        label.textContent = "Tu foto acá";
        placeholder.append(icon, label);
        return placeholder;
      }

      function openPhoto(image) {
        if (!image || !image.currentSrc && !image.src) return;
        lightboxImage.src = image.currentSrc || image.src;
        lightboxImage.alt = image.alt;
        if (typeof photoDialog.showModal === "function") photoDialog.showModal();
      }
      function closePhoto() {
        if (photoDialog.open) photoDialog.close();
        lightboxImage.removeAttribute("src");
        lightboxImage.alt = "";
      }

      function renderMoments() {
        const records = isPreview ? validMoments : validMoments.filter((moment) => text(moment.fecha) || text(moment.titulo) || text(moment.texto) || safeFile(moment.foto));
        timeline.hidden = !records.length;
        if (!records.length) return;
        records.forEach((moment, index) => {
          const item = document.createElement("li");
          item.className = "moment reveal";
          item.dataset.side = index % 2 === 0 ? "left" : "right";
          const body = document.createElement("div");
          body.className = "moment-body";
          const date = text(moment.fecha);
          if (date || isPreview) {
            const dateNode = document.createElement("time");
            dateNode.className = "moment-date";
            dateNode.textContent = date || "Tu fecha acá";
            dateNode.classList.toggle("preview-example", isPreview && !date);
            body.appendChild(dateNode);
          }
          const imagePath = safeFile(moment.foto);
          if (imagePath || isPreview) {
            const figure = document.createElement("figure");
            figure.className = "moment-photo reveal " + (index % 2 === 0 ? "photo-left" : "photo-right");
            figure.style.setProperty("--tilt", ["-3.5deg", "3deg", "-2.5deg", "2.5deg"][index % 4]);
            const frame = document.createElement("div");
            frame.className = "photo-frame reveal";
            const trigger = document.createElement("button");
            trigger.type = "button";
            trigger.className = "photo-trigger";
            const alt = text(moment.alt) || (para ? "Foto de un momento de " + para + " y " + (de || "su pareja") : "Foto de un momento especial");
            if (imagePath) {
              trigger.setAttribute("aria-label", "Ampliar foto: " + alt);
              const image = document.createElement("img");
              image.src = imagePath;
              image.alt = alt;
              image.loading = "lazy";
              image.decoding = "async";
              image.addEventListener("error", () => {
                if (!active) return;
                if (isPreview) {
                  image.replaceWith(createPhotoPlaceholder(index + 1));
                  trigger.disabled = true;
                  trigger.setAttribute("aria-label", "Lugar para la foto del momento " + (index + 1));
                } else figure.remove();
                requestRouteUpdate();
              }, { once: true, signal: generatedEvents.signal });
              image.addEventListener("load", requestRouteUpdate, { once: true, signal: generatedEvents.signal });
              trigger.appendChild(image);
            } else {
              trigger.disabled = true;
              trigger.setAttribute("aria-label", "Lugar para la foto del momento " + (index + 1));
              trigger.appendChild(createPhotoPlaceholder(index + 1));
            }
            frame.appendChild(trigger);
            figure.append(frame, createDoodle());
            body.appendChild(figure);
          }
          const headingText = text(moment.titulo);
          if (headingText || isPreview) {
            const heading = document.createElement("h2");
            heading.className = "moment-title";
            heading.textContent = headingText || "Momento " + (index + 1);
            heading.classList.toggle("preview-example", isPreview && !headingText);
            body.appendChild(heading);
          }
          const paragraphText = text(moment.texto);
          if (paragraphText || isPreview) {
            const paragraph = document.createElement("p");
            paragraph.className = "moment-text";
            paragraph.textContent = paragraphText || "Tu momento especial…";
            paragraph.classList.toggle("preview-example", isPreview && !paragraphText);
            body.appendChild(paragraph);
          }
          item.appendChild(body);
          momentList.appendChild(item);
        });
        requestRouteUpdate();
      }

      function buildRoute() {
        if (!active || !contentShown || timeline.hidden) return;
        const width = Math.max(1, timeline.clientWidth);
        const height = Math.max(1, timeline.scrollHeight);
        routeSvg.setAttribute("viewBox", "0 0 " + width + " " + height);
        routeSvg.setAttribute("preserveAspectRatio", "none");
        routeSvg.replaceChildren();
        const desktop = window.matchMedia("(min-width: 800px)").matches;
        const baseX = desktop ? width / 2 : Math.min(25, Math.max(20, width * .075));
        const items = Array.from(momentList.querySelectorAll(".moment"));
        const points = [{ x: baseX, y: 0 }];
        items.forEach((item, index) => {
          const y = Math.max(18, Math.min(height - 18, item.offsetTop + item.offsetHeight / 2));
          const sway = desktop ? (index % 2 === 0 ? -13 : 13) : Math.sin(index * 1.25) * 5;
          points.push({ x: baseX + sway, y });
        });
        points.push({ x: baseX, y: height });
        let d = "M " + points[0].x + " " + points[0].y;
        for (let i = 1; i < points.length; i += 1) {
          const previous = points[i - 1];
          const point = points[i];
          const mid = (previous.y + point.y) / 2;
          d += " C " + previous.x + " " + mid + ", " + point.x + " " + mid + ", " + point.x + " " + point.y;
        }
        const ns = "http://www.w3.org/2000/svg";
        const track = document.createElementNS(ns, "path");
        track.setAttribute("class", "route-track");
        track.setAttribute("d", d);
        routeSvg.appendChild(track);
        const progress = document.createElementNS(ns, "path");
        progress.setAttribute("class", "route-progress");
        progress.setAttribute("d", d);
        routeSvg.appendChild(progress);
        items.forEach((item, index) => {
          const point = points[index + 1];
          const stop = document.createElementNS(ns, "circle");
          stop.setAttribute("class", "route-stop");
          stop.setAttribute("cx", String(point.x));
          stop.setAttribute("cy", String(point.y));
          stop.setAttribute("r", "5.5");
          routeSvg.appendChild(stop);
        });
        const marker = document.createElementNS(ns, "text");
        marker.setAttribute("class", "route-heart");
        marker.setAttribute("text-anchor", "middle");
        marker.setAttribute("dominant-baseline", "central");
        marker.textContent = "♥";
        routeSvg.appendChild(marker);
        const length = progress.getTotalLength();
        progress.style.strokeDasharray = String(length);
        routeGeometry = { path: progress, marker, length, top: timeline.getBoundingClientRect().top + window.scrollY, height };
        updateRouteProgress();
      }

      function updateRouteProgress() {
        if (!active || !routeGeometry) return;
        const viewport = window.innerHeight || document.documentElement.clientHeight;
        const start = routeGeometry.top - viewport * .26;
        const end = routeGeometry.top + routeGeometry.height - viewport * .72;
        const denominator = Math.max(1, end - start);
        const progress = Math.max(0, Math.min(1, (window.scrollY - start) / denominator));
        routeGeometry.path.style.strokeDashoffset = String(routeGeometry.length * (1 - progress));
        const point = routeGeometry.path.getPointAtLength(routeGeometry.length * progress);
        routeGeometry.marker.setAttribute("x", String(point.x));
        routeGeometry.marker.setAttribute("y", String(point.y));
      }

      function requestRouteUpdate() {
        if (!active) return;
        if (routeFrame) cancelAnimationFrame(routeFrame);
        routeFrame = requestAnimationFrame(() => {
          routeFrame = 0;
          buildRoute();
        });
      }

      function observeReveals() {
        const items = contentScreen.querySelectorAll(".reveal");
        if (!("IntersectionObserver" in window)) {
          items.forEach((item) => item.classList.add("is-visible"));
          return;
        }
        revealObserver?.disconnect();
        revealObserver = new IntersectionObserver((entries, current) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              current.unobserve(entry.target);
            }
          });
        }, { threshold: .12, rootMargin: "0px 0px -18px 0px" });
        items.forEach((item) => revealObserver.observe(item));
      }

      function startHearts() {
        const count = reducedMotion.matches ? 9 : 36;
        for (let i = 0; i < count; i += 1) {
          const heart = document.createElement("span");
          const duration = reducedMotion.matches ? 48 + Math.random() * 20 : 9 + Math.random() * 9;
          heart.className = "ambient-heart";
          heart.textContent = i % 2 === 0 ? "♥" : "♡";
          heart.style.setProperty("--x", Math.random() * 100 + "%");
          heart.style.setProperty("--size", 14 + Math.random() * 24 + "px");
          heart.style.setProperty("--duration", duration + "s");
          heart.style.setProperty("--delay", -Math.random() * duration + "s");
          heart.style.setProperty("--alpha", reducedMotion.matches ? ".18" : String(.25 + Math.random() * .45));
          heart.style.setProperty("--mid-sway", (Math.random() - .5) * 32 + "px");
          heart.style.setProperty("--sway", (Math.random() - .5) * 32 + "px");
          heart.style.setProperty("--turn", (Math.random() - .5) * 70 + "deg");
          ambientLayer.appendChild(heart);
        }
      }

      function showConfetti() {
        if (reducedMotion.matches) return;
        confettiLayer.replaceChildren();
        for (let i = 0; i < 42; i += 1) {
          const heart = document.createElement("span");
          heart.className = "confetti-heart";
          heart.textContent = i % 4 === 0 ? "♡" : "♥";
          heart.style.setProperty("--size", 18 + Math.random() * 25 + "px");
          heart.style.setProperty("--drift", (Math.random() - .5) * 100 + "vw");
          heart.style.setProperty("--fall", (Math.random() - .5) * 100 + "vh");
          heart.style.setProperty("--turn", (Math.random() - .5) * 110 + "deg");
          heart.style.setProperty("--delay", Math.random() * .3 + "s");
          heart.addEventListener("animationend", () => heart.remove(), { once: true });
          confettiLayer.appendChild(heart);
        }
        window.clearTimeout(confettiTimer);
        confettiTimer = window.setTimeout(() => confettiLayer.replaceChildren(), 2600);
      }

      function cleanupGame() {
        gameGeneration += 1;
        window.clearTimeout(gameTimer);
        effects?.destruir();
        effects = null;
        if (gameInstance && typeof gameInstance.destruir === 'function') gameInstance.destruir();
        gameInstance = null;
        gameStage.replaceChildren();
        document.body.classList.remove('playing');
      }
      function openContent(settings = {}) {
        if (!active || contentShown) return;
        contentShown = true;
        cleanupGame();
        envelope?.destruir();
        envelope = null;
        intro.hidden = true;
        gameScreen.hidden = true;
        envelopeScreen.hidden = true;
        contentScreen.hidden = false;
        contentScreen.classList.toggle('is-opening', !settings.quiet);
        if (settings.quiet) contentScreen.classList.add('is-open');
        if (!isPreview && !settings.quiet) music?.reproducir();
        ambientLayer.replaceChildren();
        startHearts();
        observeReveals();
        if (!settings.quiet) showConfetti();
        requestRouteUpdate();
        openFrame = requestAnimationFrame(() => {
          if (!active) return;
          contentScreen.classList.remove('is-opening');
          contentScreen.classList.add('is-open');
          if (!isPreview && !settings.quiet) titleNode.focus({ preventScroll:true });
          const top = Number.isFinite(settings.scroll) ? settings.scroll : 0;
          window.scrollTo({ top, behavior: settings.quiet || reducedMotion.matches ? 'instant' : 'smooth' });
          requestRouteUpdate();
        });
      }
      function finishGame() {
        if (!active || gameFinished) return;
        gameFinished = true;
        if (!isPreview) music?.reproducir();
        cleanupGame();
        if (window.NucleoEfectos?.explotar) {
          const color = getComputedStyle(document.documentElement).getPropertyValue('--wine').trim() || '#8b3d52';
          effects = window.NucleoEfectos.explotar(effectsCanvas, color, () => { if (active) openContent(); }, isPreview ? { duracion:1500 } : undefined);
        } else openContent();
      }
      function skipGame() {
        if (!active || gameFinished) return;
        gameFinished = true;
        cleanupGame();
        openContent();
      }
      async function loadGame(demoJuego = isPreview) {
        cleanupGame();
        gameFinished = false;
        contentShown = false;
        contentScreen.hidden = true;
        contentScreen.classList.remove('is-open', 'is-opening');
        intro.hidden = true;
        envelopeScreen.hidden = true;
        gameScreen.hidden = false;
        gameStatus.textContent = '';
        rescueButton.hidden = true;
        if (!gameName) { openContent(); return; }
        document.body.classList.add('playing');
        if (!isPreview) gamePrompt.focus({ preventScroll:true });
        window.scrollTo({ top:0, behavior:'instant' });
        const token = gameGeneration;
        gameTimer = window.setTimeout(() => { if (active && token === gameGeneration) rescueButton.hidden = false; }, 60000);
        try {
          const game = await loadGameModule(gameName);
          if (!active || token !== gameGeneration) return;
          const gameConfig = extras[gameName] || extras.laberinto || {};
          gameInstance = game.iniciar(gameStage, { ...gameConfig, demo:isPreview && demoJuego }, () => {
            if (active && token === gameGeneration) finishGame();
          }, {
            color: getComputedStyle(document.documentElement).getPropertyValue('--wine').trim() || '#8b3d52', para, de, demo:isPreview && demoJuego
          });
        } catch (_) {
          if (!active || token !== gameGeneration) return;
          gameStatus.textContent = 'No se pudo cargar el juego. Podés seguir al recorrido.';
          rescueButton.hidden = false;
        }
      }
      function runOpening(demoJuego = isPreview) {
        if (!active) return;
        cancelAnimationFrame(openFrame);
        cancelAnimationFrame(jumpFrame);
        if (isPreview && reducedMotion.matches && demoJuego) { openContent({ quiet:true, scroll:savedScroll }); return; }
        window.clearTimeout(confettiTimer);
        confettiLayer.replaceChildren();
        ambientLayer.replaceChildren();
        tapLayer.replaceChildren();
        contentScreen.classList.remove('is-open', 'is-opening');
        if (apertura === 'juego') { loadGame(demoJuego); return; }
        cleanupGame();
        contentShown = false;
        contentScreen.hidden = true;
        contentScreen.classList.remove('is-open', 'is-opening');
        gameScreen.hidden = true;
        intro.hidden = true;
        envelope?.destruir();
        envelope = window.ErosSobre?.montar(envelopeScreen, () => { if (active) openContent(); }, { demo:isPreview });
        if (envelope) envelope.mostrar(); else openContent();
        window.scrollTo({ top:0, behavior:'instant' });
      }
      function startExperience() {
        if (startHandled) return;
        startHandled = true;
        intro.hidden = true;
        music?.reproducir();
        runOpening();
      }
      function jump(section) {
        const id = { contador:'togetherCounter', recorrido:'timeline', musica:'musicToggle', cierre:'closingBlock' }[section];
        if (!id) return;
        if (contentScreen.hidden) openContent({ quiet:true, scroll:savedScroll });
        cancelAnimationFrame(jumpFrame);
        jumpFrame = requestAnimationFrame(() => {
          if (!active) return;
          const target = document.getElementById(id);
          if (target && !target.hidden) {
            target.classList.add('is-visible');
            // Mantiene el movimiento dentro del iframe de vista previa; scrollIntoView puede
            // propagarlo al viewport de la página armadora que aloja el iframe.
            window.scrollTo({ top:Math.max(0, window.scrollY + target.getBoundingClientRect().top), behavior:reducedMotion.matches ? 'instant' : 'smooth' });
            requestRouteUpdate();
          }
        });
      }

      function spawnTapHeart(event) {
        if (reducedMotion.matches) return;
        const heart = document.createElement("span");
        heart.className = "tap-heart";
        heart.textContent = "♡";
        heart.style.left = event.clientX + "px";
        heart.style.top = event.clientY + "px";
        heart.addEventListener("animationend", () => heart.remove(), { once: true });
        tapLayer.appendChild(heart);
      }

      renderMoments();
      document.fonts?.ready.then(() => { if (active) requestRouteUpdate(); });
      return {
        command(options = {}, first = false) {
          if (options.repetir === 'apertura' || (first && (options.saltarSobre === false || options.saltarJuego === false))) runOpening(options.demoJuego !== false);
          else if (first) openContent({ quiet:true, scroll:savedScroll });
          if (options.irA) jump(options.irA);
        },
        isContentShown: () => contentShown,
        openContent, startExperience, skipGame, openPhoto, closePhoto,
        spawnTapHeart, updateRouteProgress, requestRouteUpdate,
        destroy() {
          if (!active) return;
          active = false;
          generatedEvents.abort();
          counter?.detener();
          music?.destruir();
          envelope?.destruir();
          cleanupGame();
          revealObserver?.disconnect();
          window.clearTimeout(confettiTimer);
          cancelAnimationFrame(routeFrame);
          cancelAnimationFrame(openFrame);
          cancelAnimationFrame(jumpFrame);
          routeGeometry = null;
          closePhoto();
          audio.pause(); audio.removeAttribute('src'); musicToggle.hidden = true;
          momentList.replaceChildren(); routeSvg.replaceChildren(); counterRoot.replaceChildren(); counterRoot.hidden = true;
          ambientLayer.replaceChildren(); tapLayer.replaceChildren(); confettiLayer.replaceChildren();
          effectsCanvas.hidden = true;
          effectsCanvas.getContext('2d')?.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
          contentScreen.querySelectorAll('.reveal').forEach((node) => node.classList.remove('is-visible'));
          contentScreen.classList.remove('is-open', 'is-opening');
          contentScreen.hidden = true; gameScreen.hidden = true; intro.hidden = false;
        }
      };
  }
  function render(datos, opciones = {}) {
    const data = datos && typeof datos === 'object' ? datos : {};
    const options = opciones && typeof opciones === 'object' ? opciones : {};
    const serialized = JSON.stringify(data);
    const previewDebug = isPreview && new URLSearchParams(location.search).get('debug') === '1';
    if (previewDebug) console.info('[Eros preview render]', current && serialized === lastData ? 'datos sin cambios; se conserva el DOM' : 'render ejecutado', { modelo:'nuestra-historia', campos:Object.keys(data).length });
    if (current && serialized === lastData) { if (isPreview) current.command(options); return; }
    const scroll = window.scrollY;
    const wasOpen = current?.isContentShown();
    current?.destroy();
    lastData = serialized;
    current = mount(data, scroll);
    if (isPreview) current.command(options, true);
    else if (wasOpen) current.openContent({ quiet:true, scroll });
  }
  function bind(id, event, handler) { document.getElementById(id).addEventListener(event, handler); }
  bind('startButton', 'click', () => current?.startExperience());
  bind('rescueButton', 'click', () => current?.skipGame());
  bind('closePhoto', 'click', () => current?.closePhoto());
  bind('lightboxImage', 'click', () => current?.closePhoto());
  bind('photoDialog', 'click', (event) => { if (event.target.id === 'photoDialog') current?.closePhoto(); });
  bind('photoDialog', 'close', () => { const image = document.getElementById('lightboxImage'); image.removeAttribute('src'); image.alt = ''; });
  bind('momentList', 'click', (event) => { const trigger = event.target.closest('.photo-trigger'); if (trigger) current?.openPhoto(trigger.querySelector('img')); });
  bind('contentScreen', 'pointerdown', (event) => { if (!event.target.closest('button,a,dialog,.moment-photo')) current?.spawnTapHeart(event); });
  window.addEventListener('scroll', () => current?.updateRouteProgress(), { passive:true });
  window.addEventListener('resize', () => current?.requestRouteUpdate());
  window.addEventListener('orientationchange', () => current?.requestRouteUpdate());
  window.ErosPlantilla = Object.freeze({ render, destruir() { current?.destroy(); current = null; lastData = null; } });
  if (new URLSearchParams(location.search).has('c') && !isPreview) {
    if (window.ErosPagina?.activa) window.ErosPagina.iniciar('nuestra-historia');
    else {
      document.querySelector('main').hidden = true;
      const error = document.createElement('p'); error.setAttribute('role','alert');
      error.textContent = 'No pudimos abrir tu regalo. Revisá tu conexión y volvé a cargar la página.';
      document.body.append(error);
    }
  } else if (!isPreview || parent === window) render(window.DATOS || {});
})();
