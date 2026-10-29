const {test}=require('node:test');
const assert=require('node:assert/strict');
const {montar}=require('../compartido/audio.js');
class AudioPrueba extends EventTarget {
  paused=true; plays=0; pauses=0; src=''; bloquear=false;
  play(){this.plays++;if(this.bloquear)return Promise.reject(Object.assign(new Error('bloqueado'),{name:'NotAllowedError'}));this.paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();}
  pause(){this.pauses++;this.paused=true;this.dispatchEvent(new Event('pause'));}
  removeAttribute(key){if(key==='src')this.src='';}
  load(){}
}
class BotonPrueba extends EventTarget {
  hidden=true;label={textContent:''};attributes={};
  querySelector(){return this.label;}
  setAttribute(key,value){this.attributes[key]=value;}
}
function contexto(){
  const doc=new EventTarget();doc.hidden=false;
  global.document=doc;global.location={origin:'https://sitio.test',search:'?preview=1'};
  global.window=new EventTarget();window.ErosPagina={activa:false};
  return {audio:new AudioPrueba(),button:new BotonPrueba(),doc};
}
const blob='blob:https://sitio.test/audio-prueba';
test('audio: sin archivo o con URL externa no carga ni muestra botón',()=>{
  const c=contexto();montar(c.audio,c.button,'');assert.equal(c.button.hidden,true);
  montar(c.audio,c.button,'https://youtube.com/watch?v=M7lc1UVf-VE');assert.equal(c.audio.src,'');assert.equal(c.button.hidden,true);
});
test('audio: espera un toque, reproduce y permite pausa',async()=>{
  const c=contexto(),player=montar(c.audio,c.button,blob);
  assert.equal(c.audio.plays,0);assert.equal(c.button.hidden,false);
  c.button.dispatchEvent(new Event('click'));await Promise.resolve();
  assert.equal(c.audio.plays,1);assert.equal(c.button.label.textContent,'Pausar música');
  c.button.dispatchEvent(new Event('click'));assert.equal(c.audio.paused,true);player.destruir();
});
test('audio: un bloqueo mantiene Reproducir música disponible',async()=>{
  const c=contexto();c.audio.bloquear=true;const player=montar(c.audio,c.button,blob);
  player.reproducir();await Promise.resolve();await Promise.resolve();
  assert.equal(c.button.hidden,false);assert.equal(c.button.label.textContent,'Reproducir música');player.destruir();
});
test('audio: oculta el botón ante un archivo que no carga',()=>{
  const c=contexto(),player=montar(c.audio,c.button,blob);c.audio.dispatchEvent(new Event('error'));
  assert.equal(c.button.hidden,true);assert.equal(c.audio.paused,true);player.destruir();
});
test('audio: segundo plano pausa y regresar no reanuda solo',async()=>{
  const c=contexto(),player=montar(c.audio,c.button,blob);player.reproducir();await Promise.resolve();
  c.doc.hidden=true;c.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(c.audio.paused,true);
  c.doc.hidden=false;c.doc.dispatchEvent(new Event('visibilitychange'));assert.equal(c.audio.plays,1);player.destruir();
});
test('audio: volver a montar elimina listeners anteriores y destruir corta la carga',()=>{
  const c=contexto();montar(c.audio,c.button,blob);const player=montar(c.audio,c.button,blob);
  c.button.dispatchEvent(new Event('click'));assert.equal(c.audio.plays,1);player.destruir();
  assert.equal(c.audio.src,'');assert.equal(c.button.hidden,true);c.button.dispatchEvent(new Event('click'));assert.equal(c.audio.plays,1);
});
test('audio: abrir el sobre llama play dentro del toque y omite aperturas automáticas',()=>{
  const c=contexto(),player=montar(c.audio,c.button,blob);let click;
  player.escucharApertura({addEventListener(_type,handler){click=handler;}});
  click({isTrusted:false,target:{closest:()=>true}});assert.equal(c.audio.plays,0);
  click({isTrusted:true,target:{closest:()=>true}});assert.equal(c.audio.plays,1);
  assert.equal(c.audio.paused,false);player.destruir();
  click({isTrusted:true,target:{closest:()=>true}});assert.equal(c.audio.plays,1);
});
