// Pruebas con Storage y base simulados: no se borra ningún pedido ni archivo real.
const serveLimpiezaOriginal = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: () => ({}) });
const { limpiarVencidos } = await import("../functions/limpiar-vencidos/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: serveLimpiezaOriginal });

function igualLimpieza(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("Resultado distinto: " + JSON.stringify(a) + " / " + JSON.stringify(b)); }
function afirmarLimpieza(v: unknown) { if (!v) throw new Error("No se cumplió una garantía de la limpieza."); }
const secretoLocal = "a".repeat(64);
const idVencido = "00000000-0000-4000-8000-000000000001";
const idVigente = "00000000-0000-4000-8000-000000000002";
type FilaLimpieza = {
  id: string; estado: string; limpiado_en: string | null; token: string | null;
  vence_en: string; datos: Record<string, unknown>; para_quien: string;
  total: number; mp_payment_id: string; mp_preference_id: string; audio_ruta?: string | null;
};
type SimularLimpieza = {
  filas: FilaLimpieza[]; archivos: Set<string>; audios: Set<string>; borrados: string[]; errorBorrarAudio: boolean;
  llamadas: { ruta: string; body: Record<string, unknown> }[];
  logs: unknown[][]; validar: boolean; errorListar: boolean; errorBorrar: boolean;
  errorFinalizar: boolean; sinEfecto: boolean; nombreInvalido: boolean; loteInvalido: boolean;
  finalizados: number; falloClaim: boolean;
};
function nuevaFilaLimpieza(id: string, vencido: boolean): FilaLimpieza {
  return { id, estado: "publicado", limpiado_en: null, token: null,
    vence_en: new Date(Date.now() + (vencido ? -60000 : 3600000)).toISOString(),
    datos: { carta: "TEXTO_PRIVADO" }, para_quien: "NOMBRE_PRIVADO", total: 8000,
    mp_payment_id: "123456", mp_preference_id: "123-preferencia" };
}
const puedeLimpiarse = (f: FilaLimpieza) => !f.limpiado_en && (f.estado === "vencido" || f.estado === "publicado" && Date.parse(f.vence_en) <= Date.now());

async function simularLimpieza(prueba: (s: SimularLimpieza) => Promise<void>) {
  const env = { LIMPIEZA_SECRETO: secretoLocal, SUPABASE_URL: "https://prueba.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"clave-ficticia-local"}' };
  const previo = Object.fromEntries(Object.keys(env).map(k => [k, Deno.env.get(k)]));
  Object.entries(env).forEach(([k, v]) => Deno.env.set(k, v));
  const fetchOriginal = globalThis.fetch, errorOriginal = console.error;
  const s: SimularLimpieza = { filas: [nuevaFilaLimpieza(idVencido, true), nuevaFilaLimpieza(idVigente, false)],
    archivos: new Set([idVencido + "/foto1.jpg", idVencido + "/foto2.jpg", idVigente + "/foto1.jpg"]), audios: new Set(), errorBorrarAudio:false, borrados: [], llamadas: [], logs: [],
    validar: true, errorListar: false, errorBorrar: false, errorFinalizar: false, sinEfecto: false,
    nombreInvalido: false, loteInvalido: false, finalizados: 0, falloClaim: false };
  console.error = (...args: unknown[]) => { s.logs.push(args); };
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    afirmarLimpieza(url.origin === "https://prueba.supabase.co");
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    s.llamadas.push({ ruta: url.pathname, body });
    const rpc = url.pathname.split("/").at(-1);
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      if (rpc === "eros_reclamar_vencidos") {
        if (s.falloClaim) return json({ error: "CUERPO_PRIVADO" }, 503);
        if (s.loteInvalido) return json([{ id: "../otro-pedido" }]);
        return json(s.filas.filter(puedeLimpiarse).slice(0, body.p_limite).map(f => { f.estado = "vencido"; f.token = body.p_token; return { id: f.id }; }));
      }
      if (rpc === "eros_validar_limpieza") return json({ valido: s.validar && s.filas.some(f => f.id === body.p_pedido_id && f.token === body.p_token && f.estado === "vencido") });
      if (rpc === "eros_finalizar_limpieza") {
        if (s.errorFinalizar) return json({ error: "CUERPO_PRIVADO" }, 503);
        const f = s.filas.find(f => f.id === body.p_pedido_id && f.token === body.p_token);
        afirmarLimpieza(f && ![...s.archivos, ...s.audios].some(path => path.startsWith(f.id + "/")));
        f!.audio_ruta = null; f!.datos = {}; f!.para_quien = "Datos eliminados"; f!.limpiado_en = new Date().toISOString(); f!.token = null; s.finalizados++;
        return json({ limpiado: true });
      }
      if (rpc === "eros_liberar_limpieza") { s.filas.forEach(f => { if (f.token === body.p_token) f.token = null; }); return json({ liberados: 0 }); }
      if (rpc === "eros_limpiezas_pendientes") return json({ pendientes: s.filas.some(puedeLimpiarse) });
    }
    if (url.pathname.startsWith("/storage/v1/")) afirmarLimpieza(init?.redirect === "error");
    if (["/storage/v1/object/list/fotos", "/storage/v1/object/list/audios"].includes(url.pathname)) {
      const almacen = url.pathname.endsWith("/audios") ? s.audios : s.archivos;
      if (s.errorListar) return json({ error: "CUERPO_PRIVADO" }, 500);
      afirmarLimpieza(body.offset === 0 && body.limit === 100);
      if (s.nombreInvalido) return json([{ id: "archivo", name: "../foto-de-otro.jpg" }]);
      const prefix = body.prefix + "/", entradas = new Map<string, Record<string, unknown>>();
      for (const path of almacen) {
        if (!path.startsWith(prefix)) continue;
        const resto = path.slice(prefix.length), slash = resto.indexOf("/");
        if (slash < 0) entradas.set("F:" + resto, { id: "archivo", name: resto, metadata: { size: 50 } });
        else { const name = resto.slice(0, slash); entradas.set("D:" + name, { id: null, name, metadata: null }); }
      }
      return json([...entradas.values()].sort((a, b) => String(a.name).localeCompare(String(b.name))).slice(0, 100));
    }
    if (["/storage/v1/object/fotos", "/storage/v1/object/audios"].includes(url.pathname) && init?.method === "DELETE") {
      const esAudio = url.pathname.endsWith("/audios"), almacen = esAudio ? s.audios : s.archivos;
      if (esAudio && s.errorBorrarAudio) return json({ error:"CUERPO_PRIVADO" },503);
      if (s.errorBorrar) return json({ error: "CUERPO_PRIVADO" }, 503);
      afirmarLimpieza(Array.isArray(body.prefixes) && body.prefixes.length <= 100);
      for (const path of body.prefixes) {
        afirmarLimpieza(path.startsWith(idVencido + "/"));
        afirmarLimpieza(s.filas.find(f => f.id === idVencido)?.estado === "vencido");
        s.borrados.push(path); if (!s.sinEfecto) almacen.delete(path);
      }
      return json([]);
    }
    throw new Error("Ruta de prueba no simulada.");
  }) as typeof fetch;
  try { await prueba(s); }
  finally {
    globalThis.fetch = fetchOriginal; console.error = errorOriginal;
    for (const [k, v] of Object.entries(previo)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  }
}
function peticionLimpieza(secreto: string | null = secretoLocal, body: unknown = {}, method = "POST") {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secreto !== null) headers.set("x-eros-limpieza", secreto);
  return new Request("https://prueba.supabase.co/functions/v1/limpiar-vencidos", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined });
}

Deno.test("limpieza: secreto ausente, incorrecto o de largo distinto rechaza antes de consultar", () => simularLimpieza(async s => {
  for (const valor of [null, "", "b".repeat(64), "a".repeat(63), "a".repeat(65)]) igualLimpieza((await limpiarVencidos(peticionLimpieza(valor))).status, 401);
  igualLimpieza(s.llamadas.length, 0); igualLimpieza(s.borrados.length, 0);
}));
Deno.test("limpieza: configuración vacía, GET y cuerpo con UUID no permiten borrar", () => simularLimpieza(async s => {
  Deno.env.delete("LIMPIEZA_SECRETO"); igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 503);
  Deno.env.set("LIMPIEZA_SECRETO", secretoLocal);
  igualLimpieza((await limpiarVencidos(peticionLimpieza(secretoLocal, {}, "GET"))).status, 405);
  igualLimpieza((await limpiarVencidos(peticionLimpieza(secretoLocal, { id: idVigente }))).status, 400);
  igualLimpieza(s.llamadas.length, 0);
}));
Deno.test("limpieza: cierra primero, borra dos fotos, verifica vacío y después redacta", () => simularLimpieza(async s => {
  const r = await limpiarVencidos(peticionLimpieza()); igualLimpieza(r.status, 200);
  igualLimpieza(await r.json(), { ok: true, procesados: 1, limpiados: 1, fallidos: 0, pendientes: false });
  igualLimpieza(s.finalizados, 1); igualLimpieza(s.borrados.length, 2);
  igualLimpieza(s.filas[0].datos, {}); igualLimpieza(s.filas[0].para_quien, "Datos eliminados");
  igualLimpieza(s.filas[0].total, 8000); igualLimpieza(s.filas[0].mp_payment_id, "123456");
  afirmarLimpieza(s.archivos.has(idVigente + "/foto1.jpg")); igualLimpieza(s.filas[1].para_quien, "NOMBRE_PRIVADO");
}));
Deno.test("limpieza: repetir no duplica ni cambia fechas de un pedido terminado", () => simularLimpieza(async s => {
  await limpiarVencidos(peticionLimpieza()); const primeraFecha = s.filas[0].limpiado_en;
  const r = await limpiarVencidos(peticionLimpieza()); igualLimpieza((await r.json()).limpiados, 0);
  igualLimpieza(s.finalizados, 1); igualLimpieza(s.filas[0].limpiado_en, primeraFecha);
}));
Deno.test("limpieza: carpeta vacía se confirma sin DELETE", () => simularLimpieza(async s => {
  s.archivos.delete(idVencido + "/foto1.jpg"); s.archivos.delete(idVencido + "/foto2.jpg");
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 200); igualLimpieza(s.borrados.length, 0); igualLimpieza(s.finalizados, 1);
}));
Deno.test("limpieza: error al listar o borrar conserva datos y deja reintento", () => simularLimpieza(async s => {
  for (const tipo of ["errorListar", "errorBorrar"] as const) {
    s[tipo] = true;
    const r = await limpiarVencidos(peticionLimpieza()); igualLimpieza(r.status, 207);
    const respuesta = await r.json(); igualLimpieza(respuesta.ok, false); igualLimpieza(respuesta.fallidos, 1); igualLimpieza(respuesta.pendientes, true);
    igualLimpieza(s.filas[0].limpiado_en, null); igualLimpieza(s.filas[0].para_quien, "NOMBRE_PRIVADO"); igualLimpieza(s.filas[0].token, null);
    s[tipo] = false;
  }
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 200); igualLimpieza(s.finalizados, 1);
}));
Deno.test("limpieza: fallo final después de borrar se recupera sin perder contabilidad", () => simularLimpieza(async s => {
  s.errorFinalizar = true; igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 207);
  igualLimpieza(s.filas[0].limpiado_en, null); igualLimpieza(s.borrados.length, 2);
  s.errorFinalizar = false; igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 200);
  igualLimpieza(s.borrados.length, 2); igualLimpieza(s.filas[0].mp_preference_id, "123-preferencia");
}));
Deno.test("limpieza: nunca confirma una carpeta que no se vació", () => simularLimpieza(async s => {
  s.sinEfecto = true; igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 207);
  igualLimpieza(s.finalizados, 0); igualLimpieza(s.filas[0].limpiado_en, null);
}));
Deno.test("limpieza: lote inválido, nombre inseguro o reserva ajena no salen del UUID", () => simularLimpieza(async s => {
  s.loteInvalido = true; igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 503); igualLimpieza(s.borrados.length, 0);
  s.loteInvalido = false; s.nombreInvalido = true;
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 207); igualLimpieza(s.borrados.length, 0);
  s.nombreInvalido = false; s.validar = false;
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 207); igualLimpieza(s.borrados.length, 0);
}));
Deno.test("limpieza: carpetas anidadas del propio pedido también se vacían", () => simularLimpieza(async s => {
  s.archivos.add(idVencido + "/familia/foto3.jpg");
  s.archivos.add(idVencido + "/familia/viaje/foto4.jpg");
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 200); igualLimpieza(s.borrados.length, 4);
}));
Deno.test("limpieza: 250 fotos se borran por lotes y siempre se lista desde offset0", () => simularLimpieza(async s => {
  for (let i = 3; i <= 250; i++) s.archivos.add(idVencido + "/foto" + i + ".jpg");
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status, 200); igualLimpieza(s.borrados.length, 250);
  afirmarLimpieza(s.llamadas.filter(c => c.ruta.endsWith("object/list/fotos")).every(c => c.body.offset === 0));
}));
Deno.test("limpieza: trabajo grande avanza y se completa en otra llamada sin éxito prematuro", () => simularLimpieza(async s => {
  for (let i = 3; i <= 650; i++) s.archivos.add(idVencido + "/foto" + i + ".jpg");
  const primero = await (await limpiarVencidos(peticionLimpieza())).json();
  igualLimpieza(primero.ok, true); igualLimpieza(primero.pendientes, true); igualLimpieza(s.finalizados, 0);
  igualLimpieza(s.filas[0].limpiado_en, null);
  const segundo = await (await limpiarVencidos(peticionLimpieza())).json(); igualLimpieza(segundo.pendientes, false); igualLimpieza(s.finalizados, 1);
}));
Deno.test("limpieza: error del servidor y logs no incluyen secretos, IDs ni contenido", () => simularLimpieza(async s => {
  s.falloClaim = true; const r = await limpiarVencidos(peticionLimpieza()); igualLimpieza(r.status, 503);
  const salida = JSON.stringify({ respuesta: await r.json(), logs: s.logs });
  for (const valor of [secretoLocal, idVencido, "CUERPO_PRIVADO", "NOMBRE_PRIVADO", "TEXTO_PRIVADO", "clave-ficticia-local"]) afirmarLimpieza(!salida.includes(valor));
}));

Deno.test("limpieza: borra audio privado antes de redactar y vacía su ruta", () => simularLimpieza(async s => {
  s.audios.add(idVencido + "/cancion.mp3"); s.audios.add(idVigente + "/cancion.mp3");
  s.filas[0].audio_ruta = idVencido + "/cancion.mp3";
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status,200);
  afirmarLimpieza(!s.audios.has(idVencido + "/cancion.mp3"));
  afirmarLimpieza(s.audios.has(idVigente + "/cancion.mp3"));
  igualLimpieza(s.filas[0].audio_ruta,null); igualLimpieza(s.finalizados,1);
  const borrado = s.llamadas.findIndex(c => c.ruta === "/storage/v1/object/audios");
  const fin = s.llamadas.findIndex(c => c.ruta.endsWith("eros_finalizar_limpieza"));
  afirmarLimpieza(borrado >= 0 && fin > borrado);
}));
Deno.test("limpieza: fallo de audio conserva datos y reintenta sin republicar", () => simularLimpieza(async s => {
  s.audios.add(idVencido + "/cancion.mp3"); s.filas[0].audio_ruta = idVencido + "/cancion.mp3";
  s.errorBorrarAudio = true;
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status,207);
  igualLimpieza(s.filas[0].estado,"vencido"); igualLimpieza(s.filas[0].limpiado_en,null);
  igualLimpieza(s.filas[0].para_quien,"NOMBRE_PRIVADO"); igualLimpieza(s.finalizados,0);
  afirmarLimpieza(s.audios.has(idVencido + "/cancion.mp3"));
  s.errorBorrarAudio = false;
  igualLimpieza((await limpiarVencidos(peticionLimpieza())).status,200);
  igualLimpieza(s.filas[0].audio_ruta,null); igualLimpieza(s.finalizados,1);
}));
