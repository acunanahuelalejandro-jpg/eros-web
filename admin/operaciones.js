/* Los cambios de pago y vigencia pasan por el servidor con la sesión admin. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const text = (id,value) => { $(id).textContent = value; };
  const clone = value => JSON.parse(JSON.stringify(value));
  const labels = { 'pago-manual':'Marcar pago manual', republicar:'Republicar', extender:'Extender vigencia', anular:'Anular acceso' };
  const paymentLabels = { approved:'Aprobado', pending:'Pendiente', in_process:'En revisión', in_mediation:'En mediación', authorized:'Autorizado', rejected:'Rechazado', cancelled:'Cancelado', refunded:'Reintegrado', charged_back:'Contracargo' };
  const storageKey = 'eros-admin-operaciones-v1';
  let client = null, getPedido = () => null, getUserId = () => '', onUpdated = () => {};
  let generation = 0, viewVersion = 0, paymentKey = '', paymentResult = null, pending = null, busy = false, controller = null;
  const attempts = new Map();
  const date = value => { if (!value || !Number.isFinite(+new Date(value))) return 'Sin registrar'; return new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(value)) + ' (Argentina)'; };
  function canonical(order) { try { return window.ErosPrecios.calcular(order).total === order.total; } catch (_) { return false; } }
  function cleaned(order) { return !!(order.limpiado_en || order.limpieza_intentada_en || order.limpieza_token || order.limpieza_en_curso); }
  function content(order) { return !!order.datos && typeof order.datos === 'object' && !Array.isArray(order.datos) && Object.keys(order.datos).length > 0; }
  function available(order,action) {
    if (!order || !getUserId()) return false;
    if (action === 'anular') return ['nuevo','pagado','publicado'].includes(order.estado);
    if (!content(order) || cleaned(order) || !canonical(order)) return false;
    if (action === 'pago-manual') return order.estado === 'nuevo' && !order.pagado_en;
    if (action === 'republicar') return ['pagado','publicado','vencido'].includes(order.estado) && !!order.pagado_en;
    return action === 'extender' && order.estado === 'publicado' && Number.isFinite(+new Date(order.vence_en)) && +new Date(order.vence_en) > Date.now();
  }
  function revision(order) {
    return clone({modelo:order.modelo,duracion:order.duracion,extras:order.extras || {},total:order.total,activar_el:order.activar_el || null,
      estado:order.estado,pagado_en:order.pagado_en || null,publicado_en:order.publicado_en || null,vence_en:order.vence_en || null});
  }
  function fields(order) {
    const dl = $('payment-fields'); dl.replaceChildren();
    const rows = [['Pago Mercado Pago',paymentResult?.error ? 'No disponible' : paymentResult?.estado ? paymentLabels[paymentResult.estado] || 'Estado no reconocido' : paymentResult ? 'Sin pago registrado' : 'Consultando…'],
      ['Pago manual',order.pago_manual_en ? date(order.pago_manual_en) : paymentResult?.manual ? 'Confirmado' : 'Sin registrar'],
      ['ID de preferencia',order.mp_preference_id || 'Sin registrar'],['ID de pago',order.mp_payment_id || 'Sin registrar'],
      ['Pago confirmado',date(order.pagado_en)],['Publicación',date(order.publicado_en)],['Vencimiento',date(order.vence_en)],
      ['Limpieza iniciada',date(order.limpieza_intentada_en)],['Datos eliminados',date(order.limpiado_en)]];
    rows.forEach(([label,value]) => { const dt = document.createElement('dt'),dd = document.createElement('dd'); dt.textContent = label; dd.textContent = String(value); dl.append(dt,dd); });
  }
  function controls(order) {
    for (const [id,action] of [['action-manual','pago-manual'],['action-republish','republicar'],['action-extend','extender'],['action-cancel','anular']]) $(id).disabled = busy || !available(order,action);
    const note = !content(order) || cleaned(order) ? 'La limpieza ya empezó o no queda contenido: no se puede publicar, republicar ni extender este pedido.'
      : !canonical(order) ? 'El total no coincide con los precios del modelo y los extras. Revisá el pedido antes de publicarlo.'
      : 'Cada acción pide confirmar el código. Anular el acceso no reintegra el pago de Mercado Pago.';
    text('operations-note',note);
  }
  function configurar(options) { client = options.client; getPedido = options.getPedido; getUserId = options.getUserId; onUpdated = options.onUpdated; }
  function mostrar(order,options = {}) {
    if (!order || !getUserId()) return;
    controls(order);
    const key = JSON.stringify([order.id,order.estado,order.pagado_en,order.pago_manual_en,order.mp_payment_id,order.mp_preference_id]);
    if (key === paymentKey && options.forzar !== true) { fields(order); return; }
    paymentKey = key; paymentResult = null; fields(order); const gen = ++generation, owner = getUserId();
    text('payment-status','Consultando el estado registrado del pago…');
    Promise.resolve().then(() => client.rpc('eros_admin_estado_pago',{p_pedido_id:order.id})).then(({data,error}) => {
      if (gen !== generation || !getUserId() || getUserId() !== owner || getPedido()?.id !== order.id) return;
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      paymentResult = {estado:typeof data.estado === 'string' ? data.estado : null,manual:data.manual === true};
      fields(getPedido()); text('payment-status','Estado registrado consultado. Las fechas de esta sección se muestran en hora Argentina.');
    }).catch(() => { if (gen === generation && getUserId() === owner && getPedido()?.id === order.id) { paymentKey = ''; paymentResult = {error:true}; text('payment-status','No se pudo consultar el estado del pago. Tocá Actualizar para volver a intentarlo.'); fields(order); } });
  }
  function limpiar() {
    generation++; viewVersion++; paymentKey = ''; paymentResult = null; pending = null; busy = false; controller?.abort(); controller = null;
    $('operation-dialog').close(); $('payment-fields').replaceChildren();
    for (const id of ['payment-status','operations-status','operation-error','operation-impact','operation-title','operation-ack-text']) text(id,'');
    $('operation-code').value = ''; $('operation-date').value = ''; $('operation-ack').checked = false;
  }
  function impact(order,action) {
    const days = {day:1,week:7,month:30}[window.ErosPrecios.duracion(order.duracion)];
    if (action === 'pago-manual') return 'Confirmás que recibiste ' + window.ErosPrecios.formato(order.total) + ' fuera de Mercado Pago. Se publica el pedido por ' + days + (days === 1 ? ' día' : ' días') + ', respetando su fecha de activación. El servidor confirma las fechas.';
    if (action === 'republicar') return 'Publica ahora y elimina cualquier fecha de activación futura. Reinicia el plazo de este pedido por ' + days + (days === 1 ? ' día' : ' días') + '. No se realiza un cobro nuevo.';
    if (action === 'extender') return 'Vencimiento actual: ' + date(order.vence_en) + '. Elegí hasta cuándo seguirá disponible. No se realiza un cobro nuevo.';
    return 'Corta el acceso al regalo y deja el pedido vencido. Esta acción no devuelve ni cancela el pago en Mercado Pago. La limpieza automática puede borrar sus fotos y textos después.';
  }
  function open(action) {
    const order = getPedido(); if (busy || !available(order,action)) return;
    if (action !== 'anular' && !$('activation').disabled && $('activation').value !== (order.activar_el || '')) { text('operations-status','Guardá la fecha de activación antes de confirmar esta acción.'); $('activation').focus(); return; }
    pending = {id:order.id,codigo:order.codigo,accion:action,revision:revision(order),order:clone(order),owner:getUserId(),vista:viewVersion,solicitud_id:'',vence_en:''};
    text('operation-title',labels[action]); text('operation-impact',impact(order,action)); text('operation-error','');
    text('operation-ack-text',action === 'pago-manual' ? 'Confirmo que ya recibí el pago.' : action === 'anular' ? 'Entiendo que el acceso se corta y el pago no se reintegra.' : action === 'republicar' ? 'Confirmo que quiero publicar ahora, aunque hubiera una fecha de activación futura.' : 'Confirmo este cambio de vigencia.');
    $('operation-code').value = ''; $('operation-ack').checked = false; $('operation-date').value = ''; $('operation-date').disabled = false;
    $('operation-date-wrap').hidden = action !== 'extender'; $('operation-date').required = action === 'extender';
    $('operation-confirm').disabled = false; $('operation-cancel').disabled = false; text('operation-confirm',labels[action]);
    $('operation-dialog').showModal(); (action === 'extender' ? $('operation-date') : $('operation-code')).focus();
  }
  function extension(value,order) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || '')) throw new Error('Elegí el nuevo día y la hora de vencimiento.');
    const end = new Date(value + ':00-03:00');
    if (!Number.isFinite(+end)) throw new Error('La fecha de vencimiento no es válida.');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(end).map(p => [p.type,p.value]));
    if (parts.year+'-'+parts.month+'-'+parts.day+'T'+parts.hour+':'+parts.minute !== value) throw new Error('La fecha de vencimiento no existe.');
    if (+end <= Date.now()) throw new Error('El nuevo vencimiento tiene que ser una fecha futura.');
    if (+end <= +new Date(order.vence_en)) throw new Error('El nuevo vencimiento tiene que ser posterior al actual.');
    if (+end > Date.now() + 366 * 86400000) throw new Error('Elegí un vencimiento dentro de los próximos 366 días.');
    return end.toISOString();
  }
  async function requestId(action) {
    const value = JSON.stringify([action.owner,action.id,action.accion,action.revision,action.vence_en || '',action.preparar_borrado === true]);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b => b.toString(16).padStart(2,'0')).join('');
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || '[]'); if (Array.isArray(saved)) for (const row of saved) if (Array.isArray(row) && /^[a-f0-9]{64}$/.test(row[0]) && /^[a-f0-9-]{36}$/.test(row[1]) && Date.now()-row[2] < 86400000) attempts.set(row[0],{id:row[1],time:row[2]}); } catch (_) { /* Sin almacenamiento sigue funcionando en memoria. */ }
    if (!attempts.has(hash)) attempts.set(hash,{id:crypto.randomUUID(),time:Date.now()});
    while (attempts.size > 30) attempts.delete(attempts.keys().next().value);
    try { sessionStorage.setItem(storageKey,JSON.stringify(Array.from(attempts,([key,v]) => [key,v.id,v.time]))); } catch (_) { /* No se guarda contenido del pedido. */ }
    return attempts.get(hash).id;
  }
  async function errorResponse(error,data) {
    let body = data;
    if (error?.context instanceof Response) { try { body = await error.context.json(); } catch (_) { /* Se conserva un mensaje local. */ } }
    const status = error?.context?.status || 0;
    const mensajes = {revision:'El pedido cambió mientras confirmabas. Cerrá esta ventana y tocá Actualizar antes de volver a intentarlo.',cambio:'El pedido cambió mientras confirmabas. Cerrá esta ventana y tocá Actualizar antes de volver a intentarlo.',limpieza:'La limpieza ya empezó o terminó. Este pedido no puede volver a publicarse.',total:'El total no coincide con los precios actuales del pedido.',precio:'El total o los extras no coinciden con los precios del pedido.',fecha:'Revisá la fecha: debe ser futura, posterior al vencimiento actual y dentro de los próximos 366 días.',no_autorizado:'La sesión no tiene permiso para esta acción. Volvé a iniciar sesión.',permiso:'La sesión no tiene permiso para esta acción. Volvé a iniciar sesión.',sesion:'No se pudo verificar la sesión. Volvé a iniciar sesión.',solicitud:'Cerrá esta confirmación y volvé a abrirla para revisar la acción.',estado:'El estado actual del pedido no permite esta acción. Tocá Actualizar.',pago_pendiente:'Hay un cobro pendiente o un checkout en preparación. Revisalo en Mercado Pago antes de confirmar otro pago.',limite:'Esperá un minuto antes de volver a intentar.',pedido:'No se encontró el pedido con ese código. Tocá Actualizar.'};
    const message = mensajes[body?.error] || (status === 409 ? 'El pedido cambió o no cumple las condiciones de esta acción. Cerrá esta ventana y tocá Actualizar.' : status === 401 || status === 403 ? 'No se pudo autorizar la acción. Volvé a iniciar sesión.' : 'No se pudo confirmar el resultado. Reintentá esta misma acción; se usará la misma solicitud.');
    const result = new Error(message); result.noReintentar = [400,401,403,404,409].includes(status); return result;
  }
  async function invoke(action) {
    if (!getUserId() || getUserId() !== action.owner || action.vista !== viewVersion) throw new Error('La sesión o el pedido cambió. Volvé a abrir el detalle.');
    action.solicitud_id ||= await requestId(action);
    const body = {pedido_id:action.id,codigo:action.codigo,accion:action.accion,solicitud_id:action.solicitud_id,revision:action.revision};
    if (action.accion === 'extender') body.vence_en = action.vence_en;
    if (action.preparar_borrado === true) body.preparar_borrado = true;
    const localController = new AbortController(); controller = localController; const timer = setTimeout(() => localController.abort(),25000);
    try {
      const {data,error} = await client.functions.invoke('administrar-pedido',{body,signal:localController.signal});
      if (error || data?.ok !== true) throw await errorResponse(error,data);
      if (!getUserId() || getUserId() !== action.owner || getPedido()?.id !== action.id || action.vista !== viewVersion) throw new Error('La sesión o el pedido cambió. Actualizá antes de continuar.');
      if (data.pedido?.id !== action.id || data.pedido?.codigo !== action.codigo) throw new Error('No se pudo confirmar el pedido actualizado. Tocá Actualizar.');
      onUpdated(data.pedido); return data;
    } finally { clearTimeout(timer); if (controller === localController) controller = null; }
  }
  async function anularParaBorrado(order,codigo) {
    if (!getUserId() || order.id !== getPedido()?.id || codigo !== order.codigo) throw new Error('Confirmá el código del pedido antes de borrar.');
    const action = {id:order.id,codigo:order.codigo,accion:'anular',revision:revision(order),owner:getUserId(),vista:viewVersion,solicitud_id:'',vence_en:'',preparar_borrado:true};
    return invoke(action);
  }
  for (const [id,action] of [['action-manual','pago-manual'],['action-republish','republicar'],['action-extend','extender'],['action-cancel','anular']]) $(id).addEventListener('click',() => open(action));
  $('operation-cancel').addEventListener('click',() => { if (!busy) $('operation-dialog').close(); });
  $('operation-dialog').addEventListener('cancel',event => { if (busy) event.preventDefault(); });
  $('operation-dialog').addEventListener('close',() => { if (!busy) pending = null; });
  $('operation-form').addEventListener('submit',async event => {
    event.preventDefault(); const action = pending; if (!action || busy || !getUserId()) return;
    text('operation-error','');
    if ($('operation-code').value.trim().toUpperCase() !== action.codigo) { text('operation-error','El código no coincide con el pedido.'); $('operation-code').focus(); return; }
    if (!$('operation-ack').checked) { text('operation-error','Confirmá que entendés el efecto de esta acción.'); return; }
    try { if (action.accion === 'extender' && !action.vence_en) action.vence_en = extension($('operation-date').value,action.order); }
    catch(error) { text('operation-error',error.message); $('operation-date').focus(); return; }
    busy = true; controls(getPedido()); $('operation-confirm').disabled = true; $('operation-cancel').disabled = true; $('operation-date').disabled = true;
    text('operation-error','Guardando la acción…');
    try { const result = await invoke(action); if (pending !== action || action.vista !== viewVersion) return; text('operations-status',(result.repetido ? 'La acción ya estaba confirmada. ' : 'Acción confirmada. ') + 'Revisá las fechas actualizadas y el link para entregar.'); pending = null; busy = false; $('operation-dialog').close(); }
    catch(error) { if (pending === action && getUserId() === action.owner) { text('operation-error',error.message || 'No se pudo confirmar la acción.'); $('operation-confirm').disabled = error.noReintentar === true; text('operation-confirm','Reintentar la misma acción'); } }
    finally { if (action.vista === viewVersion) { busy = false; $('operation-cancel').disabled = false; if (getPedido() && getUserId()) controls(getPedido()); } }
  });
  window.ErosOperaciones = {configurar,mostrar,limpiar,anularParaBorrado};
})();
