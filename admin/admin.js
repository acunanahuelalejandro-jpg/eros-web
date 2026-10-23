/* Panel privado. Solo usa la clave pública y la sesión del administrador; RLS decide el acceso real. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => { const e = document.createElement(tag); if (text != null) e.textContent = String(text); if (className) e.className = className; return e; };
  const say = (id,message) => { $(id).textContent = message; };
  const money = v => window.ErosPrecios.formato(v);
  const estados = { nuevo:'Nuevo', en_proceso:'En proceso', pagado:'Pagado', publicado:'Publicado', vencido:'Vencido' };
  const juegos = { 'pintar-corazon':'Pintar el corazón', pintar:'Pintar el corazón', margarita:'Me ama / no me ama', laberinto:'Llegá a mí' };
  const fields = 'id,codigo,creado_en,estado,modelo,duracion,extras,tema,para_quien,de_parte,musica,activar_el,whatsapp_cliente,datos,total,fotos_cantidad,notas';
  let client = null, userId = '', orders = [], selected = null, authGeneration = 0, detailGeneration = 0, request = null;
  let objects = [], imageBlobs = new Map(), blobURLs = new Map(), pendingBlobs = new Map(), iframe = null, previewData = null;
  let loading = false, eraseBusy = false, sessionTimer = 0, localLogout = false, authStorage = null;
  const current = (auth, detail = detailGeneration) => !!userId && auth === authGeneration && detail === detailGeneration;
  const errorText = e => typeof e?.message === 'string' ? e.message : 'No se pudo completar la operación.';
  const api = async promise => { const result = await promise; if (result.error) throw result.error; return result.data; };
  const dateTime = value => { const d = new Date(value); return Number.isNaN(+d) ? 'Sin fecha' : new Intl.DateTimeFormat('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Argentina/Buenos_Aires'}).format(d); };
  function dateLabel(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : 'Sin definir'; }
  function expiration(order) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(order.activar_el || '')) return null;
    const duration = window.ErosPrecios.duracion(order.duracion), start = new Date(order.activar_el + 'T00:00:00-03:00');
    if (!duration || !Number.isFinite(+start)) return null;
    if (duration === 'month') { const day = start.getUTCDate(); start.setUTCDate(1); start.setUTCMonth(start.getUTCMonth()+1); const last = new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate(); start.setUTCDate(Math.min(day,last)); }
    else start.setUTCDate(start.getUTCDate() + (duration === 'week' ? 7 : 1));
    return start;
  }
  function modelName(order) { return window.ErosPrecios.tabla.models[window.ErosPrecios.modelo(order.modelo)]?.name || String(order.modelo || 'Sin modelo'); }
  function extraLabel(order) { const e = order.extras || {}, pieces = []; if (e.juego) pieces.push(juegos[e.juego] || 'Juego desconocido'); if (e.contador === true || e.contador?.desde || e.contador?.activo) pieces.push('Contador'); return pieces.join(' · ') || 'Sin extras pagos'; }
  function safeLink(value) { try { const u = new URL(value); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch (_) { return ''; } }
  function whatsapp(value) { const raw = String(value || '').trim(); if (!/^\+?[\d\s()-]{8,30}$/.test(raw)) return ''; const digits = raw.replace(/\D/g,''); return /^\d{8,15}$/.test(digits) ? digits : ''; }
  function button(text, action, secondary = true) { const b = node('button',text,secondary ? 'secondary' : ''); b.type = 'button'; b.addEventListener('click',action); return b; }
  function link(text, href) { const a = node('a',text,'button secondary'); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  function clearPreview() { iframe?.remove(); iframe = null; previewData = null; if ($('preview-dialog').open) $('preview-dialog').close(); $('preview-host').replaceChildren(); }
  function clearDetail() {
    detailGeneration++; clearPreview(); selected = null; objects = []; imageBlobs.clear(); pendingBlobs.clear(); blobURLs.forEach(URL.revokeObjectURL); blobURLs.clear();
    $('detail').hidden = true;
    for (const id of ['detail-fields','contact-actions','order-content','photos']) $(id).replaceChildren();
    for (const id of ['order-json','detail-title','package-status','notes-status','photos-status','erase-status','copy-status','final-link','total-check','erase-description','erase-error']) say(id,'');
    for (const id of ['notes','activation','delivery-message','erase-code']) $(id).value = '';
    $('final-link').removeAttribute('href'); $('delivery-whatsapp').removeAttribute('href');
  }
  function hidePrivate() {
    authGeneration++; userId = ''; orders = []; request?.abort(); request = null; clearDetail();
    $('dashboard').hidden = true; $('logout').hidden = true; $('order-rows').replaceChildren(); $('expired-list').replaceChildren();
    $('new-count').textContent = ''; $('search').value = ''; $('status-filter').value = ''; $('erase-dialog').close();
  }
  async function loginState(session) {
    hidePrivate(); const gen = authGeneration;
    $('login-panel').hidden = !!session; say('global-status',session ? 'Comprobando permisos…' : '');
    if (!session) { $('login-panel').hidden = false; return; }
    try {
      // getUser verifica el token con Supabase. user_metadata nunca otorga permisos.
      const { data, error } = await client.auth.getUser(); if (error) throw error;
      if (gen !== authGeneration) return;
      if (data.user?.app_metadata?.eros_admin !== true) {
        await client.auth.signOut({scope:'local'}); throw new Error('Tu cuenta no tiene el permiso eros_admin. Revisá supabase/PASOS.md y volvé a iniciar sesión.');
      }
      userId = data.user.id; $('dashboard').hidden = false; $('logout').hidden = false; $('login-panel').hidden = true;
      say('global-status','Sesión administradora activa.'); await loadOrders();
    } catch (e) { if (gen !== authGeneration && !e.message?.includes('eros_admin')) return; hidePrivate(); $('login-panel').hidden = false; say('login-error',errorText(e)); say('global-status',''); }
  }
  async function loadOrders() {
    if (!userId || loading) return;
    loading = true; const gen = authGeneration; request?.abort(); request = new AbortController(); $('refresh').disabled = true; say('list-status','Cargando pedidos…');
    try {
      const all = []; let offset = 0;
      while (true) {
        const page = await api(client.from('pedidos').select(fields).order('creado_en',{ascending:false}).order('id',{ascending:false}).range(offset,offset+199).abortSignal(request.signal));
        if (gen !== authGeneration || !userId) return; all.push(...page); if (page.length < 200) break; offset += 200;
      }
      orders = all; renderList();
    } catch(e) { if (gen === authGeneration && userId) say('list-status','No se pudo cargar la lista: ' + errorText(e)); }
    finally { loading = false; $('refresh').disabled = false; }
  }
  const folded = value => String(value || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  function renderList() {
    if (!userId) return;
    const search = folded($('search').value), status = $('status-filter').value;
    const filtered = orders.filter(o => (!status || o.estado === status) && folded([o.codigo,o.para_quien,o.de_parte].join(' ')).includes(search));
    $('order-rows').replaceChildren(); say('new-count',orders.filter(o => o.estado === 'nuevo').length + ' nuevos');
    for (const o of filtered) {
      const tr = node('tr');
      const values = [button(o.codigo,() => openDetail(o.id)), dateTime(o.creado_en), modelName(o), o.duracion, extraLabel(o), money(o.total), null, o.fotos_cantidad];
      const labels = ['Código','Fecha','Modelo','Duración','Extras','Total','Estado','Fotos'];
      values.forEach((v,i) => {
        const td = node('td'); td.dataset.label = labels[i];
        if (i === 0) { v.className = 'code-button'; v.setAttribute('aria-label','Ver pedido ' + o.codigo); td.append(v); }
        else if (i === 6) {
          const select = node('select'); select.setAttribute('aria-label','Estado del pedido ' + o.codigo);
          Object.entries(estados).forEach(([key,label]) => { const op = node('option',label); op.value = key; select.append(op); }); select.value = o.estado;
          const feedback = node('span','','status-feedback'); feedback.setAttribute('role','status');
          select.addEventListener('change',async () => { select.disabled = true; feedback.textContent = 'Guardando…'; try { await changeStatus(o,select.value); feedback.textContent = '✓ Guardado'; } catch(e) { select.value = o.estado; feedback.textContent = errorText(e); } finally { select.disabled = false; } });
          td.append(select,feedback);
        } else td.textContent = v == null ? '' : String(v);
        tr.append(td);
      }); $('order-rows').append(tr);
    }
    say('list-status',filtered.length ? filtered.length + ' pedidos' : 'No hay pedidos para esta búsqueda.'); renderExpired();
  }
  async function changeStatus(order,status) {
    if (!userId || !Object.hasOwn(estados,status)) throw new Error('Sesión o estado inválido.');
    const gen = authGeneration; const data = await api(client.from('pedidos').update({estado:status}).eq('id',order.id).select('id,estado').single());
    if (gen !== authGeneration || !userId) return;
    order.estado = data.estado; say('new-count',orders.filter(o => o.estado === 'nuevo').length + ' nuevos'); renderExpired();
    if (selected?.id === order.id) { selected.estado = status; renderDetailFields(); }
  }
  function renderExpired() {
    $('expired-list').replaceChildren();
    const overdue = orders.filter(o => o.estado === 'publicado' && expiration(o) && +expiration(o) <= Date.now());
    for (const o of overdue) {
      const wrap = node('div',null,'expired-item'); wrap.append(node('p',o.codigo + ' · ' + modelName(o) + ' · Venció el ' + dateTime(expiration(o))));
      wrap.append(button('Ver pedido',() => openDetail(o.id)),button('Marcar vencido',async event => {
        event.currentTarget.disabled = true;
        try { await changeStatus(o,'vencido'); renderList(); } catch(e) { say('list-status',errorText(e)); event.currentTarget.disabled = false; }
      })); $('expired-list').append(wrap);
    }
    if (!overdue.length) $('expired-list').append(node('p','No hay pedidos publicados con plazo cumplido.','muted'));
    const missing = orders.filter(o => o.estado === 'publicado' && !expiration(o));
    if (missing.length) $('expired-list').append(node('p',missing.length + ' publicados sin fecha de activación válida. Completala en su detalle para calcular el vencimiento.','error'));
  }
  async function openDetail(id) {
    if (!userId) return; clearDetail(); const auth = authGeneration, gen = detailGeneration;
    $('detail').hidden = false; say('detail-status','Cargando detalle…'); $('detail-title').focus(); $('detail').scrollIntoView({block:'start',behavior:'instant'});
    try {
      const order = await api(client.from('pedidos').select(fields).eq('id',id).single()); if (!current(auth,gen)) return;
      selected = order; renderDetailFields(); renderContent(); $('notes').value = order.notas || ''; $('activation').value = order.activar_el || '';
      say('order-json',JSON.stringify(order,null,2)); say('detail-status',''); updateDelivery();
      await loadPhotos(auth,gen);
    } catch(e) { if (current(auth,gen)) say('detail-status','No se pudo cargar: ' + errorText(e)); }
  }
  function renderDetailFields() {
    if (!selected) return; const o = selected; say('detail-title','Pedido ' + o.codigo);
    $('detail-fields').replaceChildren();
    const rows = [['Estado',estados[o.estado] || o.estado],['Creado',dateTime(o.creado_en)],['Modelo',modelName(o)],['Duración',o.duracion],['Para',o.para_quien],['De parte de',o.de_parte || 'Sin indicar'],['Tema',o.tema],['Extras',extraLabel(o)],['Contador desde',dateLabel(o.extras?.contador?.desde)],['Música',o.musica || 'Sin indicar'],['Activación',dateLabel(o.activar_el)],['Vencimiento',expiration(o) ? dateTime(expiration(o)) + ' (Argentina)' : 'Falta fecha de activación'],['WhatsApp',o.whatsapp_cliente || 'Sin indicar'],['Fotos declaradas',o.fotos_cantidad],['Total guardado',money(o.total)]];
    rows.forEach(([label,value]) => $('detail-fields').append(node('dt',label),node('dd',value)));
    const check = $('total-check');
    try { const p = ErosPrecios.calcular(o); const same = p.total === o.total; check.className = same ? 'check-ok' : 'check-error'; check.textContent = (same ? '✓ Total verificado. ' : '⚠ El total guardado NO coincide. ') + 'Modelo: ' + money(p.base) + ' · Juego: ' + money(p.juego) + ' · Contador: ' + money(p.contador) + ' · Esperado: ' + money(p.total) + (same ? '' : ' · Guardado: ' + money(o.total)); }
    catch(e) { check.className = 'check-error'; check.textContent = '⚠ No se puede verificar el total: ' + errorText(e); }
    $('contact-actions').replaceChildren(); const number = whatsapp(o.whatsapp_cliente);
    if (number) $('contact-actions').append(link('Escribir al cliente','https://wa.me/' + number + '?text=' + encodeURIComponent('Hola! Te escribo por tu pedido ' + o.codigo + ' de Eros Web…')));
    const match = String(o.musica || '').match(/https?:\/\/[^\s]+/i), musicURL = match && safeLink(match[0]);
    if (musicURL) $('contact-actions').append(link('Abrir música',musicURL));
  }
  function renderContent() {
    const root = $('order-content'), d = selected.datos || {}; root.replaceChildren();
    if (d.inicio?.titulo) root.append(node('p','Inicio: ' + d.inicio.titulo));
    if (d.carta) { root.append(node('h3',d.carta.titulo)); (Array.isArray(d.carta.bloques) ? d.carta.bloques : []).forEach(b => { if (typeof b?.texto === 'string') root.append(node('p',b.texto)); }); }
    if (d.principal) root.append(node('h3',d.principal.titulo),node('p',d.principal.subtitulo));
    if (Array.isArray(d.momentos)) d.momentos.forEach(m => { const article = node('article'); article.append(node('p',m?.fecha,'muted'),node('h3',m?.titulo),node('p',m?.texto)); root.append(article); });
    if (Array.isArray(d.fotos)) d.fotos.forEach((f,i) => root.append(node('p','Foto ' + (i+1) + ': ' + (f?.epigrafe || 'Sin epígrafe'))));
    if (d.cierre?.mensaje) root.append(node('p',d.cierre.mensaje)); if (d.firma) root.append(node('p',d.firma));
    if (!root.childNodes.length) root.append(node('p','Sin contenido personal.','muted'));
  }
  function uuid(id) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) throw new Error('El identificador del pedido no es válido.'); return id; }
  async function listObjects(id) {
    uuid(id); const out = []; let offset = 0;
    while (true) { const page = await api(client.storage.from('fotos').list(id,{limit:100,offset,sortBy:{column:'name',order:'asc'}})); out.push(...page.filter(f => f.id && /^[a-z0-9][a-z0-9._-]{0,119}$/i.test(f.name))); if (page.length < 100) break; offset +=100; }
    return out.sort((a,b) => a.name.localeCompare(b.name,'es',{numeric:true}));
  }
  async function loadPhotos(auth,gen) {
    say('photos-status','Cargando fotos privadas…'); $('preview-button').disabled = true; $('package-button').disabled = true;
    try {
      const list = await listObjects(selected.id); if (!current(auth,gen)) return; objects = list; $('photos').replaceChildren();
      for (const f of list) {
        const signed = await api(client.storage.from('fotos').createSignedUrl(selected.id + '/' + f.name,600)); if (!current(auth,gen)) return;
        const figure = node('figure',null,'photo-item'), img = node('img'); img.alt = 'Foto del pedido: ' + f.name; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = signed.signedUrl;
        const caption = node('figcaption',f.name), download = button('Descargar',async event => {
          const order = selected, a = authGeneration, d = detailGeneration; event.currentTarget.disabled = true;
          try { const blob = await getBlob(f.name); if (current(a,d)) ErosPaquetes.guardar(blob,order.codigo.toLowerCase() + '-' + f.name); } catch(e) { if (current(a,d)) say('photos-status',errorText(e)); } finally { event.currentTarget.disabled = false; }
        });
        img.addEventListener('error',async () => { if (!current(auth,gen)) return; try { const renewed = await api(client.storage.from('fotos').createSignedUrl(selected.id + '/' + f.name,600)); if (current(auth,gen)) img.src = renewed.signedUrl; } catch (_) { caption.textContent = f.name + ' · No se pudo cargar. Probá Actualizar.'; } },{once:true});
        figure.append(img,caption,download); $('photos').append(figure);
      }
      const missing = ErosPaquetes.referencias(selected).filter(n => !list.some(f => f.name === n));
      say('photos-status',list.length + ' archivos disponibles.' + (missing.length ? ' Faltan: ' + missing.join(', ') : ''));
      $('preview-button').disabled = false; $('package-button').disabled = false;
    } catch(e) { if (current(auth,gen)) { say('photos-status','No se pudieron leer las fotos: ' + errorText(e)); $('preview-button').disabled = false; $('package-button').disabled = false; } }
  }
  async function getBlob(name) {
    if (!userId || !selected || !objects.some(f => f.name === name)) throw new Error('No se encuentra la foto ' + name + '.');
    if (imageBlobs.has(name)) return imageBlobs.get(name); if (pendingBlobs.has(name)) return pendingBlobs.get(name);
    const id = selected.id, auth = authGeneration, gen = detailGeneration;
    const promise = api(client.storage.from('fotos').download(uuid(id) + '/' + name)).then(blob => { if (!current(auth,gen)) throw new Error('La sesión o el pedido cambió.'); imageBlobs.set(name,blob); return blob; }).finally(() => { if (current(auth,gen)) pendingBlobs.delete(name); });
    pendingBlobs.set(name,promise); return promise;
  }
  async function preparePreview() {
    if (!selected || !userId) return;
    const order = selected, a = authGeneration, d = detailGeneration; $('preview-button').disabled = true; say('package-status','Preparando vista previa…');
    try {
      for (const name of ErosPaquetes.referencias(order)) {
        const blob = await getBlob(name); if (!current(a,d)) return; if (!blobURLs.has(name)) blobURLs.set(name,URL.createObjectURL(blob));
      }
      previewData = ErosPaquetes.crearDatos(order,p => blobURLs.get(ErosPaquetes.nombreFoto(p)) || '');
      const audio = await ErosPaquetes.musica(order); if (!current(a,d)) return;
      if (audio) { const name = '__musica'; if (!blobURLs.has(name)) blobURLs.set(name,URL.createObjectURL(audio.blob)); previewData.musica = blobURLs.get(name); } else previewData.musica = '';
      const slug = ErosPaquetes.modelo(order); $('preview-host').replaceChildren(); iframe = document.createElement('iframe'); iframe.title = 'Vista previa de ' + modelName(order); iframe.src = '../plantillas/' + slug + '/index.html?preview=1';
      $('preview-host').append(iframe); say('preview-status','Cargando vista previa…'); $('preview-dialog').showModal();
      say('preview-opening',previewData.extras.juego ? 'Probar el juego' : 'Ver el sobre'); say('package-status','');
    } catch(e) { if (current(a,d)) say('package-status','No se pudo preparar la vista previa: ' + errorText(e)); }
    finally { $('preview-button').disabled = false; }
  }
  function postPreview(options = {}) { if (iframe && previewData && userId) iframe.contentWindow.postMessage({type:'eros-preview-datos',datos:previewData,opciones:{saltarSobre:true,saltarJuego:true,...options}},location.origin === 'null' ? '*' : location.origin); }
  function updateDelivery() {
    if (!selected) return;
    try { const url = ErosPaquetes.finalURL(selected); $('final-link').href = url; say('final-link',url); const message = '¡Tu regalo ya está listo! ' + url + '\nQueda online durante ' + selected.duracion + (expiration(selected) ? ', hasta el ' + dateTime(expiration(selected)) + ' (hora Argentina).' : ' desde la fecha acordada.') + '\nDespués se da de baja.'; $('delivery-message').value = message;
      const number = whatsapp(selected.whatsapp_cliente); $('delivery-whatsapp').hidden = !number; if (number) $('delivery-whatsapp').href = 'https://wa.me/' + number + '?text=' + encodeURIComponent(message);
    } catch(e) { say('copy-status',errorText(e)); }
  }
  async function copy(value) { try { await navigator.clipboard.writeText(value); say('copy-status','✓ Copiado'); } catch(_) { say('copy-status','No se pudo copiar automáticamente. Seleccioná el texto y copialo.'); $('delivery-message').focus(); $('delivery-message').select(); } }
  $('login-form').addEventListener('submit',async event => {
    event.preventDefault(); if (!client) return; localLogout = false; client.auth.startAutoRefresh(); say('login-error',''); $('login-button').disabled = true;
    try { const {error} = await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value}); if (error) throw error; $('password').value = ''; }
    catch(e) { say('login-error',e.status === 400 ? 'No se pudo ingresar. Revisá tu email y contraseña.' : errorText(e)); }
    finally { $('login-button').disabled = false; }
  });
  $('logout').addEventListener('click',async () => { localLogout = true; client.auth.stopAutoRefresh(); hidePrivate(); $('login-panel').hidden = false; $('password').value = ''; try { await client.auth.signOut({scope:'local'}); say('global-status','Sesión cerrada.'); } catch(e) { say('global-status','Los datos se ocultaron. No se pudo confirmar el cierre: ' + errorText(e)); } finally { authStorage?.removeItem('erosweb-admin-auth-v1'); authStorage?.removeItem('erosweb-admin-auth-v1-code-verifier'); } });
  $('refresh').addEventListener('click',async () => { const id = selected?.id; await loadOrders(); if (id && userId) await openDetail(id); });
  $('search').addEventListener('input',renderList); $('status-filter').addEventListener('change',renderList);
  $('close-detail').addEventListener('click',clearDetail);
  $('notes-form').addEventListener('submit',async event => {
    event.preventDefault(); if (!selected || !userId) return; const id = selected.id, a = authGeneration, d = detailGeneration;
    $('save-notes').disabled = true; say('notes-status','Guardando…');
    try { const update = {notas:$('notes').value.trim().slice(0,1000) || null,activar_el:$('activation').value || null}; const data = await api(client.from('pedidos').update(update).eq('id',id).select('id,notas,activar_el').single()); if (!current(a,d)) return; Object.assign(selected,data); const o = orders.find(o => o.id === id); if(o) Object.assign(o,data); renderDetailFields(); updateDelivery(); renderExpired(); say('order-json',JSON.stringify(selected,null,2)); say('notes-status','✓ Guardado'); }
    catch(e) { if (current(a,d)) say('notes-status',errorText(e)); } finally { $('save-notes').disabled = false; }
  });
  $('preview-button').addEventListener('click',preparePreview); $('preview-close').addEventListener('click',() => $('preview-dialog').close());
  $('preview-dialog').addEventListener('close',() => { iframe?.remove(); iframe = null; previewData = null; });
  $('preview-opening').addEventListener('click',() => postPreview({repetir:'apertura'}));
  $('preview-content').addEventListener('click',() => postPreview({irA:ErosPaquetes.modelo(selected) === 'nuestra-historia' ? 'recorrido' : 'carta'}));
  window.addEventListener('message',event => { if (!userId || !iframe || event.source !== iframe.contentWindow || event.origin !== location.origin || event.data?.type !== 'eros-preview-listo') return; postPreview(); say('preview-status','Vista previa del pedido. Las fotos no son públicas.'); });
  $('package-button').addEventListener('click',async () => {
    if (!selected || !userId) return; const a = authGeneration, d = detailGeneration, order = selected; $('package-button').disabled = true;
    try { await ErosPaquetes.generar(order,getBlob,message => { if (current(a,d)) say('package-status',message); },() => current(a,d),objects.map(f => f.name)); if (current(a,d)) say('package-status','✓ Paquete descargado. Descomprimí todo para probarlo; copiá p/' + order.codigo.toLowerCase() + '/ a tu sitio para publicarlo.'); }
    catch(e) { if (current(a,d)) say('package-status','No se pudo generar el paquete: ' + errorText(e)); } finally { $('package-button').disabled = false; }
  });
  $('copy-link').addEventListener('click',() => { if (selected) copy(ErosPaquetes.finalURL(selected)); }); $('copy-message').addEventListener('click',() => copy($('delivery-message').value));
  $('erase-button').addEventListener('click',() => { if (!selected || !userId || eraseBusy) return; $('erase-code').value = ''; say('erase-error',''); say('erase-description','Se borrarán todas las fotos de Supabase, los nombres, el contenido, la música, el WhatsApp y las notas del pedido ' + selected.codigo + '. Retirá también p/' + selected.codigo.toLowerCase() + '/ de GitHub si está publicado.'); $('erase-dialog').showModal(); $('erase-code').focus(); });
  $('erase-cancel').addEventListener('click',() => $('erase-dialog').close());
  $('erase-form').addEventListener('submit',async event => {
    event.preventDefault(); if (!selected || !userId || eraseBusy) return;
    if ($('erase-code').value.trim().toUpperCase() !== selected.codigo.toUpperCase()) { say('erase-error','El código no coincide.'); return; }
    if (!window.confirm('Segunda confirmación: ¿borrar definitivamente las fotos y los datos personales de ' + selected.codigo + '? Esta acción no se puede deshacer.')) return;
    const a = authGeneration, d = detailGeneration, order = selected; eraseBusy = true; $('erase-confirm').disabled = true; say('erase-error','Borrando…');
    try {
      const files = await listObjects(order.id); if (!current(a,d)) return;
      for (let i = 0; i < files.length; i += 100) { await api(client.storage.from('fotos').remove(files.slice(i,i+100).map(f => order.id + '/' + f.name))); if (!current(a,d)) return; }
      if ((await listObjects(order.id)).length) throw new Error('Quedaron archivos en el bucket. Volvé a intentar el borrado.');
      const extra = {juego:order.extras?.juego || '',sobre:!order.extras?.juego,contador:{activo:!!(order.extras?.contador === true || order.extras?.contador?.desde || order.extras?.contador?.activo)}};
      await api(client.from('pedidos').update({para_quien:'Datos eliminados',de_parte:null,musica:'',whatsapp_cliente:null,datos:{},fotos_cantidad:0,notas:null,extras:extra}).eq('id',order.id).select('id').single());
      if (!current(a,d)) return; $('erase-dialog').close(); await loadOrders(); await openDetail(order.id); say('erase-status','✓ Fotos y datos personales borrados de Supabase. Si existía una página publicada, retirala también de GitHub.');
    } catch(e) { if (current(a,d)) say('erase-error','El borrado no terminó. Podés reintentar: ' + errorText(e)); }
    finally { eraseBusy = false; $('erase-confirm').disabled = false; }
  });
  async function init() {
    const config = window.EROS_CONFIG;
    if (!window.ErosPrecios || !window.ErosPaquetes || !window.supabase?.createClient || !config || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl || '') || !/^(sb_publishable_|eyJ)/.test(config.supabaseKey || '')) { say('global-status','No se pudo cargar Supabase. Revisá internet y ../armador/config.js (solo clave pública).'); $('login-panel').hidden = false; $('login-button').disabled = true; return; }
    let storage;
    try { const key = 'eros-admin-test'; sessionStorage.setItem(key,'1'); sessionStorage.removeItem(key); storage = sessionStorage; } catch(_) { const memory = new Map(); storage = {getItem:k => memory.get(k) || null,setItem:(k,v) => memory.set(k,v),removeItem:k => memory.delete(k)}; }
    authStorage = storage;
    client = window.supabase.createClient(config.supabaseUrl,config.supabaseKey,{auth:{storage,storageKey:'erosweb-admin-auth-v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    // Una clave publishable no es un JWT: createClient la manda como apikey y usa el JWT de Auth después del login.
    client.auth.onAuthStateChange((event,session) => {
      if (localLogout && session) return;
      if (session?.user?.id === userId && ['TOKEN_REFRESHED','SIGNED_IN'].includes(event)) return;
      if (!session) hidePrivate();
      clearTimeout(sessionTimer); sessionTimer = setTimeout(() => loginState(session),0);
    });
    setInterval(() => { if (userId) renderExpired(); },60000);
  }
  window.addEventListener('pageshow',event => { if (event.persisted && client) client.auth.getSession().then(({data}) => loginState(localLogout ? null : data.session)); });
  window.addEventListener('pagehide',() => { hidePrivate(); clearTimeout(sessionTimer); });
  init().catch(e => { hidePrivate(); $('login-panel').hidden = false; say('global-status',errorText(e)); });
})();
