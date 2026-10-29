import { analizarMP3, verificarAudioPedido, type AudioPedido } from "../functions/_compartido/audio.ts";

function igualAudio(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Resultado de audio inesperado."); }
function afirmarAudio(v: unknown) { if (!v) throw new Error("Falla de integridad del audio."); }
export function mp3DePrueba(cantidad = 4): Uint8Array {
  // MPEG1 Layer III, 128kbps/44100Hz; frames completos, sin datos personales.
  const bytes = new Uint8Array(417 * cantidad);
  for (let i = 0; i < cantidad; i++) bytes.set([0xff,0xfb,0x90,0x00],i*417);
  return bytes;
}
const idAudio = "da3dfe67-5917-4cbc-a74c-ebfbd0e384f1";
function pedidoAudio(): AudioPedido {
  return {id:idAudio,estado:"nuevo",audio_ruta:idAudio+"/cancion.mp3",audio_nombre:"cancion.mp3",
    audio_bytes:1668,audio_duracion:null,audio_consentimiento:true,audio_verificado_en:null,audio_sha256:null};
}

Deno.test("audio: reconoce frames Layer III completos y calcula duración real", () => {
  const r = analizarMP3(mp3DePrueba());
  igualAudio(r.bytes,1668); afirmarAudio(Math.abs(r.duracion-4*1152/44100)<.001);
  const tag = new Uint8Array(10+1668); tag.set([73,68,51,4,0,0,0,0,0,0]); tag.set(mp3DePrueba(),10);
  igualAudio(analizarMP3(tag).bytes,tag.length);
});
Deno.test("audio: rechaza tipo falso, ID3 sin MP3, frames truncados y tamaño excesivo", () => {
  for (const bytes of [new TextEncoder().encode("<html>no es mp3</html>"),new Uint8Array([73,68,51,4,0,0,0,0,0,0]),mp3DePrueba().slice(0,-1),new Uint8Array(10485761)]) {
    let fallo=false; try { analizarMP3(bytes); } catch { fallo=true; } afirmarAudio(fallo);
  }
});
Deno.test("audio: rechaza más de diez minutos contando frames", () => {
  let fallo=false; try { analizarMP3(mp3DePrueba(23000)); } catch { fallo=true; } afirmarAudio(fallo);
});

async function conAudio(probar:(ped:AudioPedido,red:{tipo:string;archivo:Uint8Array;estado:number;guardados:number})=>Promise<void>) {
  const env = {SUPABASE_URL:"https://prueba.supabase.co",SUPABASE_SECRET_KEYS:'{"default":"valor-ficticio-local"}'};
  const anteriores=Object.fromEntries(Object.keys(env).map(k=>[k,Deno.env.get(k)]));
  Object.entries(env).forEach(([k,v])=>Deno.env.set(k,v));
  const original=globalThis.fetch; const red={tipo:"audio/mpeg",archivo:mp3DePrueba(),estado:200,guardados:0};
  globalThis.fetch=(async (input:unknown,init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin!=="https://prueba.supabase.co") throw new Error("Red externa prohibida.");
    if(url.pathname==="/storage/v1/object/authenticated/audios/"+idAudio+"/cancion.mp3") return new Response(new Uint8Array(red.archivo),{status:red.estado,headers:{"Content-Type":red.tipo,"Content-Length":String(red.archivo.length)}});
    if(url.pathname==="/rest/v1/rpc/eros_confirmar_audio") {red.guardados++;const b=JSON.parse(String(init?.body));igualAudio(b.p_pedido_id,idAudio);afirmarAudio(/^[a-f0-9]{64}$/.test(b.p_sha256));return Response.json({ok:true});}
    throw new Error("Ruta no prevista de prueba.");
  }) as typeof fetch;
  try { await probar(pedidoAudio(),red); } finally {globalThis.fetch=original;for(const[k,v]of Object.entries(anteriores)){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v);}}
}
Deno.test("audio: el servidor valida bytes, tipo, consentimiento y confirma sin publicar URL",()=>conAudio(async(p,r)=>{
  const v=await verificarAudioPedido(p,Date.now()+10000,{guardarVerificacion:true});
  afirmarAudio(v && /^[a-f0-9]{64}$/.test(v.sha256));igualAudio(r.guardados,1);afirmarAudio(!JSON.stringify(v).includes("https://"));
}));
Deno.test("audio: archivo ausente, MIME falso, tamaño alterado o sin consentimiento se bloquean",()=>conAudio(async(p,r)=>{
  for(const cambiar of [()=>{r.estado=404;},()=>{r.estado=200;r.tipo="text/html";},()=>{r.tipo="audio/mpeg";p.audio_bytes=100;},()=>{p.audio_bytes=1668;p.audio_consentimiento=false;}]) {
    cambiar();let fallo=false;try{await verificarAudioPedido(p,Date.now()+10000,{guardarVerificacion:true});}catch{fallo=true;}afirmarAudio(fallo);
  }
  igualAudio(r.guardados,0);
}));
Deno.test("audio: acciones no aceptan sin verificación y detectan cambios de contenido",()=>conAudio(async(p,r)=>{
  let fallo=false;try{await verificarAudioPedido(p,Date.now()+10000);}catch{fallo=true;}afirmarAudio(fallo);
  const v=await verificarAudioPedido(p,Date.now()+10000,{guardarVerificacion:true});
  p.audio_verificado_en=new Date().toISOString();p.audio_sha256=v!.sha256;
  igualAudio((await verificarAudioPedido(p,Date.now()+10000))!.bytes,1668);
  r.archivo=r.archivo.slice();r.archivo[100]=1;fallo=false;
  try{await verificarAudioPedido(p,Date.now()+10000);}catch{fallo=true;}afirmarAudio(fallo);
}));
