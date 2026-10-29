/* MP3 del cliente: solo memoria local hasta enviar el pedido. */
(() => {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024;
  function validarArchivo(file) {
    if (!file || !Number.isInteger(file.size) || file.size <= 0) throw new Error('El archivo está vacío. Elegí un MP3.');
    if (file.size > MAX_BYTES) throw new Error('El MP3 supera los 10 MB. Elegí uno más liviano.');
    const type = String(file.type || '').toLowerCase();
    if (!['audio/mpeg','audio/mp3',''].includes(type) || (!type && !/\.mp3$/i.test(file.name || ''))) throw new Error('Elegí un archivo de audio MP3.');
    return { name:String(file.name || 'cancion.mp3').slice(0,120), size:file.size };
  }
  async function preparar(file, entorno = {}) {
    const meta = validarArchivo(file);
    const crearURL = entorno.crearURL || (value => URL.createObjectURL(value));
    const revocarURL = entorno.revocarURL || (value => URL.revokeObjectURL(value));
    const crearAudio = entorno.crearAudio || (() => new Audio());
    const previewUrl = crearURL(file);
    const audio = crearAudio(); audio.preload = 'metadata';
    try {
      const duration = await new Promise((resolve,reject) => {
        const timer = setTimeout(() => reject(new Error('No pudimos leer este MP3. Probá con otro archivo.')),10000);
        audio.onloadedmetadata = () => {
          clearTimeout(timer);
          if (!Number.isFinite(audio.duration) || audio.duration <= 0) reject(new Error('No pudimos leer este MP3. Probá con otro archivo.'));
          else if (audio.duration > 600) reject(new Error('La canción supera los 10 minutos. Elegí un MP3 más corto.'));
          else resolve(audio.duration);
        };
        audio.onerror = () => { clearTimeout(timer); reject(new Error('No pudimos leer este MP3. Probá con otro archivo.')); };
        audio.src = previewUrl;
      });
      return { file,...meta,duration,previewUrl };
    } catch (error) { revocarURL(previewUrl); throw error; }
    finally { audio.onloadedmetadata = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
  }
  function montar(onChange, teniaAudio = false) {
    const input = document.getElementById('audio-upload-input');
    const selected = document.getElementById('audio-selected');
    const consent = document.getElementById('audio-consent');
    const consentRow = document.getElementById('audio-consent-row');
    const status = document.getElementById('audio-upload-status');
    const remove = document.getElementById('audio-remove');
    const name = document.getElementById('audio-upload-name');
    const size = document.getElementById('audio-upload-size');
    let audio = null, loading = false, version = 0, locked = false;
    const notify = () => { if (typeof onChange === 'function') onChange(); };
    function render() {
      selected.hidden = !audio; consentRow.hidden = !audio;
      input.disabled = loading || locked; remove.disabled = loading || locked; consent.disabled = loading || locked;
      consent.required = Boolean(audio);
      name.textContent = audio?.name || '';
      size.textContent = audio ? new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(audio.size / (audio.size < 1048576 ? 1024 : 1048576)) + (audio.size < 1048576 ? ' KB' : ' MB') : '';
    }
    function clear(avisar = true) {
      version++;
      if (audio) URL.revokeObjectURL(audio.previewUrl);
      audio = null; loading = false; consent.checked = false; input.value = ''; status.textContent = '';
      render(); if (avisar) notify();
    }
    input.addEventListener('change', async () => {
      const file = input.files?.[0]; if (!file || locked) return;
      clear(false); loading = true; const token = version;
      status.textContent = 'Revisando el MP3…'; render(); notify();
      try {
        const result = await preparar(file);
        if (token !== version) { URL.revokeObjectURL(result.previewUrl); return; }
        audio = result; status.textContent = 'MP3 listo para tu regalo.';
      } catch (error) { if (token === version) status.textContent = error.message || 'No pudimos leer este MP3.'; }
      finally { if (token === version) { loading = false; render(); notify(); } }
    });
    consent.addEventListener('change',notify);
    remove.addEventListener('click',() => clear());
    if (teniaAudio) status.textContent = 'El borrador recuperó tus textos. Volvé a subir el MP3 si querés conservar la música.';
    render();
    return Object.freeze({
      valor:() => audio ? {...audio,consentimiento:consent.checked === true} : null,
      procesando:() => loading,
      bloquear(value) { locked = Boolean(value); render(); },
      quitar:clear,
      destruir() { clear(false); }
    });
  }
  const api = Object.freeze({MAX_BYTES,validarArchivo,preparar,montar});
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ErosAudioCarga = api;
})();
