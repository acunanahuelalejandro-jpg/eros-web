/* La clave VAPID de avisos-config.js es pública. Los permisos reales los aplica RLS con la sesión admin. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), title = document.title;
  let client = null, owner = '', channel = null, registration = null, registerPromise = null, generation = 0;
  let onChange = () => {}, onOpen = () => {}, enabled = false, busy = false, unread = 0, refreshTimer = 0;
  let audio = null, sound = false, installPrompt = null;
  const knownPaid = new Map(), seen = new Set();
  const text = (id,value) => { const e = $(id); if (e) e.textContent = value; };
  const status = value => text('notifications-status',value);
  const connected = value => text('realtime-status',value);
  const active = gen => !!owner && gen === generation;
  function buttons() {
    $('notifications-enable').disabled = busy; $('notifications-enable').hidden = enabled;
    $('notifications-disable').disabled = busy; $('notifications-disable').hidden = !enabled;
    $('notifications-test').hidden = !enabled;
    $('notifications-read').hidden = !unread; $('notifications-count').hidden = !unread;
    text('notifications-count',unread + (unread === 1 ? ' aviso sin ver' : ' avisos sin ver'));
    document.title = unread ? '(' + unread + ') ' + title : title;
  }
  function read() { unread = 0; buttons(); }
  async function worker() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) throw new Error('Los avisos requieren HTTPS y un navegador compatible.');
    if (!registerPromise) registerPromise = navigator.serviceWorker.register('sw.js',{scope:'./'}).then(async reg => {
      registration = reg;
      if (!reg.active) await new Promise((resolve,reject) => {
        const w = reg.installing || reg.waiting; if (!w) return reject(new Error('No se pudo iniciar el servicio de avisos.'));
        const timer = setTimeout(() => reject(new Error('El servicio de avisos no respondió. Volvé a intentar.')),8000);
        w.addEventListener('statechange',() => { if (w.state === 'activated') { clearTimeout(timer); resolve(); } else if (w.state === 'redundant') { clearTimeout(timer); reject(new Error('No se pudo instalar el servicio de avisos.')); } });
      });
      return reg;
    }).catch(e => { registerPromise = null; throw e; });
    return registerPromise;
  }
  async function send(message) {
    const reg = await worker(), target = reg.active;
    if (!target) throw new Error('El servicio de avisos todavía no está listo.');
    return new Promise((resolve,reject) => {
      const pair = new MessageChannel();
      const timer = setTimeout(() => { pair.port1.close(); reject(new Error('No respondió el servicio de avisos.')); },5000);
      pair.port1.onmessage = event => { clearTimeout(timer); pair.port1.close(); resolve(event.data); };
      target.postMessage(message,[pair.port2]);
    });
  }
  function publicKey() {
    const key = window.EROS_AVISOS_CONFIG?.vapidPublicKey;
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{80,100}$/.test(key)) throw new Error('Falta la clave pública VAPID de avisos-config.js. Revisá la guía de avisos.');
    const bytes = Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-key.length%4)%4)),c => c.charCodeAt(0));
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('La clave pública de avisos no es válida.'); return bytes;
  }
  function soundUnlock() {
    try { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) return; audio ||= new Audio(); const context = audio; void context.resume().then(() => { if (audio === context && owner) sound = context.state === 'running'; }).catch(() => { sound = false; }); }
    catch (_) { sound = false; }
  }
  function ping() {
    if (!owner || !sound || !audio || audio.state !== 'running') return;
    try { const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime; oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(660,now); oscillator.frequency.exponentialRampToValueAtTime(880,now+.14); gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.13,now+.025); gain.gain.exponentialRampToValueAtTime(.0001,now+.35); oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(now); oscillator.stop(now+.36); }
    catch (_) { /* El aviso visual no depende del audio. */ }
  }
  function refresh() { clearTimeout(refreshTimer); const gen = generation; refreshTimer = setTimeout(() => { if (active(gen)) onChange(); },160); }
  function consume(event) {
    if (!owner || !event?.evento || seen.has(event.evento)) return;
    seen.add(event.evento); if (seen.size > 200) seen.delete(seen.values().next().value);
    if (event.tipo === 'prueba') return;
    unread++; buttons(); ping(); refresh();
  }
  function minimal(row,type) {
    const model = window.ErosPrecios?.tabla.models[window.ErosPrecios.modelo(row.modelo)]?.name;
    const duration = {day:'1 día',week:'1 semana',month:'1 mes'}[window.ErosPrecios?.duracion(row.duracion)];
    if (!/^[0-9a-f-]{36}$/i.test(row.id || '') || !/^[A-Z0-9]{6}$/.test(row.codigo || '') || !model || !duration || !Number.isSafeInteger(row.total) || row.total < 0 || row.total > 1000000) return null;
    return {version:1,tipo:type,codigo:row.codigo,modelo:model,duracion:duration,total:row.total,evento:type + ':' + row.id};
  }
  async function announce(event) {
    if (!event) return; const gen = generation;
    try { const response = await send({type:'eros-registrar-aviso',event,notify:enabled}); if (active(gen) && response.fresh) consume(response.event); }
    catch (_) { if (active(gen)) consume(event); }
  }
  function receive(change) {
    if (!owner) return;
    const row = change.new || {};
    if (change.eventType === 'INSERT') { knownPaid.set(row.id,!!row.pagado_en); void announce(minimal(row,'nuevo')); }
    if (change.eventType === 'UPDATE') {
      const paid = !!row.pagado_en, before = knownPaid.get(row.id); knownPaid.set(row.id,paid);
      // RLS puede entregar únicamente la PK en old: el pago se detecta desde la base conocida.
      if (paid && before !== true) void announce(minimal(row,'pagado'));
    }
    if (change.eventType === 'DELETE') knownPaid.delete(change.old?.id);
    refresh();
  }
  function actualizarBase(orders) { for (const order of orders || []) if (!knownPaid.has(order.id)) knownPaid.set(order.id,!!order.pagado_en); }
  async function save(sub,gen) {
    const result = await client.from('admin_push_subscriptions').upsert({admin_user_id:owner,endpoint:sub.endpoint,suscripcion:sub.toJSON(),actualizado_en:new Date().toISOString()},{onConflict:'endpoint'});
    if (!active(gen)) return false;
    if (result.error) throw new Error('No se pudo guardar este dispositivo. Revisá las políticas de admin_push_subscriptions y volvé a activar los avisos.');
    return true;
  }
  async function restore(gen) {
    try {
      const reg = await worker(); if (!active(gen) || !reg.pushManager) return;
      const state = await send({type:'eros-estado'}), sub = await reg.pushManager.getSubscription();
      if (!active(gen)) return;
      if (sub && state.owner && state.owner !== owner) { await send({type:'eros-desactivar'}); await sub.unsubscribe(); enabled = false; status('Este dispositivo pertenecía a otra cuenta. Activá los avisos para tu cuenta.'); }
      else if (sub && state.enabled && state.owner === owner && window.Notification?.permission === 'granted') { if (await save(sub,gen)) { enabled = true; status('Avisos activados en este dispositivo. Tocá Probar aviso local para habilitar también el sonido de esta sesión.'); } }
      if (active(gen)) buttons();
    } catch (e) { if (active(gen)) status(e.message); }
  }
  async function iniciar(options) {
    pausar(); client = options.client; owner = options.userId; onChange = options.onChange; onOpen = options.onOpen;
    const gen = generation; knownPaid.clear(); actualizarBase(options.orders); buttons();
    connected('Conectando los avisos del panel…');
    channel = client.channel('eros-admin-pedidos-' + owner).on('postgres_changes',{event:'*',schema:'public',table:'pedidos'},payload => { if (active(gen)) receive(payload); }).subscribe(state => {
      if (!active(gen)) return;
      connected(state === 'SUBSCRIBED' ? '● Pedidos en vivo conectados.' : ['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(state) ? 'No hay conexión en vivo. Usá Actualizar y revisá internet o la configuración Realtime.' : 'Conectando los avisos del panel…');
    });
    void restore(gen);
  }
  function pausar() {
    generation++; owner = ''; enabled = false; clearTimeout(refreshTimer);
    if (channel && client) void client.removeChannel(channel); channel = null;
    unread = 0; knownPaid.clear(); seen.clear(); sound = false; buttons();
    if (audio) { void audio.close().catch(() => {}); audio = null; }
  }
  async function disable(account,connection) {
    // Primero desactivar en el dispositivo: incluso sin red no debe avisar después de Salir.
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    let localError = false, remoteError = false;
    try { await send({type:'eros-desactivar'}); } catch (_) { localError = true; }
    const reg = registration || await worker().catch(() => null), sub = reg?.pushManager ? await reg.pushManager.getSubscription().catch(() => null) : null;
    if (sub) {
      const endpoint = sub.endpoint;
      try { await sub.unsubscribe(); } catch (_) { localError = true; }
      try { const result = await connection.from('admin_push_subscriptions').delete().eq('admin_user_id',account).eq('endpoint',endpoint); remoteError = !!result.error; } catch (_) { remoteError = true; }
    }
    enabled = false; buttons();
    if (localError) throw new Error('No se pudo confirmar la baja local. Quitá el permiso de notificaciones de este sitio en tu navegador.');
    if (remoteError) throw new Error('Avisos desactivados en este dispositivo. Sin conexión no se pudo limpiar el registro del servidor.');
  }
  async function salir() { const account = owner, connection = client; pausar(); if (account && connection) await disable(account,connection); }
  $('notifications-enable').addEventListener('click',async () => {
    if (!owner || busy) return;
    // El permiso y el desbloqueo de audio se solicitan solo tras este gesto directo.
    soundUnlock();
    let permission;
    try { permission = window.Notification?.permission === 'default' ? window.Notification.requestPermission() : Promise.resolve(window.Notification?.permission); }
    catch (_) { status('El navegador no permitió solicitar avisos. Revisá los permisos del sitio.'); return; }
    busy = true; buttons(); const gen = generation;
    try {
      if (!('PushManager' in window) || !window.Notification) throw new Error('Este navegador no admite avisos Push. En iPhone, agregá el panel a inicio y abrilo desde su ícono.');
      if (await permission !== 'granted') throw new Error('No se concedió permiso. Podés habilitarlo desde los permisos del sitio en tu navegador.');
      const key = publicKey(), reg = await worker(); if (!active(gen)) return;
      let sub = await reg.pushManager.getSubscription(), state = await send({type:'eros-estado'});
      if (sub && state.owner && state.owner !== owner) { await send({type:'eros-desactivar'}); await sub.unsubscribe(); sub = null; }
      sub ||= await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
      if (!active(gen)) { await sub.unsubscribe(); return; }
      let saved;
      try { saved = await save(sub,gen); }
      catch (error) {
        // Un endpoint puede seguir vinculado a otra cuenta por RLS; se crea uno nuevo sin apropiarse del anterior.
        if (!active(gen)) return;
        await send({type:'eros-desactivar'}); await sub.unsubscribe();
        sub = await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
        if (!active(gen)) { await sub.unsubscribe(); return; }
        saved = await save(sub,gen);
      }
      if (saved) {
        if (!active(gen)) return;
        const result = await send({type:'eros-activar',owner});
        if (!active(gen)) { await send({type:'eros-desactivar'}); return; }
        if (!result.ok) throw new Error('No se pudo activar el dispositivo.'); enabled = true; status('Avisos activados. Recibirás código, modelo, duración y total de cada pedido nuevo o pagado.');
      }
    } catch (e) { if (active(gen)) status(e.message || 'No se pudieron activar los avisos.'); }
    finally { busy = false; buttons(); }
  });
  $('notifications-disable').addEventListener('click',async () => { if (!owner || busy) return; busy = true; buttons(); try { await disable(owner,client); sound = false; status('Avisos desactivados en este dispositivo.'); } catch(e) { status(e.message); } finally { busy = false; buttons(); } });
  $('notifications-test').addEventListener('click',async () => { if (!owner) return; soundUnlock(); try { const result = await send({type:'eros-prueba'}); if (!result.ok) throw new Error(); ping(); status('Prueba local enviada. Esto comprueba el permiso del dispositivo; no prueba el webhook de Supabase.'); } catch (_) { status('No se pudo mostrar la prueba local. Revisá los permisos del navegador.'); } });
  $('notifications-read').addEventListener('click',read);
  navigator.serviceWorker?.addEventListener('message',event => {
    if (!event.source?.scriptURL || new URL(event.source.scriptURL).origin !== location.origin || !event.source.scriptURL.startsWith(new URL('sw.js',location.href).href)) return;
    if (owner && event.data?.type === 'eros-aviso') consume(event.data.event);
    if (event.data?.type === 'eros-abrir-pedido' && /^[A-Z0-9]{6}$/.test(event.data.codigo || '')) {
      if (owner) { read(); onOpen(event.data.codigo); }
      else window.dispatchEvent(new CustomEvent('eros-pedido-pendiente',{detail:event.data.codigo}));
    }
  });
  window.addEventListener('beforeinstallprompt',event => { event.preventDefault(); installPrompt = event; $('install-app').hidden = !owner; });
  $('install-app').addEventListener('click',async () => { if (!owner || !installPrompt) return; await installPrompt.prompt(); installPrompt = null; $('install-app').hidden = true; });
  window.addEventListener('appinstalled',() => { installPrompt = null; $('install-app').hidden = true; });
  window.ErosAvisos = {iniciar,actualizarBase,pausar,salir,marcarLeidos:read};
})();
