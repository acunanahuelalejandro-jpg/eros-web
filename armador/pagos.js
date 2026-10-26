/* Cobro y seguimiento: solo usa la clave pública; los pagos se validan en el servidor. */
(() => {
  'use strict';
  const scriptUrl = document.currentScript.src;
  const storageKey = 'erosweb-ultimo-pedido';
  const slugPattern = /^[23456789abcdefgh]{12,32}$/;
  const codePattern = /^[A-Z0-9]{6}$/;
  const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const esSlug = value => typeof value === 'string' && slugPattern.test(value);
  const esId = value => typeof value === 'string' && idPattern.test(value);
  const esCodigo = value => typeof value === 'string' && codePattern.test(value);

  function recordar(pedido) {
    const dato = {
      id: esId(pedido.id) ? pedido.id : '',
      code: esCodigo(pedido.code || pedido.codigo) ? (pedido.code || pedido.codigo) : '',
      slug: esSlug(pedido.slug) ? pedido.slug : '',
      total: Number.isInteger(pedido.total) && pedido.total >= 0 ? pedido.total : null,
      model: typeof pedido.model === 'string' ? pedido.model.slice(0, 80) : '',
      savedAt: Number.isFinite(pedido.savedAt) ? pedido.savedAt : Date.now()
    };
    try { localStorage.setItem(storageKey, JSON.stringify(dato)); } catch (_) { /* El cobro funciona aunque el navegador no permita recordar el pedido. */ }
    return dato;
  }
  function recuperar() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return value && typeof value === 'object' && esCodigo(value.code) ? value : null;
    } catch (_) { return null; }
  }
  function credenciales(pedido) {
    if (esId(pedido.id) && esCodigo(pedido.code || pedido.codigo)) return { id: pedido.id, codigo: pedido.code || pedido.codigo };
    if (esSlug(pedido.slug)) return { slug: pedido.slug };
    throw new Error('Falta identificar tu pedido. Escribinos por WhatsApp con tu código.');
  }
  function urlSeguimiento(pedido) {
    const url = new URL('../pedido/', scriptUrl);
    if (esSlug(pedido.slug)) url.searchParams.set('c', pedido.slug);
    else if (esId(pedido.id) && esCodigo(pedido.code || pedido.codigo)) {
      url.searchParams.set('id', pedido.id); url.searchParams.set('codigo', pedido.code || pedido.codigo);
    } else return '';
    return url.href;
  }
  function urlCheckout(value) {
    try {
      const url = new URL(value);
      const hosts = ['www.mercadopago.com', 'mercadopago.com', 'www.mercadopago.com.ar', 'mercadopago.com.ar', 'sandbox.mercadopago.com.ar', 'sandbox.mercadopago.com'];
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts.includes(url.hostname)) return '';
      if (!/^\/(?:mla\/)?checkout\//.test(url.pathname)) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function urlPagina(value) {
    try {
      const url = new URL(value);
      const expected = new URL('../p/', scriptUrl);
      if (url.origin !== expected.origin || url.username || url.password) return '';
      if (![expected.pathname, expected.pathname + 'index.html'].includes(url.pathname) || !esSlug(url.searchParams.get('c'))) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  async function llamar(nombre, pedido) {
    const config = window.EROS_CONFIG || {};
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl || '') || !/^(sb_publishable_|eyJ)/.test(config.supabaseKey || '')) {
      throw new Error('La conexión de pagos no está disponible. Tu pedido sigue guardado; reintentá en unos minutos.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    try {
      const response = await fetch(config.supabaseUrl.replace(/\/$/, '') + '/functions/v1/' + nombre, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabaseKey },
        body: JSON.stringify(credenciales(pedido)), signal: controller.signal, credentials: 'omit', cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const defaults = {
          404: 'No encontramos ese pedido. Revisá el enlace o escribinos con tu código.',
          409: 'El pedido cambió de estado. Actualizá el seguimiento antes de volver a pagar.',
          410: 'Este pedido ya venció. Escribinos si necesitás ayuda.',
          429: 'Hubo varios intentos seguidos. Esperá un minuto y volvé a probar.'
        };
        const error = new Error(data.error === 'pago_pendiente'
          ? 'Mercado Pago todavía está revisando tu pago. Revisá el estado y esperá la confirmación para evitar pagar dos veces. Si demora, escribinos con tu código.'
          : defaults[response.status] || 'No pudimos consultar el pago ahora. Tu pedido sigue guardado; volvé a intentar.');
        error.httpStatus = response.status;
        error.codigo = typeof data.error === 'string' ? data.error.slice(0, 80) : '';
        throw error;
      }
      if (!data || !['nuevo', 'pagado', 'publicado', 'vencido'].includes(data.estado) || !esSlug(data.slug) || !esCodigo(data.codigo)) {
        throw new Error('La respuesta del pedido no fue válida. Reintentá en unos minutos.');
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('La conexión tardó demasiado. Tu pedido sigue guardado; volvé a intentar.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function copiar(value) {
    try { await navigator.clipboard.writeText(value); return true; } catch (_) {
      const field = document.createElement('textarea'); field.value = value; field.readOnly = true;
      field.style.position = 'fixed'; field.style.opacity = '0'; document.body.append(field); field.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* El enlace sigue disponible para copiar manualmente. */ }
      field.remove(); return ok;
    }
  }
  window.ErosPagos = Object.freeze({
    esSlug, esId, esCodigo, recordar, recuperar, urlSeguimiento, urlCheckout, urlPagina, copiar,
    consultar: pedido => llamar('estado-pedido', pedido), crear: pedido => llamar('crear-pago', pedido)
  });
})();
