// Utilidades del servidor. Las claves se leen del entorno y nunca se devuelven.
export class ErrorCobro extends Error {
  constructor(public estado: number, public codigo: string, mensaje: string) {
    super(mensaje);
  }
}

export function sitioEros(): URL {
  const valor = Deno.env.get("EROS_SITE_URL") || "";
  let url: URL;
  try { url = new URL(valor); } catch {
    throw new ErrorCobro(503, "configuracion", "Todavía no está configurado el cobro. Probá más tarde.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new ErrorCobro(503, "configuracion", "Todavía no está configurado el cobro. Probá más tarde.");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function modoMercadoPago(): "test" | "produccion" {
  const modo = Deno.env.get("MP_MODO");
  if (modo !== "test" && modo !== "produccion") {
    throw new ErrorCobro(503, "configuracion", "Falta configurar el modo de cobro.");
  }
  return modo;
}

export function cabecerasNavegador(req: Request): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "Retry-After",
  });
  const origen = req.headers.get("origin");
  const permitidos = [sitioEros().origin];
  if (Deno.env.get("MP_MODO") === "test") {
    permitidos.push("http://localhost:8000", "http://127.0.0.1:8000");
  }
  if (origen) {
    if (!permitidos.includes(origen)) {
      throw new ErrorCobro(403, "origen", "Abrí el pedido desde la página de Eros Web.");
    }
    headers.set("Access-Control-Allow-Origin", origen);
  }
  return headers;
}

export function responderJSON(valor: unknown, estado = 200, headers?: Headers): Response {
  const salida = new Headers(headers);
  salida.set("Content-Type", "application/json; charset=utf-8");
  salida.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(valor), { status: estado, headers: salida });
}

export function responderError(error: unknown, headers?: Headers): Response {
  if (error instanceof ErrorCobro) {
    const salida = new Headers(headers);
    if (error.estado === 429) salida.set("Retry-After", "60");
    return responderJSON({ error: error.codigo, mensaje: error.message }, error.estado, salida);
  }
  // No registrar objetos de error, URLs, cuerpos ni cabeceras: pueden tener secretos.
  console.error("cobro_error_interno");
  return responderJSON({ error: "servidor", mensaje: "No pudimos completar la consulta. Probá de nuevo en un momento." }, 503, headers);
}

export async function leerCuerpo(req: Request, maximo = 8192): Promise<Record<string, unknown>> {
  const lector = req.body?.getReader();
  if (!lector) throw new ErrorCobro(400, "cuerpo", "Faltan los datos del pedido.");
  let longitud = 0;
  const partes: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await lector.read();
      if (done) break;
      longitud += value.byteLength;
      if (longitud > maximo) {
        await lector.cancel();
        throw new ErrorCobro(413, "cuerpo", "La solicitud supera el tamaño permitido.");
      }
      partes.push(value);
    }
  } finally { lector.releaseLock(); }
  const bytes = new Uint8Array(longitud);
  let posicion = 0;
  for (const parte of partes) { bytes.set(parte, posicion); posicion += parte.length; }
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes));
    if (json && typeof json === "object" && !Array.isArray(json)) return json;
  } catch { /* Se responde sin reflejar el contenido recibido. */ }
  throw new ErrorCobro(400, "cuerpo", "La solicitud no tiene un formato válido.");
}

export async function fetchConTiempo(url: string, init: RequestInit, milisegundos = 8000, hasta = Infinity): Promise<Response> {
  const restante = Math.min(milisegundos, hasta - Date.now());
  if (restante < 50) throw new ErrorCobro(503, "tiempo", "La consulta tardó demasiado. Tu pedido sigue guardado; volvé a intentar.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), restante);
  try {
    const respuesta = await fetch(url, { ...init, signal: controller.signal });
    // El timeout cubre también el cuerpo, no solo la llegada de las cabeceras.
    if (!respuesta.body) return respuesta;
    const lector = respuesta.body.getReader();
    const partes: Uint8Array[] = [];
    let longitud = 0;
    try {
      while (true) {
        const { value, done } = await lector.read();
        if (done) break;
        longitud += value.byteLength;
        if (longitud > 2 * 1024 * 1024) { controller.abort(); throw new Error("respuesta_excesiva"); }
        partes.push(value);
      }
    } finally { lector.releaseLock(); }
    const bytes = new Uint8Array(longitud);
    let offset = 0;
    for (const parte of partes) { bytes.set(parte, offset); offset += parte.length; }
    return new Response(bytes, { status: respuesta.status, statusText: respuesta.statusText, headers: respuesta.headers });
  } finally { clearTimeout(timer); }
}

export function secretoServidor(): string {
  let nuevos: Record<string, string> = {};
  try { nuevos = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); } catch { /* Compatibilidad con proyectos antiguos. */ }
  const clave = nuevos.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!clave) throw new ErrorCobro(503, "configuracion", "Falta configurar la conexión del servidor.");
  return clave;
}

export async function consultarBD(ruta: string, metodo = "GET", cuerpo?: unknown, hasta = Infinity): Promise<unknown> {
  const base = Deno.env.get("SUPABASE_URL") || "";
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)) {
    throw new ErrorCobro(503, "configuracion", "Falta configurar la conexión del servidor.");
  }
  const clave = secretoServidor();
  const headers: Record<string, string> = { apikey: clave, "Content-Type": "application/json" };
  // Las claves nuevas sb_secret no son JWT y no se envían como Bearer.
  if (clave.startsWith("eyJ")) headers.Authorization = "Bearer " + clave;
  const respuesta = await fetchConTiempo(base + "/rest/v1/" + ruta, {
    method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  }, 7000, hasta);
  if (!respuesta.ok) {
    console.error("cobro_bd_http", respuesta.status);
    throw new ErrorCobro(503, "base_de_datos", "No pudimos consultar el pedido. Probá de nuevo.");
  }
  if (respuesta.status === 204) return null;
  return await respuesta.json();
}

export async function rpcCobro(nombre: string, argumentos: Record<string, unknown>, hasta = Infinity): Promise<Record<string, unknown>> {
  return await consultarBD("rpc/" + nombre, "POST", argumentos, hasta) as Record<string, unknown>;
}

export async function hashCobro(valor: string): Promise<string> {
  const bytes = new TextEncoder().encode(valor);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, b => b.toString(16).padStart(2, "0")).join("");
}

export async function limitarCobro(req: Request, ruta: string, maximo: number, segundos: number, hasta = Infinity): Promise<void> {
  // La cabecera de red es una defensa adicional; el límite por pedido es independiente.
  // No se guarda la IP: solo un hash con una clave del servidor, en un esquema privado.
  const ip = (req.headers.get("x-forwarded-for") || "sin-ip").split(",")[0].trim().slice(0, 80);
  const clave = await hashCobro(secretoServidor() + ":" + ruta + ":" + ip);
  const resultado = await rpcCobro("eros_limitar_cobro", { p_clave: clave, p_limite: maximo, p_segundos: segundos }, hasta);
  if (resultado.permitido !== true) {
    throw new ErrorCobro(429, "limite", "Hiciste varias consultas seguidas. Esperá un minuto y volvé a intentar.");
  }
}

export function urlSeguimiento(slug: string): string {
  const url = new URL("pedido/", sitioEros());
  url.searchParams.set("c", slug);
  return url.href;
}

export function urlRegalo(slug: string): string {
  const url = new URL("p/", sitioEros());
  url.searchParams.set("c", slug);
  return url.href;
}
