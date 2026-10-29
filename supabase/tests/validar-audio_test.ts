import type { AudioPedido } from "../functions/_compartido/audio.ts";
const serveOriginal = Deno.serve;
Object.defineProperty(Deno,"serve",{configurable:true,writable:true,value:()=>({})});
const {validarAudio} = await import("../functions/validar-audio/index.ts");
Object.defineProperty(Deno,"serve",{configurable:true,writable:true,value:serveOriginal});
const id="da3dfe67-5917-4cbc-a74c-ebfbd0e384f1";
function eq(a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error("Validación de audio inesperada.");}
function ok(value:unknown){if(!value)throw new Error("No se conservó la privacidad o validación del MP3.");}
function frames(){const bytes=new Uint8Array(417*4);for(let i=0;i<4;i++)bytes.set([255,251,144,0],417*i);return bytes;}
type Caso={pedido:AudioPedido|null;tipo:string;estadoAudio:number;limite:boolean;confirmar:boolean;requests:string[]};
async function conCaso(fn:(c:Caso)=>Promise<void>){
  const env={SUPABASE_URL:"https://prueba.supabase.co",SUPABASE_SECRET_KEYS:'{"default":"secreto-ficticio-solo-prueba"}',EROS_SITE_URL:"https://tienda.github.io/eros-web/",MP_MODO:"test"};
  const old=Object.fromEntries(Object.keys(env).map(k=>[k,Deno.env.get(k)]));Object.entries(env).forEach(([k,v])=>Deno.env.set(k,v));
  const fetchOld=globalThis.fetch;
  const c:Caso={pedido:{id,estado:"nuevo",audio_ruta:id+"/cancion.mp3",audio_nombre:"Nombre privado.mp3",audio_bytes:1668,audio_consentimiento:true,datos:{audio:{src:"audio/cancion.mp3"}}},tipo:"audio/mpeg",estadoAudio:200,limite:true,confirmar:true,requests:[]};
  globalThis.fetch=(async(input:unknown,init?:RequestInit)=>{
    const url=new URL(String(input));if(url.origin!==env.SUPABASE_URL)throw new Error("Red externa prohibida.");c.requests.push(url.pathname);
    if(url.pathname==="/rest/v1/rpc/eros_limitar_cobro")return Response.json({permitido:c.limite});
    if(url.pathname==="/rest/v1/pedidos"){eq(url.searchParams.get("id"),"eq."+id);eq(url.searchParams.get("codigo"),"eq.AUD234");return Response.json(c.pedido?[c.pedido]:[]);}
    if(url.pathname==="/storage/v1/object/authenticated/audios/"+id+"/cancion.mp3")return new Response(frames(),{status:c.estadoAudio,headers:{"Content-Type":c.tipo}});
    if(url.pathname==="/rest/v1/rpc/eros_confirmar_audio"){const body=JSON.parse(String(init?.body));eq(body.p_pedido_id,id);ok(/^[a-f0-9]{64}$/.test(body.p_sha256));return Response.json({ok:c.confirmar});}
    throw new Error("Ruta inesperada.");
  }) as typeof fetch;
  try{await fn(c);}finally{globalThis.fetch=fetchOld;for(const[k,v]of Object.entries(old)){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v);}}
}
function req(body:unknown={id,codigo:"AUD234"},method="POST",origin="https://tienda.github.io"){
  return new Request("https://prueba.supabase.co/functions/v1/validar-audio",{method,headers:{Origin:origin,"Content-Type":"application/json"},...(method==="POST"?{body:JSON.stringify(body)}:{})});
}
Deno.test("subida MP3: OPTIONS y métodos no permitidos no consultan pedidos",()=>conCaso(async c=>{
  eq((await validarAudio(req({},"OPTIONS"))).status,204);eq((await validarAudio(req({},"GET"))).status,405);eq(c.requests.length,0);
}));
Deno.test("subida MP3: origen ajeno, credenciales inválidas o límite no leen archivos",()=>conCaso(async c=>{
  eq((await validarAudio(req({},"POST","https://ajeno.test"))).status,403);eq(c.requests.length,0);
  eq((await validarAudio(req({id:"otro",codigo:"AUD234"}))).status,400);
  c.limite=false;eq((await validarAudio(req())).status,429);ok(!c.requests.some(p=>p.includes("/storage/")));
}));
Deno.test("subida MP3: valida archivo del pedido y devuelve solo confirmación",()=>conCaso(async c=>{
  const response=await validarAudio(req());eq(response.status,200);const body=await response.json();eq(body,{ok:true});
  ok(!/Nombre privado|secreto|https:|cancion\.mp3/.test(JSON.stringify(body)));eq(c.requests.filter(p=>p.includes("/object/authenticated/")).length,1);
}));
Deno.test("subida MP3: no valida otro código ni un pedido ya publicado",()=>conCaso(async c=>{
  c.pedido=null;eq((await validarAudio(req())).status,404);
  c.pedido={id,estado:"publicado"};eq((await validarAudio(req())).status,409);ok(!c.requests.some(p=>p.includes("/storage/")));
}));
Deno.test("subida MP3: consentimiento, tamaño, MIME y existencia se vuelven a comprobar",()=>conCaso(async c=>{
  c.pedido!.audio_consentimiento=false;eq((await validarAudio(req())).status,409);
  c.pedido!.audio_consentimiento=true;c.pedido!.audio_bytes=10485761;eq((await validarAudio(req())).status,409);
  c.pedido!.audio_bytes=1668;c.tipo="text/html";eq((await validarAudio(req())).status,409);
  c.tipo="audio/mpeg";c.estadoAudio=404;eq((await validarAudio(req())).status,409);
  ok(!c.requests.some(p=>p.endsWith("eros_confirmar_audio")));
}));
Deno.test("subida MP3: una confirmación rechazada no se comunica como éxito",()=>conCaso(async c=>{
  c.confirmar=false;eq((await validarAudio(req())).status,409);
}));
