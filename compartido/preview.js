/* Contrato de vista previa. El modo normal no registra ningún puente de mensajes. */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('preview') !== '1' || parent === window) return;
  const targetOrigin = location.origin === 'null' ? '*' : location.origin;
  const debug = new URLSearchParams(location.search).get('debug') === '1';
  const log = (event, details = {}) => { if (debug) console.info('[Eros preview iframe]', event, JSON.stringify(details)); };
  const sections = new Set(['contador', 'carta', 'fotos', 'recorrido', 'cierre']);
  function options(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      saltarSobre: source.saltarSobre !== false,
      saltarJuego: source.saltarJuego !== false,
      demoJuego: source.demoJuego !== false,
      repetir: source.repetir === 'apertura' ? 'apertura' : null,
      irA: sections.has(source.irA) ? source.irA : null
    };
  }
  let received = false;
  let lastVersion = 0;
  function renderInfo(info) {
    let badge = document.getElementById('eros-preview-music-info');
    if (!badge) {
      badge = document.createElement('aside'); badge.id = 'eros-preview-music-info';
      Object.assign(badge.style, { position:'fixed', zIndex:'10000', left:'12px', right:'12px', bottom:'12px', maxWidth:'460px', margin:'auto', padding:'9px 12px', border:'1px solid rgba(139,61,82,.25)', borderRadius:'14px', color:'#3c3034', background:'rgba(255,250,246,.96)', boxShadow:'0 5px 18px rgba(48,43,49,.14)', font:'600 13px/1.35 system-ui,sans-serif', overflowWrap:'anywhere' });
      document.body.append(badge);
    }
    badge.replaceChildren();
    if (info?.elegida !== true) { badge.hidden = true; return; }
    const text = document.createElement('span'); text.textContent = 'Música: ' + (typeof info.descripcion === 'string' ? info.descripcion.slice(0, 220) : 'a elegir'); badge.append(text);
    const rawLink = typeof info.enlace === 'string' ? info.enlace : '';
    try {
      const url = new URL(rawLink);
      if (url.protocol === 'https:' && ['open.spotify.com','spotify.link','youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(url.hostname.toLowerCase())) {
        badge.append(document.createTextNode(' · ')); const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Abrir música'; badge.append(link);
      }
    } catch (_) { /* El enlace opcional solo se muestra si es válido. */ }
    badge.hidden = false;
  }
  const fallback = setTimeout(() => {
    if (!received) { log('respaldo local: el padre no envió datos'); window.ErosPlantilla?.render(window.DATOS || {}, options()); }
  }, 2000);
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== parent || parent === window) { log('mensaje ignorado por origen o ventana', { origenCorrecto:event.origin === location.origin, ventanaCorrecta:event.source === parent }); return; }
    const message = event.data;
    if (message?.type === 'eros-preview-info') { renderInfo(message.previewInfo); log('información de música actualizada'); return; }
    if (!message || message.type !== 'eros-preview-datos' || !message.datos || typeof message.datos !== 'object' || Array.isArray(message.datos)) return;
    const nextVersion = Number.isSafeInteger(message.version) && message.version > 0 ? message.version : lastVersion + 1;
    if (nextVersion < lastVersion) {
      log('versión vieja ignorada', { recibida:nextVersion, vigente:lastVersion });
      return;
    }
    if (nextVersion === lastVersion && received) {
      // Repetición del mismo envío: confirmar otra vez por si se perdió el ACK anterior.
      parent.postMessage({ type:'eros-preview-recibido', version:nextVersion }, targetOrigin);
      log('versión repetida confirmada', { version:nextVersion });
      return;
    }
    if (typeof window.ErosPlantilla?.render !== 'function') {
      log('render todavía no disponible; el padre reintentará', { version:nextVersion });
      return;
    }
    clearTimeout(fallback);
    log('eros-preview-datos recibido', { origenCorrecto:event.origin === location.origin, ventanaCorrecta:event.source === parent, campos:Object.keys(message.datos), version:nextVersion, revision:message.diagnostico?.revision });
    try {
      window.ErosPlantilla.render(message.datos, options(message.opciones));
      renderInfo(message.previewInfo);
      lastVersion = nextVersion;
      received = true;
      parent.postMessage({ type:'eros-preview-recibido', version:lastVersion }, targetOrigin);
      log('eros-preview-recibido enviado', { version:lastVersion });
    } catch (error) {
      parent.postMessage({ type:'eros-preview-error', version:nextVersion, error:String(error?.message || error).slice(0, 180) }, targetOrigin);
      log('falló render', { version:nextVersion, error:error?.message || String(error) });
    }
  });
  window.addEventListener('pagehide', () => { clearTimeout(fallback); window.ErosPlantilla?.destruir(); }, { once: true });
  parent.postMessage({ type: 'eros-preview-listo' }, targetOrigin);
  log('eros-preview-listo enviado', { origen:location.origin });
})();
