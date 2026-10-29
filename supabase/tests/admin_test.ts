// Pruebas locales: Auth y PostgREST están simulados; no se opera sobre pedidos reales.
const serveAnterior = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: () => ({}) });
const { administrarPedido } = await import("../functions/administrar-pedido/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: serveAnterior });

function igual(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Valores distintos: " + JSON.stringify(a) + " / " + JSON.stringify(b)); }
function afirmar(v: unknown): asserts v { if (!v) throw new Error("No se cumplió la condición"); }
const id = "11111111-1111-4111-8111-111111111111", admin = "22222222-2222-4222-8222-222222222222";
const solicitud = "33333333-3333-4333-8333-333333333333";
const pedidoBase = { id, codigo: "TES234", estado: "nuevo", modelo: "carta-para-vos", duracion: "1 día", extras: { juego: "", sobre: true, contador: {} },
  datos: { version: 2, para: "Nombre privado", carta: { titulo: "Texto privado" }, extras: { juego: "", sobre: true, contador: {} } },
  total: 5000, activar_el: null, fotos_cantidad: 0, mp_payment_id: null, mp_preference_id: null,
  pagado_en: null as string | null, publicado_en: null as string | null, vence_en: null as string | null,
  limpiado_en: null as string | null, limpieza_intentada_en: null as string | null, pago_manual_en: null, audio_ruta:null as string|null, audio_nombre:null as string|null, audio_bytes:null as number|null, audio_duracion:null as number|null, audio_consentimiento:false, audio_verificado_en:null as string|null, audio_sha256:null as string|null };
const revision = (p: typeof pedidoBase) => ({ modelo: p.modelo, duracion: p.duracion, extras: p.extras, total: p.total, activar_el: p.activar_el,
  estado: p.estado, pagado_en: p.pagado_en, publicado_en: p.publicado_en, vence_en: p.vence_en });
type Simulado = { pedido: typeof pedidoBase; authStatus: number; esAdmin: boolean; limite: boolean; audioEstado:number; previa: Record<string, unknown>; consultas: { path: string; body: Record<string, unknown> }[]; resultado: Record<string, unknown> };
async function simular(probar: (s: Simulado) => Promise<void>) {
  const env = { SUPABASE_URL: "https://prueba.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"servidor-ficticio"}', EROS_SITE_URL: "https://tienda.ejemplo.test/eros-web/", MP_MODO: "test", AVISOS_SECRETO: "" };
  const anterior = Object.fromEntries(Object.keys(env).map(k => [k, Deno.env.get(k)])), fetchAnterior = globalThis.fetch;
  Object.entries(env).forEach(([k,v]) => Deno.env.set(k,v));
  const s: Simulado = { pedido: structuredClone(pedidoBase), authStatus: 200, esAdmin: true, limite: false, audioEstado:404, previa: { encontrada: false }, consultas: [], resultado: { ok: true, repetido: false, pedido: { id, codigo: "TES234", estado: "publicado" } } };
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input)), body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    afirmar(u.origin === "https://prueba.supabase.co"); s.consultas.push({ path: u.pathname, body });
    if (u.pathname === "/storage/v1/object/authenticated/audios/" + id + "/cancion.mp3") return Promise.resolve(new Response(null,{status:s.audioEstado}));
    let valor: unknown;
    if (u.pathname === "/auth/v1/user") {
      igual(new Headers(init?.headers).get("Authorization"), "Bearer sesion-ficticia-local");
      valor = s.authStatus === 200 ? { id: admin, app_metadata: { eros_admin: s.esAdmin }, user_metadata: { eros_admin: true } } : { message: "No reflejar este error" };
    } else if (u.pathname === "/rest/v1/pedidos") valor = [s.pedido];
    else if (u.pathname.endsWith("eros_admin_buscar_accion")) valor = s.previa;
    else if (u.pathname.endsWith("eros_limitar_cobro")) valor = { permitido: !s.limite };
    else if (u.pathname.endsWith("eros_admin_accion")) valor = s.resultado;
    else throw new Error("Ruta no simulada");
    return Promise.resolve(new Response(JSON.stringify(valor), { status: u.pathname === "/auth/v1/user" ? s.authStatus : 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;
  try { await probar(s); } finally { globalThis.fetch = fetchAnterior; for (const [k,v] of Object.entries(anterior)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k,v); } }
}
function req(s: Simulado, cambios: Record<string, unknown> = {}, autorizado = true) {
  return new Request("https://prueba.supabase.co/functions/v1/administrar-pedido", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://tienda.ejemplo.test", ...(autorizado ? { Authorization: "Bearer sesion-ficticia-local" } : {}) },
    body: JSON.stringify({ pedido_id: id, codigo: s.pedido.codigo, accion: "pago-manual", solicitud_id: solicitud, revision: revision(s.pedido), ...cambios }) });
}
Deno.test("panel: OPTIONS termina antes de Auth o BD; otro origen no se admite", () => simular(async s => {
  const r = await administrarPedido(new Request("https://prueba.supabase.co/functions/v1/administrar-pedido", { method: "OPTIONS", headers: { Origin: "https://tienda.ejemplo.test" } }));
  igual(r.status, 204); igual(r.headers.get("Access-Control-Allow-Origin"), "https://tienda.ejemplo.test"); igual(s.consultas.length, 0);
  const otra = req(s); otra.headers.set("Origin", "https://ajeno.ejemplo.test"); igual((await administrarPedido(otra)).status, 403); igual(s.consultas.length, 0);
}));
Deno.test("panel: exige sesión verificada y app_metadata admin, nunca user_metadata", () => simular(async s => {
  igual((await administrarPedido(req(s, {}, false))).status, 401); igual(s.consultas.length, 0);
  s.authStatus = 401; igual((await administrarPedido(req(s))).status, 401);
  s.authStatus = 200; s.esAdmin = false; igual((await administrarPedido(req(s))).status, 403);
  afirmar(s.consultas.every(c => c.path === "/auth/v1/user"));
}));
Deno.test("panel: transmite acción con admin verificado, snapshot y total recalculado", () => simular(async s => {
  const r = await administrarPedido(req(s)); igual(r.status, 200);
  const accion = s.consultas.find(c => c.path.endsWith("eros_admin_accion")); afirmar(accion);
  igual(accion.body.p_admin_id, admin); igual(accion.body.p_solicitud_id, solicitud); igual(accion.body.p_total_esperado, 5000);
  afirmar(/^[a-f0-9]{64}$/.test(String(accion.body.p_huella)));
  const salida = JSON.stringify(await r.json()); afirmar(!salida.includes("privado") && !salida.includes("servidor-ficticio"));
}));
Deno.test("panel: total alterado o extras inconsistentes bloquean publicación", () => simular(async s => {
  s.pedido.total = 1; igual((await administrarPedido(req(s))).status, 409);
  s.pedido = structuredClone(pedidoBase); s.pedido.datos.extras.juego = "laberinto";
  igual((await administrarPedido(req(s))).status, 409); afirmar(!s.consultas.some(c => c.path.endsWith("eros_admin_accion")));
}));
Deno.test("panel: una revisión vieja no pisa cambios posteriores", () => simular(async s => {
  const r = req(s); s.pedido.total = 8000; s.pedido.duracion = "1 semana";
  igual((await administrarPedido(r)).status, 409); afirmar(!s.consultas.some(c => c.path.endsWith("eros_admin_accion")));
}));
Deno.test("panel: valida acciones, UUID, código y fechas de extensión", () => simular(async s => {
  for (const cambio of [{ accion: "inventada" }, { pedido_id: "malo" }, { solicitud_id: "malo" }, { codigo: "otro" }, { accion: "extender", vence_en: "no-es-fecha" }, { accion: "extender", vence_en: "2000-01-01T00:00:00Z" }, { accion: "extender", vence_en: "2027-02-30T20:00:00-03:00" }, { preparar_borrado: true }]) igual((await administrarPedido(req(s, cambio))).status, 400);
  afirmar(!s.consultas.some(c => c.path.endsWith("eros_admin_accion")));
}));
Deno.test("panel: no restaura contenido vacío, limpiado o parcialmente borrado", () => simular(async s => {
  for (const field of ["limpiado_en", "limpieza_intentada_en"] as const) {
    s.pedido = structuredClone(pedidoBase); s.pedido[field] = new Date().toISOString();
    igual((await administrarPedido(req(s))).status, 409);
  }
  s.pedido = structuredClone(pedidoBase); s.pedido.datos = {} as typeof s.pedido.datos;
  igual((await administrarPedido(req(s))).status, 409);
  afirmar(!s.consultas.some(c => c.path.endsWith("eros_admin_accion")));
}));
Deno.test("panel: anular puede cerrar un pedido aunque su total no coincida", () => simular(async s => {
  s.pedido.total = 1; igual((await administrarPedido(req(s, { accion: "anular" }))).status, 200);
  const accion = s.consultas.find(c => c.path.endsWith("eros_admin_accion")); afirmar(accion); igual(accion.body.p_accion, "anular");
}));
Deno.test("panel: conserva UUID para reintentos y comunica conflicto transaccional", () => simular(async s => {
  s.resultado = { ok: true, repetido: true, pedido: { id, estado: "publicado" } };
  igual((await (await administrarPedido(req(s))).json()).repetido, true);
  s.resultado = { ok: false, error: "cambio" }; const r = await administrarPedido(req(s)); igual(r.status, 409); igual((await r.json()).error, "cambio");
}));
Deno.test("panel: recupera una acción confirmada aunque después se haya limpiado el pedido", () => simular(async s => {
  const peticion = req(s); s.pedido.estado = "vencido"; s.pedido.limpiado_en = new Date().toISOString(); s.pedido.datos = {} as typeof s.pedido.datos;
  s.previa = { encontrada: true, ok: true, repetido: true, pedido: { id, codigo: "TES234", estado: "vencido", para_quien: "No devolver", datos: { privado: true } } };
  const respuesta = await administrarPedido(peticion); igual(respuesta.status, 200); const salida = await respuesta.json(); igual(salida.repetido, true); igual(salida.pedido.estado, "vencido");
  afirmar(!JSON.stringify(salida).includes("No devolver") && !JSON.stringify(salida).includes("privado"));
  afirmar(!s.consultas.some(c => c.path === "/rest/v1/pedidos" || c.path.endsWith("eros_admin_accion")));
}));
Deno.test("panel: el borrado manual se marca en servidor antes de permitir tocar Storage", () => simular(async s => {
  const r = await administrarPedido(req(s, { accion: "anular", preparar_borrado: true })); igual(r.status, 200);
  const accion = s.consultas.find(c => c.path.endsWith("eros_admin_accion")); afirmar(accion); igual(accion.body.p_preparar_borrado, true);
  afirmar(!s.consultas.some(c => c.path.startsWith("/storage/")));
}));
Deno.test("panel: limita acciones por admin antes de consultar o modificar un pedido", () => simular(async s => {
  s.limite = true; const r = await administrarPedido(req(s)); igual(r.status, 429);
  afirmar(!s.consultas.some(c => c.path === "/rest/v1/pedidos" || c.path.endsWith("eros_admin_accion")));
}));

Deno.test("panel: audio borrado bloquea pago manual, republicar y extender; anular sigue permitido", () => simular(async s => {
  Object.assign(s.pedido,{audio_ruta:id+"/cancion.mp3",audio_nombre:"cancion.mp3",audio_bytes:1251,audio_duracion:.078,audio_consentimiento:true,audio_verificado_en:new Date().toISOString(),audio_sha256:"a".repeat(64)});
  for (const accion of ["pago-manual","republicar","extender"]) {
    const r = await administrarPedido(req(s,{accion,...(accion === "extender" ? {vence_en:new Date(Date.now()+86400000).toISOString()} : {})}));
    igual(r.status,409); igual((await r.json()).error,"audio_ausente");
  }
  afirmar(!s.consultas.some(c=>c.path.endsWith("eros_admin_accion")));
  igual((await administrarPedido(req(s,{accion:"anular"}))).status,200);
  igual(s.consultas.filter(c=>c.path.endsWith("eros_admin_accion")).length,1);
}));
Deno.test("panel: no publica audio sin consentimiento o validación del servidor", () => simular(async s => {
  Object.assign(s.pedido,{audio_ruta:id+"/cancion.mp3",audio_nombre:"cancion.mp3",audio_bytes:1251,audio_duracion:.078,audio_consentimiento:false});
  igual((await administrarPedido(req(s))).status,409);
  s.pedido.audio_consentimiento = true;
  const r = await administrarPedido(req(s)); igual(r.status,409); igual((await r.json()).error,"audio_sin_verificar");
  afirmar(!s.consultas.some(c=>c.path.startsWith("/storage/") || c.path.endsWith("eros_admin_accion")));
}));
