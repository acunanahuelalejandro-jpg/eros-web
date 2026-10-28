(() => {
  'use strict';
  const api = window.ErosPagos;
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const returned = ['success', 'pending', 'failure'].includes(params.get('resultado')) ? params.get('resultado') : '';
  const stored = api.recuperar();
  let pedido = api.esSlug(params.get('c')) ? { slug:params.get('c') }
    : api.esId(params.get('id')) && api.esCodigo(params.get('codigo')) ? { id:params.get('id'), code:params.get('codigo') } : null;
  if (!pedido && !params.has('c') && !params.has('id') && !params.has('codigo')) pedido = stored;
  if (pedido && stored && ((pedido.slug && stored.slug === pedido.slug) || (pedido.id && pedido.id === stored.id && pedido.code === stored.code))) pedido = { ...stored, ...pedido };
  let estado = '', pagoActual = null, timer = 0, loading = false, paying = false, stopped = false, currentLink = '';
  const text = (id, value) => { $(id).textContent = value; };
  function showError(message) { text('tracking-error', message); $('tracking-error').hidden = false; $('retry-button').hidden = false; }
  function setBusy(value) { $('tracking-card').setAttribute('aria-busy', String(value)); $('refresh-button').disabled = value || paying; $('retry-button').disabled = value || paying; $('pay-button').disabled = value || paying; }
  function support() {
    const message = '¡Hola! Necesito ayuda con mi pedido' + (api.esCodigo(pedido?.code) ? ' #' + pedido.code : '') + ' de Eros Web.';
    ['support-top', 'support-bottom'].forEach(id => { $(id).href = 'https://wa.me/5491161360254?text=' + encodeURIComponent(message); });
  }
  function remember(data) {
    pedido = { ...pedido, slug:data.slug, code:data.codigo };
    api.recordar(pedido); support();
    text('order-code', 'Pedido ' + data.codigo); $('order-code').hidden = false;
    const clean = new URL(location.href); clean.search = ''; clean.searchParams.set('c', data.slug);
    try { history.replaceState(null, '', clean.href); } catch (_) { /* El estado se puede seguir consultando con el enlace actual. */ }
    document.title = 'Pedido ' + data.codigo + ' | Eros Web';
  }
  function schedule(wait = 5000) {
    clearTimeout(timer);
    if (!stopped && !document.hidden && (!estado || ['nuevo', 'pagado'].includes(estado))) timer = setTimeout(refresh, wait);
  }
  function buildQr(link) {
    if (currentLink === link) return;
    currentLink = link;
    $('qr-error').hidden = true;
    try {
      if (typeof window.qrcode !== 'function') throw new Error('QR no disponible');
      const qr = window.qrcode(0, 'M'); qr.addData(link); qr.make();
      const count = qr.getModuleCount(), margin = 4, scale = 8;
      const canvas = $('qr-code'); canvas.width = canvas.height = (count + margin * 2) * scale;
      const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = '#302b31';
      for (let y = 0; y < count; y += 1) for (let x = 0; x < count; x += 1) if (qr.isDark(y, x)) context.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale);
      canvas.hidden = false; $('download-qr').href = canvas.toDataURL('image/png'); $('download-qr').download = 'eros-web-' + pedido.code.toLowerCase() + '-qr.png'; $('download-qr').hidden = false;
    } catch (_) { $('qr-code').hidden = true; $('download-qr').hidden = true; $('qr-error').hidden = false; }
  }
  function render(data) {
    remember(data); estado = data.estado; pagoActual = data.pago || null;
    $('tracking-error').hidden = true; $('retry-button').hidden = true; $('return-note').hidden = true;
    $('published').hidden = true; $('payment-actions').hidden = !['nuevo', 'pagado'].includes(estado);
    $('pay-button').hidden = estado !== 'nuevo'; $('poll-note').hidden = !['nuevo', 'pagado'].includes(estado);
    if (estado === 'nuevo') {
      let title = 'Tu pedido espera el pago';
      let description = 'Pagá con Mercado Pago. La confirmación se revisa automáticamente en esta página.';
      if (data.pago === 'pendiente') { title = 'Tu pago está pendiente'; description = 'Mercado Pago todavía está revisando el pago. Esperá la confirmación para evitar pagar dos veces.'; }
      else if (data.pago === 'rechazado') { title = 'El pago no se completó'; description = 'Podés volver a intentarlo con Mercado Pago. Tu pedido sigue guardado.'; }
      else if (returned) {
        text('return-note', returned === 'failure' ? 'Volviste de Mercado Pago. Todavía no hay un pago confirmado; podés reintentar.' : returned === 'pending' ? 'Volviste de Mercado Pago. Estamos esperando la confirmación del pago.' : 'Volviste de Mercado Pago. Estamos verificando la confirmación; el regreso por sí solo no confirma el pago.');
        $('return-note').hidden = false;
      }
      text('status-title', title); text('status-description', description);
      text('pay-button', data.pago === 'pendiente' ? 'Revisar estado del pago' : data.pago === 'rechazado' || data.pago === 'cancelado' || returned === 'failure' ? 'Reintentar pago' : 'Pagar con Mercado Pago');
    } else if (estado === 'pagado') {
      text('status-title', '¡Pago confirmado!'); text('status-description', 'Estamos preparando el enlace de tu regalo. Esta página se actualiza sola.');
    } else if (estado === 'publicado') {
      const link = api.urlPagina(data.link);
      if (!link) { text('status-title', '¡Pago confirmado!'); text('status-description', 'El enlace de tu página todavía no está disponible. Consultanos con tu código.'); return; }
      text('status-title', 'Tu página ya está lista'); text('status-description', 'Copiá el link o descargá el QR para compartir tu regalo.');
      $('published').hidden = false; $('public-link').value = link; $('open-page').href = link; buildQr(link);
    } else {
      text('status-title', 'El tiempo de tu página terminó'); text('status-description', 'Tu página ya venció y el link ya no da acceso al regalo. Si tenés alguna consulta, escribinos con tu código.');
    }
  }
  async function refresh() {
    if (!pedido || loading || paying || stopped || document.hidden) return;
    clearTimeout(timer); loading = true; setBusy(true);
    try { render(await api.consultar(pedido)); }
    catch (error) {
      if (!estado) { text('status-title', 'No pudimos consultar tu pedido'); text('status-description', 'Podés volver a intentarlo. Si sigue pasando, escribinos con tu código.'); }
      showError(error.message);
      if ([404,410].includes(error.httpStatus)) stopped = true;
    } finally { loading = false; setBusy(false); schedule($('tracking-error').hidden ? 5000 : 15000); }
  }
  async function pay() {
    if (paying || loading || !pedido || estado !== 'nuevo') return;
    if (pagoActual === 'pendiente') { await refresh(); return; }
    paying = true; clearTimeout(timer); $('pay-button').disabled = true; $('tracking-error').hidden = true; text('feedback', 'Abriendo Mercado Pago…');
    try {
      const data = await api.crear(pedido); remember(data);
      if (data.estado !== 'nuevo') { render(await api.consultar(pedido)); text('feedback', 'El estado de tu pedido se actualizó.'); return; }
      const url = api.urlCheckout(data.init_point);
      if (!url) throw new Error('No pudimos abrir Mercado Pago. Reintentá en unos minutos.');
      location.assign(url);
    } catch (error) {
      if (error.codigo === 'pago_pendiente') { pagoActual = 'pendiente'; text('pay-button', 'Revisar estado del pago'); }
      showError(error.message); text('feedback', 'Tu pedido sigue guardado.');
    }
    finally { paying = false; $('pay-button').disabled = false; schedule(); }
  }
  $('refresh-button').addEventListener('click', refresh);
  $('retry-button').addEventListener('click', () => { stopped = false; refresh(); });
  $('pay-button').addEventListener('click', pay);
  $('copy-link').addEventListener('click', async () => { text('feedback', await api.copiar($('public-link').value) ? 'Link copiado.' : 'Seleccioná el enlace de arriba para copiarlo.'); });
  $('share-link').addEventListener('click', async () => {
    const url = $('public-link').value;
    if (navigator.share) { try { await navigator.share({ title:'Un regalo para vos', url }); } catch (error) { if (error.name !== 'AbortError') text('feedback', 'No pudimos compartirlo. Podés copiar el link.'); } }
    else text('feedback', await api.copiar(url) ? 'Link copiado para compartir.' : 'Seleccioná el enlace de arriba para copiarlo.');
  });
  document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden && ['nuevo','pagado',''].includes(estado)) refresh(); });
  window.addEventListener('pagehide', () => clearTimeout(timer));
  window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; refresh(); } });
  if (pedido) { support(); refresh(); }
  else {
    setBusy(false); text('status-title', 'Abrí el enlace de tu pedido'); text('status-description', 'Usá el enlace que recibiste al enviarlo. Si lo perdiste, escribinos por WhatsApp con tu código.');
  }
})();
