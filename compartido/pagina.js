/* Carga de regalos vigentes. No guarda textos, fotos ni enlaces firmados en storage. */
(() => {
  'use strict';
  const query = new URLSearchParams(location.search);
  const activa = query.has('c') && query.get('preview') !== '1';
  if (!activa) { window.ErosPagina = Object.freeze({ activa:false }); return; }

  const base = new URL('../', document.currentScript.src);
  const modelos = new Set(['carta-para-vos','nuestra-historia','album-recuerdos']);
  const slug = query.get('c') || '';
  const blobs = new Set();
  const permitidos = new Set();
  const controllers = new Set();
  let run = 0, vencimiento = 0, timer = 0, modeloActual = '', rutaCorta = false, iniciado = false;
  document.documentElement.classList.add('eros-pagina-bloqueada');

  function interfaz() {
    let root = document.getElementById('eros-pagina-estado');
    if (root) return root;
    root = document.createElement('section'); root.id = 'eros-pagina-estado'; root.className = 'eros-pagina-estado';
    root.setAttribute('aria-labelledby','eros-pagina-titulo'); root.setAttribute('data-eros-pagina-ui','');
    const heart = document.createElement('div'); heart.className = 'eros-pagina-corazon'; heart.textContent = '♡'; heart.setAttribute('aria-hidden','true');
    const heading = document.createElement('h1'); heading.id = 'eros-pagina-titulo';
    const description = document.createElement('p'); description.id = 'eros-pagina-descripcion'; description.setAttribute('role','status'); description.setAttribute('aria-live','polite');
    const retry = document.createElement('button'); retry.id = 'eros-pagina-reintentar'; retry.type = 'button'; retry.textContent = 'Volver a intentar';
    retry.addEventListener('click', () => rutaCorta ? redirigir() : iniciar(modeloActual));
    root.append(heart,heading,description,retry); document.body.append(root); return root;
  }
  function estado(titulo, descripcion, retry = false) {
    document.documentElement.classList.add('eros-pagina-bloqueada');
    const root = interfaz(); root.hidden = false;
    document.getElementById('eros-pagina-titulo').textContent = titulo;
    document.getElementById('eros-pagina-descripcion').textContent = descripcion;
    document.getElementById('eros-pagina-reintentar').hidden = !retry;
    document.title = titulo + ' | Eros Web';
  }
  function liberar() {
    clearTimeout(timer); timer = 0;
    controllers.forEach(controller => controller.abort()); controllers.clear();
    window.ErosPlantilla?.destruir();
    blobs.forEach(url => URL.revokeObjectURL(url)); blobs.clear(); permitidos.clear();
  }
  function noDisponible(status) {
    if (status === 410) estado('Esta página ya venció', 'El tiempo acordado para este regalo terminó.');
    else if (status === 404) estado('Esta página todavía no está disponible', 'Revisá el enlace o volvé a abrirlo en la fecha acordada.');
    else estado('No pudimos abrir tu regalo', 'Revisá tu conexión y volvé a intentar en un momento.', true);
  }
  function config() {
    const value = window.EROS_CONFIG || {};
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(value.supabaseUrl || '') || !/^(sb_publishable_|eyJ)/.test(value.supabaseKey || '')) throw new Error('configuracion');
    return { url:value.supabaseUrl.replace(/\/$/,''), key:value.supabaseKey };
  }
  async function solicitar(soloModelo) {
    if (!/^[23456789abcdefgh]{12,32}$/.test(slug)) { const error = new Error('enlace'); error.status = 404; throw error; }
    const cfg = config(), controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch(cfg.url + '/functions/v1/obtener-pagina', {
        method:'POST', headers:{'Content-Type':'application/json',apikey:cfg.key},
        body:JSON.stringify({slug,...(soloModelo ? {soloModelo:true} : {})}), signal:controller.signal, credentials:'omit', cache:'no-store',
      });
      if (!response.ok) { const error = new Error('consulta'); error.status = response.status; throw error; }
      const payload = await response.json();
      if (!payload || !modelos.has(payload.modelo)) throw new Error('respuesta');
      const hasta = Date.parse(payload.vence_en);
      if (!Number.isFinite(hasta)) throw new Error('respuesta');
      if (hasta <= Date.now()) { const error = new Error('vencio'); error.status = 410; throw error; }
      if (!soloModelo && (!payload.datos || typeof payload.datos !== 'object' || Array.isArray(payload.datos) || !Array.isArray(payload.fotos))) throw new Error('respuesta');
      return payload;
    } finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  function urlFirmada(value) {
    try {
      const cfg = config(), url = new URL(value);
      return url.origin === new URL(cfg.url).origin && url.pathname.startsWith('/storage/v1/object/sign/fotos/') &&
        url.protocol === 'https:' && !url.username && !url.password && !!url.searchParams.get('token') && url.href.length < 8192 ? url.href : '';
    } catch (_) { return ''; }
  }
  function musicaSegura(value, modelo) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value,base), carpeta = new URL('musica/',base);
      const carpetaModelo = new URL('plantillas/' + modelo + '/',base);
      return url.origin === base.origin && url.protocol === base.protocol && !url.username && !url.password && !url.search && !url.hash &&
        ((url.pathname.startsWith(carpeta.pathname) && /\.(mp3|m4a|ogg|wav)$/i.test(url.pathname)) ||
          (url.pathname.startsWith(carpetaModelo.pathname) && /^musica\.(mp3|m4a|ogg|wav)$/i.test(url.pathname.slice(carpetaModelo.pathname.length)))) ? url.href : '';
    } catch (_) { return ''; }
  }
  async function fotoLocal(url, hasta) {
    if (Date.now() >= hasta) return '';
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(),Math.min(15000,hasta-Date.now()));
    try {
      const response = await fetch(url,{signal:controller.signal,credentials:'omit',cache:'no-store'});
      if (!response.ok) return '';
      const blob = await response.blob();
      if (!/^image\/(jpeg|png|webp)$/i.test(blob.type) || !blob.size || blob.size > 5*1024*1024) return '';
      const local = URL.createObjectURL(blob); blobs.add(local); permitidos.add(local); return local;
    } catch (_) { return ''; }
    finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  async function prepararDatos(payload, token) {
    const photos = [...new Set(payload.fotos.slice(0,14).map(urlFirmada).filter(Boolean))];
    const conversion = new Map(); let index = 0, terminadas = 0;
    const hasta = Date.now()+15000;
    async function siguiente() {
      while (index < photos.length) {
        const photo = photos[index++];
        if (token !== run) return;
        const local = await fotoLocal(photo,hasta);
        if (token !== run) { if (local) { URL.revokeObjectURL(local); blobs.delete(local); permitidos.delete(local); } return; }
        conversion.set(photo,local);
        terminadas++;
        const description = document.getElementById('eros-pagina-descripcion');
        if (description) description.textContent = 'Preparando tus fotos: ' + terminadas + ' de ' + photos.length + '…';
      }
    }
    await Promise.all(Array.from({length:Math.min(4,photos.length)},siguiente));
    const datos = structuredClone(payload.datos);
    function recorrer(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key,item] of Object.entries(value)) {
        if (['foto','src','fotoQuienJuega','fotoQuienRegala'].includes(key) && typeof item === 'string') value[key] = conversion.get(item) || '';
        else if (item && typeof item === 'object') recorrer(item);
      }
    }
    recorrer(datos);
    datos.musica = musicaSegura(datos.musica,payload.modelo);
    if (datos.musica) permitidos.add(datos.musica);
    return datos;
  }
  function vigilarVencimiento() {
    clearTimeout(timer);
    if (!vencimiento) return;
    const queda = vencimiento-Date.now();
    if (queda <= 0) { run++; liberar(); noDisponible(410); return; }
    timer = setTimeout(vigilarVencimiento,Math.min(60000,queda));
  }
  function destino(modelo) {
    const url = new URL('plantillas/' + modelo + '/',base); url.searchParams.set('c',slug); return url.href;
  }
  async function iniciar(modelo) {
    modeloActual = modelo; rutaCorta = false; iniciado = true;
    const token = ++run; liberar(); vencimiento = 0;
    estado('Preparando tu regalo', 'Esperá un momento…');
    try {
      const payload = await solicitar(false);
      if (token !== run) return;
      if (payload.modelo !== modelo) { location.replace(destino(payload.modelo)); return; }
      const datos = await prepararDatos(payload,token);
      if (token !== run) return;
      vencimiento = Date.parse(payload.vence_en);
      if (vencimiento <= Date.now()) { noDisponible(410); liberar(); return; }
      if (typeof window.ErosPlantilla?.render !== 'function') throw new Error('modelo');
      window.ErosPlantilla.render(datos);
      document.documentElement.classList.remove('eros-pagina-bloqueada'); interfaz().hidden = true;
      vigilarVencimiento();
    } catch (error) { if (token === run) { liberar(); noDisponible(error.status); } }
  }
  async function redirigir() {
    rutaCorta = true; iniciado = true;
    const token = ++run; liberar(); estado('Preparando tu regalo','Esperá un momento…');
    try {
      const payload = await solicitar(true);
      if (token === run) location.replace(destino(payload.modelo));
    } catch (error) { if (token === run) noDisponible(error.status); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) vigilarVencimiento(); });
  window.addEventListener('pagehide', () => { run++; liberar(); document.documentElement.classList.add('eros-pagina-bloqueada'); });
  window.addEventListener('pageshow',event => { if (event.persisted && iniciado) { if (rutaCorta) redirigir(); else iniciar(modeloActual); } });
  window.ErosPagina = Object.freeze({ activa, iniciar, redirigir, esRecursoPermitido:value => permitidos.has(value) });
})();
