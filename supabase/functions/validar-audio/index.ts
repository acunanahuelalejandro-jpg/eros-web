import { buscarPedido, credencialPedido } from "../_compartido/cobros.ts";
import { verificarAudioPedido } from "../_compartido/audio.ts";
import { cabecerasNavegador, ErrorCobro, hashCobro, leerCuerpo, limitarCobro, responderError, responderJSON, responderPreflight, rpcCobro, secretoServidor } from "../_compartido/http.ts";

export async function validarAudio(req:Request):Promise<Response> {
  const hasta=Date.now()+18000;let headers:Headers|undefined;
  try {
    const preflight=responderPreflight(req);if(preflight)return preflight;
    headers=cabecerasNavegador(req);
    if(req.method!=="POST")throw new ErrorCobro(405,"metodo","Usá la subida de audio del armador.");
    await limitarCobro(req,"validar-audio",20,900,hasta);
    const body=await leerCuerpo(req,1024);
    const credencial=credencialPedido(body);
    if("slug" in credencial)throw new ErrorCobro(400,"pedido","Volvé al armador para validar el audio.");
    const limite=await rpcCobro("eros_limitar_cobro",{p_clave:await hashCobro(secretoServidor()+":audio:"+credencial.id),p_limite:10,p_segundos:900},hasta);
    if(limite.permitido!==true)throw new ErrorCobro(429,"limite","Esperá unos minutos antes de volver a validar el audio.");
    const pedido=await buscarPedido(credencial,true,hasta);
    if(pedido.estado!=="nuevo")throw new ErrorCobro(409,"audio_estado","El pedido ya no admite subidas de audio.");
    const audio=await verificarAudioPedido(pedido,hasta,{guardarVerificacion:true});
    if(!audio)throw new ErrorCobro(400,"audio_ausente","Este pedido no tiene un audio para validar.");
    // La respuesta no permite descargar, listar ni conocer archivos de otro pedido.
    return responderJSON({ok:true},200,headers);
  }catch(error){return responderError(error,headers);}
}
Deno.serve(validarAudio);
