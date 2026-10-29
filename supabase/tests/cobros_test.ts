// Pruebas locales: fetch queda interceptado. No se crean pedidos ni cobros reales.
import { referenciaPrecio, type PedidoCobro } from "../functions/_compartido/cobros.ts";
import { fetchConTiempo } from "../functions/_compartido/http.ts";
import { avisarPagoAdmin } from "../functions/_compartido/avisos.ts";

const serveOriginal = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: () => ({}) });
const { crearPago } = await import("../functions/crear-pago/index.ts");
const { webhookMercadoPago } = await import("../functions/webhook-mercadopago/index.ts");
const { estadoPedido } = await import("../functions/estado-pedido/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: serveOriginal });

function igual(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Se esperaba " + JSON.stringify(b) + ", llegó " + JSON.stringify(a));
}
function afirmar(valor: unknown, mensaje = "No se cumplió la condición") { if (!valor) throw new Error(mensaje); }
const copiar = <T>(valor: T): T => structuredClone(valor);
const fila: PedidoCobro = {
  id: "d3156117-2e7c-469e-891f-72282db231be", codigo: "TES234", slug: "23456789abcdefgh23456789abcdefgh",
  estado: "nuevo", modelo: "carta-para-vos", duracion: "1 día", extras: { juego: "", sobre: true, contador: {} },
  datos: { version: 2, para: "Nombre privado", carta: { titulo: "Texto privado" }, extras: { juego: "", sobre: true, contador: {} } },
  total: 5000, activar_el: null, fotos_cantidad: 2, mp_preference_id: null, mp_payment_id: null,
};
type Simulado = {
  pedido: PedidoCobro; peticiones: { url: string; body: Record<string, unknown>; method: string }[];
  pagoEstado: string | null; accionReserva: string; limite: boolean; vendedorPrueba: boolean;
  preferencia: Record<string, unknown> | null; pago: Record<string, unknown>; referencia: string;
  registro: Record<string, unknown>[]; fallaPOST: boolean; modo: string;
  audioRespuesta?: "ausente" | "invalido";
};

async function simular(probar: (s: Simulado) => Promise<void>) {
  const env = { SUPABASE_URL: "https://prueba.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"valor-ficticio-local"}',
    MP_ACCESS_TOKEN: "valor-ficticio-mercadopago", MP_WEBHOOK_SECRET: "firma-ficticia-local", MP_MODO: "test", AVISOS_SECRETO: "", EROS_SITE_URL: "https://eros.ejemplo.test/eros-web/" };
  const anterior = Object.fromEntries(Object.keys(env).map(k => [k, Deno.env.get(k)]));
  Object.entries(env).forEach(([k, v]) => Deno.env.set(k, v));
  const fetchOriginal = globalThis.fetch;
  const s: Simulado = { pedido: copiar(fila), peticiones: [], pagoEstado: null, accionReserva: "crear", limite: false,
    vendedorPrueba: true, preferencia: null, pago: {}, referencia: await referenciaPrecio(fila), registro: [], fallaPOST: false, modo: "test" };
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method || "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    s.peticiones.push({ url: url.href, body, method });
    if (url.hostname === "prueba.supabase.co") {
      if (url.pathname === "/storage/v1/object/authenticated/audios/" + s.pedido.id + "/cancion.mp3") {
        return Promise.resolve(s.audioRespuesta === "invalido"
          ? new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } })
          : json({ error: "Object not found" }, 404));
      }
      if (url.pathname === "/functions/v1/avisar-admin") {
        igual(init?.headers && new Headers(init.headers).get("x-eros-aviso"), "a".repeat(64));
        return Promise.resolve(json({ ok: !s.fallaPOST }, s.fallaPOST ? 503 : 200));
      }
      const rpc = url.pathname.split("/").at(-1);
      if (url.pathname === "/rest/v1/pedidos") return Promise.resolve(json([s.pedido]));
      if (rpc === "eros_limitar_cobro") return Promise.resolve(json({ permitido: !s.limite }));
      if (rpc === "eros_estado_cobro") return Promise.resolve(json({ estado: s.pagoEstado }));
      if (rpc === "eros_identificar_pago") return Promise.resolve(json({ codigo: s.pedido.codigo }));
      if (rpc === "eros_reservar_checkout") return Promise.resolve(json({ accion: s.accionReserva, preference_id: "123-pref" }));
      if (rpc === "eros_fallar_checkout") return Promise.resolve(json({ ok: true }));
      if (rpc === "eros_guardar_checkout") return Promise.resolve(json({ guardado: true }));
      if (rpc === "eros_registrar_pago") {
        s.registro.push(body); s.pagoEstado = String(body.p_estado);
        if (body.p_estado === "approved") { s.pedido.estado = "publicado"; s.pedido.mp_payment_id = String(body.p_payment_id); }
        return Promise.resolve(json({ accion: body.p_estado === "approved" ? "publicado" : "registrado" }));
      }
    }
    if (url.hostname === "api.mercadopago.com") {
      if (url.pathname === "/users/me") return Promise.resolve(json({ id: 123, tags: s.vendedorPrueba ? ["test_user"] : [] }));
      if (url.pathname === "/v1/payment_methods") return Promise.resolve(json([{ payment_type_id: "credit_card" }, { payment_type_id: "ticket" }, { payment_type_id: "atm" }, { payment_type_id: "bank_transfer" }]));
      if (url.pathname === "/checkout/preferences/search") return Promise.resolve(json({ elements: [] }));
      if (url.pathname === "/checkout/preferences" && method === "POST") {
        if (s.fallaPOST) return Promise.reject(new TypeError("red simulada"));
        s.preferencia = { ...body, id: "123-pref", collector_id: 123, init_point: "https://www.mercadopago.com/mla/checkout/start?pref_id=123-pref" };
        return Promise.resolve(json(s.preferencia));
      }
      if (url.pathname === "/checkout/preferences/123-pref") return Promise.resolve(json(s.preferencia));
      if (url.pathname === "/v1/payments/123456") return Promise.resolve(json(s.pago));
    }
    return Promise.reject(new Error("Ruta no simulada"));
  }) as typeof fetch;
  try { await probar(s); }
  finally {
    globalThis.fetch = fetchOriginal;
    for (const [k, v] of Object.entries(anterior)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  }
}
const requestPedido = (cuerpo: unknown = { id: fila.id, codigo: fila.codigo }) => new Request("https://prueba.supabase.co/functions/v1/crear-pago", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://eros.ejemplo.test" }, body: JSON.stringify(cuerpo),
});
async function requestWebhook(s: Simulado, firmaValida = true) {
  s.pago = { id: 123456, external_reference: s.pedido.id, collector_id: 123, status: "approved", currency_id: "ARS", transaction_amount: 5000,
    payment_type_id: "credit_card", live_mode: false, date_last_updated: new Date().toISOString(),
    metadata: { eros_pedido_id: s.pedido.id, eros_revision: s.referencia, eros_modo: s.modo }, ...s.pago };
  const ts = Math.floor(Date.now() / 1000), requestId = "solicitud-local";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("firma-ficticia-local"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`id:123456;request-id:${requestId};ts:${ts};`)));
  const signature = firmaValida ? Array.from(hash, b => b.toString(16).padStart(2, "0")).join("") : "0".repeat(64);
  return new Request("https://prueba.supabase.co/functions/v1/webhook-mercadopago?data.id=123456&type=payment", { method: "POST",
    headers: { "Content-Type": "application/json", "x-request-id": requestId, "x-signature": `ts=${ts},v1=${signature}` },
    body: JSON.stringify({ type: "payment", data: { id: "123456" }, status: "approved", transaction_amount: 1 }),
  });
}

Deno.test("CORS: las tres funciones responden OPTIONS 204 sin cuerpo, credenciales ni consultas", () => simular(async s => {
  Deno.env.set("EROS_SITE_URL", "https://tienda.github.io/eros-web/");
  for (const clave of ["SUPABASE_URL", "SUPABASE_SECRET_KEYS", "MP_ACCESS_TOKEN", "MP_WEBHOOK_SECRET", "MP_MODO"]) Deno.env.delete(clave);
  for (const [nombre, handler] of [["crear-pago", crearPago], ["estado-pedido", estadoPedido], ["webhook-mercadopago", webhookMercadoPago]] as const) {
    // También un OPTIONS sin Origin conserva el origen configurado, siempre sin /eros-web/.
    for (const conOrigen of [true, false]) {
      const headers = new Headers({
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, x-client-info, apikey, content-type",
      });
      if (conOrigen) headers.set("Origin", "https://tienda.github.io");
      const respuesta = await handler(new Request("https://prueba.supabase.co/functions/v1/" + nombre, { method: "OPTIONS", headers }));
      igual(respuesta.status, 204);
      igual(await respuesta.text(), "");
      igual(respuesta.headers.get("Access-Control-Allow-Origin"), "https://tienda.github.io");
      igual(respuesta.headers.get("Access-Control-Allow-Methods"), "POST, OPTIONS");
      igual(respuesta.headers.get("Access-Control-Allow-Headers"), "authorization, x-client-info, apikey, content-type");
    }
  }
  igual(s.peticiones.length, 0); igual(s.registro.length, 0);
}));
Deno.test("CORS: preflight ajeno sigue rechazado y GET conserva 405 con CORS", () => simular(async s => {
  for (const handler of [crearPago, estadoPedido, webhookMercadoPago]) {
    const ajeno = await handler(new Request("https://prueba.supabase.co/functions/v1/prueba", {
      method: "OPTIONS", headers: { Origin: "https://ajeno.ejemplo.test", "Access-Control-Request-Method": "POST" },
    }));
    igual(ajeno.status, 403); igual(ajeno.headers.get("Access-Control-Allow-Origin"), null);
    const get = await handler(new Request("https://prueba.supabase.co/functions/v1/prueba", { headers: { Origin: "https://eros.ejemplo.test" } }));
    igual(get.status, 405); igual(get.headers.get("Access-Control-Allow-Origin"), "https://eros.ejemplo.test");
  }
  igual(s.peticiones.length, 0);
}));

Deno.test("checkout: precio del servidor, moneda ARS y URLs por slug; no envía contenido personal", () => simular(async s => {
  const respuesta = await crearPago(requestPedido()); igual(respuesta.status, 200);
  const salida = await respuesta.json(); igual(salida.slug, fila.slug); afirmar(salida.init_point.startsWith("https://www.mercadopago.com/"));
  afirmar(s.preferencia); const p = s.preferencia!;
  igual((p.items as Record<string, unknown>[])[0].unit_price, 5000); igual(p.external_reference, fila.id);
  afirmar(JSON.stringify(p.back_urls).includes(fila.slug));
  afirmar(!JSON.stringify(p).includes("privado"));
  for (const tipo of ["ticket", "atm", "bank_transfer"]) afirmar(JSON.stringify(p.payment_methods).includes(tipo));
}));
Deno.test("checkout: total manipulado y extras inconsistentes se rechazan antes de Mercado Pago", () => simular(async s => {
  s.pedido.total = 1; igual((await crearPago(requestPedido())).status, 409);
  s.pedido = copiar(fila); (s.pedido.datos.extras as Record<string, unknown>).juego = "laberinto";
  igual((await crearPago(requestPedido())).status, 409);
  afirmar(s.peticiones.every(p => !p.url.includes("api.mercadopago.com")));
}));
Deno.test("checkout: audio sin verificar o borrado impide crear o reservar un cobro", () => simular(async s => {
  for (const verificado of [false, true]) {
    s.pedido = copiar(fila); s.peticiones = [];
    Object.assign(s.pedido, {
      audio_ruta: fila.id + "/cancion.mp3", audio_nombre: "prueba.mp3", audio_bytes: 3,
      audio_consentimiento: true, audio_verificado_en: verificado ? new Date().toISOString() : null,
      audio_sha256: verificado ? "a".repeat(64) : null,
    });
    s.pedido.datos.audio = { src: "audio/cancion.mp3" };
    const respuesta = await crearPago(requestPedido());
    igual(respuesta.status, 409);
    igual((await respuesta.json()).error, verificado ? "audio_ausente" : "audio_sin_verificar");
    afirmar(!s.peticiones.some(p => p.url.includes("api.mercadopago.com")));
    afirmar(!s.peticiones.some(p => p.url.endsWith("eros_reservar_checkout") || p.url.endsWith("eros_guardar_checkout")));
    igual(s.preferencia, null); igual(s.registro.length, 0); igual(s.pedido.estado, "nuevo");
  }
}));
Deno.test("checkout: código solo, origen ajeno y límite no permiten iniciar un pago", () => simular(async s => {
  igual((await crearPago(requestPedido({ codigo: fila.codigo }))).status, 400);
  const ajeno = requestPedido(); ajeno.headers.set("origin", "https://ajeno.ejemplo.test"); igual((await crearPago(ajeno)).status, 403);
  s.limite = true; igual((await crearPago(requestPedido())).status, 429);
}));
Deno.test("checkout: pendiente consulta estado sin generar otra preferencia", () => simular(async s => {
  s.pagoEstado = "in_process"; const r = await crearPago(requestPedido()); igual(r.status, 409); igual((await r.json()).error, "pago_pendiente");
  afirmar(!s.peticiones.some(p => p.url.includes("api.mercadopago.com")));
}));
Deno.test("checkout: test rechaza cuenta real y producción rechaza vendedor ficticio", () => simular(async s => {
  s.vendedorPrueba = false; igual((await crearPago(requestPedido())).status, 503);
  Deno.env.set("MP_MODO", "produccion"); s.vendedorPrueba = true; igual((await crearPago(requestPedido())).status, 503);
}));
Deno.test("checkout: POST ambiguo queda incierto; conciliar no repite el POST", () => simular(async s => {
  s.fallaPOST = true; igual((await crearPago(requestPedido())).status, 502);
  afirmar(s.peticiones.some(p => p.url.endsWith("eros_fallar_checkout") && p.body.p_incierto === true));
  s.peticiones = []; s.accionReserva = "conciliar";
  igual((await crearPago(requestPedido())).status, 503);
  afirmar(!s.peticiones.some(p => p.url.endsWith("/checkout/preferences") && p.method === "POST"));
}));
Deno.test("webhook: firma inválida no consulta ni escribe la base", () => simular(async s => {
  const respuesta = await webhookMercadoPago(await requestWebhook(s, false));
  igual(respuesta.status, 401); igual(s.peticiones.length, 0);
  igual(respuesta.headers.get("Access-Control-Allow-Origin"), "https://eros.ejemplo.test");
}));
Deno.test("webhook: sólo API approved por total exacto publica; reenvío no duplica", () => simular(async s => {
  igual((await webhookMercadoPago(await requestWebhook(s))).status, 200); igual(s.registro.length, 1); igual(s.registro[0].p_total, 5000); igual(s.registro[0].p_dias, 1);
  const repetido = await webhookMercadoPago(await requestWebhook(s)); igual((await repetido.json()).accion, "repetido"); igual(s.registro.length, 1);
}));
Deno.test("webhook: un pago aprobado con audio inválido no se registra ni publica", () => simular(async s => {
  Object.assign(s.pedido, {
    audio_ruta: fila.id + "/cancion.mp3", audio_nombre: "prueba.mp3", audio_bytes: 3,
    audio_consentimiento: true, audio_verificado_en: new Date().toISOString(), audio_sha256: "a".repeat(64),
  });
  s.pedido.datos.audio = { src: "audio/cancion.mp3" }; s.audioRespuesta = "invalido";
  const respuesta = await webhookMercadoPago(await requestWebhook(s));
  igual(respuesta.status, 503); igual((await respuesta.json()).error, "audio_no_disponible");
  afirmar(s.peticiones.some(p => p.url.includes("/storage/v1/object/authenticated/audios/")));
  afirmar(!s.peticiones.some(p => p.url.endsWith("eros_registrar_pago") || p.url.endsWith("/functions/v1/avisar-admin")));
  igual(s.registro.length, 0); igual(s.pedido.estado, "nuevo"); igual(s.pedido.mp_payment_id, null);
}));
Deno.test("webhook: no acepta monto, moneda ni vendedor distintos", () => simular(async s => {
  for (const cambio of [{ transaction_amount: 1 }, { currency_id: "USD" }, { collector_id: 999 }]) {
    s.pago = cambio; igual((await webhookMercadoPago(await requestWebhook(s))).status, 200);
  }
  igual(s.registro.length, 0);
}));
Deno.test("webhook: status del cuerpo no aprueba pago pendiente de la API", () => simular(async s => {
  s.pago = { status: "pending" }; await webhookMercadoPago(await requestWebhook(s));
  igual(s.pedido.estado, "nuevo"); igual(s.registro[0].p_estado, "pending");
}));
Deno.test("webhook: pago publicado avisa solo id/tipo y un reenvío conserva publicación", () => simular(async s => {
  Deno.env.set("AVISOS_SECRETO", "a".repeat(64));
  igual((await webhookMercadoPago(await requestWebhook(s))).status, 200);
  igual(s.pedido.estado, "publicado"); igual(s.registro.length, 1);
  let avisos = s.peticiones.filter(p => p.url.endsWith("/functions/v1/avisar-admin"));
  igual(avisos.length, 1); igual(avisos[0].body, { pedido_id: fila.id, tipo: "pagado" });
  igual((await (await webhookMercadoPago(await requestWebhook(s))).json()).accion, "repetido");
  igual(s.registro.length, 1);
  avisos = s.peticiones.filter(p => p.url.endsWith("/functions/v1/avisar-admin")); igual(avisos.length, 2);
}));
Deno.test("webhook: un fallo de avisos no revierte el pago; pendiente no manda aviso", () => simular(async s => {
  Deno.env.set("AVISOS_SECRETO", "a".repeat(64)); s.fallaPOST = true;
  igual((await webhookMercadoPago(await requestWebhook(s))).status, 200); igual(s.pedido.estado, "publicado");
  s.pedido = copiar(fila); s.peticiones = []; s.pago = { status: "pending" };
  igual((await webhookMercadoPago(await requestWebhook(s))).status, 200);
  afirmar(!s.peticiones.some(p => p.url.endsWith("/functions/v1/avisar-admin")));
}));
Deno.test("seguimiento: sólo estado/código/slug/pago/link, sin contenido personal", () => simular(async s => {
  const salida = await (await estadoPedido(requestPedido({ slug: fila.slug }))).json();
  igual(Object.keys(salida).sort(), ["codigo", "estado", "link", "pago", "slug"]); igual(salida.link, null);
  s.pedido.estado = "publicado"; s.pedido.mp_payment_id = "123456";
  const publicado = await (await estadoPedido(requestPedido({ slug: fila.slug }))).json();
  igual(publicado.link, "https://eros.ejemplo.test/eros-web/p/?c=" + fila.slug);
  afirmar(!JSON.stringify(publicado).includes("privado"));
  s.pedido.vence_en = "2020-01-01T00:00:00Z";
  const vencido = await (await estadoPedido(requestPedido({ slug: fila.slug }))).json();
  igual(vencido.estado, "vencido"); igual(vencido.link, null);
}));
Deno.test("timeout: cubre también un cuerpo lento y respeta el límite total", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = ((_input: unknown, init: RequestInit) => Promise.resolve(new Response(new ReadableStream({
    start(controller) { init.signal?.addEventListener("abort", () => controller.error(new DOMException("cancelado", "AbortError"))); },
  })))) as typeof fetch;
  let fallo = false; const inicio = Date.now();
  try { await fetchConTiempo("https://simulado.ejemplo.test", {}, 8000, inicio + 50); } catch { fallo = true; }
  finally { globalThis.fetch = original; }
  afirmar(fallo); afirmar(Date.now() - inicio < 1000);
});
Deno.test("avisos de pago: waitUntil mantiene el trabajo sin demorar el webhook", async () => {
  const global = globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } };
  const previoRuntime = global.EdgeRuntime, previoFetch = globalThis.fetch;
  const env = { AVISOS_SECRETO: "a".repeat(64), SUPABASE_URL: "https://prueba.supabase.co" };
  const previos = Object.fromEntries(Object.keys(env).map(k => [k, Deno.env.get(k)]));
  let resolver!: (r: Response) => void, trabajo: Promise<unknown> | undefined;
  global.EdgeRuntime = { waitUntil(p) { trabajo = p; } };
  globalThis.fetch = (() => new Promise<Response>(r => { resolver = r; })) as typeof fetch;
  try {
    Object.entries(env).forEach(([k,v]) => Deno.env.set(k,v));
    await avisarPagoAdmin(fila.id); afirmar(trabajo); afirmar(resolver);
    resolver(new Response('{"ok":true}', { status: 200 })); await trabajo;
  } finally {
    globalThis.fetch = previoFetch;
    if (previoRuntime) global.EdgeRuntime = previoRuntime; else delete global.EdgeRuntime;
    for (const [k,v] of Object.entries(previos)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k,v); }
  }
});
