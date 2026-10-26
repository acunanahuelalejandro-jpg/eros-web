// Red completamente simulada: no lee proyectos, pedidos ni fotos reales.
import { datosPublicosPagina, disponibilidadPagina, nombreFotoPagina, type PedidoPagina } from "../functions/_compartido/paginas.ts";

const servePaginaOriginal = Deno.serve;
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: () => ({}) });
const { obtenerPagina } = await import("../functions/obtener-pagina/index.ts");
Object.defineProperty(Deno, "serve", { configurable: true, writable: true, value: servePaginaOriginal });

function igualPagina(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("No coincide: " + JSON.stringify(a) + " / " + JSON.stringify(b)); }
function afirmarPagina(v: unknown) { if (!v) throw new Error("No se cumplió la condición de privacidad o vigencia."); }
const slugPagina = "23456789abcdefgh23456789abcdefgh";
const idPagina = "da3dfe67-5917-4cbc-a74c-ebfbd0e384f1";
function pedidoDePagina(modelo = "carta-para-vos", juego = ""): PedidoPagina {
  const fotos = Array.from({ length: 12 }, (_, i) => ({ src: "imagenes/foto" + (i + 1) + ".jpg", alt: "Recuerdo " + (i + 1), epigrafe: "Epígrafe " + (i + 1) }));
  const extras = { juego, sobre: true, contador: { desde: "2021-03-12", etiqueta: "Juntos desde hace" },
    laberinto: { fotoQuienJuega: "imagenes/juego-jugador.jpg", fotoQuienRegala: "imagenes/juego-regala.jpg" } };
  return {
    id: idPagina, estado: "publicado", modelo, tema: "galaxia", para_quien: "Sofi", de_parte: "Nico", extras,
    datos: { version: 2, inicio: { titulo: "Un regalo para vos" }, firma: "Nico", musica: "", extras,
      carta: { titulo: "Para vos", bloques: [ { texto: "Un mensaje del regalo." }, ...fotos.slice(0, 3).map(f => ({ foto: f.src, alt: f.alt })) ] },
      principal: { titulo: "Nuestros recuerdos", subtitulo: "Momentos juntos" },
      momentos: fotos.slice(0, 8).map((f, i) => ({ fecha: "Momento " + (i + 1), titulo: "Recuerdo", texto: "Texto", foto: f.src, alt: f.alt })),
      fotos, cierre: { mensaje: "Un cierre." }, whatsapp_cliente: "CONTACTO_PRIVADO", notas: "NOTAS_PRIVADAS", mp_payment_id: "PAGO_PRIVADO" },
    publicado_en: new Date(Date.now() - 60000).toISOString(), vence_en: new Date(Date.now() + 3600000).toISOString(), activar_el: null,
  };
}
type RedPagina = {
  pedido: PedidoPagina | null; requests: { path: string; body: Record<string, unknown> }[];
  paths: string[]; ttl: number; falta: boolean; almacenamientoHTTP: number; limite: boolean;
  firmadaAjena: boolean; demora: number;
};
async function conPagina(probar: (s: RedPagina) => Promise<void>, modelo?: string, juego?: string) {
  const env = { SUPABASE_URL: "https://prueba.supabase.co", SUPABASE_SECRET_KEYS: '{"default":"valor-ficticio-local"}', EROS_SITE_URL: "https://tienda.github.io/eros-web/", MP_MODO: "test" };
  const anterior = Object.fromEntries(Object.keys(env).map(k => [k, Deno.env.get(k)]));
  Object.entries(env).forEach(([k, v]) => Deno.env.set(k, v));
  const originalFetch = globalThis.fetch;
  const s: RedPagina = { pedido: pedidoDePagina(modelo, juego), requests: [], paths: [], ttl: 0, falta: false, almacenamientoHTTP: 200, limite: false, firmadaAjena: false, demora: 0 };
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { "Content-Type": "application/json" } });
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    s.requests.push({ path: url.pathname, body });
    if (url.origin !== "https://prueba.supabase.co") throw new Error("La prueba no permite red externa.");
    if (url.pathname === "/rest/v1/rpc/eros_limitar_cobro") return json({ permitido: !s.limite });
    if (url.pathname === "/rest/v1/pedidos") {
      afirmarPagina(url.searchParams.get("slug") === "eq." + slugPagina);
      afirmarPagina(!/whatsapp|notas|mp_payment|mp_preference/.test(url.searchParams.get("select") || ""));
      return json(s.pedido ? [s.pedido] : []);
    }
    if (url.pathname === "/storage/v1/object/sign/fotos") {
      s.paths = body.paths; s.ttl = body.expiresIn;
      if (s.demora) await new Promise(r => setTimeout(r, s.demora));
      if (s.almacenamientoHTTP !== 200) return json({}, s.almacenamientoHTTP);
      return json(s.paths.map(path => ({ path, error: s.falta ? "Object not found" : null,
        signedURL: s.falta ? null : s.firmadaAjena ? "https://ajeno.ejemplo.test/foto.jpg?token=ficticio" : "/object/sign/fotos/" + path + "?token=firma-ficticia-local" })));
    }
    throw new Error("Ruta de prueba no reconocida.");
  }) as typeof fetch;
  try { await probar(s); }
  finally {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries(anterior)) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
  }
}
const pedirPagina = (body: unknown = { slug: slugPagina }) => new Request("https://prueba.supabase.co/functions/v1/obtener-pagina", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://tienda.github.io" }, body: JSON.stringify(body),
});

Deno.test("página: preflight204 no necesita claves ni consulta recursos", () => conPagina(async s => {
  Deno.env.delete("SUPABASE_URL"); Deno.env.delete("SUPABASE_SECRET_KEYS");
  const r = await obtenerPagina(new Request("https://prueba.supabase.co/functions/v1/obtener-pagina", { method: "OPTIONS", headers: { Origin: "https://tienda.github.io" } }));
  igualPagina(r.status, 204); igualPagina(r.headers.get("Access-Control-Allow-Origin"), "https://tienda.github.io"); igualPagina(s.requests.length, 0);
}));
for (const [modelo, cantidad] of [["carta-para-vos", 3], ["nuestra-historia", 8], ["album-recuerdos", 12]] as const) {
  for (const juego of ["", "pintar-corazon", "margarita", "laberinto"]) {
    Deno.test("página vigente: " + modelo + " / " + (juego || "sobre") + ", solo fotos propias y sin campos internos", () => conPagina(async s => {
      const r = await obtenerPagina(pedirPagina()); igualPagina(r.status, 200);
      const json = await r.json(); igualPagina(json.modelo, modelo); igualPagina(json.datos.extras.juego, juego); igualPagina(json.datos.extras.sobre, !juego);
      igualPagina(json.fotos.length, cantidad + (juego === "laberinto" ? 2 : 0));
      afirmarPagina(s.paths.every(p => p.startsWith(idPagina + "/"))); afirmarPagina(s.ttl <= 600 && s.ttl > 0);
      afirmarPagina(!/CONTACTO_PRIVADO|NOTAS_PRIVADAS|PAGO_PRIVADO|mp_payment|whatsapp_cliente/.test(JSON.stringify(json)));
      afirmarPagina(json.fotos.every((url: string) => url.startsWith("https://prueba.supabase.co/storage/v1/object/sign/fotos/" + idPagina + "/")));
      igualPagina(r.headers.get("Cache-Control"), "no-store");
    }, modelo, juego));
  }
}
Deno.test("página: desconocida, impaga, pagada y futura tienen el mismo404 y no firman fotos", () => conPagina(async s => {
  for (const cambio of [null, { estado: "nuevo" }, { estado: "pagado" }, { datos: {} }, { datos: null }, { publicado_en: new Date(Date.now() + 3600000).toISOString() }, { activar_el: "2099-02-14" }, { modelo: "no-conocido" }]) {
    s.pedido = cambio === null ? null : { ...pedidoDePagina(), ...cambio };
    const r = await obtenerPagina(pedirPagina()); igualPagina(r.status, 404); igualPagina((await r.json()).error, "no_disponible");
  }
  igualPagina(s.paths.length, 0);
}));
Deno.test("página: vencida410, y fecha Argentina arranca a03:00UTC", () => conPagina(async s => {
  s.pedido!.estado = "vencido"; igualPagina((await obtenerPagina(pedirPagina())).status, 410);
  s.pedido = pedidoDePagina(); s.pedido.vence_en = new Date(Date.now() - 1000).toISOString(); s.pedido.publicado_en = "2020-01-01T00:00:00Z";
  igualPagina((await obtenerPagina(pedirPagina())).status, 410); igualPagina(s.paths.length, 0);
  const p = pedidoDePagina(); p.publicado_en = "2026-02-13T00:00:00Z"; p.vence_en = "2026-02-15T03:00:00Z"; p.activar_el = "2026-02-14";
  igualPagina(disponibilidadPagina(p, Date.parse("2026-02-14T02:59:59Z")), "no_disponible");
  igualPagina(disponibilidadPagina(p, Date.parse("2026-02-14T03:00:00Z")), "disponible");
}));
Deno.test("página: ruta corta devuelve solo modelo/fecha, sin firmar ni devolver contenido", () => conPagina(async s => {
  const r = await obtenerPagina(pedirPagina({ slug: slugPagina, soloModelo: true })); igualPagina(r.status, 200);
  igualPagina(Object.keys(await r.json()).sort(), ["modelo", "vence_en"]); igualPagina(s.paths.length, 0);
}));
Deno.test("página: fotos ausentes y cero fotos conservan el contenido sin URLs rotas", () => conPagina(async s => {
  s.falta = true; const faltan = await (await obtenerPagina(pedirPagina())).json(); igualPagina(faltan.fotos.length, 0);
  afirmarPagina(faltan.datos.carta.bloques.filter((b: Record<string, unknown>) => "foto" in b).every((b: Record<string, unknown>) => b.foto === ""));
  (s.pedido!.datos as Record<string, unknown>).carta = { titulo: "Sin fotos", bloques: [{ texto: "El texto sigue acá." }] }; s.paths = [];
  const sin = await (await obtenerPagina(pedirPagina())).json(); igualPagina(sin.datos.carta.bloques[0].texto, "El texto sigue acá."); igualPagina(s.paths.length, 0);
}));
Deno.test("página: rechaza traversal, URLs y referencias a otro pedido", () => conPagina(async s => {
  const rutas = ["../foto1.jpg", "imagenes/../foto1.jpg", "https://ajeno.ejemplo.test/foto1.jpg", "imagenes/otro-uuid/foto1.jpg", "imagenes/foto1.jpg?token=x", "imagenes/%2e%2e/foto1.jpg"];
  rutas.forEach(r => igualPagina(nombreFotoPagina(r), ""));
  (s.pedido!.datos as Record<string, unknown>).carta = { titulo: "Prueba", bloques: rutas.map(foto => ({ foto })) };
  const salida = await (await obtenerPagina(pedirPagina())).json(); igualPagina(s.paths.length, 0); igualPagina(salida.fotos.length, 0);
}));
Deno.test("página: nunca confía en una URL firmada de otro host", () => conPagina(async s => {
  s.firmadaAjena = true; const salida = await (await obtenerPagina(pedirPagina())).json(); igualPagina(salida.fotos.length, 0); afirmarPagina(!JSON.stringify(salida).includes("ajeno.ejemplo"));
}));
Deno.test("página: TTL no supera el plazo restante y se vuelve a verificar al terminar", () => conPagina(async s => {
  s.pedido!.vence_en = new Date(Date.now() + 120000).toISOString();
  const r = await obtenerPagina(pedirPagina()); igualPagina(r.status, 200); afirmarPagina(s.ttl <= 120);
  s.pedido!.vence_en = new Date(Date.now() + 1100).toISOString(); s.demora = 1200;
  igualPagina((await obtenerPagina(pedirPagina())).status, 410);
}));
Deno.test("página: límites429 y slug inválido404 no permiten leer un regalo", () => conPagina(async s => {
  s.limite = true; igualPagina((await obtenerPagina(pedirPagina())).status, 429);
  afirmarPagina(!s.requests.some(r => r.path === "/rest/v1/pedidos"));
  s.limite = false; igualPagina((await obtenerPagina(pedirPagina({ slug: "TES234" }))).status, 404);
}));
Deno.test("página: música propia conserva carpeta correcta, no convierte enlaces externos en audio", () => conPagina(async s => {
  const p = s.pedido!; const data = p.datos as Record<string, unknown>;
  data.musica = "musica/cancion-1.mp3";
  igualPagina(datosPublicosPagina(p, () => "").musica, "https://tienda.github.io/eros-web/musica/cancion-1.mp3");
  for (const ruta of ["https://open.spotify.com/track/ejemplo", "../musica.mp3", "/musica/cancion.mp3", "musica/../../privado.mp3", "musica/cancion.mp3?x=1"]) {
    data.musica = ruta; igualPagina(datosPublicosPagina(p, () => "").musica, "");
  }
  data.musica = "musica.mp3"; igualPagina(datosPublicosPagina(p, () => "").musica, "https://tienda.github.io/eros-web/plantillas/carta-para-vos/musica.mp3");
}));
