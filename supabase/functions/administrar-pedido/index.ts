import { verificarAudioPedido } from "../_compartido/audio.ts";
import { jsonOrdenado, validarPrecio } from "../_compartido/cobros.ts";
import { avisarPagoAdmin } from "../_compartido/avisos.ts";
import { baseSupabaseServidor, cabecerasNavegador, consultarBD, ErrorCobro, fetchConTiempo, hashCobro, leerCuerpo, responderError, responderJSON, responderPreflight, rpcCobro, secretoServidor } from "../_compartido/http.ts";
import type { PedidoCobro } from "../_compartido/cobros.ts";

const uuidPanel = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const accionesPanel = ["pago-manual", "republicar", "extender", "anular"];
const mensajesPanel: Record<string, string> = {
  permiso: "Volvé a iniciar sesión con tu cuenta administradora.", pedido: "No encontramos el pedido con ese código.",
  solicitud: "Este intento ya se usó con otros datos. Cerrá la confirmación y volvé a abrirla.",
  cambio: "El pedido cambió. Actualizalo y revisá los datos antes de confirmar.",
  limpieza: "El borrado empezó o ya terminó. No se puede recuperar este contenido.",
  precio: "El total o los extras no coinciden con los precios vigentes. Revisá el pedido.",
  estado: "El estado actual del pedido no permite esta acción.",
  fecha: "Elegí un vencimiento futuro, posterior al actual y dentro de los próximos 366 días.",
  pago_pendiente: "Hay un cobro pendiente o un checkout en preparación. Revisalo en Mercado Pago antes de confirmar otro pago.",
};
type PedidoPanel = PedidoCobro & { pagado_en: string | null; publicado_en: string | null; vence_en: string | null;
  limpiado_en: string | null; limpieza_intentada_en: string | null; pago_manual_en: string | null };
function revisionPanel(pedido: Record<string, unknown>) {
  const salida: Record<string, unknown> = {};
  for (const clave of ["modelo","duracion","extras","total","activar_el","estado","pagado_en","publicado_en","vence_en"]) {
    const valor = pedido[clave] ?? null;
    salida[clave] = ["pagado_en","publicado_en","vence_en"].includes(clave) && typeof valor === "string"
      ? Number.isFinite(Date.parse(valor)) ? new Date(valor).toISOString() : "fecha_invalida" : valor;
  }
  return salida;
}
function respuestaPanel(resultado: Record<string, unknown>, headers: Headers): Response {
  if (resultado.ok !== true) {
    const codigo = typeof resultado.error === "string" && mensajesPanel[resultado.error] ? resultado.error : "servidor";
    throw new ErrorCobro(codigo === "permiso" ? 403 : codigo === "pedido" ? 404 : 409, codigo, mensajesPanel[codigo] || "No se pudo completar la acción. Actualizá el pedido.");
  }
  const origen = resultado.pedido && typeof resultado.pedido === "object" ? resultado.pedido as Record<string, unknown> : {};
  const pedido: Record<string, unknown> = {};
  for (const clave of ["id","codigo","estado","slug","mp_preference_id","mp_payment_id","pagado_en","publicado_en","vence_en","activar_el","pago_manual_en","limpiado_en","limpieza_intentada_en"]) {
    if (Object.hasOwn(origen, clave)) pedido[clave] = origen[clave];
  }
  return responderJSON({ ok: true, repetido: resultado.repetido === true, pedido }, 200, headers);
}

export async function administrarPedido(req: Request): Promise<Response> {
  const hasta = Date.now() + 18000;
  let headers: Headers | undefined;
  try {
    const preflight = responderPreflight(req); if (preflight) return preflight;
    headers = cabecerasNavegador(req);
    if (req.method !== "POST") throw new ErrorCobro(405, "metodo", "Método no permitido.");
    const autorizacion = req.headers.get("Authorization") || "";
    if (!/^Bearer [^\s]{1,8192}$/i.test(autorizacion)) throw new ErrorCobro(401, "sesion", "Iniciá sesión en el panel.");
    // Auth valida la sesión en el servidor. Nunca se confía en decodificar el JWT
    // localmente ni en user_metadata, que el propio usuario puede editar.
    const verificacion = await fetchConTiempo(baseSupabaseServidor() + "/auth/v1/user", {
      headers: { apikey: secretoServidor(), Authorization: autorizacion },
    }, 6000, hasta);
    if (!verificacion.ok) throw new ErrorCobro(verificacion.status === 401 || verificacion.status === 403 ? 401 : 503, "sesion", "No pudimos verificar la sesión. Volvé a ingresar.");
    const usuario = await verificacion.json();
    if (!uuidPanel(usuario.id) || usuario.app_metadata?.eros_admin !== true) throw new ErrorCobro(403, "permiso", mensajesPanel.permiso);
    const body = await leerCuerpo(req, 16384);
    if (!uuidPanel(body.pedido_id) || !uuidPanel(body.solicitud_id) || typeof body.codigo !== "string" || !/^[A-Z0-9]{6}$/.test(body.codigo)
      || typeof body.accion !== "string" || !accionesPanel.includes(body.accion) || !body.revision || typeof body.revision !== "object" || Array.isArray(body.revision)) {
      throw new ErrorCobro(400, "solicitud", "Revisá el pedido y la acción que querés confirmar.");
    }
    const id = body.pedido_id.toLowerCase(), solicitud = body.solicitud_id.toLowerCase(), accion = body.accion;
    if ((Object.hasOwn(body,"preparar_borrado") && typeof body.preparar_borrado !== "boolean") || (body.preparar_borrado === true && accion !== "anular")) throw new ErrorCobro(400,"solicitud","El borrado requiere anular el acceso al pedido.");
    const prepararBorrado = body.preparar_borrado === true;
    let vence: string | null = null;
    if (accion === "extender") {
      if (typeof body.vence_en !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,6})?)?(?:Z|[+-]\d\d:\d\d)$/.test(body.vence_en) || !Number.isFinite(Date.parse(body.vence_en))) throw new ErrorCobro(400, "fecha", mensajesPanel.fecha);
      if (new Date(body.vence_en.slice(0,10) + "T00:00:00Z").toISOString().slice(0,10) !== body.vence_en.slice(0,10)) throw new ErrorCobro(400, "fecha", mensajesPanel.fecha);
      vence = new Date(body.vence_en).toISOString();
    }
    const revisionCliente = revisionPanel(body.revision as Record<string, unknown>);
    const huella = await hashCobro(jsonOrdenado({ pedido_id: id, codigo: body.codigo, accion, revision: revisionCliente, vence_en: vence, preparar_borrado: prepararBorrado }));
    const limite = await rpcCobro("eros_limitar_cobro", { p_clave: await hashCobro(secretoServidor() + ":admin:" + usuario.id), p_limite: 30, p_segundos: 60 }, hasta);
    if (limite.permitido !== true) throw new ErrorCobro(429, "limite", "Esperá un minuto antes de volver a intentar.");
    // Resolver primero un reintento evita que el cambio causado por la propia
    // acción se confunda con una revisión vieja o con contenido ya eliminado.
    const previa = await rpcCobro("eros_admin_buscar_accion", { p_admin_id: usuario.id, p_pedido_id: id, p_solicitud_id: solicitud, p_huella: huella }, hasta);
    if (previa.encontrada === true || previa.ok === false) {
      const respuesta = respuestaPanel(previa, headers);
      if (accion === "pago-manual") await avisarPagoAdmin(id);
      return respuesta;
    }
    if (vence && (Date.parse(vence) <= Date.now() || Date.parse(vence) > Date.now() + 366 * 86400000)) throw new ErrorCobro(400, "fecha", mensajesPanel.fecha);
    const columnas = "id,codigo,slug,estado,modelo,duracion,extras,datos,total,activar_el,fotos_cantidad,mp_preference_id,mp_payment_id,pagado_en,publicado_en,vence_en,limpiado_en,limpieza_intentada_en,pago_manual_en,audio_ruta,audio_nombre,audio_bytes,audio_duracion,audio_consentimiento,audio_verificado_en,audio_sha256";
    const filas = await consultarBD("pedidos?select=" + columnas + "&id=eq." + encodeURIComponent(id) + "&codigo=eq." + encodeURIComponent(body.codigo) + "&limit=1", "GET", undefined, hasta) as PedidoPanel[];
    const pedido = Array.isArray(filas) ? filas[0] : null;
    if (!pedido) throw new ErrorCobro(404, "pedido", mensajesPanel.pedido);
    if (jsonOrdenado(revisionCliente) !== jsonOrdenado(revisionPanel(pedido as unknown as Record<string, unknown>))) throw new ErrorCobro(409, "cambio", mensajesPanel.cambio);
    let totalEsperado: number | null = null;
    if (accion !== "anular") {
      if (pedido.limpiado_en || pedido.limpieza_intentada_en || !pedido.datos || !Object.keys(pedido.datos).length) throw new ErrorCobro(409, "limpieza", mensajesPanel.limpieza);
      totalEsperado = validarPrecio(pedido).total;
      await verificarAudioPedido(pedido, hasta);
    }
    // El snapshot completo viaja solo entre el servidor y SQL; nunca se incluye
    // en la respuesta ni en la auditoría. SQL lo vuelve a comparar bajo bloqueo.
    const revisionServidor = { modelo: pedido.modelo, duracion: pedido.duracion, extras: pedido.extras, total: pedido.total,
      activar_el: pedido.activar_el, estado: pedido.estado, pagado_en: pedido.pagado_en, publicado_en: pedido.publicado_en,
      vence_en: pedido.vence_en, datos: pedido.datos, fotos_cantidad: pedido.fotos_cantidad };
    const resultado = await rpcCobro("eros_admin_accion", { p_admin_id: usuario.id, p_pedido_id: id, p_codigo: body.codigo,
      p_accion: accion, p_solicitud_id: solicitud, p_huella: huella, p_revision: revisionServidor,
      p_total_esperado: totalEsperado, p_vence_en: vence, p_preparar_borrado: prepararBorrado }, hasta);
    const respuesta = respuestaPanel(resultado, headers);
    if (accion === "pago-manual") await avisarPagoAdmin(id);
    return respuesta;
  } catch (error) { return responderError(error, headers); }
}

Deno.serve(administrarPedido);
