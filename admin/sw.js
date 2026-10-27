/* Solo avisos: no hay caché de HTML, pedidos, sesiones, fotos ni respuestas de API. */
'use strict';
const DB_NAME = 'eros-admin-avisos-v1', LIMIT = 100, MAX_AGE = 7 * 86400000;
const MODELS = ['Carta para vos','Nuestra historia','Álbum de recuerdos'];
const DURATIONS = ['1 día','1 semana','1 mes'];
let work = Promise.resolve();
function serial(fn) { const next = work.then(fn,fn); work = next.catch(() => {}); return next; }
function valid(value) {
  if (value?.version === 1 && value.tipo === 'prueba' && /^prueba:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.evento || '')) return {version:1,tipo:'prueba',evento:value.evento};
  if (!value || value.version !== 1 || !['nuevo','pagado'].includes(value.tipo) || !/^[A-Z0-9]{6}$/.test(value.codigo || '') || !MODELS.includes(value.modelo) || !DURATIONS.includes(value.duracion) || !Number.isSafeInteger(value.total) || value.total < 0 || value.total > 1000000 || !new RegExp('^' + value.tipo + ':[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$','i').test(value.evento || '')) return null;
  return {version:1,tipo:value.tipo,codigo:value.codigo,modelo:value.modelo,duracion:value.duracion,total:value.total,evento:value.evento};
}
function db() { return new Promise((resolve,reject) => { const r = indexedDB.open(DB_NAME,1); r.onupgradeneeded = () => { r.result.createObjectStore('eventos',{keyPath:'evento'}); r.result.createObjectStore('config'); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function operation(store,mode,fn) {
  const database = await db();
  try { return await new Promise((resolve,reject) => { const tx = database.transaction(store,mode); let result; fn(tx.objectStore(store),value => { result = value; }); tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); }
  finally { database.close(); }
}
const readConfig = () => operation('config','readonly',(s,done) => { const r = s.get('device'); r.onsuccess = () => done(r.result || {enabled:false,owner:''}); });
async function remember(event) {
  return operation('eventos','readwrite',(store,done) => {
    const all = store.getAll();
    all.onsuccess = () => {
      const now = Date.now(), rows = all.result.sort((a,b) => b.cuando-a.cuando), exists = rows.some(row => row.evento === event.evento && now-row.cuando < MAX_AGE);
      rows.forEach((row,i) => { if (now-row.cuando >= MAX_AGE || i >= LIMIT-1) store.delete(row.evento); });
      // Solo identificador técnico y fecha: ningún texto, nombre o foto se guarda acá.
      if (!exists) store.put({evento:event.evento,cuando:now}); done(!exists);
    };
  });
}
async function broadcast(type,event) { const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true}); windows.filter(c => c.url.startsWith(self.registration.scope)).forEach(c => c.postMessage({type,event})); }
function body(event) { return event.tipo === 'prueba' ? 'Prueba de Eros Web' : (event.tipo === 'pagado' ? 'Pedido pagado ' : 'Nuevo pedido ') + event.codigo + ' · ' + event.modelo + ' · ' + event.duracion + ' · $' + new Intl.NumberFormat('es-AR').format(event.total); }
async function deliver(raw,push,notify) {
  const event = valid(raw); if (!event) return {ok:false};
  const settings = await readConfig();
  if (push && !settings.enabled) return {ok:false};
  const fresh = await remember(event);
  // Un push válido siempre produce un aviso visible (Safari userVisibleOnly).
  // La misma etiqueta reemplaza duplicados de Push/Realtime sin repetir sonido del sistema.
  if (settings.enabled && (push || (notify && fresh))) await self.registration.showNotification('Eros Web',{
    body:body(event),tag:'eros-' + event.evento,renotify:false,
    icon:new URL('icons/icon-192.png',self.registration.scope).href,
    badge:new URL('icons/icon-192.png',self.registration.scope).href,
    data:{codigo:event.codigo},silent:!fresh
  });
  if (fresh) await broadcast('eros-aviso',event);
  return {ok:true,fresh,event};
}
self.addEventListener('install',event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event => event.waitUntil(self.clients.claim()));
self.addEventListener('push',event => {
  let payload; try { payload = event.data?.json(); } catch (_) { return; }
  event.waitUntil(serial(() => deliver(payload,true,true)).catch(() => {}));
});
self.addEventListener('message',event => {
  const source = event.source;
  if (!source?.url || !source.url.startsWith(self.registration.scope) || new URL(source.url).origin !== self.location.origin) return;
  const message = event.data || {}, reply = result => event.ports?.[0]?.postMessage(result);
  event.waitUntil(serial(async () => {
    if (message.type === 'eros-estado') return reply({ok:true,...await readConfig()});
    if (message.type === 'eros-activar' && /^[0-9a-f-]{36}$/i.test(message.owner || '')) {
      await operation('config','readwrite',s => s.put({enabled:true,owner:message.owner},'device')); return reply({ok:true});
    }
    if (message.type === 'eros-desactivar') {
      await operation('config','readwrite',s => s.put({enabled:false,owner:''},'device'));
      await operation('eventos','readwrite',s => s.clear());
      (await self.registration.getNotifications()).filter(n => n.tag?.startsWith('eros-')).forEach(n => n.close()); return reply({ok:true});
    }
    if (message.type === 'eros-registrar-aviso') return reply(await deliver(message.event,false,message.notify === true));
    if (message.type === 'eros-prueba') {
      const settings = await readConfig(); if (!settings.enabled) return reply({ok:false});
      await self.registration.showNotification('Eros Web',{body:'Prueba de avisos en este dispositivo',tag:'eros-prueba',icon:new URL('icons/icon-192.png',self.registration.scope).href,data:{}}); return reply({ok:true});
    }
    reply({ok:false});
  }).catch(() => reply({ok:false})));
});
self.addEventListener('notificationclick',event => {
  event.notification.close(); const code = event.notification.data?.codigo;
  const url = new URL('./',self.registration.scope); if (/^[A-Z0-9]{6}$/.test(code || '')) url.searchParams.set('pedido',code);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const target = windows.find(c => c.url.startsWith(self.registration.scope));
    if (target) { await target.focus(); if (code) target.postMessage({type:'eros-abrir-pedido',codigo:code}); }
    else await self.clients.openWindow(url.href);
  })());
});
