import { baseSupabaseServidor, cabecerasServidor, ErrorCobro, rpcCobro } from "./http.ts";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export type AudioPedido = {
  id:string; estado?:string; audio_ruta?:string|null; audio_nombre?:string|null;
  audio_bytes?:number|null; audio_duracion?:number|null; audio_consentimiento?:boolean;
  audio_verificado_en?:string|null; audio_sha256?:string|null;
  limpiado_en?:string|null; limpieza_intentada_en?:string|null;
  datos?:unknown;
};
export type AudioVerificado = {ruta:string;bytes:number;duracion:number;sha256:string};
const errorAudio = (codigo:string,mensaje="El audio no está disponible o no es un MP3 válido. Revisá el archivo antes de continuar.") => new ErrorCobro(409,codigo,mensaje);

// Recorre todos los frames: no acepta un archivo por la extensión o por un prefijo ID3.
export function analizarMP3(bytes:Uint8Array): {bytes:number;duracion:number} {
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw errorAudio("audio_tamano","El MP3 debe pesar como máximo 10 MB.");
  let cursor=0, fin=bytes.length, frames=0, duracion=0, frecuenciaInicial=0;
  if (bytes[0]===73 && bytes[1]===68 && bytes[2]===51) {
    if(bytes.length<10 || ![2,3,4].includes(bytes[3]) || bytes[4]===255 || bytes.slice(6,10).some(b=>b>127)) throw errorAudio("audio_formato");
    const size=(bytes[6]<<21)|(bytes[7]<<14)|(bytes[8]<<7)|bytes[9];
    cursor=10+size;
    if(bytes[3]===4 && (bytes[5]&16)) cursor+=10;
    if(cursor>=fin) throw errorAudio("audio_formato");
  }
  if(fin-cursor>=128 && bytes[fin-128]===84 && bytes[fin-127]===65 && bytes[fin-126]===71) fin-=128;
  while(cursor<fin) {
    if(fin-cursor<=4096 && bytes.subarray(cursor,fin).every(b=>b===0)) break;
    if(cursor+4>fin || bytes[cursor]!==255 || (bytes[cursor+1]&224)!==224) throw errorAudio("audio_formato");
    const version=(bytes[cursor+1]>>3)&3, layer=(bytes[cursor+1]>>1)&3;
    const bitrateIndex=bytes[cursor+2]>>4, rateIndex=(bytes[cursor+2]>>2)&3, padding=(bytes[cursor+2]>>1)&1;
    if(version===1 || layer!==1 || bitrateIndex===0 || bitrateIndex===15 || rateIndex===3 || (bytes[cursor+3]&3)===2) throw errorAudio("audio_formato");
    const rates=[44100,48000,32000];
    const rate=rates[rateIndex]/(version===3?1:version===2?2:4);
    const bitrates=version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
    const frameSize=Math.floor((version===3?144:72)*bitrates[bitrateIndex]*1000/rate)+padding;
    if(!frecuenciaInicial) frecuenciaInicial=rate;
    if(rate!==frecuenciaInicial || frameSize<24 || cursor+frameSize>fin) throw errorAudio("audio_formato");
    duracion+=(version===3?1152:576)/rate;
    if(duracion>600) throw errorAudio("audio_duracion","El MP3 debe durar como máximo 10 minutos.");
    cursor+=frameSize; frames++;
  }
  if(frames<3) throw errorAudio("audio_formato");
  return {bytes:bytes.length,duracion:Math.round(duracion*1000)/1000};
}

export function rutaAudioPedido(pedido:AudioPedido): string {
  if(!pedido.audio_ruta) return "";
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(pedido.id) && pedido.audio_ruta===pedido.id.toLowerCase()+"/cancion.mp3" ? pedido.audio_ruta : "";
}

async function descargarAudio(ruta:string,hasta:number):Promise<Uint8Array> {
  const controller=new AbortController();
  const restante=Math.min(12000,hasta-Date.now());
  if(restante<50) throw new ErrorCobro(503,"audio_tiempo","La validación del audio tardó demasiado. Volvé a intentar.");
  const timer=setTimeout(()=>controller.abort(),restante);
  try {
    const response=await fetch(baseSupabaseServidor()+"/storage/v1/object/authenticated/audios/"+ruta,{headers:cabecerasServidor(),redirect:"error",signal:controller.signal});
    if(response.status===404) throw errorAudio("audio_ausente");
    if(response.status!==200 || !response.body) throw new ErrorCobro(503,"audio_storage","No pudimos verificar el audio. Volvé a intentar.");
    const tipo=(response.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase();
    if(tipo!=="audio/mpeg") {await response.body.cancel();throw errorAudio("audio_tipo");}
    const declarados=Number(response.headers.get("Content-Length")||0);
    if(declarados>MAX_AUDIO_BYTES) {await response.body.cancel();throw errorAudio("audio_tamano");}
    const reader=response.body.getReader(),partes:Uint8Array[]=[];let size=0;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
        if(size>MAX_AUDIO_BYTES){await reader.cancel();throw errorAudio("audio_tamano");}partes.push(value);}
    } finally {reader.releaseLock();}
    if(declarados && declarados!==size) throw errorAudio("audio_tamano");
    const bytes=new Uint8Array(size);let offset=0;for(const part of partes){bytes.set(part,offset);offset+=part.byteLength;}
    return bytes;
  } catch(error) {
    if(error instanceof ErrorCobro) throw error;
    throw new ErrorCobro(503,"audio_conexion","No pudimos verificar el audio. Volvé a intentar.");
  } finally {clearTimeout(timer);}
}

export async function verificarAudioPedido(pedido:AudioPedido,hasta=Infinity,opciones:{guardarVerificacion?:boolean}={}):Promise<AudioVerificado|null> {
  if(!pedido.audio_ruta) {
    const datos=pedido.datos && typeof pedido.datos==="object" ? pedido.datos as Record<string,unknown> : {};
    const audio=datos.audio && typeof datos.audio==="object" ? datos.audio as Record<string,unknown> : {};
    if(audio.src || pedido.audio_bytes || pedido.audio_nombre || pedido.audio_sha256 || pedido.audio_verificado_en) throw errorAudio("audio_incompleto");
    return null;
  }
  const ruta=rutaAudioPedido(pedido);
  if(!ruta || pedido.audio_consentimiento!==true || !Number.isSafeInteger(pedido.audio_bytes) || pedido.audio_bytes!<1 || pedido.audio_bytes!>MAX_AUDIO_BYTES ||
    typeof pedido.audio_nombre!=="string" || !pedido.audio_nombre.trim() || pedido.audio_nombre.length>120 || pedido.limpiado_en || pedido.limpieza_intentada_en) throw errorAudio("audio_metadatos");
  if(!opciones.guardarVerificacion && (!pedido.audio_verificado_en || !Number.isFinite(Date.parse(pedido.audio_verificado_en)) || !/^[a-f0-9]{64}$/.test(pedido.audio_sha256||""))) throw errorAudio("audio_sin_verificar");
  if(opciones.guardarVerificacion && pedido.estado!=="nuevo") throw errorAudio("audio_estado");
  const bytes=await descargarAudio(ruta,hasta),analisis=analizarMP3(bytes);
  if(bytes.length!==pedido.audio_bytes) throw errorAudio("audio_tamano");
  const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer));
  const sha256=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
  if(pedido.audio_sha256 && pedido.audio_sha256!==sha256) throw errorAudio("audio_cambiado");
  if(opciones.guardarVerificacion) {
    const result=await rpcCobro("eros_confirmar_audio",{p_pedido_id:pedido.id,p_ruta:ruta,p_bytes:analisis.bytes,p_duracion:analisis.duracion,p_sha256:sha256},hasta);
    if(result.ok!==true) throw errorAudio("audio_cambio");
  }
  return {ruta,...analisis,sha256};
}
