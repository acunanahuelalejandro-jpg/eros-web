/* Álbum original con ciclo de vida para la vista previa administrativa. */
(() => {
  'use strict';
  const preview = new URLSearchParams(location.search).get('preview') === '1';
  if (preview) document.documentElement.classList.add('eros-preview-mode');
  const original = [...document.body.children].filter(n => n.tagName !== 'SCRIPT').map(n => n.cloneNode(true));
  let current = null, last = null, resetNeeded = false;
  function mount(data, scroll) {
    let active = true, effect = null, revealObserver = null;
    const controller = new AbortController(), timers = new Set(), frames = new Set();
    const on = (node,type,handler,options = {}) => node.addEventListener(type,handler,{...options,signal:controller.signal});
    const later = (callback,delay) => { const id = setTimeout(() => { timers.delete(id); if (active) callback(); },delay); timers.add(id); return id; };
    const frame = callback => { const id = requestAnimationFrame(() => { frames.delete(id); if (active) callback(); }); frames.add(id); return id; };
      const cleanText = (value) => typeof value === "string" ? value.trim() : "";
      const safeFile = (value) => {
        const path = cleanText(value).replace(/\\/g, "/");
        if (window.ErosPagina?.activa && window.ErosPagina.esRecursoPermitido(path)) return path;
        if (preview && path.startsWith('blob:')) { try { if (new URL(path).origin === location.origin) return path; } catch (_) {} }
        if (!path || path.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.split("/").includes("..")) return "";
        return path;
      };
      const para = cleanText(data.para);
      const de = cleanText(data.de);
      const extras = data.extras && typeof data.extras === "object" ? data.extras : {};
      const principal = data.principal && typeof data.principal === "object" ? data.principal : {};
      const inicio = data.inicio && typeof data.inicio === "object" ? data.inicio : {};
      const cierre = data.cierre && typeof data.cierre === "object" ? data.cierre : {};
      const rawTitle = cleanText(principal.titulo);
      const rawSubtitle = cleanText(principal.subtitulo);
      const title = rawTitle || (para ? "Un álbum para " + para : (preview ? "Tu álbum de recuerdos" : "Álbum de recuerdos"));
      const subtitle = rawSubtitle || (preview ? "Tus recuerdos, uno por uno…" : "");
      const startTitle = cleanText(inicio.titulo) || (para ? "Una sorpresa para " + para : "Un regalo para vos");
      const startLabel = cleanText(inicio.boton) || "Tocá para empezar";
      const rawGame = cleanText(extras.juego);
      const gameName = ["pintar-corazon", "margarita", "laberinto"].includes(rawGame) ? rawGame : "";
      const query = new URLSearchParams(location.search);
      window.ErosTemas?.aplicar(!preview && query.has('tema') ? query.get('tema') : data.tema);
      if (/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(data.colorPrincipal || '')) {
        const hex = data.colorPrincipal.slice(1), full = hex.length === 3 ? [...hex].map(x => x+x).join('') : hex;
        document.documentElement.style.setProperty('--wine',data.colorPrincipal);
        document.documentElement.style.setProperty('--wine-rgb',[0,2,4].map(i => parseInt(full.slice(i,i+2),16)).join(','));
      }
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const records = Array.isArray(data.fotos) ? data.fotos.slice(0, 12).filter((photo) => photo && typeof photo === "object") : [];
      const validRecords = records.map((photo) => ({
        src: safeFile(photo.src),
        alt: cleanText(photo.alt),
        epigrafe: cleanText(photo.epigrafe)
      }));
      if (preview) while (validRecords.length < 12) validRecords.push({ src:"", alt:"", epigrafe:"" });
      const startSeconds = Number.isInteger(data.automatico) && data.automatico > 0 ? Math.min(data.automatico, 3600) : 0;

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
      const albumTitle = document.getElementById("albumTitle");
      const albumSubtitle = document.getElementById("albumSubtitle");
      const albumStage = document.getElementById("albumStage");
      const albumCaption = document.getElementById("albumCaption");
      const albumStatus = document.getElementById("albumStatus");
      const albumView = document.getElementById("albumView");
      const emptyMessage = document.getElementById("emptyMessage");
      const previousButton = document.getElementById("previousButton");
      const nextButton = document.getElementById("nextButton");
      const galleryButton = document.getElementById("galleryButton");
      const galleryDialog = document.getElementById("galleryDialog");
      const galleryGrid = document.getElementById("galleryGrid");
      const photoDialog = document.getElementById("photoDialog");
      const lightboxImage = document.getElementById("lightboxImage");
      const closingBlock = document.getElementById("albumClosing");
      const closingMessage = document.getElementById("closingMessage");
      const signatureNode = document.getElementById("signature");
      const counterRoot = document.getElementById("togetherCounter");
      const ambientLayer = document.getElementById("ambientHearts");
      const tapLayer = document.getElementById("tapHeartLayer");
      const effectsCanvas = document.getElementById("effectsCanvas");
      const audio = document.getElementById("backgroundMusic");
      const musicToggle = document.getElementById("musicToggle");
      const music = window.ErosAudio?.montar(audio, musicToggle, data.audio?.src);
      music?.escucharApertura(envelopeScreen);
      const autoControl = document.getElementById("autoControl");
      const autoToggle = document.getElementById("autoToggle");
      let index = 0;
      let contentShown = false;
      let startHandled = false;
      let gameInstance = null;
      let gameTimer = 0;
      let autoTimer = 0;
      let autoPaused = false;
      let isDragging = false;
      let pointerStart = null;
      let swipePending = false;
      let celebrationShown = false;

      document.title = title + " | Eros Web";
      document.getElementById("introTitle").textContent = startTitle;
      startButton.textContent = startLabel;
      albumTitle.textContent = title;
      albumSubtitle.textContent = subtitle;
      const rawClosingMessage = cleanText(cierre.mensaje);
      const rawSignature = cleanText(data.firma);
      closingMessage.textContent = rawClosingMessage || (preview ? "Acá va tu mensaje final…" : "");
      signatureNode.textContent = rawSignature || (preview ? "Tu firma" : "");
      albumTitle.classList.toggle("preview-example", preview && !rawTitle && !para);
      albumSubtitle.classList.toggle("preview-example", preview && !rawSubtitle);
      closingMessage.classList.toggle("preview-example", preview && !rawClosingMessage);
      signatureNode.classList.toggle("preview-example", preview && !rawSignature);
      if (!subtitle) albumSubtitle.hidden = true;
      if (!rawClosingMessage && !preview) closingMessage.hidden = true;
      if (!rawSignature && !preview) signatureNode.hidden = true;
      if (para) {
        gameRecipient.textContent = "Un juego para " + para;
        gameRecipient.hidden = false;
      }
      gamePrompt.textContent = para ? "Una sorpresa para " + para : "Una sorpresa para vos";
      const counter = window.ErosContador?.montar(counterRoot, extras.contador);
      const aperture = window.ErosApertura.elegirApertura(data);
      let envelope = aperture === 'sobre' && window.ErosSobre ? window.ErosSobre.montar(envelopeScreen, openContent, { demo:preview }) : null;
      if (startSeconds) autoControl.hidden = false;

      function makeImageButton(record, photoIndex, stackClass) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "polaroid " + stackClass;
        button.setAttribute("aria-label", record.src ? (record.alt || "Ampliar foto " + (photoIndex + 1)) : "Lugar para la foto " + (photoIndex + 1));
        const image = document.createElement("img");
        image.className = "polaroid-image";
        image.alt = record.alt || "Foto " + (photoIndex + 1);
        image.decoding = "async";
        image.loading = photoIndex === index ? "eager" : "lazy";
        const placeholder = document.createElement("span");
        placeholder.className = "photo-placeholder";
        function setPlaceholder(label) {
          placeholder.replaceChildren();
          if (preview) {
            const icon = document.createElement("span");
            icon.className = "empty-photo-icon";
            icon.setAttribute("aria-hidden", "true");
            icon.textContent = "♡";
            placeholder.append(icon);
          }
          const textNode = document.createElement("span");
          textNode.textContent = label;
          placeholder.append(textNode);
        }
        setPlaceholder(record.src ? (preview ? "Tu foto acá" : "La foto no está disponible") : (preview ? "Tu foto acá" : "Todavía no se agregó una foto"));
        placeholder.hidden = Boolean(record.src);
        if (record.src) {
          image.src = record.src;
          on(image, "error", () => {
            image.hidden = true;
            if (preview) setPlaceholder("Tu foto acá");
            placeholder.hidden = false;
            button.disabled = true;
            button.setAttribute("aria-label", preview ? "Lugar para la foto " + (photoIndex + 1) : "Foto no disponible");
          }, { once: true });
        } else {
          image.hidden = true;
          button.disabled = preview;
        }
        button.append(image, placeholder);
        on(button, "click", () => {
          if (swipePending) {
            swipePending = false;
            return;
          }
          if (record.src && !image.hidden) openPhoto(record.src, image.alt);
        });
        return button;
      }

      function renderStack() {
        albumStage.replaceChildren();
        if (!validRecords.length) {
          albumView.hidden = true;
          emptyMessage.hidden = false;
          return;
        }
        albumView.hidden = false;
        emptyMessage.hidden = true;
        const visible = Math.min(4, validRecords.length);
        for (let offset = visible - 1; offset >= 0; offset -= 1) {
          const photoIndex = (index + offset) % validRecords.length;
          const className = offset === 0 ? "is-front" : "is-back-" + offset;
          const card = makeImageButton(validRecords[photoIndex], photoIndex, "stack-card " + className);
          card.dataset.photoIndex = String(photoIndex);
          albumStage.appendChild(card);
        }
        const current = validRecords[index];
        albumCaption.textContent = current.epigrafe || (preview ? "Epígrafe " + (index + 1) : "");
        albumCaption.classList.toggle("preview-example", preview && !current.epigrafe);
        albumCaption.hidden = !current.epigrafe && !preview;
        albumStatus.textContent = (index + 1) + " / " + validRecords.length;
        previousButton.disabled = index === 0;
        nextButton.disabled = index >= validRecords.length - 1;
        renderGallery();
        if (preview || contentShown && index === validRecords.length - 1) {
          closingBlock.hidden = false;
          if (contentShown && index === validRecords.length - 1) {
            if (!celebrationShown) {
              celebrationShown = true;
              celebrate();
              stopAutomatic();
            }
          }
        } else {
          closingBlock.hidden = true;
        }
      }

      function renderGallery() {
        galleryGrid.replaceChildren();
        validRecords.forEach((record, photoIndex) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "gallery-thumb";
          button.setAttribute("aria-label", "Ver foto " + (photoIndex + 1) + " ampliada");
          button.setAttribute("aria-current", String(photoIndex === index));
          const image = document.createElement("img");
          image.alt = record.alt || "Foto " + (photoIndex + 1);
          image.loading = "lazy";
          image.decoding = "async";
          if (record.src) {
            image.src = record.src;
            on(image, "error", () => { image.hidden = true; }, { once: true });
          } else {
            image.hidden = true;
          }
          const placeholder = document.createElement("span");
          placeholder.className = "gallery-placeholder";
          placeholder.hidden = Boolean(record.src);
          placeholder.textContent = preview ? "Tu foto acá" : "";
          const caption = document.createElement("span");
          caption.textContent = record.epigrafe || (preview ? "Epígrafe " + (photoIndex + 1) : "Foto " + (photoIndex + 1));
          if (preview && !record.epigrafe) caption.classList.add("preview-example");
          button.append(image, placeholder, caption);
          if (!record.src) button.disabled = preview;
          on(button, "click", () => {
            if (!record.src || image.hidden) return;
            openPhoto(record.src, image.alt);
          });
          galleryGrid.appendChild(button);
        });
      }

      function openPhoto(src, alt) {
        if (!src || typeof photoDialog.showModal !== "function") return;
        lightboxImage.src = src;
        lightboxImage.alt = alt || "Foto ampliada";
        photoDialog.showModal();
      }
      function closePhoto() {
        if (photoDialog.open) photoDialog.close();
      }
      on(document.getElementById("closePhoto"), "click", closePhoto);
      on(lightboxImage, "click", closePhoto);
      on(photoDialog, "click", (event) => { if (event.target === photoDialog) closePhoto(); });
      on(photoDialog, "close", () => { lightboxImage.removeAttribute("src"); lightboxImage.alt = ""; });

      function openGallery() {
        renderGallery();
        if (typeof galleryDialog.showModal === "function") galleryDialog.showModal();
      }
      on(document.getElementById("closeGallery"), "click", () => galleryDialog.close());
      on(galleryDialog, "click", (event) => { if (event.target === galleryDialog) galleryDialog.close(); });
      on(galleryButton, "click", openGallery);

      function stopAutomatic() {
        if (autoTimer) window.clearInterval(autoTimer);
        autoTimer = 0;
      }
      function startAutomatic() {
        stopAutomatic();
        if (!startSeconds || autoPaused || !contentShown || index >= validRecords.length - 1) return;
        autoTimer = window.setInterval(() => {
          if (!galleryDialog.open && !photoDialog.open) goNext();
        }, startSeconds * 1000);
      }
      on(autoToggle, "click", () => {
        autoPaused = !autoPaused;
        autoToggle.textContent = autoPaused ? "Reanudar avance" : "Pausar avance";
        autoToggle.setAttribute("aria-pressed", String(autoPaused));
        if (autoPaused) stopAutomatic();
        else startAutomatic();
      });

      function goTo(nextIndex) {
        if (nextIndex < 0 || nextIndex >= validRecords.length || nextIndex === index) return;
        index = nextIndex;
        renderStack();
        if (startSeconds && !autoPaused) startAutomatic();
      }
      function goNext() { goTo(index + 1); }
      function goPrevious() { goTo(index - 1); }
      on(previousButton, "click", goPrevious);
      on(nextButton, "click", goNext);

      function setDragTransform(card, dx, dy) {
        card.style.transition = "none";
        card.style.transform = "translate(" + dx + "px," + Math.max(-12, Math.min(12, dy * .15)) + "px) rotate(" + (dx / 22) + "deg)";
      }
      on(albumStage, "pointerdown", (event) => {
        if (!contentShown || event.button !== undefined && event.button !== 0) return;
        const card = albumStage.querySelector(".is-front");
        if (!card) return;
        isDragging = true;
        swipePending = false;
        pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY, card };
        try { card.setPointerCapture(event.pointerId); } catch (_) {}
      });
      on(albumStage, "pointermove", (event) => {
        if (!isDragging || !pointerStart || event.pointerId !== pointerStart.id) return;
        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;
        if (Math.abs(dx) > Math.abs(dy) * 1.15 && Math.abs(dx) > 5) {
          event.preventDefault();
          setDragTransform(pointerStart.card, dx, dy);
        }
      });
      function finishDrag(event) {
        if (!isDragging || !pointerStart || event.pointerId !== pointerStart.id) return;
        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;
        const card = pointerStart.card;
        isDragging = false;
        pointerStart = null;
        try { card.releasePointerCapture(event.pointerId); } catch (_) {}
        card.style.transition = "";
        if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.2) {
          swipePending = true;
          card.style.setProperty("--fly-x", (dx < 0 ? "-115vw" : "115vw"));
          card.style.setProperty("--fly-turn", (dx < 0 ? "-22deg" : "22deg"));
          card.classList.add("is-leaving");
          later(() => {
            swipePending = false;
            if (dx < 0) goNext();
            else goPrevious();
          }, reducedMotion.matches ? 20 : 330);
        } else {
          card.style.transform = "";
          later(() => { card.style.transition = ""; }, 20);
        }
      }
      on(albumStage, "pointerup", finishDrag);
      on(albumStage, "pointercancel", finishDrag);
      on(document, "keydown", (event) => {
        if (!contentShown || galleryDialog.open || photoDialog.open || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.target && event.target.closest && event.target.closest("button,a,input,textarea,select")) return;
        if (event.key === "ArrowRight") { event.preventDefault(); goNext(); }
        if (event.key === "ArrowLeft") { event.preventDefault(); goPrevious(); }
      });

      function observeReveals() {
        const nodes = contentScreen.querySelectorAll(".reveal");
        if (!("IntersectionObserver" in window)) {
          nodes.forEach((node) => node.classList.add("is-visible"));
          return;
        }
        revealObserver?.disconnect();
        const observer = revealObserver = new IntersectionObserver((entries, current) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              current.unobserve(entry.target);
            }
          });
        }, { threshold: .12, rootMargin: "0px 0px -18px 0px" });
        nodes.forEach((node) => observer.observe(node));
      }

      function celebrate() {
        if (window.NucleoEfectos && typeof window.NucleoEfectos.explotar === "function") {
          const color = getComputedStyle(document.documentElement).getPropertyValue("--wine").trim() || "#8b3d52";
          effect?.destruir(); effect = window.NucleoEfectos.explotar(effectsCanvas, color);
        }
      }

      function openContent() {
        if (!active) return;
        if (contentShown) return;
        contentShown = true;
        envelope?.destruir();
        envelope = null;
        intro.hidden = true;
        gameScreen.hidden = true;
        envelopeScreen.hidden = true;
        contentScreen.hidden = false;
        contentScreen.classList.add("is-opening");
        if (!preview) music?.reproducir();
        if (window.NucleoEfectos && typeof window.NucleoEfectos.iniciarLluvia === "function") {
          window.NucleoEfectos.iniciarLluvia(ambientLayer, reducedMotion.matches);
        }
        if (window.NucleoEfectos && typeof window.NucleoEfectos.corazonAlTocar === "function") {
          on(contentScreen, "pointerdown", (event) => {
            if (!event.target.closest("button,a,dialog")) window.NucleoEfectos.corazonAlTocar(tapLayer, event, reducedMotion.matches);
          });
        }
        observeReveals();
        frame(() => {
          contentScreen.classList.remove("is-opening");
          contentScreen.classList.add("is-open");
          if (!preview) albumTitle.focus({ preventScroll: true });
          window.scrollTo({ top: preview ? scroll : 0, behavior: preview || reducedMotion.matches ? 'instant' : 'smooth' });
          renderStack();
        });
        // Arranca sin depender del repintado: algunos celulares pausan requestAnimationFrame.
        startAutomatic();
      }

      function showEnvelopeOrContent() {
        if (envelope) {
          gameScreen.hidden = true;
          envelope.mostrar();
        } else {
          openContent();
        }
      }
      function cleanupGame() {
        window.clearTimeout(gameTimer);
        if (gameInstance && typeof gameInstance.destruir === "function") {
          try { gameInstance.destruir(); } catch (_) {}
        }
        gameInstance = null;
        gameStage.replaceChildren();
        document.body.classList.remove("playing");
      }
      function finishGame() {
        if (!preview) music?.reproducir();
        cleanupGame();
        if (window.NucleoEfectos && typeof window.NucleoEfectos.explotar === "function") {
          const color = getComputedStyle(document.documentElement).getPropertyValue("--wine").trim() || "#8b3d52";
          effect?.destruir(); effect = window.NucleoEfectos.explotar(effectsCanvas, color, openContent, preview ? { duracion:1500 } : undefined);
        } else openContent();
      }
      function skipGame() {
        cleanupGame();
        openContent();
      }
      function loadGame(demoJuego = preview) {
        gameScreen.hidden = false;
        document.body.classList.add("playing");
        gamePrompt.focus({ preventScroll: true });
        gameTimer = later(() => { rescueButton.hidden = false; }, 60000);
        const script = document.createElement("script");
        script.src = "../../plantillas/juegos-interactivos/juegos/" + gameName + ".js";
        script.onload = () => {
          if (!active) return;
          const game = window.JUEGOS && window.JUEGOS[gameName];
          if (!game || typeof game.iniciar !== "function") {
            gameStatus.textContent = "El juego no está disponible. Podés seguir al álbum.";
            rescueButton.hidden = false;
            return;
          }
          try {
            const gameConfig = extras[gameName] || extras.laberinto || {};
            gameInstance = game.iniciar(gameStage, { ...gameConfig, demo:preview && demoJuego }, finishGame, {
              color: getComputedStyle(document.documentElement).getPropertyValue("--wine").trim() || "#8b3d52",
              para: para, de: de, demo:preview && demoJuego
            });
          } catch (_) {
            gameStatus.textContent = "No se pudo abrir el juego. Podés seguir al álbum.";
            rescueButton.hidden = false;
          }
        };
        script.onerror = () => {
          if (!active) return;
          gameStatus.textContent = "No se pudo cargar el juego. Podés seguir al álbum.";
          rescueButton.hidden = false;
        };
        document.body.appendChild(script);
      }

      function startExperience() {
        if (startHandled) return;
        startHandled = true;
        intro.hidden = true;
        music?.reproducir();
        if (aperture === "juego" && gameName) loadGame();
        else showEnvelopeOrContent();
      }

      renderStack();
      on(startButton, "click", startExperience);
      on(rescueButton, "click", skipGame);

      return {
        command(options = {}) {
          if (options.repetir === 'apertura') {
            cleanupGame(); stopAutomatic(); envelope?.destruir(); envelope = null;
            effect?.destruir(); effect = null;
            effectsCanvas.getContext('2d')?.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
            contentShown = false; contentScreen.hidden = true; intro.hidden = true;
            if (preview && reducedMotion.matches && options.demoJuego !== false) openContent();
            else if (aperture === 'juego' && gameName) loadGame(options.demoJuego !== false);
            else {
              envelope = window.ErosSobre?.montar(envelopeScreen, openContent, { demo:preview });
              showEnvelopeOrContent();
            }
          } else if (!contentShown) {
            cleanupGame();
            effect?.destruir();
            effect = null;
            openContent();
          }
          if (options.irA) frame(() => {
            const node = {contador:counterRoot,cierre:closingBlock,fotos:albumView,carta:albumTitle,musica:musicToggle}[options.irA];
            // El scroll queda confinado al documento de la plantilla y no desplaza el armador.
            if (node && !node.hidden) window.scrollTo({top:Math.max(0,window.scrollY+node.getBoundingClientRect().top),behavior:'instant'});
          });
        },
        destroy() { active = false; controller.abort(); counter?.detener(); music?.destruir(); envelope?.destruir(); cleanupGame(); stopAutomatic(); revealObserver?.disconnect(); effect?.destruir(); timers.forEach(clearTimeout); frames.forEach(cancelAnimationFrame); audio.pause(); audio.removeAttribute('src'); }
      };
  }
  function render(data = {}, options = {}) {
    const serialized = JSON.stringify(data);
    const previewDebug = preview && new URLSearchParams(location.search).get('debug') === '1';
    if (previewDebug) console.info('[Eros preview render]', current && last === serialized ? 'datos sin cambios; se conserva el DOM' : 'render ejecutado', { modelo:'album-recuerdos', fotos:Array.isArray(data.fotos) ? data.fotos.length : 0 });
    if (current && last === serialized) { if (preview) current.command(options); return; }
    const scroll = scrollY;
    current?.destroy();
    if (current || resetNeeded) {
      const status = document.querySelector('[data-eros-pagina-ui]');
      document.body.replaceChildren(...original.map(n => n.cloneNode(true)));
      if (status) document.body.append(status);
      resetNeeded = false;
    }
    current = mount(data,scroll); last = serialized;
    if (preview) current.command(options);
  }
  window.ErosPlantilla = Object.freeze({ render, destruir() { if (current) resetNeeded = true; current?.destroy(); current = null; last = null; } });
  if (new URLSearchParams(location.search).has('c') && !preview) {
    if (window.ErosPagina?.activa) window.ErosPagina.iniciar('album-recuerdos');
    else {
      document.querySelector('main').hidden = true;
      const error = document.createElement('p'); error.setAttribute('role','alert');
      error.textContent = 'No pudimos abrir tu regalo. Revisá tu conexión y volvé a cargar la página.';
      document.body.append(error);
    }
  } else if (!preview || parent === window) render(window.DATOS || {});
})();
