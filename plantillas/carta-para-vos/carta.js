/* Carta para vos: DOM por render y controles estables registrados una sola vez. */
(() => {
  'use strict';
  const isPreview = new URLSearchParams(location.search).get('preview') === '1';
  let current = null, lastData = null;
  if (isPreview) document.documentElement.classList.add('eros-preview-mode');
  const gameScripts = new Map();
  function loadGame(slug) {
    if (window.JUEGOS?.[slug]) return Promise.resolve();
    if (!gameScripts.has(slug)) gameScripts.set(slug, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '../../plantillas/juegos-interactivos/juegos/' + slug + '.js';
      script.onload = resolve; script.onerror = () => { gameScripts.delete(slug); script.remove(); reject(new Error('Juego no disponible')); };
      document.head.append(script);
    }));
    return gameScripts.get(slug);
  }
  function mount(raw, savedScroll) {
      const asText = (value) => typeof value === "string" ? value.trim() : "";
      const safeRelativeFile = (value) => {
        const path = asText(value).replace(/\\/g, "/");
        if (window.ErosPagina?.activa && window.ErosPagina.esRecursoPermitido(path)) return path;
        if (isPreview && path.startsWith("blob:") && new URL(path).origin === location.origin) return path;
        if (!path || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split("/").includes("..")) return "";
        return path;
      };
      const para = asText(raw.para);
      const de = asText(raw.de);
      const extras = raw.extras && typeof raw.extras === "object" ? raw.extras : {};
      const inicio = raw.inicio && typeof raw.inicio === "object" ? raw.inicio : {};
      const carta = raw.carta && typeof raw.carta === "object" ? raw.carta : {};
      const introTitle = asText(inicio.titulo) || (para ? "Un regalo para " + para : "Un regalo para vos");
      const introButton = asText(inicio.boton) || "Tocá para empezar";
      const rawLetterTitle = asText(carta.titulo);
      const letterTitle = rawLetterTitle || (isPreview ? (para ? "Para " + para : "Para Nombre") : (para ? "Una carta para " + para : "Una carta para vos"));
      const rawSignature = asText(raw.firma);
      const signature = rawSignature || (isPreview ? "Tu firma" : "");
      const musicPath = safeRelativeFile(raw.musica);
      const requestedColor = asText(raw.colorPrincipal);
      const customColor = /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(requestedColor) ? requestedColor : "";
      const textBlocks = Array.isArray(carta.bloques) ? carta.bloques : [];
      const apertura = window.ErosApertura.elegirApertura(raw);

      const introScreen = document.getElementById("introScreen");
      const envelopeScreen = document.getElementById("envelopeScreen");
      const letterScreen = document.getElementById("letterScreen");
      const startButton = document.getElementById("startButton");
      const introHeading = document.getElementById("introTitle");
      const letterHeading = document.getElementById("letterTitle");
      const letterCard = document.getElementById("letterCard");
      const letterBlocks = document.getElementById("letterBlocks");
      const counterRoot = document.getElementById("togetherCounter");
      const closingBlock = document.getElementById("closingBlock");
      const signatureNode = document.getElementById("signature");
      const siteFooter = document.getElementById("siteFooter");
      const audio = document.getElementById("backgroundMusic");
      const musicToggle = document.getElementById("musicToggle");
      const musicText = document.getElementById("musicText");
      const ambientHearts = document.getElementById("ambientHearts");
      const tapHeartLayer = document.getElementById("tapHeartLayer");
      const confettiLayer = document.getElementById("confettiLayer");
      const photoDialog = document.getElementById("photoDialog");
      const lightboxImage = document.getElementById("lightboxImage");
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const svgNamespace = "http://www.w3.org/2000/svg";
      let musicUsable = Boolean(musicPath);
      let confettiTimer = 0, openFrame = 0, observer = null, game = null, gameRoot = null, gameRun = 0;
      let active = true;
      let sharedEnvelope = null;

      if (window.ErosTemas) window.ErosTemas.aplicar(!isPreview && new URLSearchParams(location.search).has('tema') ? new URLSearchParams(location.search).get('tema') : asText(raw.tema));
      if (customColor) {
        const normalizedColor = customColor.length === 4 ? customColor.slice(1).split("").map((part) => part + part).join("") : customColor.slice(1);
        const customRgb = [0, 2, 4].map((index) => parseInt(normalizedColor.slice(index, index + 2), 16)).join(",");
        document.documentElement.style.setProperty("--wine", customColor);
        document.documentElement.style.setProperty("--wine-rgb", customRgb);
      }
      document.title = letterTitle + " | Eros Web";
      introHeading.textContent = introTitle;
      startButton.textContent = introButton;
      letterHeading.textContent = letterTitle;
      letterHeading.classList.toggle("preview-example", isPreview && !rawLetterTitle && !para);
      letterCard.setAttribute("aria-label", para ? "Carta para " + para : "Carta para vos");
      signatureNode.textContent = signature;
      signatureNode.classList.toggle("preview-example", isPreview && !rawSignature);
      siteFooter.textContent = de ? "Hecho con ♡ por " + de + " · Eros Web" : "Eros Web";
      const counter = window.ErosContador ? window.ErosContador.montar(counterRoot, extras.contador) : null;
      // El sobre se monta solo cuando es la apertura elegida.
      if (apertura === "sobre" && window.ErosSobre) sharedEnvelope = window.ErosSobre.montar(envelopeScreen, finishOpening, { demo:isPreview });

      function createPetals() {
        const svg = document.createElementNS(svgNamespace, "svg");
        svg.setAttribute("class", "letter-petals reveal");
        svg.setAttribute("viewBox", "0 0 60 36");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        const heartPath = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";
        [[2, 9, .62], [21, 1, .72], [40, 9, .62]].forEach(([x, y, scale]) => {
          const path = document.createElementNS(svgNamespace, "path");
          path.setAttribute("d", heartPath);
          path.setAttribute("transform", `translate(${x} ${y}) scale(${scale})`);
          svg.appendChild(path);
        });
        return svg;
      }

      function createPhotoDoodle() {
        const svg = document.createElementNS(svgNamespace, "svg");
        svg.setAttribute("class", "photo-heart-doodle");
        svg.setAttribute("viewBox", "0 0 88 82");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("focusable", "false");
        const paths = [
          ["doodle-heart", "M44 70 C38 65 13 48 9 32 C5 17 17 9 29 12 C36 14 41 19 44 26 C48 17 57 10 68 12 C80 15 84 27 79 38 C74 53 55 66 44 70 Z"],
          ["doodle-echo", "M43 67 C31 58 15 45 13 32 C11 23 16 17 24 16"],
          ["doodle-vein", "M22 25 C28 19 35 22 39 29 M51 25 C57 19 64 20 68 26"],
          ["doodle-spark", "M7 43l-4 1 M11 54l-3 3 M80 47l4 1 M76 58l3 3"]
        ];
        paths.forEach(([className, d]) => {
          const path = document.createElementNS(svgNamespace, "path");
          path.setAttribute("class", className);
          path.setAttribute("d", d);
          svg.appendChild(path);
        });
        return svg;
      }

      function createPhotoPlaceholder(index) {
        const placeholder = document.createElement("span");
        placeholder.className = "photo-empty";
        placeholder.setAttribute("role", "img");
        placeholder.setAttribute("aria-label", "Lugar para la foto " + index);
        const icon = document.createElement("span");
        icon.className = "preview-photo-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = "♡";
        const label = document.createElement("span");
        label.textContent = "Tu foto acá";
        placeholder.append(icon, label);
        return placeholder;
      }

      function previewBlocks() {
        if (!isPreview) return textBlocks;
        const paragraphs = textBlocks.filter((block) => block && typeof block === "object" && Object.hasOwn(block, "texto"));
        const photos = textBlocks.filter((block) => block && typeof block === "object" && Object.hasOwn(block, "foto"));
        if (!paragraphs.length) paragraphs.push({ texto:"" });
        const after = Array.from({ length:paragraphs.length }, () => []);
        for (let index = 0; index < 3; index += 1) {
          const paragraphIndex = Math.min(paragraphs.length - 1, Math.floor(((index + 1) * paragraphs.length) / 4));
          const photo = photos[index] || {};
          after[paragraphIndex].push({ foto:photo.foto || "", alt:photo.alt || "", previewSlot:index + 1 });
        }
        const blocks = [];
        paragraphs.forEach((paragraph, index) => {
          blocks.push(paragraph);
          after[index].forEach((photo) => blocks.push(photo));
        });
        return blocks;
      }

      let validTextCount = 0;
      let photoCount = 0;
      previewBlocks().forEach((block) => {
        if (!block || typeof block !== "object") return;
        const text = asText(block.texto);
        if (text || isPreview && Object.hasOwn(block, "texto")) {
          if (validTextCount > 0) letterBlocks.appendChild(createPetals());
          const paragraph = document.createElement("p");
          paragraph.className = "letter-text reveal";
          paragraph.textContent = text || (isPreview ? "Acá va tu mensaje…" : "");
          paragraph.classList.toggle("preview-example", isPreview && !text);
          letterBlocks.appendChild(paragraph);
          validTextCount += 1;
          return;
        }

        const imagePath = safeRelativeFile(block.foto);
        if ((!imagePath && !isPreview) || photoCount >= 3) return;
        const imageIndex = photoCount;
        const figure = document.createElement("figure");
        const side = imageIndex % 2 === 0 ? "photo-left" : "photo-right";
        figure.className = `photo-card reveal photo-${imageIndex + 1} ${side}`;
        figure.style.setProperty("--tilt", ["-4deg", "3deg", "5deg"][imageIndex]);
        if (imagePath) {
          const image = document.createElement("img");
          image.src = imagePath;
          image.alt = asText(block.alt) || (para ? "Foto con " + para : "Foto de un momento especial");
          image.loading = "lazy";
          image.decoding = "async";
          image.addEventListener("error", () => {
            if (isPreview) image.replaceWith(createPhotoPlaceholder(imageIndex + 1));
            else figure.remove();
          }, { once: true });
          figure.append(image);
        } else {
          figure.append(createPhotoPlaceholder(imageIndex + 1));
        }
        figure.append(createPhotoDoodle());
        letterBlocks.appendChild(figure);
        photoCount += 1;
      });
      if (photoCount > 0) letterCard.classList.add("has-photos");
      if (signature) closingBlock.classList.add("has-signature");

      function addReveals() {
        const items = document.querySelectorAll(".reveal");
        if (!("IntersectionObserver" in window)) {
          items.forEach((item) => item.classList.add("is-visible"));
          return;
        }
        if (observer) observer.disconnect();
        observer = new IntersectionObserver((entries, currentObserver) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              currentObserver.unobserve(entry.target);
            }
          });
        }, { threshold: .12, rootMargin: "0px 0px -20px 0px" });
        items.forEach((item) => observer.observe(item));
      }

      function addAmbientHearts() {
        const isReduced = reducedMotion.matches;
        const count = isReduced ? 8 : 100;
        for (let i = 0; i < count; i += 1) {
          const heart = document.createElement("span");
          const duration = isReduced ? 36 + Math.random() * 14 : 9 + Math.random() * 9;
          const swayRange = isReduced ? 8 : 34;
          heart.className = "ambient-heart";
          heart.textContent = i % 2 === 0 ? "♥" : "♡";
          heart.style.setProperty("--x", `${Math.random() * 100}%`);
          heart.style.setProperty("--size", `${14 + Math.random() * 24}px`);
          heart.style.setProperty("--duration", `${duration}s`);
          heart.style.setProperty("--delay", `${-Math.random() * duration}s`);
          heart.style.setProperty("--alpha", `${isReduced ? .22 + Math.random() * .18 : .25 + Math.random() * .45}`);
          heart.style.setProperty("--mid-sway", `${(Math.random() - .5) * swayRange}px`);
          heart.style.setProperty("--sway", `${(Math.random() - .5) * swayRange}px`);
          heart.style.setProperty("--turn", `${(Math.random() - .5) * (isReduced ? 24 : 76)}deg`);
          heart.style.setProperty("--heart-color", i % 3 === 0 ? "var(--heart-color)" : "var(--wine)");
          ambientHearts.appendChild(heart);
        }
      }

      function spawnTapHeart(event) {
        if (reducedMotion.matches) return;
        const heart = document.createElement("span");
        heart.className = "tap-heart";
        heart.textContent = "♡";
        heart.style.left = `${event.clientX}px`;
        heart.style.top = `${event.clientY}px`;
        heart.addEventListener("animationend", () => heart.remove(), { once: true });
        tapHeartLayer.appendChild(heart);
      }

      function makeConfetti() {
        if (reducedMotion.matches) return;
        confettiLayer.replaceChildren();
        const spread = 100;
        for (let i = 0; i < 42; i += 1) {
          const heart = document.createElement("span");
          heart.className = "confetti-heart";
          heart.textContent = i % 4 === 0 ? "♡" : "♥";
          heart.style.setProperty("--size", `${18 + Math.random() * 25}px`);
          heart.style.setProperty("--drift", `${(Math.random() - .5) * spread}vw`);
          heart.style.setProperty("--fall", `${(Math.random() - .5) * spread}vh`);
          heart.style.setProperty("--turn", `${(Math.random() - .5) * 110}deg`);
          heart.style.setProperty("--delay", `${Math.random() * .3}s`);
          heart.addEventListener("animationend", () => heart.remove(), { once: true });
          confettiLayer.appendChild(heart);
        }
        window.clearTimeout(confettiTimer);
        confettiTimer = window.setTimeout(() => confettiLayer.replaceChildren(), 2600);
      }

      function updateMusicButton() {
        const paused = audio.paused;
        musicText.textContent = paused ? "Activar música" : "Pausar música";
        musicToggle.setAttribute("aria-label", paused ? "Activar música" : "Pausar música");
        musicToggle.setAttribute("aria-pressed", String(!paused));
      }

      function hideMusic() {
        musicUsable = false;
        audio.pause();
        musicToggle.hidden = true;
      }

      function playMusic() {
        if (!musicUsable) return;
        try {
          const promise = audio.play();
          if (promise && typeof promise.catch === "function") {
            promise.catch((error) => {
              if (error && error.name === "NotAllowedError") {
                musicToggle.hidden = false;
                updateMusicButton();
                return;
              }
              hideMusic();
            });
          }
        } catch (error) {
          hideMusic();
        }
      }

      function openPhoto(image) {
        lightboxImage.src = image.currentSrc || image.src;
        lightboxImage.alt = image.alt;
        if (typeof photoDialog.showModal === "function") photoDialog.showModal();
      }

      function closePhoto() {
        if (photoDialog.open) photoDialog.close();
        lightboxImage.removeAttribute("src");
        lightboxImage.alt = "";
      }

      function stopGame() {
        gameRun += 1;
        if (game) game.destruir();
        game = null;
        if (gameRoot) gameRoot.remove();
        gameRoot = null;
      }
      function openLetter() {
        if (!active) return;
        stopGame();
        sharedEnvelope?.destruir();
        sharedEnvelope = null;
        introScreen.hidden = true;
        envelopeScreen.hidden = true;
        letterScreen.hidden = false;
        letterScreen.classList.add("is-opening");
        addReveals();
        ambientHearts.replaceChildren();
        addAmbientHearts();
        makeConfetti();
        openFrame = window.requestAnimationFrame(() => {
          if (!active) return;
          letterScreen.classList.remove("is-opening");
          letterScreen.classList.add("is-open");
          if (!isPreview) letterHeading.focus({ preventScroll: true });
          window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
        });
      }

      function startExperience() {
        introScreen.hidden = true;
        if (musicUsable) {
          audio.src = musicPath;
          musicToggle.hidden = false;
          playMusic();
        }
        runOpening();
      }

      function showFinal(scroll = savedScroll, burst = false) {
        stopGame();
        sharedEnvelope?.destruir();
        sharedEnvelope = null;
        envelopeScreen.hidden = true;
        introScreen.hidden = true;
        letterScreen.hidden = false;
        letterScreen.classList.remove("is-opening");
        letterScreen.classList.add("is-open");
        ambientHearts.replaceChildren();
        addAmbientHearts();
        addReveals();
        if (burst) makeConfetti();
        openFrame = requestAnimationFrame(() => { if (active) window.scrollTo({ top: scroll, behavior: 'instant' }); });
      }
      function jump(section) {
        const selector = { contador: '#togetherCounter', carta: '#letterCard', fotos: '.photo-card', cierre: '#closingBlock' }[section];
        if (!selector) return;
        openFrame = requestAnimationFrame(() => {
          if (!active) return;
          const target = document.querySelector(selector);
          if (target && !target.hidden) {
            target.classList.add('is-visible');
            // La vista previa vive dentro de un iframe; desplazar su propio viewport evita
            // que scrollIntoView también mueva la página armadora que lo contiene.
            window.scrollTo({ top:Math.max(0, window.scrollY + target.getBoundingClientRect().top - 12), behavior:reducedMotion.matches ? 'instant' : 'smooth' });
          }
        });
      }
      function finishOpening() {
        if (!active) return;
        if (isPreview) showFinal(0, true); else openLetter();
      }
      function runOpening(demoJuego = isPreview) {
        if (isPreview && reducedMotion.matches && demoJuego) { finishOpening(); return; }
        if (apertura === 'juego') repeatGame(demoJuego); else repeatEnvelope(demoJuego);
      }
      function repeatEnvelope(demoJuego = isPreview) {
        stopGame();
        sharedEnvelope?.destruir();
        letterScreen.hidden = true;
        introScreen.hidden = true;
        envelopeScreen.hidden = false;
        window.scrollTo({ top: 0, behavior: 'instant' });
        sharedEnvelope = window.ErosSobre?.montar(envelopeScreen, finishOpening, { demo:isPreview && demoJuego });
        if (sharedEnvelope) sharedEnvelope.mostrar(); else finishOpening();
      }
      async function repeatGame(demoJuego = isPreview) {
        stopGame();
        sharedEnvelope?.destruir();
        sharedEnvelope = null;
        envelopeScreen.hidden = true;
        const slug = asText(extras.juego);
        if (!['pintar-corazon', 'margarita', 'laberinto'].includes(slug)) { finishOpening(); return; }
        introScreen.hidden = true;
        letterScreen.hidden = true;
        const token = gameRun;
        gameRoot = document.createElement('section');
        gameRoot.className = 'eros-preview-game';
        const heading = document.createElement('h1');
        heading.textContent = { 'pintar-corazon': 'Pintá el corazón', margarita: 'Me ama / no me ama', laberinto: 'Llegá a mí' }[slug];
        const stage = document.createElement('div');
        const status = document.createElement('p'); status.setAttribute('role', 'status'); status.textContent = 'Preparando el juego…';
        const skip = document.createElement('button'); skip.type = 'button'; skip.className = 'button'; skip.textContent = 'Saltar al contenido'; skip.hidden = demoJuego;
        skip.addEventListener('click', finishOpening, { once: true });
        gameRoot.append(heading, status, stage, skip);
        document.querySelector('main').prepend(gameRoot);
        window.scrollTo({ top: 0, behavior: 'instant' });
        try {
          await loadGame(slug);
          if (!active || token !== gameRun) return;
          status.textContent = '';
          const registry = window.JUEGOS[slug];
          const gameConfig = extras[slug] || extras.laberinto || {};
          game = registry.iniciar(stage, { ...gameConfig, demo:isPreview && demoJuego }, () => {
            if (active && token === gameRun) finishOpening();
          }, { color: getComputedStyle(document.documentElement).getPropertyValue('--wine').trim(), para, de, demo:isPreview && demoJuego });
        } catch (_) {
          if (active && token === gameRun) status.textContent = 'Podés seguir al contenido final.';
        }
      }
      return {
        command(options = {}, first = false) {
          // Los indicadores antiguos solo piden mostrar la apertura: nunca encadenan sobre y juego.
          if (options.repetir === 'apertura' || (first && (options.saltarSobre === false || options.saltarJuego === false))) runOpening(options.demoJuego !== false);
          else if (first) showFinal(savedScroll);
          if (options.irA) { if (letterScreen.hidden) showFinal(savedScroll); jump(options.irA); }
        },
        startExperience, openPhoto, closePhoto, spawnTapHeart, hideMusic, updateMusicButton,
        toggleMusic() { if (!musicUsable) return; if (audio.paused) playMusic(); else audio.pause(); updateMusicButton(); },
        destroy() {
          active = false;
          stopGame();
          clearTimeout(confettiTimer);
          cancelAnimationFrame(openFrame);
          observer?.disconnect();
          counter?.detener();
          sharedEnvelope?.destruir();
          closePhoto();
          audio.pause(); audio.removeAttribute('src'); musicToggle.hidden = true;
          letterBlocks.replaceChildren(); counterRoot.replaceChildren(); counterRoot.hidden = true;
          ambientHearts.replaceChildren(); tapHeartLayer.replaceChildren(); confettiLayer.replaceChildren();
          letterCard.classList.remove('has-photos'); closingBlock.classList.remove('has-signature', 'is-visible');
          letterScreen.classList.remove('is-open', 'is-opening'); letterScreen.hidden = true; introScreen.hidden = false;
        }
      };
  }
  function render(datos, opciones = {}) {
    const raw = datos && typeof datos === 'object' ? datos : {};
    const serialized = JSON.stringify(raw);
    const previewDebug = isPreview && new URLSearchParams(location.search).get('debug') === '1';
    if (previewDebug) console.info('[Eros preview render]', serialized === lastData && !!current ? 'datos sin cambios; se conserva el DOM' : 'render ejecutado', { modelo:'carta-para-vos', campos:Object.keys(raw).length });
    if (serialized === lastData && current) { if (isPreview) current.command(opciones); return; }
    const scroll = window.scrollY;
    current?.destroy();
    lastData = serialized;
    current = mount(raw, scroll);
    if (isPreview) current.command(opciones, true);
  }
  function bind(id, event, handler) { document.getElementById(id).addEventListener(event, handler); }
  bind('startButton', 'click', () => current?.startExperience());
  bind('musicToggle', 'click', () => current?.toggleMusic());
  bind('backgroundMusic', 'play', () => current?.updateMusicButton());
  bind('backgroundMusic', 'pause', () => current?.updateMusicButton());
  bind('backgroundMusic', 'error', () => current?.hideMusic());
  bind('closePhoto', 'click', () => current?.closePhoto());
  bind('lightboxImage', 'click', () => current?.closePhoto());
  bind('photoDialog', 'click', (event) => { if (event.target.id === 'photoDialog') current?.closePhoto(); });
  bind('photoDialog', 'close', () => { const image = document.getElementById('lightboxImage'); image.removeAttribute('src'); image.alt = ''; });
  bind('letterBlocks', 'click', (event) => { const image = event.target.closest('.photo-card img'); if (image) current?.openPhoto(image); });
  bind('letterScreen', 'pointerdown', (event) => { if (!event.target.closest('button,a,dialog,.photo-card')) current?.spawnTapHeart(event); });
  window.ErosPlantilla = Object.freeze({ render, destruir() { current?.destroy(); current = null; lastData = null; } });
  if (new URLSearchParams(location.search).has('c') && !isPreview) {
    if (window.ErosPagina?.activa) window.ErosPagina.iniciar('carta-para-vos');
    else {
      document.querySelector('main').hidden = true;
      const error = document.createElement('p'); error.setAttribute('role','alert');
      error.textContent = 'No pudimos abrir tu regalo. Revisá tu conexión y volvé a cargar la página.';
      document.body.append(error);
    }
  } else if (!isPreview || parent === window) render(window.DATOS || {});
})();
