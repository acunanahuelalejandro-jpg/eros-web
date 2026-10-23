/* Armador de pedidos Eros Web. La clave de Supabase debe ser siempre la pública; RLS limita el acceso. */
(() => {
  'use strict';

  const WHATSAPP_NUMBER = '5491161360254';
  const PRICE_TABLE = window.ErosPrecios.tabla;
  const GAMES = { pintar: 'Pintar el corazón', margarita: 'Me ama / no me ama', laberinto: 'Llegá a mí' };
  const GAME_DATA = { pintar: 'pintar-corazon', margarita: 'margarita', laberinto: 'laberinto' };
  const THEMES = { eros: 'Eros', dorado: 'Dorado', 'azul-cielo': 'Azul cielo', rosa: 'Rosa', atardecer: 'Atardecer', bosque: 'Bosque', lavanda: 'Lavanda', medianoche: 'Medianoche', galaxia: 'Galaxia' };
  const STORAGE_KEY = 'erosweb-pedido-v2';
  // Conservamos los identificadores anteriores para recuperar borradores ya guardados.
  const STEPS = [[1], [2], [3], [4, 5], [6, 7], [8, 9], [10]];
  const stepIndex = () => STEPS.findIndex(group => group.includes(state.step));
  const SUCCESS_KEY = 'erosweb-ultimo-pedido';
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const MAX_BUCKET_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  const freshState = () => ({
    model: '', duration: '', game: '', theme: 'eros', counter: false, counterDate: '',
    recipient: '', sender: '', activationDate: '', musicMode: '', musicTrack: '', musicLink: '', whatsapp: '', photoMeta: [],
    content: {
      carta: { title: '', paragraphs: [''], signature: '' },
      historia: { moments: [{ date: '', title: '', text: '' }], final: '', signature: '' },
      album: { title: '', subtitle: '', final: '', signature: '' }
    },
    step: 1
  });
  let state = freshState();
  let photos = [];
  let mazePhotos = { player: null, giver: null };
  let objectUrls = new Set();
  let submitting = false;
  let photoProcessing = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const text = (element, value) => { if (element) element.textContent = value == null ? '' : String(value); };
  const clamp = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
  const formatARS = (amount) => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(amount);
  const jsonBytes = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let changeQueued = false;
  function notifyPreview() {
    if (changeQueued) return;
    changeQueued = true;
    queueMicrotask(() => { changeQueued = false; document.dispatchEvent(new Event('eros-armador-cambio')); });
  }
  const saveDraft = () => { notifyPreview(); try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) { /* El armador sigue funcionando si el navegador bloquea el almacenamiento. */ } };
  const clearDraft = () => { try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) { /* Opcional. */ } };
  const readDraft = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return null;
      const clean = freshState();
      clean.model = Object.hasOwn(PRICE_TABLE.models, saved.model) ? saved.model : '';
      clean.duration = Object.hasOwn(PRICE_TABLE.durations, saved.duration) ? saved.duration : '';
      clean.game = Object.hasOwn(GAMES, saved.game) ? saved.game : '';
      clean.theme = Object.hasOwn(THEMES, saved.theme) ? saved.theme : 'eros';
      clean.counter = saved.counter === true;
      clean.counterDate = typeof saved.counterDate === 'string' ? saved.counterDate.slice(0, 10) : '';
      clean.recipient = clamp(saved.recipient, 120);
      clean.sender = clamp(saved.sender, 120);
      clean.activationDate = typeof saved.activationDate === 'string' ? saved.activationDate.slice(0, 10) : '';
      clean.musicMode = ['selection', 'link', 'help'].includes(saved.musicMode) ? saved.musicMode : '';
      clean.musicTrack = clamp(saved.musicTrack, 200);
      clean.musicLink = clamp(saved.musicLink, 494);
      clean.whatsapp = clamp(saved.whatsapp, 30);
      clean.photoMeta = Array.isArray(saved.photoMeta) ? saved.photoMeta.slice(0, 12).map((m, i) => ({ alt: clamp(m?.alt, 120), caption: clamp(m?.caption, 80), momentIndex: Number.isInteger(m?.momentIndex) ? Math.max(0, Math.min(7, m.momentIndex)) : i })) : [];
      clean.step = Number.isInteger(saved.step) && saved.step >= 1 && saved.step <= 10 ? saved.step : 1;
      if (saved.content && typeof saved.content === 'object') {
        const c = saved.content;
        clean.content.carta.title = clamp(c.carta?.title, 120);
        clean.content.carta.paragraphs = Array.isArray(c.carta?.paragraphs) ? c.carta.paragraphs.slice(0, 5).map((x) => clamp(x, 600)) : [''];
        if (!clean.content.carta.paragraphs.length) clean.content.carta.paragraphs = [''];
        clean.content.carta.signature = clamp(c.carta?.signature, 120);
        clean.content.historia.moments = Array.isArray(c.historia?.moments) ? c.historia.moments.slice(0, 8).map((m) => ({ date: clamp(m?.date, 80), title: clamp(m?.title, 120), text: clamp(m?.text, 280) })) : [{ date: '', title: '', text: '' }];
        if (!clean.content.historia.moments.length) clean.content.historia.moments = [{ date: '', title: '', text: '' }];
        clean.content.historia.final = clamp(c.historia?.final, 1000);
        clean.content.historia.signature = clamp(c.historia?.signature, 120);
        clean.content.album.title = clamp(c.album?.title, 120);
        clean.content.album.subtitle = clamp(c.album?.subtitle, 280);
        clean.content.album.final = clamp(c.album?.final, 1000);
        clean.content.album.signature = clamp(c.album?.signature, 120);
      }
      return clean;
    } catch (_) { return null; }
  };

  function totalAmount() {
    if (!state.model || !state.duration) {
      return (state.game ? PRICE_TABLE.extras.game : 0) + (state.counter ? PRICE_TABLE.extras.counter : 0);
    }
    return window.ErosPrecios.calcular({ modelo:state.model, duracion:state.duration, extras:{ juego:state.game, contador:state.counter } }).total;
  }
  function updatePrices() {
    $$('[data-extra-price]').forEach((el) => { if (PRICE_TABLE.extras[el.dataset.extraPrice]) text(el, '+' + formatARS(PRICE_TABLE.extras[el.dataset.extraPrice])); });
    $$('[data-extra-inline]').forEach((el) => { if (PRICE_TABLE.extras[el.dataset.extraInline]) text(el, formatARS(PRICE_TABLE.extras[el.dataset.extraInline])); });
    $$('[data-model-start]').forEach((el) => { const m = PRICE_TABLE.models[el.dataset.modelStart]; if (m) text(el, 'Desde ' + formatARS(Math.min(...Object.values(m.prices)))); });
    $$('[data-model-prices]').forEach((el) => {
      const m = PRICE_TABLE.models[el.dataset.modelPrices]; if (!m) return;
      el.replaceChildren();
      Object.keys(PRICE_TABLE.durations).forEach((d) => { const span = document.createElement('span'); span.textContent = PRICE_TABLE.durations[d] + ' ' + formatARS(m.prices[d]); el.append(span); });
    });
  }
  function setRadio(name, value) { const radio = $$('input[name="' + name + '"]').find((item) => item.value === value); if (radio) radio.checked = true; }
  function addListItem(list, label, value) { const li = document.createElement('li'); li.textContent = label + ': ' + value; list.append(li); }
  function addBreakdownItem(list, label, amount) { const li = document.createElement('li'); const name = document.createElement('span'); const price = document.createElement('span'); name.textContent = label; price.textContent = formatARS(amount); li.append(name, price); list.append(li); }
  function dateDDMMYYYY(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''; const [y, m, d] = value.split('-'); return d + '/' + m + '/' + y; }

  function hydrateInputs() {
    setRadio('order-model', state.model); setRadio('order-duration', state.duration); setRadio('order-game', state.game); setRadio('order-theme', state.theme);
    setRadio('order-counter', state.counter ? 'yes' : 'no'); setRadio('order-music', state.musicMode);
    $('#counter-date').value = state.counterDate; $('#recipient-name').value = state.recipient; $('#sender-name').value = state.sender;
    $('#activation-date').value = state.activationDate; $('#music-link-input').value = state.musicLink; $('#music-track').value = state.musicTrack; $('#client-whatsapp').value = state.whatsapp;
  }

  function createField(labelText, id, type = 'text', maxLength = null, hint = '', value = '', required = false) {
    const label = document.createElement('label'); label.className = 'order-field'; label.htmlFor = id; label.append(document.createTextNode(labelText));
    const control = type === 'textarea' ? document.createElement('textarea') : document.createElement('input');
    control.id = id; control.name = id; if (type !== 'textarea') control.type = type;
    if (maxLength) control.maxLength = maxLength; if (required) control.required = true; control.value = value;
    label.append(control);
    if (hint) { const small = document.createElement('small'); small.className = 'field-hint'; small.textContent = hint; label.append(small); }
    if (type === 'textarea' && maxLength) { const count = document.createElement('small'); count.className = 'char-count'; count.dataset.countFor = id; count.textContent = value.length + ' / ' + maxLength; label.append(count); }
    return { label, control };
  }
  function bindText(control, setter, onChange = null) {
    control.addEventListener('input', () => { const value = clamp(control.value, control.maxLength || 10000); setter(value); const counter = $('[data-count-for=\"' + control.id + '\"]'); if (counter) counter.textContent = value.length + ' / ' + control.maxLength; saveDraft(); if (onChange) onChange(); renderSummary(); });
  }
  function bindContentControl(control, setter) { bindText(control, setter, () => { updateAvailability(); }); }

  function renderContentFields() {
    const host = $('#content-fields'); host.replaceChildren();
    if (!state.model) { const p = document.createElement('p'); p.textContent = 'Elegí primero un modelo.'; host.append(p); return; }
    if (state.model === 'carta') {
      const c = state.content.carta;
      let field = createField('Título de la carta', 'letter-title', 'text', 120, 'Máximo 120 caracteres.', c.title, true); host.append(field.label); bindContentControl(field.control, (v) => { c.title = v; });
      const paragraphs = document.createElement('div'); paragraphs.className = 'content-block-list'; host.append(paragraphs);
      function drawParagraphs() {
        paragraphs.replaceChildren();
        c.paragraphs.forEach((paragraph, index) => {
          const card = document.createElement('article'); card.className = 'content-block';
          const heading = document.createElement('h4'); heading.textContent = 'Párrafo ' + (index + 1); card.append(heading);
          const para = createField('Texto del párrafo', 'letter-paragraph-' + index, 'textarea', 600, 'Máximo 600 caracteres.', paragraph, true); card.append(para.label);
          bindContentControl(para.control, (v) => { c.paragraphs[index] = v; });
          const actions = document.createElement('div'); actions.className = 'content-toolbar';
          const remove = document.createElement('button'); remove.className = 'small-action'; remove.type = 'button'; remove.textContent = 'Quitar párrafo'; remove.disabled = c.paragraphs.length <= 1; remove.addEventListener('click', () => { if (c.paragraphs.length > 1) c.paragraphs.splice(index, 1); saveDraft(); renderContentFields(); renderSummary(); });
          actions.append(remove); card.append(actions); paragraphs.append(card);
        });
        const add = document.createElement('button'); add.type = 'button'; add.className = 'small-action'; add.textContent = 'Agregar párrafo'; add.disabled = c.paragraphs.length >= 5; add.addEventListener('click', () => { if (c.paragraphs.length < 5) c.paragraphs.push(''); saveDraft(); renderContentFields(); renderSummary(); const el = $('#letter-paragraph-' + (c.paragraphs.length - 1)); if (el) el.focus(); }); paragraphs.append(add);
      }
      drawParagraphs();
      field = createField('Firma', 'letter-signature', 'text', 120, 'Máximo 120 caracteres.', c.signature); host.append(field.label); bindContentControl(field.control, (v) => { c.signature = v; });
    } else if (state.model === 'historia') {
      const c = state.content.historia;
      const list = document.createElement('div'); list.className = 'content-block-list'; host.append(list);
      function drawMoments() {
        list.replaceChildren();
        c.moments.forEach((moment, index) => {
          const card = document.createElement('article'); card.className = 'content-block'; const heading = document.createElement('h4'); heading.textContent = 'Momento ' + (index + 1); card.append(heading);
          let f = createField('Fecha (texto libre)', 'moment-date-' + index, 'text', 80, 'Ejemplo: 12 de marzo de 2021.', moment.date, true); card.append(f.label); bindContentControl(f.control, (v) => { moment.date = v; });
          f = createField('Título', 'moment-title-' + index, 'text', 120, 'Máximo 120 caracteres.', moment.title, true); card.append(f.label); bindContentControl(f.control, (v) => { moment.title = v; });
          f = createField('Texto', 'moment-text-' + index, 'textarea', 280, 'Máximo 280 caracteres.', moment.text, true); card.append(f.label); bindContentControl(f.control, (v) => { moment.text = v; });
          const actions = document.createElement('div'); actions.className = 'content-toolbar'; const remove = document.createElement('button'); remove.className = 'small-action'; remove.type = 'button'; remove.textContent = 'Quitar momento'; remove.disabled = c.moments.length <= 1; remove.addEventListener('click', () => { if (c.moments.length > 1) { c.moments.splice(index, 1); photos.forEach((photo) => { if (photo.momentIndex >= c.moments.length) photo.momentIndex = Math.max(0, c.moments.length - 1); }); syncPhotoMeta(); } saveDraft(); renderContentFields(); renderSummary(); renderPhotos(); }); actions.append(remove); card.append(actions); list.append(card);
        });
        const add = document.createElement('button'); add.type = 'button'; add.className = 'small-action'; add.textContent = 'Agregar momento'; add.disabled = c.moments.length >= 8; add.addEventListener('click', () => { if (c.moments.length < 8) c.moments.push({ date: '', title: '', text: '' }); saveDraft(); renderContentFields(); renderSummary(); const el = $('#moment-date-' + (c.moments.length - 1)); if (el) el.focus(); }); list.append(add);
      }
      drawMoments();
      let f = createField('Mensaje final', 'history-final', 'textarea', 1000, 'Máximo 1000 caracteres.', c.final); host.append(f.label); bindContentControl(f.control, (v) => { c.final = v; });
      f = createField('Firma', 'history-signature', 'text', 120, 'Máximo 120 caracteres.', c.signature); host.append(f.label); bindContentControl(f.control, (v) => { c.signature = v; });
    } else {
      const c = state.content.album;
      let f = createField('Título del álbum', 'album-title', 'text', 120, 'Máximo 120 caracteres.', c.title, true); host.append(f.label); bindContentControl(f.control, (v) => { c.title = v; });
      f = createField('Subtítulo', 'album-subtitle', 'textarea', 280, 'Máximo 280 caracteres.', c.subtitle, true); host.append(f.label); bindContentControl(f.control, (v) => { c.subtitle = v; });
      f = createField('Mensaje final', 'album-final', 'textarea', 1000, 'Máximo 1000 caracteres.', c.final); host.append(f.label); bindContentControl(f.control, (v) => { c.final = v; });
      f = createField('Firma', 'album-signature', 'text', 120, 'Máximo 120 caracteres.', c.signature); host.append(f.label); bindContentControl(f.control, (v) => { c.signature = v; });
    }
  }

  function revokePhoto(photo) { if (photo && photo.previewUrl) { URL.revokeObjectURL(photo.previewUrl); objectUrls.delete(photo.previewUrl); photo.previewUrl = ''; } }
  function syncPhotoMeta() { state.photoMeta = photos.map((photo, index) => ({ alt: clamp(photo.alt || 'Foto ' + (index + 1), 120), caption: clamp(photo.caption || '', 80), momentIndex: Number.isInteger(photo.momentIndex) ? photo.momentIndex : 0 })); saveDraft(); }
  function changeModel(model) {
    state.model = model; const limit = PRICE_TABLE.models[model]?.limit || 0; let message = '';
    while (photos.length > limit) { const removed = photos.pop(); revokePhoto(removed); message = 'Este modelo admite hasta ' + limit + ' fotos; quitamos las que excedían el límite.'; }
    syncPhotoMeta(); setRadio('order-model', model); renderContentFields(); renderPhotos(); if (message) text($('#photo-error'), message); renderSummary(); saveDraft();
  }
  async function decodeFile(file) {
    if (file.size > MAX_FILE_BYTES) throw new Error('Cada foto debe pesar menos de 15 MB.');
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Usá una foto JPG, PNG o WebP.');
    let source, width, height, close = null;
    if ('createImageBitmap' in window) {
      try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); width = source.width; height = source.height; close = () => source.close(); }
      catch (_) { source = null; }
    }
    if (!source) {
      const url = URL.createObjectURL(file); objectUrls.add(url);
      try { source = await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('No pudimos leer esta foto, probá con otra o con una captura')); img.src = url; }); width = source.naturalWidth; height = source.naturalHeight; }
      catch (error) { URL.revokeObjectURL(url); objectUrls.delete(url); throw error; }
      finally { /* La URL temporal se libera tras pintar. */ }
      close = () => { URL.revokeObjectURL(url); objectUrls.delete(url); };
    }
    if (!width || !height) { if (close) close(); throw new Error('No pudimos leer esta foto, probá con otra o con una captura'); }
    return { source, width, height, close };
  }
  async function compressFile(file) {
    let decoded;
    try { decoded = await decodeFile(file); }
    catch (error) { if (/15 MB|Usá una foto/.test(error.message)) throw error; throw new Error('No pudimos leer esta foto, probá con otra o con una captura'); }
    try {
      const canvas = document.createElement('canvas');
      const initialScale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
      let scale = initialScale; let blob = null;
      for (let pass = 0; pass < 4; pass += 1) {
        canvas.width = Math.max(1, Math.round(decoded.width * scale)); canvas.height = Math.max(1, Math.round(decoded.height * scale));
        const context = canvas.getContext('2d', { alpha: false }); if (!context) throw new Error('No pudimos leer esta foto, probá con otra o con una captura');
        context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
        if (!blob) throw new Error('No pudimos leer esta foto, probá con otra o con una captura');
        if (blob.size <= MAX_BUCKET_BYTES) break;
        scale *= 0.82;
      }
      if (!blob || blob.size > MAX_BUCKET_BYTES) throw new Error('Esta foto sigue pesando más de 5 MB después de optimizarla. Probá con una imagen más chica.');
      return blob;
    } finally { if (decoded.close) decoded.close(); }
  }
  function currentGalleryLimit() { return PRICE_TABLE.models[state.model]?.limit || 0; }
  function formattedBytes(size) { return size < 1024 * 1024 ? (size / 1024).toFixed(0) + ' KB' : (size / (1024 * 1024)).toFixed(2) + ' MB'; }
  function updatePhotoTotals() { const total = photos.reduce((sum, p) => sum + p.blob.size, 0) + Object.values(mazePhotos).reduce((sum, p) => sum + (p ? p.blob.size : 0), 0); text($('#photo-total'), 'Tamaño total: ' + formattedBytes(total)); }
  function renderMazePreview(which) {
    const host = which === 'player' ? $('#maze-player-preview') : $('#maze-giver-preview'); host.replaceChildren(); const photo = mazePhotos[which];
    if (photo) { const img = document.createElement('img'); img.src = photo.previewUrl; img.alt = which === 'player' ? 'Vista previa de la foto de quien va a jugar' : 'Vista previa de la foto de quien regala'; host.append(img, document.createTextNode(' ' + formattedBytes(photo.blob.size))); }
  }
  function renderPhotos() {
    const host = $('#photo-list'); host.replaceChildren();
    const limit = currentGalleryLimit(); text($('#photo-limit-note'), state.model ? 'Podés cargar hasta ' + limit + ' fotos. Se optimizan en este dispositivo antes de subirlas.' : 'Elegí primero un modelo.');
    $('#photo-input').disabled = !state.model || photos.length >= limit || photoProcessing > 0;
    $('#labyrinth-photos').hidden = state.game !== 'laberinto';
    if (!photos.length && state.photoMeta.length) { const reminder = document.createElement('p'); reminder.className = 'field-hint'; reminder.textContent = 'Las fotos no se guardan al recargar. Volvé a elegirlas; tus textos siguen guardados.'; host.append(reminder); }
    photos.forEach((photo, index) => {
      const card = document.createElement('article'); card.className = 'photo-card'; const img = document.createElement('img'); img.src = photo.previewUrl; img.alt = 'Vista previa de la foto ' + (index + 1); card.append(img);
      const info = document.createElement('div'); const title = document.createElement('strong'); title.textContent = 'Foto ' + (index + 1); const meta = document.createElement('p'); meta.className = 'photo-meta'; meta.textContent = formattedBytes(photo.blob.size); info.append(title, meta); card.append(info);
      const alt = createField('Descripción breve para accesibilidad', 'photo-alt-' + index, 'text', 120, 'Máximo 120 caracteres.', photo.alt || 'Foto ' + (index + 1)); alt.label.classList.add('photo-alt-field'); card.append(alt.label); alt.control.addEventListener('input', () => { photo.alt = clamp(alt.control.value, 120); syncPhotoMeta(); renderSummary(); });
      if (state.model === 'album') { const cap = createField('Epígrafe', 'photo-caption-' + index, 'text', 80, 'Máximo 80 caracteres.', photo.caption || ''); card.append(cap.label); cap.control.addEventListener('input', () => { photo.caption = clamp(cap.control.value, 80); syncPhotoMeta(); renderSummary(); }); }
      if (state.model === 'historia') {
        const label = document.createElement('label'); label.className = 'order-field'; label.htmlFor = 'photo-moment-' + index; label.textContent = 'Asociar con momento'; const select = document.createElement('select'); select.id = 'photo-moment-' + index;
        state.content.historia.moments.forEach((moment, i) => { const option = document.createElement('option'); option.value = String(i); option.textContent = 'Momento ' + (i + 1) + (moment.title ? ' · ' + moment.title : ''); select.append(option); });
        select.value = String(Math.min(photo.momentIndex || 0, state.content.historia.moments.length - 1)); select.addEventListener('change', () => { photo.momentIndex = Number(select.value); syncPhotoMeta(); renderSummary(); }); label.append(select); card.append(label);
      }
      const actions = document.createElement('div'); actions.className = 'photo-actions';
      const up = document.createElement('button'); up.type = 'button'; up.className = 'small-action'; up.textContent = 'Subir'; up.disabled = index === 0; up.setAttribute('aria-label', 'Subir foto ' + (index + 1)); up.addEventListener('click', () => { [photos[index - 1], photos[index]] = [photos[index], photos[index - 1]]; syncPhotoMeta(); renderPhotos(); renderSummary(); });
      const down = document.createElement('button'); down.type = 'button'; down.className = 'small-action'; down.textContent = 'Bajar'; down.disabled = index === photos.length - 1; down.setAttribute('aria-label', 'Bajar foto ' + (index + 1)); down.addEventListener('click', () => { [photos[index + 1], photos[index]] = [photos[index], photos[index + 1]]; syncPhotoMeta(); renderPhotos(); renderSummary(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'small-action'; remove.textContent = 'Quitar'; remove.setAttribute('aria-label', 'Quitar foto ' + (index + 1)); remove.addEventListener('click', () => { const [removed] = photos.splice(index, 1); revokePhoto(removed); syncPhotoMeta(); renderPhotos(); renderSummary(); });
      actions.append(up, down, remove); card.append(actions); host.append(card);
    });
    renderMazePreview('player'); renderMazePreview('giver'); updatePhotoTotals();
  }
  async function addSelectedPhotos(fileList) {
    const files = Array.from(fileList || []); if (!files.length) return;
    photoProcessing += 1; text($('#photo-error'), 'Optimizando las fotos…'); updateAvailability();
    const remaining = Math.max(0, currentGalleryLimit() - photos.length); let issue = '';
    try {
      for (const file of files.slice(0, remaining)) {
        try { const blob = await compressFile(file); const url = URL.createObjectURL(blob); objectUrls.add(url); const meta = state.photoMeta[photos.length] || {}; photos.push({ blob, previewUrl: url, alt: meta.alt || 'Foto ' + (photos.length + 1), caption: meta.caption || '', momentIndex: Math.min(meta.momentIndex ?? photos.length, state.content.historia.moments.length - 1) }); }
        catch (error) { issue = error.message || 'No pudimos leer esta foto, probá con otra o con una captura'; }
      }
      if (files.length > remaining) issue = 'Este modelo admite hasta ' + currentGalleryLimit() + ' fotos.';
    } finally {
      photoProcessing = Math.max(0, photoProcessing - 1); $('#photo-input').value = '';
      text($('#photo-error'), issue); syncPhotoMeta(); renderPhotos(); renderSummary(); updateAvailability();
    }
  }
  async function setMazePhoto(which, file) {
    if (!file) return; photoProcessing += 1; text($('#photo-error'), 'Optimizando la foto…'); updateAvailability(); let issue = '';
    try { const blob = await compressFile(file); if (mazePhotos[which]) revokePhoto(mazePhotos[which]); const url = URL.createObjectURL(blob); objectUrls.add(url); mazePhotos[which] = { blob, previewUrl: url }; renderMazePreview(which); updatePhotoTotals(); }
    catch (error) { issue = error.message || 'No pudimos leer esta foto, probá con otra o con una captura'; }
    finally { photoProcessing = Math.max(0, photoProcessing - 1); text($('#photo-error'), issue); updateAvailability(); renderSummary(); }
  }

  function musicDescription() {
    if (state.musicMode === 'selection') return state.musicTrack ? 'seleccion: ' + state.musicTrack : 'seleccion: pendiente';
    if (state.musicMode === 'link') return state.musicLink ? 'link: ' + state.musicLink : 'link pendiente';
    return 'ayuda para elegir';
  }
  function validMusicUrl(value) {
    try { const url = new URL(value); if (url.protocol !== 'https:') return false; const host = url.hostname.toLowerCase(); return ['open.spotify.com', 'spotify.link', 'youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host); } catch (_) { return false; }
  }
  function normalizeWhatsapp(value) { return String(value || '').replace(/\D/g, ''); }
  function validWhatsappInput(value) { const trimmed = String(value || '').trim(); if (!trimmed) return true; return /^\+?[0-9\s().-]{8,30}$/.test(trimmed) && normalizeWhatsapp(trimmed).length >= 8 && normalizeWhatsapp(trimmed).length <= 20; }
  function validDate(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const [y, m, d] = value.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; }

  function renderSummary() {
    const summary = $('#order-summary-list'); const breakdown = $('#order-breakdown'); if (!summary || !breakdown) return;
    summary.replaceChildren(); breakdown.replaceChildren();
    if (state.model) addListItem(summary, 'Modelo', PRICE_TABLE.models[state.model].name);
    if (state.duration) addListItem(summary, 'Duración', PRICE_TABLE.durations[state.duration]);
    addListItem(summary, 'Juego', state.game ? GAMES[state.game] : 'No');
    const apertura = window.ErosApertura.elegirApertura({ extras: { juego: state.game } });
    const aperturaTexto = apertura === 'juego' ? 'El juego reemplaza al sobre como apertura' : 'Sobre animado incluido';
    addListItem(summary, 'Apertura', aperturaTexto);
    text($('#order-opening-note'), 'Sobre animado incluido. Si elegís juego interactivo, el juego reemplaza al sobre como apertura.');
    addListItem(summary, 'Tema', THEMES[state.theme] || 'Eros');
    addListItem(summary, 'Contador', state.counter ? 'Sí, desde ' + dateDDMMYYYY(state.counterDate) : 'No');
    if (state.recipient) addListItem(summary, 'Para', state.recipient);
    if (state.sender) addListItem(summary, 'De parte de', state.sender);
    if (state.activationDate) addListItem(summary, 'Fecha solicitada', dateDDMMYYYY(state.activationDate));
    if (state.model === 'carta') { const c = state.content.carta; if (c.title) addListItem(summary, 'Título', c.title); c.paragraphs.forEach((paragraph, i) => { if (paragraph.trim()) addListItem(summary, 'Párrafo ' + (i + 1), paragraph); }); if (c.signature) addListItem(summary, 'Firma', c.signature); }
    if (state.model === 'historia') { const c = state.content.historia; c.moments.forEach((m, i) => { if (m.title.trim() || m.text.trim()) addListItem(summary, 'Momento ' + (i + 1), [m.date, m.title, m.text].filter(Boolean).join(' · ')); }); if (c.final) addListItem(summary, 'Mensaje final', c.final); if (c.signature) addListItem(summary, 'Firma', c.signature); }
    if (state.model === 'album') { const c = state.content.album; if (c.title) addListItem(summary, 'Título del álbum', c.title); if (c.subtitle) addListItem(summary, 'Subtítulo', c.subtitle); if (c.final) addListItem(summary, 'Mensaje final', c.final); if (c.signature) addListItem(summary, 'Firma', c.signature); }
    addListItem(summary, 'Fotos cargadas', photos.length + ' para la página' + (state.game === 'laberinto' ? ' · ' + Object.values(mazePhotos).filter(Boolean).length + ' para el juego' : ''));
    photos.forEach((photo, index) => { let detail = photo.alt || 'Foto ' + (index + 1); if (state.model === 'album' && photo.caption) detail += ' · ' + photo.caption; if (state.model === 'historia') detail += ' · momento ' + ((photo.momentIndex || 0) + 1); addListItem(summary, 'Foto ' + (index + 1), detail); });
    addListItem(summary, 'Música', musicDescription());
    if (state.whatsapp) addListItem(summary, 'WhatsApp', normalizeWhatsapp(state.whatsapp));
    const base = state.model && state.duration ? PRICE_TABLE.models[state.model].prices[state.duration] : 0;
    if (state.model && state.duration) addBreakdownItem(breakdown, PRICE_TABLE.models[state.model].name + ' · ' + PRICE_TABLE.durations[state.duration], base);
    if (state.game) addBreakdownItem(breakdown, 'Juego interactivo', PRICE_TABLE.extras.game);
    if (state.counter) addBreakdownItem(breakdown, 'Contador de tiempo juntos', PRICE_TABLE.extras.counter);
    addBreakdownItem(breakdown, 'Tema de color incluido', 0);
    if (apertura === 'sobre') addBreakdownItem(breakdown, 'Sobre animado incluido', 0);
    text($('#order-final-total'), formatARS(totalAmount()));
    const amount = formatARS(totalAmount()); text($('#order-sidebar-total'), amount); text($('#order-mobile-total'), amount);
    text($('#order-sidebar-detail'), state.model && state.duration ? PRICE_TABLE.models[state.model].name + ' · ' + PRICE_TABLE.durations[state.duration] : 'Elegí un modelo y una duración');
    updateDependentFields();
    notifyPreview();
  }

  function validateStep(step) {
    text($('#order-error'), '');
    if (step === 1 && !state.model) return fail('Elegí un modelo para continuar.', $('input[name="order-model"]'));
    if (step === 2 && !state.duration) return fail('Elegí la duración de la página.', $('input[name="order-duration"]'));
    if (step === 5 && state.counter && !validDate(state.counterDate)) return fail('Elegí una fecha válida para el contador.', $('#counter-date'));
    if (step === 6) {
      if (!state.recipient.trim()) return fail('Escribí el nombre de quien recibe el regalo.', $('#recipient-name'));
      if (state.activationDate && !validDate(state.activationDate)) return fail('Revisá la fecha en que querés activar la página.', $('#activation-date'));
    }
    if (step === 8 && photoProcessing > 0) return fail('Esperá a que termine la optimización de las fotos.', null);
    if (step === 7) {
      if (state.model === 'carta') { const c = state.content.carta; if (!c.title.trim()) return fail('Agregá un título para la carta.', $('#letter-title')); if (!c.signature.trim()) return fail('Agregá la firma de la carta.', $('#letter-signature')); const missing = c.paragraphs.findIndex((p) => !p.trim()); if (missing >= 0) return fail('Completá el párrafo ' + (missing + 1) + ' o quitá ese espacio.', $('#letter-paragraph-' + missing)); }
      if (state.model === 'historia') { const i = state.content.historia.moments.findIndex((m) => !m.date.trim() || !m.title.trim() || !m.text.trim()); if (i >= 0) return fail('Completá la fecha, el título y el texto del momento ' + (i + 1) + '.', $('#moment-date-' + i)); if (!state.content.historia.final.trim()) return fail('Agregá el mensaje final de la historia.', $('#history-final')); if (!state.content.historia.signature.trim()) return fail('Agregá la firma de la historia.', $('#history-signature')); }
      if (state.model === 'album') { const c = state.content.album; if (!c.title.trim()) return fail('Agregá un título para el álbum.', $('#album-title')); if (!c.subtitle.trim()) return fail('Agregá un subtítulo para el álbum.', $('#album-subtitle')); if (!c.final.trim()) return fail('Agregá el mensaje final del álbum.', $('#album-final')); if (!c.signature.trim()) return fail('Agregá la firma del álbum.', $('#album-signature')); }
    }
    if (step === 9) {
      if (!state.musicMode) return fail('Elegí una opción de música.', $('input[name="order-music"]'));
      if (state.musicMode === 'link' && state.musicLink && !validMusicUrl(state.musicLink)) return fail('Usá un link https de open.spotify.com, spotify.link, youtube.com o youtu.be.', $('#music-link-input'));
    }
    if (step === 10) {
      if (!$('#privacy-consent').checked) return fail('Confirmá que tenés permiso para usar las fotos y aceptás la política de privacidad.', $('#privacy-consent'));
      const phone = $('#client-whatsapp').value.trim(); if (phone && (!validWhatsappInput(phone))) return fail('Revisá tu WhatsApp: ingresá entre 8 y 20 números con código de país.', $('#client-whatsapp'));
    }
    return true;
  }
  function fail(message, target) { text($('#order-error'), message); if (target && target.focus) target.focus(); return false; }
  function updateAvailability() {
    const next = $('#order-next'); if (next) next.disabled = submitting || photoProcessing > 0;
    const send = $('#send-order'); if (send && !submitting) send.disabled = photoProcessing > 0;
  }
  function updateDependentFields() {
    $('#counter-date-wrap').hidden = !state.counter;
    $('#music-link-wrap').hidden = state.musicMode !== 'link';
    $('#music-selection-wrap').hidden = state.musicMode !== 'selection';
    $('#labyrinth-photos').hidden = state.game !== 'laberinto';
    $$('[data-duration-price]').forEach((el) => {
      text(el, state.model ? formatARS(PRICE_TABLE.models[state.model].prices[el.dataset.durationPrice]) : 'Elegí un modelo primero');
    });
  }
  function showStep(step, focus = true) {
    state.step = Math.max(1, Math.min(10, step)); saveDraft();
    const index = stepIndex(), group = STEPS[index], number = index + 1;
    $$('.order-step').forEach(panel => { panel.hidden = !group.includes(Number(panel.dataset.orderStep)); });
    const percentage = Math.round(number / STEPS.length * 100);
    const label = 'Paso ' + number + ' de ' + STEPS.length;
    text($('#order-step-label'), label); text($('#order-progress-percent'), percentage + '%');
    $('#order-progress').setAttribute('aria-valuemax', String(STEPS.length));
    $('#order-progress').setAttribute('aria-valuenow', String(number));
    $('#order-progress').setAttribute('aria-valuetext', label);
    $('#order-progress-fill').style.width = percentage + '%';
    $('#order-back').hidden = index === 0; $('#order-next').hidden = index === STEPS.length - 1;
    $('#order-step-viewport').scrollTop = 0;
    text($('#order-live'), label + '.'); renderSummary();
    if (focus) $('[data-order-step="' + state.step + '"] h3')?.focus({ preventScroll:true });
  }
  function scrollToOrder() {
    const builder = $('#order-builder');
    if (!builder) return;
    const rect = builder.getBoundingClientRect();
    const targetTop = 90;
    // En escritorio el asistente ya queda sticky; solo lo acercamos si quedó fuera de pantalla.
    // En móvil, alineamos el paso actual bajo el encabezado. El desplazamiento inmediato evita
    // carreras entre varios pasos seguidos y el scroll-restoration del navegador al recargar.
    if (matchMedia('(min-width:1024px)').matches) {
      if (rect.top < targetTop - 8 || rect.top > targetTop + 18) {
        window.scrollTo({ top:Math.max(0, scrollY + rect.top - targetTop), behavior:'instant' });
      }
      return;
    }
    if (rect.top < targetTop - 8 || rect.top > targetTop + 18) {
      window.scrollTo({ top:Math.max(0, scrollY + rect.top - targetTop), behavior:'instant' });
    }
  }
  function firstIncompleteStep() {
    if (!state.model) return 1; if (!state.duration) return 2; if (state.counter && !validDate(state.counterDate)) return 5; if (!state.recipient.trim()) return 6;
    return 0;
  }

  function buildTemplateData(resolvePhoto = (photo, filename) => filename) {
    const base = {
      version: 2, para: state.recipient.trim(), de: state.sender.trim(), tema: state.theme,
      extras: { juego: state.game ? GAME_DATA[state.game] : '', contador: { desde: state.counter ? state.counterDate : '', etiqueta: 'Juntos desde hace' } },
      inicio: { titulo: 'Un regalo para ' + state.recipient.trim(), boton: 'Tocá para empezar' }, firma: '', musica: '', colorPrincipal: ''
    };
    base.extras.sobre = window.ErosApertura.elegirApertura(base) === 'sobre';
    if (state.game === 'laberinto') {
      base.extras.laberinto = {
        fotoQuienJuega: mazePhotos.player ? resolvePhoto(mazePhotos.player, 'imagenes/juego-jugador.jpg') : '',
        fotoQuienRegala: mazePhotos.giver ? resolvePhoto(mazePhotos.giver, 'imagenes/juego-regala.jpg') : ''
      };
    }
    const selectedTrack = $('#music-track').value;
    if (state.musicMode === 'selection' && selectedTrack) base.musica = selectedTrack;
    if (state.model === 'carta') {
      const c = state.content.carta; const paragraphs = c.paragraphs.map((p) => p.trim()); const blocks = [];
      const photosAfter = Array.from({ length: paragraphs.length }, () => []);
      photos.forEach((photo, i) => { const at = Math.min(paragraphs.length - 1, Math.floor(((i + 1) * paragraphs.length) / (photos.length + 1))); photosAfter[at].push(i); });
      paragraphs.forEach((paragraph, i) => { blocks.push({ texto: paragraph }); photosAfter[i].forEach((photoIndex) => blocks.push({ foto: resolvePhoto(photos[photoIndex], 'imagenes/foto' + (photoIndex + 1) + '.jpg'), alt: photos[photoIndex].alt || 'Foto ' + (photoIndex + 1) })); });
      base.carta = { titulo: c.title.trim(), bloques: blocks }; base.firma = c.signature.trim();
    } else if (state.model === 'historia') {
      base.principal = { titulo: 'Nuestra historia', subtitulo: 'Un recorrido por momentos importantes.' };
      base.momentos = state.content.historia.moments.map((m, i) => {
        const result = { fecha: m.date.trim(), titulo: m.title.trim(), texto: m.text.trim() };
        const photoIndex = photos.findIndex((p) => p.momentIndex === i);
        if (photoIndex >= 0) { result.foto = resolvePhoto(photos[photoIndex], 'imagenes/foto' + (photoIndex + 1) + '.jpg'); result.alt = photos[photoIndex].alt || 'Foto ' + (photoIndex + 1); }
        return result;
      });
      base.cierre = { mensaje: state.content.historia.final.trim() }; base.firma = state.content.historia.signature.trim();
    } else {
      const c = state.content.album;
      base.principal = { titulo: c.title.trim(), subtitulo: c.subtitle.trim() };
      base.fotos = photos.map((p, i) => ({ src: resolvePhoto(p, 'imagenes/foto' + (i + 1) + '.jpg'), alt: p.alt || 'Foto ' + (i + 1), epigrafe: p.caption || '' }));
      base.automatico = 0; base.cierre = { mensaje: c.final.trim() }; base.firma = c.signature.trim();
    }
    return base;
  }

  function buildRow(id, code, data) {
    const extras = { juego: data.extras.juego, sobre: data.extras.sobre, contador: data.extras.contador };
    if (data.extras.laberinto) extras.laberinto = data.extras.laberinto;
    const row = {
      id, codigo: code, modelo: PRICE_TABLE.models[state.model].slug,
      duracion: PRICE_TABLE.durations[state.duration], extras, tema: state.theme,
      para_quien: state.recipient.trim(), de_parte: state.sender.trim() || null,
      musica: musicDescription(), activar_el: state.activationDate || null,
      whatsapp_cliente: normalizeWhatsapp(state.whatsapp) || null, datos: data,
      total: totalAmount(), fotos_cantidad: photos.length
    };
    if (jsonBytes(extras) > 5000) throw new Error('Los extras superan el tamaño permitido. Revisá las fotos opcionales del juego.');
    if (jsonBytes(data) > 50000) throw new Error('El contenido supera el tamaño permitido por la base de datos.');
    return row;
  }
  function generateUUID() {
    if (window.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    if (window.crypto && typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''); return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
    }
    throw new Error('Este navegador no tiene un generador seguro. Probá con una versión actualizada.');
  }
  function generateCode() { const random = new Uint32Array(6); crypto.getRandomValues(random); return Array.from(random, (v) => CODE_ALPHABET[v % CODE_ALPHABET.length]).join(''); }
  function makeFallbackMessage() {
    const model = PRICE_TABLE.models[state.model]; const lines = ['¡Hola! Necesito ayuda para enviar mi pedido de Eros Web. El armador mostró un error:', '- Modelo: ' + (model ? model.name : 'pendiente'), '- Duración: ' + (PRICE_TABLE.durations[state.duration] || 'pendiente'), '- Juego: ' + (state.game ? GAMES[state.game] : 'No'), '- Tema: ' + (THEMES[state.theme] || 'Eros'), '- Contador: ' + (state.counter ? 'sí, desde ' + dateDDMMYYYY(state.counterDate) : 'no'), '- Para: ' + (state.recipient || 'pendiente')];
    if (state.sender) lines.push('- De parte de: ' + state.sender);
    lines.push('- Música: ' + musicDescription(), '- Total: ' + formatARS(totalAmount()), '¿Me ayudás a completar el envío desde la página?'); return lines.join('\n');
  }
  function showFallback(message) {
    text($('#order-error'), message || 'No pudimos enviar tu pedido ahora. Lo que cargaste sigue en esta pestaña; reintentá o pedí ayuda por WhatsApp.');
    const link = $('#fallback-whatsapp'); link.hidden = false; link.onclick = () => window.open('https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(makeFallbackMessage()), '_blank', 'noopener,noreferrer');
    $('#send-order').disabled = false; submitting = false; $('#order-progress-status').hidden = true; $('#order-next').disabled = false;
  }
  function setProgress(percent, message) { const bar = $('#upload-progress-fill'); bar.style.width = percent + '%'; bar.parentElement.setAttribute('aria-valuenow', String(percent)); text($('#upload-progress-text'), message); text($('#order-live'), message); }
  function uploadableFiles() {
    const entries = photos.map((p, i) => ({ name: 'foto' + (i + 1) + '.jpg', blob: p.blob }));
    if (state.game === 'laberinto') { if (mazePhotos.player) entries.push({ name: 'juego-jugador.jpg', blob: mazePhotos.player.blob }); if (mazePhotos.giver) entries.push({ name: 'juego-regala.jpg', blob: mazePhotos.giver.blob }); }
    return entries;
  }
  async function uploadWithRetry(client, id, item) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { error: uploadError } = await client.storage.from('fotos').upload(id + '/' + item.name, item.blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
      if (!uploadError) return;
      lastError = uploadError;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 450));
    }
    throw lastError || new Error('No se pudo subir una foto.');
  }
  function isDuplicateCode(error) { return error && (error.code === '23505' || /duplicate key|unique constraint|pedidos_codigo/i.test(error.message || '')); }
  async function submitOrder() {
    if (submitting) return;
    text($('#order-error'), ''); $('#fallback-whatsapp').hidden = true;
    for (let step = 1; step <= 10; step += 1) {
      if (!validateStep(step)) { state.step = step; showStep(step); scrollToOrder(); return; }
    }
    if ($('#website-field').value.trim()) { text($('#order-live'), ''); return; }
    if (!window.EROS_CONFIG || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(window.EROS_CONFIG.supabaseUrl || '') || !window.EROS_CONFIG.supabaseKey || !window.supabase?.createClient) {
      showFallback('No pudimos enviar tu pedido ahora porque la conexión no está disponible. Lo que cargaste sigue en esta pestaña; reintentá o pedí ayuda por WhatsApp.'); return;
    }
    submitting = true; $('#send-order').disabled = true; $('#order-next').disabled = true; $('#order-progress-status').hidden = false; $('#order-progress-status').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' }); setProgress(0, 'Preparando el pedido…');
    try {
      // UUID generado una vez para este intento; todos los objetos quedan dentro de su carpeta.
      const id = generateUUID(); const client = window.supabase.createClient(window.EROS_CONFIG.supabaseUrl, window.EROS_CONFIG.supabaseKey);
      const files = uploadableFiles(); const data = buildTemplateData();
      for (let i = 0; i < files.length; i += 1) {
        const item = files[i]; setProgress(Math.round((i / Math.max(1, files.length + 1)) * 90), 'Subiendo foto ' + (i + 1) + ' de ' + files.length + '…'); await uploadWithRetry(client, id, item);
      }
      const rowBase = buildRow(id, generateCode(), data); let insertError = null; let insertedCode = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const code = attempt === 0 ? rowBase.codigo : generateCode(); rowBase.codigo = code;
        setProgress(95, 'Guardando el pedido…');
        const { error: errorInsert } = await client.from('pedidos').insert(rowBase);
        if (!errorInsert) { insertedCode = code; insertError = null; break; }
        insertError = errorInsert; if (!isDuplicateCode(errorInsert)) break;
      }
      if (insertError) throw insertError;
      setProgress(100, 'Pedido recibido.');
      const success = { code: insertedCode, total: totalAmount(), model: PRICE_TABLE.models[state.model].name, savedAt: Date.now() };
      try { localStorage.setItem(SUCCESS_KEY, JSON.stringify(success)); } catch (_) { /* Se muestra el éxito aunque no se pueda recordar tras recargar. */ }
      showSuccess(success);
    } catch (error) {
      console.warn('No se pudo guardar el pedido:', error);
      showFallback('No pudimos enviar tu pedido ahora. Lo que cargaste sigue en esta pestaña; reintentá o pedí ayuda por WhatsApp.');
    }
  }

  function showSuccess(success) {
    submitting = false; $('#order-progress-status').hidden = true; $('#order-error').textContent = ''; $('#fallback-whatsapp').hidden = true;
    $$('.order-step').forEach((panel) => { panel.hidden = true; }); $('.order-progress-head').hidden = true; $('#order-progress').hidden = true; $('.order-nav').hidden = true;
    const host = $('#order-success'); host.replaceChildren(); host.hidden = false;
    const heading = document.createElement('h3'); heading.textContent = '¡Recibimos tu pedido!'; const intro = document.createElement('p'); intro.textContent = 'Tu pedido quedó guardado. Este es tu código:';
    const code = document.createElement('strong'); code.className = 'success-code'; code.textContent = success.code; code.setAttribute('aria-label', 'Código de pedido ' + success.code);
    const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'button button-light'; copy.textContent = 'Copiar código'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(success.code); copy.textContent = 'Código copiado'; } catch (_) { const area = document.createElement('textarea'); area.value = success.code; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); try { document.execCommand('copy'); copy.textContent = 'Código copiado'; } catch (_) { copy.textContent = 'Copiá el código de arriba'; } area.remove(); } });
    const total = document.createElement('p'); total.textContent = 'Total: ' + formatARS(success.total);
    const instructions = document.createElement('p'); instructions.textContent = 'Transferí ' + formatARS(success.total) + ' al alias newel.mp y avisá por WhatsApp con tu código y el comprobante. Con el pago confirmado, recibís por WhatsApp el link y el QR en 2 a 3 días.';
    const pay = document.createElement('a'); pay.className = 'button button-primary'; pay.target = '_blank'; pay.rel = 'noopener noreferrer'; pay.textContent = 'Avisar mi pago por WhatsApp'; pay.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent('¡Hola! Transferí ' + formatARS(success.total) + ' por mi pedido #' + success.code + ' de Eros Web. Te comparto el comprobante para confirmar el pago.');
    const reset = document.createElement('button'); reset.type = 'button'; reset.className = 'button button-light'; reset.textContent = 'Armar otro pedido'; reset.addEventListener('click', resetOrder);
    host.append(heading, intro, code, copy, total, instructions, pay, reset); text($('#order-live'), 'Pedido recibido. Código ' + success.code + '. Total ' + formatARS(success.total) + '.');
    text($('#order-sidebar-total'), formatARS(success.total)); text($('#order-mobile-total'), formatARS(success.total));
  }

  function resetOrder() {
    clearDraft(); try { localStorage.removeItem(SUCCESS_KEY); } catch (_) { /* Opcional. */ }
    $$('#pedido input[type=radio]').forEach((radio) => { radio.checked = false; }); $('#privacy-consent').checked = false;
    photos.forEach(revokePhoto); Object.values(mazePhotos).forEach(revokePhoto); photos = []; mazePhotos = { player: null, giver: null }; state = freshState();
    $('#order-success').hidden = true; $('.order-progress-head').hidden = false; $('#order-progress').hidden = false; $('.order-nav').hidden = false; $('#fallback-whatsapp').hidden = true; $('#privacy-consent').checked = false; $('#photo-error').textContent = ''; $('#order-error').textContent = ''; $('#music-track').value = ''; $('#photo-input').value = ''; $('#maze-player-input').value = ''; $('#maze-giver-input').value = '';
    hydrateInputs(); renderContentFields(); renderPhotos(); showStep(1); scrollToOrder();
  }

  function init() {
    updatePrices(); const restored = readDraft(); if (restored) state = restored; hydrateInputs(); renderContentFields(); renderPhotos();
    const success = (() => { try { const value = JSON.parse(localStorage.getItem(SUCCESS_KEY) || 'null'); return value && /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(value.code) && Number.isInteger(value.total) ? value : null; } catch (_) { return null; } })();
    renderSummary();
    if (success) showSuccess(success); else showStep(state.step, false);

    $$('input[name="order-model"]').forEach((input) => input.addEventListener('change', () => { changeModel(input.value); showStep(2, false); }));
    $$('input[name="order-duration"]').forEach((input) => input.addEventListener('change', () => { state.duration = input.value; saveDraft(); renderSummary(); }));
    $$('input[name="order-game"]').forEach((input) => input.addEventListener('change', () => { state.game = input.value; renderPhotos(); saveDraft(); renderSummary(); }));
    $$('input[name="order-theme"]').forEach((input) => input.addEventListener('change', () => { state.theme = input.value; saveDraft(); renderSummary(); }));
    $$('input[name="order-counter"]').forEach((input) => input.addEventListener('change', () => { state.counter = input.value === 'yes'; if (!state.counter) state.counterDate = ''; $('#counter-date').value = state.counterDate; saveDraft(); renderSummary(); }));
    $$('input[name="order-music"]').forEach((input) => input.addEventListener('change', () => { state.musicMode = input.value; showStep(9, false); saveDraft(); renderSummary(); }));
    $('#counter-date').addEventListener('change', (e) => { state.counterDate = e.target.value; saveDraft(); renderSummary(); });
    $('#recipient-name').addEventListener('input', (e) => { state.recipient = clamp(e.target.value, 120); saveDraft(); renderSummary(); });
    $('#sender-name').addEventListener('input', (e) => { state.sender = clamp(e.target.value, 120); saveDraft(); renderSummary(); });
    $('#activation-date').addEventListener('change', (e) => { state.activationDate = e.target.value; saveDraft(); renderSummary(); });
    $('#music-track').addEventListener('change', (e) => { state.musicTrack = clamp(e.target.value, 200); saveDraft(); renderSummary(); });
    $('#music-link-input').addEventListener('input', (e) => { state.musicLink = clamp(e.target.value, 494); saveDraft(); renderSummary(); });
    $('#client-whatsapp').addEventListener('input', (e) => { state.whatsapp = clamp(e.target.value, 30); saveDraft(); renderSummary(); });
    $('#photo-input').addEventListener('change', (e) => addSelectedPhotos(e.target.files));
    $('#maze-player-input').addEventListener('change', (e) => setMazePhoto('player', e.target.files && e.target.files[0]));
    $('#maze-giver-input').addEventListener('change', (e) => setMazePhoto('giver', e.target.files && e.target.files[0]));
    $('#order-next').addEventListener('click', () => { const index = stepIndex(); if (STEPS[index].every(validateStep) && STEPS[index + 1]) { showStep(STEPS[index + 1][0]); scrollToOrder(); } });
    $('#order-back').addEventListener('click', () => { const group = STEPS[stepIndex() - 1]; if (group) { showStep(group[0]); scrollToOrder(); } });
    $('#order-mobile-summary').addEventListener('click', () => { showStep(10); scrollToOrder(); });
    $('#send-order').addEventListener('click', submitOrder); $('#order-reset').addEventListener('click', resetOrder);
    $$('[data-order-model]').forEach((button) => button.addEventListener('click', () => { changeModel(button.dataset.orderModel); showStep(2); scrollToOrder(); }));
    $$('[data-order-game]').forEach((button) => button.addEventListener('click', () => { if (!state.game) { state.game = 'pintar'; setRadio('order-game', state.game); } renderPhotos(); saveDraft(); showStep(3); scrollToOrder(); }));
    $$('[data-order-counter]').forEach((button) => button.addEventListener('click', () => { state.counter = true; setRadio('order-counter', 'yes'); saveDraft(); renderSummary(); showStep(5); scrollToOrder(); }));
    $$('[data-order-theme]').forEach((button) => button.addEventListener('click', () => { showStep(4); scrollToOrder(); }));
    $$('.whatsapp-link').forEach((link) => { const message = link.dataset.message || '¡Hola! Tengo una consulta sobre cómo armar y enviar mi pedido en Eros Web.'; link.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message); });
    const year = $('#current-year'); if (year) year.textContent = String(new Date().getFullYear());
    window.addEventListener('beforeunload', () => { objectUrls.forEach((url) => URL.revokeObjectURL(url)); });
  }
  // El pedido final y la vista previa usan el mismo conversor; solo cambia la ruta de las fotos.
  window.ErosArmador = Object.freeze({
    vistaPrevia(resolvePhoto) {
      const datos = state.model ? buildTemplateData(resolvePhoto) : null;
      return {
        modelo: PRICE_TABLE.models[state.model]?.slug || '', datos,
        apertura: window.ErosApertura.elegirApertura(datos),
        paso: state.step, etapa: stepIndex() + 1, recibe:state.recipient.trim(), de:state.sender.trim(),
        musica: { modo:state.musicMode, descripcion:musicDescription(), enlace:validMusicUrl(state.musicLink) ? state.musicLink : '', archivo:datos?.musica || '' },
        juego: state.game, contador: state.counter, desde: state.counterDate
      };
    }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true }); else init();
})();
