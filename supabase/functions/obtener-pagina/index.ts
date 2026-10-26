import { baseSupabaseServidor, cabecerasNavegador, cabecerasServidor, consultarBD, ErrorCobro, fetchConTiempo, hashCobro, leerCuerpo, limitarCobro, responderError, responderJSON, responderPreflight, rpcCobro, secretoServidor } from "../_compartido/http.ts";
import { datosPublicosPagina, disponibilidadPagina, modeloPagina, type PedidoPagina } from "../_compartido/paginas.ts";

function noDisponible(): ErrorCobro {
  // La misma respuesta para desconocido, impago, incompleto o con fecha futura.
  return new ErrorCobro(404, "no_disponible", "Esta página todavía no está disponible. Revisá el enlace o volvé más tarde.");
}
function comprobarVigencia(pedido: PedidoPagina | null): asserts pedido is PedidoPagina {
  const estado = disponibilidadPagina(pedido, Date.now());
  if (estado === "vencido") throw new ErrorCobro(410, "vencido", "Esta página ya venció.");
  if (estado !== "disponible") throw noDisponible();
}

async function firmarFotos(pedido: PedidoPagina, nombres: Set<string>, segundos: number, hasta: number): Promise<Map<string, string>> {
  const fotos = new Map<string, string>();
  if (!nombres.size) return fotos;
  const base = baseSupabaseServidor();
  const paths = Array.from(nombres, nombre => pedido.id + "/" + nombre);
  const respuesta = await fetchConTiempo(base + "/storage/v1/object/sign/fotos", {
    method: "POST", headers: cabecerasServidor(), body: JSON.stringify({ paths, expiresIn: segundos }),
  }, 7000, hasta);
  if (!respuesta.ok) {
    // Una foto ausente no impide leer los textos; no se registra ruta, token ni cliente.
    console.error("pagina_fotos_http", respuesta.status);
    if ([400, 404].includes(respuesta.status)) return fotos;
    throw new ErrorCobro(503, "fotos", "No pudimos cargar las fotos de este regalo. Probá de nuevo en un momento.");
  }
  const filas: unknown = await respuesta.json();
  if (!Array.isArray(filas)) throw new ErrorCobro(503, "fotos", "No pudimos cargar este regalo. Probá de nuevo.");
  const permitidos = new Set(paths);
  for (const fila of filas) {
    if (!fila || typeof fila !== "object" || typeof fila.path !== "string" || !permitidos.has(fila.path) || fila.error) continue;
    const raw = fila.signedURL || fila.signedUrl;
    if (typeof raw !== "string" || raw.length > 8192) continue;
    try {
      const relativa = raw.startsWith("/object/sign/") ? "/storage/v1" + raw : raw;
      const url = new URL(relativa, base);
      if (url.origin !== base || url.username || url.password || url.hash ||
        decodeURIComponent(url.pathname) !== "/storage/v1/object/sign/fotos/" + fila.path || !url.searchParams.get("token")) continue;
      fotos.set(fila.path.slice(pedido.id.length + 1), url.href);
    } catch { /* Una ruta inválida se trata como una foto que no está disponible. */ }
  }
  return fotos;
}

export async function obtenerPagina(req: Request): Promise<Response> {
  const hasta = Date.now() + 18000;
  let headers: Headers | undefined;
  try {
    const preflight = responderPreflight(req);
    if (preflight) return preflight;
    headers = cabecerasNavegador(req);
    if (req.method !== "POST") throw new ErrorCobro(405, "metodo", "Abrí el link de tu regalo.");
    await limitarCobro(req, "obtener-pagina", 120, 60, hasta);
    const cuerpo = await leerCuerpo(req, 2048);
    const slug = cuerpo.slug;
    if (typeof slug !== "string" || !/^[23456789abcdefgh]{12,32}$/.test(slug)) throw noDisponible();
    // Segundo límite por link, independiente del encabezado de red del visitante.
    const clave = await hashCobro(secretoServidor() + ":pagina:" + slug);
    const limite = await rpcCobro("eros_limitar_cobro", { p_clave: clave, p_limite: 60, p_segundos: 60 }, hasta);
    if (limite.permitido !== true) throw new ErrorCobro(429, "limite", "Este regalo recibió varias consultas seguidas. Esperá un minuto y volvé a abrirlo.");
    const columnas = "id,estado,modelo,datos,extras,tema,para_quien,de_parte,publicado_en,vence_en,activar_el";
    const filas = await consultarBD("pedidos?select=" + columnas + "&slug=eq." + encodeURIComponent(slug) + "&limit=1", "GET", undefined, hasta) as PedidoPagina[];
    const pedido = Array.isArray(filas) && filas.length ? filas[0] : null;
    comprobarVigencia(pedido);
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(pedido.id)) throw noDisponible();
    if (cuerpo.soloModelo === true) return responderJSON({ modelo: modeloPagina(pedido), vence_en: pedido.vence_en }, 200, headers);
    const nombres = new Set<string>();
    datosPublicosPagina(pedido, nombre => { nombres.add(nombre); return ""; });
    const ahora = Date.now();
    const fin = Date.parse(pedido.vence_en!);
    const segundos = Math.min(600, Math.max(0, Math.floor((fin - ahora) / 1000)));
    // Storage usa segundos enteros. No se firma una foto por más tiempo del que queda.
    const fotos = segundos ? await firmarFotos(pedido, nombres, segundos, hasta) : new Map<string, string>();
    comprobarVigencia(pedido);
    const datos = datosPublicosPagina(pedido, nombre => fotos.get(nombre) || "");
    return responderJSON({
      modelo: modeloPagina(pedido), datos, fotos: Array.from(fotos.values()),
      vence_en: pedido.vence_en,
      urls_vencen_en: new Date(Math.min(fin, ahora + segundos * 1000)).toISOString(),
    }, 200, headers);
  } catch (error) { return responderError(error, headers); }
}

Deno.serve(obtenerPagina);
