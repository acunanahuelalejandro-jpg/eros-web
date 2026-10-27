// Pruebas locales: ni fetch ni el proveedor Push salen a la red. Todas las claves se generan para esta ejecución.
import { createECDH, randomBytes } from "node:crypto";
import webpush from "npm:web-push@3.6.7";
import { configurarVapid, payloadAviso, validarSuscripcionPush, type EnviarPush, type OpcionesPush, type SuscripcionPush } from "../functions/_compartido/push.ts";

const serveOriginal = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: () => ({}) });
const { crearManejadorAvisos } = await import("../functions/avisar-admin/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: serveOriginal });

function afirmar(valor: unknown, mensaje = "No se cumplió la condición"): asserts valor { if (!valor) throw new Error(mensaje); }
function igual(actual: unknown, esperado: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(esperado)) throw new Error("Se esperaba " + JSON.stringify(esperado) + ", llegó " + JSON.stringify(actual));
}
const copiar = <T>(valor: T): T => structuredClone(valor);
const pedidoId = "11111111-1111-4111-8111-111111111111";
const subId = "22222222-2222-4222-8222-222222222222";
const secretoLocal = "a".repeat(64);
const minimo = { codigo: "TES234", modelo: "carta-para-vos", duracion: "1 día", total: 5000 };
type Registro = { id: string; endpoint: string; suscripcion: { endpoint: string; keys: { p256dh: string; auth: string } } };
type Consulta = { ruta: string; metodo: string; body: Record<string, unknown> };
type Entrega = { sub: SuscripcionPush; payload: Record<string, unknown>; opciones: OpcionesPush };
type Simulado = {
  consultas: Consulta[]; envios: Entrega[]; logs: unknown[][]; suscripciones: Registro[];
  finales: Record<string, unknown>[]; eventos: Map<string, { audiencia: string[]; enviados: Set<string> }>;
  limite: boolean; valido: boolean; fallaBD: boolean; fallaFinal: boolean;
  pedido: Record<string, unknown>; fallos: Map<string, number | Error>; handler: ReturnType<typeof crearManejadorAvisos>;
};

function parLocal() {
  const par = createECDH("prime256v1"); par.generateKeys();
  return { publicKey: par.getPublicKey().toString("base64url"), privateKey: par.getPrivateKey().toString("base64url") };
}
function registroLocal(endpoint = "https://fcm.googleapis.com/fcm/send/dispositivo-ficticio", id = subId): Registro {
  const par = parLocal();
  return { id, endpoint, suscripcion: { endpoint, keys: { p256dh: par.publicKey, auth: randomBytes(16).toString("base64url") } } };
}
const json = (valor: unknown, status = 200) => new Response(JSON.stringify(valor), { status, headers: { "Content-Type": "application/json" } });
function request(body: unknown = { pedido_id: pedidoId, tipo: "nuevo" }, secreto: string | null = secretoLocal, method = "POST") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secreto !== null) headers.set("x-eros-aviso", secreto);
  return new Request("https://prueba.supabase.co/functions/v1/avisar-admin", { method, headers, body: method === "GET" ? undefined : JSON.stringify(body) });
}

async function simular(probar: (s: Simulado) => Promise<void>) {
  const par = parLocal();
  const env: Record<string, string> = { AVISOS_SECRETO: secretoLocal, VAPID_PUBLIC_KEY: par.publicKey, VAPID_PRIVATE_KEY: par.privateKey,
    EROS_SITE_URL: "https://tienda.ejemplo.test/eros-web/", SUPABASE_URL: "https://prueba.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"servidor-ficticio-local"}' };
  const anteriores = Object.fromEntries(Object.keys(env).map(k => [k, Deno.env.get(k)]));
  const fetchOriginal = globalThis.fetch, logOriginal = console.error;
  const s: Simulado = { consultas: [], envios: [], logs: [], suscripciones: [registroLocal()], finales: [], eventos: new Map(),
    limite: false, valido: true, fallaBD: false, fallaFinal: false, pedido: copiar(minimo), fallos: new Map(), handler: null as unknown as ReturnType<typeof crearManejadorAvisos> };
  Object.entries(env).forEach(([k, v]) => Deno.env.set(k, v));
  console.error = (...args: unknown[]) => { s.logs.push(args); };
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const metodo = init?.method || "GET", body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    s.consultas.push({ ruta: url.pathname + url.search, metodo, body });
    if (url.origin !== "https://prueba.supabase.co") throw new Error("El test bloqueó una conexión no simulada");
    if (s.fallaBD) return Promise.resolve(json({ error: "fallo local, no reflejar" }, 500));
    const rpc = url.pathname.split("/").at(-1);
    if (rpc === "eros_limitar_cobro") return Promise.resolve(json({ permitido: !s.limite }));
    if (rpc === "eros_suscripciones_push") return Promise.resolve(json(s.suscripciones));
    if (rpc === "eros_reclamar_avisos") {
      if (!s.valido) return Promise.resolve(json({ valido: false }));
      const key = String(body.p_tipo) + ":" + String(body.p_pedido_id);
      const repetido = s.eventos.has(key);
      if (!repetido) s.eventos.set(key, { audiencia: s.suscripciones.map(row => row.id), enviados: new Set() });
      const evento = s.eventos.get(key)!;
      const entregas = s.suscripciones.filter(row => evento.audiencia.includes(row.id) && !evento.enviados.has(row.id));
      return Promise.resolve(json({ valido: true, repetido, sin_dispositivos: evento.audiencia.length === 0,
        pedido: s.pedido, entregas, pendientes: entregas.length > 0 }));
    }
    if (rpc === "eros_finalizar_entrega_aviso") {
      s.finales.push(body);
      if (s.fallaFinal) return Promise.resolve(json({ guardado: false }));
      const key = String(body.p_tipo) + ":" + String(body.p_pedido_id), evento = s.eventos.get(key);
      if (body.p_resultado === "enviado") evento?.enviados.add(String(body.p_suscripcion_id));
      if (body.p_resultado === "descartado") s.suscripciones = s.suscripciones.filter(row => row.id !== body.p_suscripcion_id);
      return Promise.resolve(json({ guardado: true }));
    }
    if (rpc === "eros_cerrar_aviso") {
      const evento = s.eventos.get(String(body.p_tipo) + ":" + String(body.p_pedido_id));
      return Promise.resolve(json({ pendientes: !!evento && s.suscripciones.some(row => evento.audiencia.includes(row.id) && !evento.enviados.has(row.id)) }));
    }
    if (url.pathname === "/rest/v1/admin_push_subscriptions" && metodo === "DELETE") {
      const id = (url.searchParams.get("id") || "").replace(/^eq\./, "");
      s.suscripciones = s.suscripciones.filter(row => row.id !== id);
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    throw new Error("Ruta local sin simular");
  }) as typeof fetch;
  const enviarFake: EnviarPush = async (sub, texto, opciones) => {
    s.envios.push({ sub: copiar(sub), payload: JSON.parse(texto), opciones: copiar(opciones) });
    const fallo = s.fallos.get(sub.endpoint);
    if (fallo instanceof Error) throw fallo;
    if (fallo) throw { statusCode: fallo, endpoint: sub.endpoint, body: "No registrar endpoint, claves o detalles" };
    return { statusCode: 201 };
  };
  s.handler = crearManejadorAvisos(enviarFake);
  try { await probar(s); }
  finally {
    globalThis.fetch = fetchOriginal; console.error = logOriginal;
    for (const [k, v] of Object.entries(anteriores)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  }
}

Deno.test("avisos: sin secreto correcto no consulta BD ni envía Push", () => simular(async s => {
  for (const secreto of [null, "incorrecto", "b".repeat(64), secretoLocal + "x"]) {
    igual((await s.handler(request({ prueba: true }, secreto))).status, 401);
  }
  igual((await s.handler(request({}, secretoLocal, "GET"))).status, 405);
  Deno.env.delete("AVISOS_SECRETO"); igual((await s.handler(request())).status, 503);
  igual(s.consultas.length, 0); igual(s.envios.length, 0);
}));

Deno.test("avisos: prueba limitada, audiencia del RPC admin y payload de prueba sin datos personales", () => simular(async s => {
  const r = await s.handler(request({ prueba: true, codigo: "OTR234", para_quien: "Nombre que debe ignorarse", datos: { texto: "Texto privado" } }));
  igual(r.status, 200); igual((await r.json()).enviados, 1);
  const limite = s.consultas.find(c => c.ruta.endsWith("eros_limitar_cobro")); afirmar(limite);
  igual(limite.body.p_limite, 5); igual(limite.body.p_segundos, 3600); afirmar(/^[a-f0-9]{64}$/.test(String(limite.body.p_clave)));
  afirmar(s.consultas.some(c => c.ruta.endsWith("eros_suscripciones_push")));
  afirmar(s.consultas.every(c => !c.ruta.includes("/auth/") && !c.ruta.includes("/pedidos")));
  const payload = s.envios[0].payload; igual(Object.keys(payload).sort(), ["evento", "tipo", "version"]);
  igual(payload.version, 1); igual(payload.tipo, "prueba"); afirmar(/^prueba:[a-f0-9-]{36}$/.test(String(payload.evento)));
  afirmar(!JSON.stringify(payload).includes("privado")); igual(s.finales.length, 0);
}));

Deno.test("avisos: modo prueba respeta límite y audiencia vacía", () => simular(async s => {
  s.limite = true; const bloqueado = await s.handler(request({ prueba: true })); igual(bloqueado.status, 429);
  igual((await bloqueado.json()).error, "limite_pruebas"); igual(s.envios.length, 0);
  afirmar(!s.consultas.some(c => c.ruta.endsWith("eros_suscripciones_push")));
  s.limite = false; s.suscripciones = [];
  const vacio = await s.handler(request({ prueba: true })); igual(vacio.status, 200); igual((await vacio.json()).sin_dispositivos, true); igual(s.envios.length, 0);
}));

Deno.test("avisos: Webhook toma solo record.id; recarga las etiquetas mínimas por RPC", () => simular(async s => {
  const r = await s.handler(request({ type: "INSERT", schema: "public", table: "pedidos", record: {
    id: pedidoId.toUpperCase(), codigo: "MAL234", modelo: "Inyectado", duracion: "mil años", total: 1,
    para_quien: "Nombre privado", whatsapp_cliente: "5491100000000", datos: { carta: "Texto privado" }, fotos: ["privada.jpg"] } }));
  igual(r.status, 200); igual((await r.json()).enviados, 1);
  const claim = s.consultas.find(c => c.ruta.endsWith("eros_reclamar_avisos")); afirmar(claim);
  igual(claim.body.p_pedido_id, pedidoId); igual(claim.body.p_tipo, "nuevo");
  igual(Object.keys(claim.body).sort(), ["p_pedido_id", "p_reserva", "p_tipo"]);
  igual(s.envios[0].payload, { version: 1, tipo: "nuevo", codigo: "TES234", modelo: "Carta para vos", duracion: "1 día", total: 5000, evento: "nuevo:" + pedidoId });
  const texto = JSON.stringify(s.envios[0].payload); for (const privado of ["Nombre", "Texto", "whatsapp", "privada.jpg", "MAL234", "Inyectado"]) afirmar(!texto.includes(privado));
  igual(s.envios[0].opciones.TTL, 300); igual(s.envios[0].opciones.urgency, "high");
  afirmar(/^[a-f0-9]{32}$/.test(s.envios[0].opciones.topic)); afirmar(s.envios[0].opciones.timeout <= 5000);
  igual(s.finales[0].p_resultado, "enviado"); afirmar(s.consultas.some(c => c.ruta.endsWith("eros_cerrar_aviso")));
}));

Deno.test("avisos: eventos nuevo y pagado separados; la repetición no agrega otra audiencia", () => simular(async s => {
  igual((await s.handler(request())).status, 200); igual(s.envios.length, 1);
  s.suscripciones.push(registroLocal("https://updates.push.services.mozilla.com/wpush/v2/otro", "33333333-3333-4333-8333-333333333333"));
  const repetido = await s.handler(request()); igual(repetido.status, 200); igual((await repetido.json()).repetido, true); igual(s.envios.length, 1);
  const pagado = await s.handler(request({ pedido_id: pedidoId, tipo: "pagado" })); igual(pagado.status, 200); igual((await pagado.json()).enviados, 2);
  igual(s.envios.length, 3); afirmar(s.envios.slice(1).every(e => e.payload.evento === "pagado:" + pedidoId && e.payload.tipo === "pagado"));
  const otraVez = await s.handler(request({ pedido_id: pedidoId, tipo: "pagado" })); igual((await otraVez.json()).repetido, true); igual(s.envios.length, 3);
}));

Deno.test("avisos: validación de evento y pedido omitido sin envío", () => simular(async s => {
  for (const body of [{ pedido_id: "cualquiera", tipo: "nuevo" }, { pedido_id: pedidoId, tipo: "otro" }, { type: "INSERT", schema: "public", table: "pedidos", record: { id: "malo" } }, { type: "INSERT", schema: "otra", table: "pedidos", record: { id: pedidoId } }]) igual((await s.handler(request(body))).status, 400);
  igual(s.consultas.length, 0); s.valido = false;
  const r = await s.handler(request()); igual(r.status, 200); igual((await r.json()).omitido, true); igual(s.envios.length, 0);
}));

Deno.test("avisos: 404 y 410 descartan el dispositivo; 429 conserva para reintentar sin filtrar endpoint", () => simular(async s => {
  s.suscripciones = [registroLocal("https://fcm.googleapis.com/fcm/send/caducado404"), registroLocal("https://updates.push.services.mozilla.com/wpush/v2/caducado410", "33333333-3333-4333-8333-333333333333"), registroLocal("https://web.push.apple.com/limite429", "44444444-4444-4444-8444-444444444444")];
  s.suscripciones.forEach((sub, i) => s.fallos.set(sub.endpoint, [404, 410, 429][i]));
  const r = await s.handler(request()); igual(r.status, 207); const salida = await r.json(); igual(salida.descartados, 2); igual(salida.fallidos, 1); igual(salida.pendientes, true);
  igual(s.suscripciones.length, 1); afirmar(s.suscripciones[0].endpoint.endsWith("limite429"));
  igual(s.finales.map(f => f.p_resultado).sort(), ["descartado", "descartado", "reintentar"]);
  const logs = JSON.stringify(s.logs); afirmar(!logs.includes("https:") && !logs.includes("endpoint") && !logs.includes("keys"));
  afirmar(s.logs.every(log => log[0] === "push_http" && log.length === 2 && [404, 410, 429].includes(Number(log[1]))));
  afirmar(!JSON.stringify(salida).includes("limite429"));
}));

Deno.test("avisos: prueba elimina 410 por REST pero conserva 429", () => simular(async s => {
  s.fallos.set(s.suscripciones[0].endpoint, 410);
  const r = await s.handler(request({ prueba: true })); igual(r.status, 200); igual((await r.json()).descartados, 1); igual(s.suscripciones.length, 0);
  afirmar(s.consultas.some(c => c.metodo === "DELETE" && c.ruta.includes("admin_push_subscriptions?id=eq." + subId)));
  s.suscripciones = [registroLocal()]; s.fallos.set(s.suscripciones[0].endpoint, 429);
  igual((await s.handler(request({ prueba: true }))).status, 207); igual(s.suscripciones.length, 1);
}));

Deno.test("avisos: registro SSRF o con claves inválidas se descarta antes del proveedor", () => simular(async s => {
  s.suscripciones = [registroLocal("https://127.0.0.1/privado"), registroLocal("https://fcm.googleapis.com.ejemplo.test/robar", "33333333-3333-4333-8333-333333333333"), registroLocal("https://fcm.googleapis.com/fcm/send/sin-clave", "44444444-4444-4444-8444-444444444444")];
  s.suscripciones[2].suscripcion.keys.p256dh = "invalida";
  const r = await s.handler(request()); igual(r.status, 200); igual((await r.json()).descartados, 3); igual(s.envios.length, 0); igual(s.suscripciones.length, 0);
}));

Deno.test("avisos: falla de BD o del proveedor responde sin secretos ni errores completos", () => simular(async s => {
  s.fallaBD = true; const bd = await s.handler(request()); igual(bd.status, 503); igual(s.envios.length, 0);
  afirmar(!JSON.stringify(await bd.json()).includes("fallo local"));
  s.fallaBD = false;
  s.fallos.set(s.suscripciones[0].endpoint, new Error("privado: " + s.suscripciones[0].endpoint + " auth=" + s.suscripciones[0].suscripcion.keys.auth));
  const proveedor = await s.handler(request()); igual(proveedor.status, 207);
  const salida = JSON.stringify(await proveedor.json()) + JSON.stringify(s.logs);
  for (const secreto of [s.suscripciones[0].endpoint, s.suscripciones[0].suscripcion.keys.auth, secretoLocal, Deno.env.get("VAPID_PRIVATE_KEY")!]) afirmar(!salida.includes(secreto));
  afirmar(s.logs.some(log => log[0] === "push_http" && log[1] === null));
}));

Deno.test("avisos: confirmar entrega requiere guardado en BD; no informa éxito si falla", () => simular(async s => {
  s.fallaFinal = true; const r = await s.handler(request()); igual(r.status, 207); const body = await r.json(); igual(body.ok, false); igual(body.enviados, 0); igual(body.pendientes, true);
  afirmar(s.consultas.some(c => c.ruta.endsWith("eros_cerrar_aviso"))); afirmar(s.envios.length === 1);
}));

Deno.test("Push: valida hosts oficiales Chrome, Firefox, Safari y Windows sin aceptar SSRF", () => {
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://web.push.apple.com/abc", "https://wns2-db5p.notify.windows.com/w/?token=abc"]) afirmar(validarSuscripcionPush(registroLocal(endpoint)), "Proveedor oficial rechazado");
  for (const endpoint of ["http://fcm.googleapis.com/fcm/send/abc", "https://127.0.0.1/a", "https://localhost/a", "https://fcm.googleapis.com.ejemplo.test/a", "https://updates.push.services.mozilla.com.ejemplo.test/a", "https://otro.web.push.apple.com/a", "https://usuario:pass@fcm.googleapis.com/a", "https://fcm.googleapis.com:8443/a", "https://fcm.googleapis.com/a#fragmento", "https://fcm.googleapis.com/"]) igual(validarSuscripcionPush(registroLocal(endpoint)), null);
});

Deno.test("Push: endpoint coincidente y claves criptográficas válidas son obligatorios", () => {
  const mismatch = registroLocal(); mismatch.suscripcion.endpoint += "-otro"; igual(validarSuscripcionPush(mismatch), null);
  const corto = registroLocal(); corto.suscripcion.keys.auth = "A".repeat(21); igual(validarSuscripcionPush(corto), null);
  const largo = registroLocal(); largo.suscripcion.keys.auth = "A".repeat(23); igual(validarSuscripcionPush(largo), null);
  const punto = registroLocal(); punto.suscripcion.keys.p256dh = "B" + "A".repeat(86); igual(validarSuscripcionPush(punto), null);
  igual(validarSuscripcionPush(null), null); igual(validarSuscripcionPush({ endpoint: "https://fcm.googleapis.com/a", suscripcion: { keys: {} } }), null);
});

Deno.test("Push: payload contiene solo etiquetas permitidas, código, evento y total", () => {
  const row = { ...minimo, para_quien: "Privado", de_parte: "Privado", datos: { texto: "Privado" }, whatsapp_cliente: "5491100000000", musica: "Privado", fotos: ["privado.jpg"] };
  igual(payloadAviso(row, "pagado", pedidoId), { version: 1, tipo: "pagado", codigo: "TES234", modelo: "Carta para vos", duracion: "1 día", total: 5000, evento: "pagado:" + pedidoId });
  for (const cambio of [{ codigo: "corto" }, { codigo: "abcdef" }, { modelo: "inventado" }, { duracion: "2 meses" }, { total: 0 }, { total: -1 }, { total: 100001 }, { total: 5000.1 }, { total: "5000" }]) igual(payloadAviso({ ...row, ...cambio }, "nuevo", pedidoId), null);
  afirmar(payloadAviso({ codigo: "ABC234", modelo: "Álbum de recuerdos", duracion: "month", total: 29000 }, "nuevo", pedidoId));
});

Deno.test("VAPID: el par público/privado debe coincidir y nunca se devuelve al fallar", () => simular(async s => {
  const correcto = configurarVapid(); afirmar(correcto.subject.endsWith("/eros-web/admin/"));
  Deno.env.set("VAPID_PUBLIC_KEY", parLocal().publicKey);
  let codigo = ""; try { configurarVapid(); } catch (error) { codigo = error && typeof error === "object" && "codigo" in error ? String(error.codigo) : "otro"; }
  igual(codigo, "configuracion_vapid");
  const r = await s.handler(request({ prueba: true })); igual(r.status, 503); igual(s.envios.length, 0); igual(s.consultas.length, 0);
  const salida = JSON.stringify(await r.json()) + JSON.stringify(s.logs);
  afirmar(!salida.includes(Deno.env.get("VAPID_PRIVATE_KEY")!)); afirmar(!salida.includes(Deno.env.get("VAPID_PUBLIC_KEY")!));
}));

Deno.test("Web Push real: genera POST cifrado y firma VAPID compatibles sin contactar al proveedor", () => simular(async s => {
  const sub = validarSuscripcionPush(s.suscripciones[0]); afirmar(sub);
  const payload = JSON.stringify(payloadAviso(minimo, "nuevo", pedidoId));
  const opciones = { vapidDetails: configurarVapid(), TTL: 300, urgency: "high", topic: "a".repeat(32) };
  const primera = webpush.generateRequestDetails(sub, payload, opciones);
  const segunda = webpush.generateRequestDetails(sub, payload, opciones);
  igual(primera.endpoint, sub.endpoint); igual(primera.method, "POST");
  const headers = new Headers(primera.headers);
  igual(headers.get("Content-Encoding"), "aes128gcm"); igual(headers.get("TTL"), "300"); igual(headers.get("Urgency"), "high");
  afirmar(headers.get("Authorization")?.startsWith("vapid "));
  afirmar(primera.body && primera.body.byteLength > new TextEncoder().encode(payload).length);
  afirmar(!primera.body.includes(payload)); afirmar(!primera.body.equals(segunda.body));
  igual(s.consultas.length, 0); igual(s.envios.length, 0);
}));
