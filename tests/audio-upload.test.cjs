const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validarArchivo, preparar, MAX_BYTES } = require('../armador/audio.js');
const file = (extra = {}) => ({ name:'mi-cancion.mp3',type:'audio/mpeg',size:5120,...extra });

test('audio: acepta MP3 y audio/mpeg dentro de 10 MB', () => {
  for (const type of ['audio/mpeg','audio/mp3','']) assert.equal(validarArchivo(file({type})).size,5120);
  assert.equal(validarArchivo(file({size:MAX_BYTES})).size,MAX_BYTES);
});
test('audio: rechaza otros tipos, archivos vacíos y mayores a 10 MB', () => {
  for (const data of [file({type:'audio/wav'}),file({name:'imagen.jpg',type:''}),file({size:0}),file({size:MAX_BYTES+1})]) {
    assert.throws(() => validarArchivo(data),/MP3|10 MB|vacío/);
  }
});
const entorno = (duration, falla = false) => {
  const revoked = [];
  return { revoked, crearURL:()=>'blob:audio-ficticio',revocarURL:url=>revoked.push(url),
    crearAudio:()=>({ duration, pause(){},removeAttribute(){},load(){},set src(value){queueMicrotask(()=>falla?this.onerror():this.onloadedmetadata());} }) };
};
test('audio: rechaza más de diez minutos y revoca su URL', async () => {
  const env = entorno(600.01);
  await assert.rejects(preparar(file(),env),/10 minutos/);
  assert.deepEqual(env.revoked,['blob:audio-ficticio']);
});
test('audio: rechaza archivos ilegibles y conserva solo la URL del MP3 válido', async () => {
  const bad = entorno(0,true);
  await assert.rejects(preparar(file(),bad),/leer/);
  assert.equal(bad.revoked.length,1);
  const good = entorno(600);
  const result = await preparar(file(),good);
  assert.equal(result.duration,600);
  assert.equal(result.previewUrl,'blob:audio-ficticio');
  assert.equal(good.revoked.length,0);
});
