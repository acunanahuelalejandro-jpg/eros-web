/* Puente de vista previa en vivo. Conserva un iframe y confirma cada versión de datos. */
(() => {
  'use strict';

  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const log = (event, details = {}) => {
    if (debug) console.info('[Eros preview padre]', event, JSON.stringify(details));
  };

  function init() {
    const api = window.ErosArmador;
    const models = Object.freeze({
      'carta-para-vos': { title:'Carta para vos', content:'carta', photos:'fotos' },
      'nuestra-historia': { title:'Nuestra historia', content:'recorrido', photos:'recorrido' },
      'album-recuerdos': { title:'Álbum de recuerdos', content:'carta', photos:'fotos' }
    });
    const section = document.getElementById('pedido');
    if (!api || !section) { log('armador todavía no disponible'); return; }

    const panel = document.getElementById('preview-panel');
    const dialog = document.getElementById('preview-dialog');
    const phone = document.getElementById('preview-phone');
    const host = document.getElementById('preview-frame-host');
    const placeholder = document.getElementById('preview-placeholder');
    const status = document.getElementById('preview-status');
    const caption = document.getElementById('preview-caption');
    const musicInfo = document.getElementById('preview-music');
    const closeButton = document.getElementById('preview-close');
    const desktop = matchMedia('(min-width:1024px)');
    const origin = location.origin;
    const targetOrigin = origin === 'null' ? '*' : origin;
    const urls = new Map();

    let iframe = null;
    let model = '';
    let frameModel = '';
    let expectedSrc = '';
    let srcAssigned = false;
    let frameReady = false;
    let frameHasContent = false;
    let version = 0;
    let latestMessage = null;
    let retryCount = 0;
    let ackTimer = 0;
    let watchdogTimer = 0;
    let watchdogReloaded = false;
    let scheduleTimer = 0;
    let resizeFrame = 0;
    let pendingOptions = {};
    let previous = null;
    let opener = null;
    let savedOverflow = '';
    let retryButton = null;
    let enlargeButton = null;

    function clearAckTimer() { clearTimeout(ackTimer); ackTimer = 0; }
    function clearWatchdog() { clearTimeout(watchdogTimer); watchdogTimer = 0; }
    function clearUrls() {
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    }
    function showPlaceholder(message, retry = false) {
      placeholder.textContent = message;
      placeholder.hidden = false;
      if (retryButton) retryButton.hidden = !retry;
    }
    function hidePlaceholder() {
      placeholder.hidden = true;
      if (retryButton) retryButton.hidden = true;
    }
    function setLoading(message = 'Cargando la vista previa…') {
      textStatus(message);
      showPlaceholder('Cargando tu vista previa…');
    }
    function textStatus(message) {
      if (status) status.textContent = message;
    }

    function measure() {
      if (!panel || !phone) return;
      const panelWidth = panel.clientWidth || innerWidth;
      if (desktop.matches) {
        const width = Math.min(420, Math.max(340, panelWidth - 30));
        const height = Math.max(520, Math.min(846, innerHeight - 244));
        phone.style.setProperty('--preview-width', (width - 14) + 'px');
        phone.style.setProperty('--preview-height', height + 'px');
        phone.style.setProperty('--preview-scale', '1');
      } else {
        // En celular se conserva un marco de tamaño de referencia y se escala completo.
        const keyboardOpen = document.body.classList.contains('preview-keyboard-open');
        const availableHeight = Math.max(140, panel.clientHeight - (keyboardOpen ? 18 : 74));
        const scale = Math.min(.92, (panelWidth - 34) / 420, availableHeight / 860);
        phone.style.setProperty('--preview-width', '406px');
        phone.style.setProperty('--preview-height', '846px');
        phone.style.setProperty('--preview-scale', String(Math.max(.17, scale)));
      }
      log('marco medido', { width:panelWidth, height:panel.clientHeight, viewport:[innerWidth, innerHeight], scale:phone.style.getPropertyValue('--preview-scale') });
    }

    function collectData() {
      const used = new Set();
      const snapshot = api.vistaPrevia(photo => {
        if (!photo?.blob) return '';
        used.add(photo.blob);
        if (!urls.has(photo.blob)) urls.set(photo.blob, URL.createObjectURL(photo.blob));
        return urls.get(photo.blob);
      });
      urls.forEach((url, blob) => {
        if (!used.has(blob)) { URL.revokeObjectURL(url); urls.delete(blob); }
      });
      return snapshot;
    }

    function renderMusic(snapshot) {
      musicInfo.replaceChildren();
      const music = snapshot?.musica;
      if (music?.elegida !== true) { musicInfo.hidden = true; return; }
      const label = document.createElement('span');
      label.textContent = 'Música: ' + (music.descripcion || 'a elegir');
      musicInfo.append(label);
      if (music.enlace) {
        musicInfo.append(document.createTextNode(' · '));
        const link = document.createElement('a');
        link.href = music.enlace;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Abrir enlace';
        musicInfo.append(link);
      }
      musicInfo.hidden = false;
    }

    function makeFrame() {
      if (iframe) return iframe;
      iframe = document.createElement('iframe');
      iframe.title = 'Vista previa de Eros Web';
      iframe.addEventListener('load', () => {
        if (!iframe || !srcAssigned || iframe.src !== expectedSrc) {
          log('evento load inicial o anterior ignorado', { src:iframe?.src || '', esperado:expectedSrc });
          return;
        }
        frameReady = true;
        log('evento load del iframe', { modelo:frameModel, origenEsperado:origin });
        sendLatest('load');
      });
      // El listener global de mensajes ya está registrado antes de que se asigne src.
      host.append(iframe);
      return iframe;
    }

    function frameUrl(name, reload = false) {
      const url = new URL('plantillas/' + name + '/index.html', location.href);
      url.searchParams.set('preview', '1');
      if (debug) url.searchParams.set('debug', '1');
      if (reload) url.searchParams.set('eros-retry', String(Date.now()));
      return url.href;
    }

    function startWatchdog() {
      clearWatchdog();
      watchdogTimer = setTimeout(() => {
        if (frameHasContent || !model) return;
        if (!watchdogReloaded) {
          watchdogReloaded = true;
          log('watchdog: recarga única del iframe', { modelo:model });
          navigate(model, true);
          return;
        }
        showPlaceholder('No pudimos cargar la vista previa. Probá de nuevo.', true);
        textStatus('La vista previa necesita reintentarse.');
        log('watchdog: se agotó la recuperación automática', { modelo:model });
      }, 4000);
    }

    function navigate(name, reload = false) {
      if (!reload) watchdogReloaded = false;
      frameModel = name;
      frameReady = false;
      frameHasContent = false;
      retryCount = 0;
      clearAckTimer();
      const nextSrc = frameUrl(name, reload);
      expectedSrc = nextSrc;
      srcAssigned = false;
      makeFrame();
      iframe.title = 'Vista previa de ' + (models[name]?.title || 'Eros Web');
      setLoading();
      startWatchdog();
      iframe.src = nextSrc;
      srcAssigned = true;
      log('src asignado al iframe reutilizado', { modelo:name, reload, src:nextSrc });
    }

    function sendLatest(reason = 'actualización') {
      if (!iframe || !latestMessage || !frameReady) {
        log('envío pendiente', { reason, hayIframe:!!iframe, listo:frameReady, version:latestMessage?.version });
        return;
      }
      clearAckTimer();
      try {
        iframe.contentWindow.postMessage(latestMessage, targetOrigin);
        if (reason !== 'reintento') retryCount = 0;
        log('eros-preview-datos enviado', { reason, modelo:frameModel, version:latestMessage.version, campos:Object.keys(latestMessage.datos || {}), fotos:latestMessage.datos?.fotos?.length || latestMessage.datos?.momentos?.filter(m => m.foto).length || latestMessage.datos?.carta?.bloques?.filter(b => b.foto).length || 0 });
      } catch (error) {
        log('falló postMessage', { message:error?.message, version:latestMessage.version });
      }
      const sentVersion = latestMessage.version;
      ackTimer = setTimeout(() => {
        if (!latestMessage || latestMessage.version !== sentVersion) return;
        if (retryCount < 5) {
          retryCount += 1;
          log('sin confirmación; se reintenta', { version:sentVersion, reintento:retryCount });
          sendLatest('reintento');
        } else {
          log('se agotaron los reintentos de confirmación', { version:sentVersion });
        }
      }, 800);
    }

    function prepareMessage(snapshot) {
      const options = { saltarSobre:true, saltarJuego:true, ...pendingOptions };
      pendingOptions = {};
      // La marca solo vive en esta copia de la vista previa; buildRow conserva el contrato del pedido.
      const datos = snapshot.datos;
      if (snapshot.contador && datos?.extras?.contador && typeof datos.extras.contador === 'object') {
        datos.extras.contador.activo = true;
      }
      latestMessage = {
        type:'eros-preview-datos',
        version:++version,
        datos,
        previewInfo:snapshot.musica,
        opciones:options,
        diagnostico:debug ? { revision:version, etapa:snapshot.etapa, modelo:snapshot.modelo } : undefined
      };
      retryCount = 0;
      clearAckTimer();
      renderMusic(snapshot);
      if (!frameHasContent) setLoading('Cargando la vista previa…');
      else textStatus('Actualizando la vista previa…');
      log('nueva versión preparada', { version, modelo:snapshot.modelo, opciones:options });
    }

    function update() {
      clearTimeout(scheduleTimer);
      const snapshot = collectData();
      const nextModel = snapshot.modelo || '';
      log('actualización solicitada', { modelo:nextModel, listo:frameReady, etapa:snapshot.etapa });
      if (nextModel !== model) {
        model = nextModel;
        pendingOptions = model ? { repetir:'apertura' } : {};
      }
      const supported = Object.hasOwn(models, model);
      panel.querySelectorAll('[data-preview-action]').forEach(button => { button.disabled = !supported; });
      const repeatButton = panel.querySelector('[data-preview-action="repetir"]');
      if (repeatButton) repeatButton.textContent = 'Repetir la apertura';
      const manualButton = panel.querySelector('[data-preview-action="manual"]');
      if (manualButton) manualButton.hidden = !snapshot.juego;
      caption.textContent = snapshot.recibe ? 'Para ' + snapshot.recibe + (snapshot.de ? ' · de ' + snapshot.de : '') : 'Mirá cómo queda tu página mientras la armás.';
      if (!supported) {
        model = '';
        frameHasContent = false;
        clearAckTimer();
        clearWatchdog();
        showPlaceholder('Elegí un modelo para empezar');
        textStatus('');
        renderMusic(snapshot);
        return;
      }

      prepareMessage(snapshot);
      if (!iframe || frameModel !== model) navigate(model);
      else sendLatest('actualización');
      measure();
    }

    function schedule() {
      const snapshot = api.vistaPrevia();
      log('cambio del armador recibido', { modelo:snapshot.modelo, etapa:snapshot.etapa, juego:snapshot.juego });
      if (previous && snapshot.modelo === previous.modelo) {
        if (snapshot.juego !== previous.juego) pendingOptions = { repetir:'apertura' };
        else if (snapshot.contador && (!previous.contador || snapshot.desde !== previous.desde)) pendingOptions = { irA:'contador' };
        else if (snapshot.etapa !== previous.etapa) {
          const config = models[snapshot.modelo];
          const sectionByStep = { 4:'contador', 5:config?.content, 6:config?.photos, 7:'cierre' };
          pendingOptions = { irA:sectionByStep[snapshot.etapa] || null };
        }
      }
      previous = snapshot;
      clearTimeout(scheduleTimer);
      scheduleTimer = setTimeout(update, 50);
    }

    function retryFrame() {
      if (!model || !Object.hasOwn(models, model)) return;
      watchdogReloaded = false;
      frameHasContent = false;
      retryCount = 0;
      if (retryButton) retryButton.hidden = true;
      navigate(model, true);
      measure();
    }

    function handleMessage(event) {
      if (event.origin !== origin) {
        log('mensaje ignorado: origen distinto', { recibido:event.origin, esperado:origin, coincideConLocation:event.origin === location.origin });
        return;
      }
      if (!iframe || event.source !== iframe.contentWindow) { log('mensaje ignorado: ventana distinta'); return; }
      const message = event.data;
      if (message?.type === 'eros-preview-listo') {
        frameReady = true;
        log('eros-preview-listo recibido', { origenCorrecto:event.origin === location.origin, ventanaCorrecta:event.source === iframe.contentWindow });
        sendLatest('listo');
        return;
      }
      if (message?.type === 'eros-preview-recibido') {
        if (message.version !== latestMessage?.version) {
          log('confirmación vieja ignorada', { recibida:message.version, vigente:latestMessage?.version });
          return;
        }
        clearAckTimer();
        clearWatchdog();
        frameHasContent = true;
        watchdogReloaded = false;
        hidePlaceholder();
        textStatus('Vista previa actualizada.');
        log('confirmación recibida; estado de carga limpiado', { version:message.version, origenCorrecto:event.origin === location.origin });
        return;
      }
      if (message?.type === 'eros-preview-error') {
        if (message.version !== latestMessage?.version) return;
        clearAckTimer();
        showPlaceholder('No pudimos mostrar esta vista previa. Probá de nuevo.', true);
        textStatus('La vista previa encontró un error.');
        log('error informado por la plantilla', { version:message.version, error:message.error });
      }
    }

    // Registrar el puente antes de crear el iframe y antes de asignar cualquier src.
    window.addEventListener('message', handleMessage);
    retryButton = document.createElement('button');
    retryButton.type = 'button';
    retryButton.className = 'preview-retry small-action';
    retryButton.textContent = 'Reintentar';
    retryButton.hidden = true;
    retryButton.addEventListener('click', retryFrame);
    host.append(retryButton);

    enlargeButton = document.createElement('button');
    enlargeButton.type = 'button';
    enlargeButton.className = 'preview-enlarge small-action';
    enlargeButton.textContent = 'Agrandar';
    enlargeButton.setAttribute('aria-label', 'Agrandar vista previa');
    panel.append(enlargeButton);
    enlargeButton.addEventListener('click', () => {
      if (desktop.matches || dialog.open) return;
      opener = enlargeButton;
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      closeButton.focus();
      measure();
    });
    closeButton.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.body.style.overflow = savedOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll:true });
      measure();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('button:not([disabled]), iframe, a[href]')).filter(node => node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    panel.querySelectorAll('[data-preview-action]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      pendingOptions = button.dataset.previewAction === 'contenido'
        ? { irA:models[model]?.content || null }
        : { repetir:'apertura', demoJuego:button.dataset.previewAction !== 'manual' };
      update();
    }));

    const observer = new IntersectionObserver(entries => {
      document.body.classList.toggle('order-in-view', entries[0].isIntersecting);
      log('sección visible', { visible:entries[0].isIntersecting });
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(measure);
    }, { threshold:0 });
    observer.observe(section);
    function measureAfterViewportChange() {
      const editing = document.activeElement?.matches('input, textarea, select');
      const keyboardOpen = !desktop.matches && editing && window.visualViewport && window.visualViewport.height < innerHeight * .78;
      document.body.classList.toggle('preview-keyboard-open', !!keyboardOpen);
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(measure);
    }
    window.addEventListener('resize', measureAfterViewportChange);
    window.visualViewport?.addEventListener('resize', measureAfterViewportChange);
    document.addEventListener('focusin', measureAfterViewportChange);
    document.addEventListener('focusout', () => setTimeout(measureAfterViewportChange, 0));
    window.addEventListener('pagehide', () => {
      clearTimeout(scheduleTimer); clearAckTimer(); clearWatchdog(); cancelAnimationFrame(resizeFrame);
      observer.disconnect(); window.removeEventListener('message', handleMessage); clearUrls();
    }, { once:true });
    document.addEventListener('eros-armador-cambio', schedule);
    previous = api.vistaPrevia();
    update();
  }

  function waitForBuilder() {
    if (window.ErosArmador) { init(); return; }
    document.addEventListener('eros-armador-disponible', init, { once:true });
    setTimeout(() => { if (window.ErosArmador) init(); }, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForBuilder, { once:true });
  else waitForBuilder();
})();
