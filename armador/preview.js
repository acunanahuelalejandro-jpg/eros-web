/* Puente de vista previa: mantiene un iframe por modelo y envía cada cambio en vivo. */
(() => {
  'use strict';
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const log = (event, details = {}) => { if (debug) console.info('[Eros preview padre]', event, JSON.stringify(details)); };
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
    const openButton = document.getElementById('preview-open');
    const desktop = matchMedia('(min-width:1024px)');
    const origin = location.origin;
    const urls = new Map();
    let iframe = null, ready = false, model = '', timer = 0, resizeFrame = 0, lastDataKey = null, lastMusicKey = null;
    let pending = {}, previous = null, opener = null, savedOverflow = '';
    const active = () => desktop.matches || dialog.open;
    function clearUrls() { urls.forEach(url => URL.revokeObjectURL(url)); urls.clear(); }
    function destroyFrame(reason) {
      if (iframe) iframe.remove();
      log('iframe destruido', { reason, model });
      iframe = null; ready = false; lastDataKey = null; lastMusicKey = null; clearUrls();
    }
    function measure() {
      if (!panel || !phone || !active()) return;
      const width = Math.min(420, Math.max(340, panel.clientWidth - 30));
      const compact = desktop.matches ? Math.max(520, Math.min(846, innerHeight - 244)) : Math.max(440, Math.min(846, innerHeight - 250));
      phone.style.setProperty('--preview-width', (width - 14) + 'px');
      phone.style.setProperty('--preview-height', compact + 'px');
      phone.style.setProperty('--preview-scale', '1');
      log('marco medido', { width, height:compact, viewport:[innerWidth, innerHeight] });
    }
    function collectData() {
      const used = new Set();
      const snapshot = api.vistaPrevia(photo => {
        if (!photo?.blob) return '';
        used.add(photo.blob);
        if (!urls.has(photo.blob)) urls.set(photo.blob, URL.createObjectURL(photo.blob));
        return urls.get(photo.blob);
      });
      urls.forEach((url, blob) => { if (!used.has(blob)) { URL.revokeObjectURL(url); urls.delete(blob); } });
      return snapshot;
    }
    function renderMusic(snapshot) {
      musicInfo.replaceChildren();
      const music = snapshot?.musica;
      if (!music?.modo) { musicInfo.hidden = true; return; }
      const label = document.createElement('span');
      label.textContent = 'Música: ' + (music.descripcion || 'a elegir');
      musicInfo.append(label);
      if (music.enlace) {
        musicInfo.append(document.createTextNode(' · '));
        const link = document.createElement('a'); link.href = music.enlace; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Abrir enlace';
        musicInfo.append(link);
      }
      musicInfo.hidden = false;
    }
    function post(options = {}) {
      if (!iframe || !ready || !Object.hasOwn(models, model)) return false;
      const snapshot = collectData();
      const dataKey = JSON.stringify(snapshot.datos);
      const musicKey = JSON.stringify(snapshot.musica);
      const commandRequested = Object.keys(options).length > 0;
      if (!commandRequested && dataKey === lastDataKey) {
        if (musicKey !== lastMusicKey) {
          iframe.contentWindow.postMessage({ type:'eros-preview-info', previewInfo:snapshot.musica }, origin);
          lastMusicKey = musicKey;
          log('solo cambió la información de música');
        } else log('sin cambios que enviar');
        renderMusic(snapshot);
        return true;
      }
      const message = {
        type:'eros-preview-datos', datos:snapshot.datos, previewInfo:snapshot.musica,
        opciones:{ saltarSobre:true, saltarJuego:true, ...options },
        diagnostico: debug ? { revision:Date.now(), etapa:snapshot.etapa, modelo:snapshot.modelo } : undefined
      };
      iframe.contentWindow.postMessage(message, origin);
      lastDataKey = dataKey; lastMusicKey = musicKey;
      pending = {};
      status.textContent = 'Vista previa actualizada.';
      renderMusic(snapshot);
      log('datos enviados', { modelo:snapshot.modelo, etapa:snapshot.etapa, revision:message.diagnostico?.revision, campos:Object.keys(snapshot.datos || {}), fotos:snapshot.datos?.fotos?.length || snapshot.datos?.momentos?.filter(m => m.foto).length || snapshot.datos?.carta?.bloques?.filter(b => b.foto).length || 0, opcion:options });
      return true;
    }
    function update() {
      clearTimeout(timer);
      const snapshot = api.vistaPrevia();
      log('actualización solicitada', { modelo:snapshot.modelo, listo:ready, activa:active() });
      if (snapshot.modelo !== model) { destroyFrame('cambio de modelo'); model = snapshot.modelo; pending = { repetir:'apertura' }; }
      const supported = Object.hasOwn(models, model);
      panel.querySelectorAll('[data-preview-action]').forEach(button => { button.disabled = !supported; });
      panel.querySelector('[data-preview-action="repetir"]').textContent = 'Repetir la apertura';
      panel.querySelector('[data-preview-action="manual"]').hidden = !snapshot.juego;
      caption.textContent = snapshot.recibe ? 'Para ' + snapshot.recibe + (snapshot.de ? ' · de ' + snapshot.de : '') : 'Mirá cómo queda tu página mientras la armás.';
      if (!supported) {
        destroyFrame('sin modelo'); placeholder.textContent = 'Elegí un modelo para empezar'; placeholder.hidden = false;
        renderMusic(snapshot); return;
      }
      if (!active()) { log('actualización pendiente: vista no abierta'); return; }
      measure(); placeholder.textContent = 'Cargando tu vista previa…'; placeholder.hidden = !iframe;
      if (!iframe) {
        ready = false;
        iframe = document.createElement('iframe');
        iframe.title = 'Vista previa de ' + models[model].title;
        iframe.src = 'plantillas/' + model + '/index.html?preview=1' + (debug ? '&debug=1' : '');
        iframe.addEventListener('load', () => log('iframe cargado', { src:iframe?.src, origen:location.origin }));
        host.append(iframe);
        status.textContent = 'Cargando la vista previa…';
        log('iframe creado', { src:iframe.src, origenEsperado:origin });
      } else post(pending);
    }
    function schedule() {
      const snapshot = api.vistaPrevia();
      log('cambio del armador recibido', { modelo:snapshot.modelo, etapa:snapshot.etapa, juego:snapshot.juego, anterior:snapshot.juego === previous?.juego });
      if (previous && snapshot.modelo === previous.modelo) {
        if (snapshot.juego !== previous.juego) pending = { repetir:'apertura' };
        else if (snapshot.contador && (!previous.contador || snapshot.desde !== previous.desde)) pending = { irA:'contador' };
        else if (snapshot.etapa !== previous.etapa) {
          const config = models[snapshot.modelo];
          const sectionByStep = { 4:'contador', 5:config?.content, 6:config?.photos, 7:'cierre' };
          pending = { irA:sectionByStep[snapshot.etapa] || null };
        }
      }
      previous = snapshot;
      clearTimeout(timer);
      timer = setTimeout(update, 80);
    }
    window.addEventListener('message', event => {
      if (event.origin !== origin) { log('mensaje ignorado: origen distinto', { recibido:event.origin, esperado:origin }); return; }
      if (event.source !== iframe?.contentWindow) { log('mensaje ignorado: ventana distinta'); return; }
      if (event.data?.type !== 'eros-preview-listo') return;
      ready = true;
      log('eros-preview-listo recibido', { origenCorrecto:event.origin === location.origin, ventanaCorrecta:event.source === iframe.contentWindow });
      placeholder.hidden = true;
      if (!post(pending)) log('iframe listo pero no se pudo enviar');
    });
    document.addEventListener('eros-armador-cambio', schedule);
    panel.querySelectorAll('[data-preview-action]').forEach(button => button.addEventListener('click', () => {
      if (button.disabled) return;
      if (button.dataset.previewAction === 'contenido') pending = { irA:models[model]?.content || null };
      else pending = { repetir:'apertura', demoJuego:button.dataset.previewAction !== 'manual' };
      if (!post(pending)) update();
    }));
    openButton.addEventListener('click', () => {
      opener = openButton; savedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
      dialog.showModal(); document.getElementById('preview-close').focus(); measure(); update();
    });
    document.getElementById('preview-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      document.body.style.overflow = savedOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll:true });
      measure(); update();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(dialog.querySelectorAll('button:not([disabled]), iframe, a[href]')).filter(node => node.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    const observer = new IntersectionObserver(entries => {
      document.body.classList.toggle('order-in-view', entries[0].isIntersecting);
      log('sección visible', { visible:entries[0].isIntersecting });
    }, { threshold:0 });
    observer.observe(section);
    desktop.addEventListener('change', () => { if (dialog.open) dialog.close(); measure(); update(); });
    window.addEventListener('resize', () => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(measure); });
    window.addEventListener('pagehide', () => { clearTimeout(timer); cancelAnimationFrame(resizeFrame); observer.disconnect(); destroyFrame('salida de página'); }, { once:true });
    previous = api.vistaPrevia();
    update();
  }
  function waitForBuilder() {
    if (window.ErosArmador) { init(); return; }
    document.addEventListener('eros-armador-disponible', init, { once:true });
    setTimeout(() => { if (window.ErosArmador) init(); }, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', waitForBuilder, { once:true }); else waitForBuilder();
})();
