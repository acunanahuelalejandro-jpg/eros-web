import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root = new URL('../',import.meta.url);
function armador() {
  const controls=new Map(); const control=selector=>{if(!controls.has(selector)) controls.set(selector,{value:'',checked:false,textContent:'',focus(){this.focused=true;}});return controls.get(selector);};
  const window={ErosPrecios:{tabla:{models:{carta:{slug:'carta-para-vos'}},durations:{}}},ErosApertura:{elegirApertura:()=> 'sobre'}};
  const context=vm.createContext({window,URL,Intl,TextEncoder,console,document:{readyState:'loading',querySelector:control,addEventListener(){}}});
  const source=readFileSync(new URL('armador/armador.js',root),'utf8').replace("  if (document.readyState === 'loading')","  window.__prueba = {state,buildTemplateData,buildRow,validateStep,enviarAudio,setAudio(value){ audioUpload={valor:()=>value,procesando:()=>false}; }};\n  if (document.readyState === 'loading')");
  vm.runInContext(source,context); const api=window.__prueba;api.state.model='carta';api.state.recipient='Sofi';return {...api,control,snapshot:window.ErosArmador.vistaPrevia};
}
const audio={file:{name:'cancion.mp3'},name:'Mi canción.mp3',size:12345,duration:90,previewUrl:'blob:http://localhost/audio',consentimiento:true};
test('armador: MP3 opcional; no conserva fuentes ni opciones anteriores',()=>{
  const a=armador();const data=a.buildTemplateData();assert.equal(data.audio,undefined);assert.equal(data.musica,undefined);assert.equal(data.musicaYoutube,undefined);assert.equal(a.validateStep(9),true);
});
test('armador: ruta canónica del audio y metadatos privados',()=>{
  const a=armador();a.setAudio(audio);const data=a.buildTemplateData();assert.equal(data.audio.src,'audio/cancion.mp3');
  const row=a.buildRow('uuid-ficticio','ABC234',data);assert.equal(row.audio_ruta,'uuid-ficticio/cancion.mp3');assert.equal(row.audio_nombre,'Mi canción.mp3');assert.equal(row.audio_bytes,12345);assert.equal(row.audio_duracion,90);assert.equal(row.audio_consentimiento,true);
});
test('armador: exige declaración si hay un MP3',()=>{
  const a=armador();a.setAudio({...audio,consentimiento:false});assert.equal(a.validateStep(9),false);assert.match(a.control('#order-error').textContent,/derecho/);assert.equal(a.control('#audio-consent').focused,true);
});
test('armador: vista previa usa blob, pedido usa ruta relativa',()=>{
  const a=armador();a.setAudio(audio);assert.equal(a.snapshot().datos.audio.src,audio.previewUrl);assert.equal(a.buildTemplateData().audio.src,'audio/cancion.mp3');
});
test('armador: sube una vez y reintenta validación sobre el mismo pedido',async()=>{
  const a=armador();let uploads=0,validations=0;
  const client={storage:{from(bucket){assert.equal(bucket,'audios');return {upload:async(path,file,opts)=>{uploads++;assert.equal(path,'uuid/cancion.mp3');assert.equal(opts.contentType,'audio/mpeg');return {error:null};}};}},functions:{invoke:async(name,args)=>{assert.equal(name,'validar-audio');assert.equal(args.body.id,'uuid');assert.equal(args.body.codigo,'ABC234');return {data:{ok:++validations>1},error:null};}}};
  const pending={id:'uuid',codigo:'ABC234',audio,uploadedAudio:false};
  await assert.rejects(a.enviarAudio(client,pending));await a.enviarAudio(client,pending);assert.equal(uploads,1);assert.equal(validations,2);
});
test('landing: único selector de MP3 sin enlaces ni catálogo',()=>{
  const html=readFileSync(new URL('index.html',root),'utf8');assert.ok(html.includes('id="audio-upload-input"'));assert.ok(html.includes('audio/mpeg'));assert.ok(html.includes('Declaro que tengo derecho a usar este archivo y me hago responsable de su contenido'));
  assert.ok(!/id="music-(?:track|link|help|selection)"/.test(html));assert.ok(html.indexOf('src="armador/audio.js"')<html.indexOf('src="armador/armador.js"'));
});
