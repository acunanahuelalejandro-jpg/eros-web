import { EROS_PRECIOS } from "../_compartido/precios.ts";
import { verificarAudioPedido } from "../_compartido/audio.ts";
import { buscarPedido, checkoutSeguro, credencialPedido, referenciaPrecio, revisionPedido, validarPrecio, type PedidoCobro } from "../_compartido/cobros.ts";
import { cabecerasNavegador, ErrorCobro, leerCuerpo, limitarCobro, modoMercadoPago, responderError, responderJSON, responderPreflight, rpcCobro, urlSeguimiento } from "../_compartido/http.ts";
import { apiMercadoPago, ErrorMercadoPago, mediosExcluidos, verificarVendedor } from "../_compartido/mercadopago.ts";

function preferenciaValida(preferencia: Record<string, unknown>, pedido: PedidoCobro, referencia: string, vendedor: string): boolean {
  const metadata = preferencia.metadata as Record<string, unknown> | undefined;
  const items = preferencia.items;
  if (String(preferencia.external_reference) !== pedido.id || String(preferencia.collector_id) !== vendedor ||
    metadata?.eros_revision !== referencia || metadata?.eros_pedido_id !== pedido.id || metadata?.eros_modo !== modoMercadoPago() ||
    !Array.isArray(items) || items.length !== 1) return false;
  const item = items[0];
  return item?.currency_id === "ARS" && item?.quantity === 1 && item?.unit_price === pedido.total && !!checkoutSeguro(preferencia.init_point);
}

async function conciliarPreferencia(pedido: PedidoCobro, referencia: string, vendedor: string, hasta: number): Promise<Record<string, unknown> | null> {
  const ids: string[] = [];
  if (pedido.mp_preference_id) ids.push(pedido.mp_preference_id);
  const busqueda = await apiMercadoPago("/checkout/preferences/search?external_reference=" + encodeURIComponent(pedido.id) + "&limit=30", "GET", undefined, hasta);
  const elementos = busqueda.elements || busqueda.results;
  if (Array.isArray(elementos)) {
    for (const elemento of elementos) {
      const id = elemento && typeof elemento === "object" ? String(elemento.id || "") : "";
      if (/^[a-zA-Z0-9_-]{1,200}$/.test(id) && !ids.includes(id)) ids.push(id);
    }
  }
  // El límite normal por pedido es cinco intentos; no se hace una búsqueda ilimitada.
  for (const id of ids.slice(0, 2)) {
    const preferencia = await apiMercadoPago("/checkout/preferences/" + encodeURIComponent(id), "GET", undefined, hasta);
    if (preferenciaValida(preferencia, pedido, referencia, vendedor) &&
      Date.parse(String(preferencia.expiration_date_to)) > Date.now() + 60_000) return preferencia;
  }
  return null;
}

export async function crearPago(req: Request): Promise<Response> {
  const hasta = Date.now() + 18000;
  let headers: Headers | undefined;
  let pedido: PedidoCobro | undefined;
  let reserva = "";
  let retenerReserva = false;
  try {
    const preflight = responderPreflight(req);
    if (preflight) return preflight;
    headers = cabecerasNavegador(req);
    if (req.method !== "POST") throw new ErrorCobro(405, "metodo", "Usá el botón de pago del pedido.");
    await limitarCobro(req, "crear-pago", 30, 900, hasta);
    const cuerpo = await leerCuerpo(req);
    pedido = await buscarPedido(credencialPedido(cuerpo), true, hasta);
    const respuestaBase = { estado: pedido.estado, slug: pedido.slug, codigo: pedido.codigo, seguimiento_url: urlSeguimiento(pedido.slug) };
    if (pedido.estado === "publicado" || pedido.estado === "pagado") return responderJSON(respuestaBase, 200, headers);
    if (pedido.estado !== "nuevo") throw new ErrorCobro(410, "vencido", "El tiempo de este pedido ya terminó. Consultanos con tu código.");
    await verificarAudioPedido(pedido, hasta);
    const calculo = validarPrecio(pedido);
    const referencia = await referenciaPrecio(pedido);
    const revision = revisionPedido(pedido);
    const modo = modoMercadoPago();
    const estadoCobro = await rpcCobro("eros_estado_cobro", { p_pedido_id: pedido.id }, hasta);
    if (["pending", "in_process", "authorized", "in_mediation"].includes(String(estadoCobro.estado))) {
      throw new ErrorCobro(409, "pago_pendiente", "Mercado Pago todavía está revisando tu pago. Esperá su confirmación para evitar pagar dos veces.");
    }
    const vendedor = await verificarVendedor(hasta);
    reserva = crypto.randomUUID();
    const resultado = await rpcCobro("eros_reservar_checkout", {
      p_pedido_id: pedido.id, p_revision: revision, p_referencia: referencia, p_modo: modo, p_reserva: reserva,
    }, hasta);
    const accion = resultado.accion;
    if (accion === "limite") throw new ErrorCobro(429, "limite_pedido", "Hubo varios intentos de pago para este pedido. Esperá 30 minutos o consultanos con tu código.");
    if (accion === "ocupado") throw new ErrorCobro(409, "preparando", "Ya estamos preparando este pago. Esperá unos segundos y volvé a intentar.");
    if (!["crear", "conciliar", "reutilizar"].includes(String(accion))) throw new ErrorCobro(409, "pedido_cambio", "El pedido cambió. Actualizá el seguimiento antes de pagar.");
    if (accion === "reutilizar") {
      reserva = "";
      const preferencia = await apiMercadoPago("/checkout/preferences/" + encodeURIComponent(String(resultado.preference_id)), "GET", undefined, hasta);
      if (!preferenciaValida(preferencia, pedido, referencia, vendedor)) throw new ErrorCobro(409, "checkout", "Necesitamos revisar el pago de este pedido. Consultanos con tu código.");
      return responderJSON({ ...respuestaBase, init_point: checkoutSeguro(preferencia.init_point) }, 200, headers);
    }
    let preferencia: Record<string, unknown>;
    if (accion === "conciliar") {
      retenerReserva = true;
      const encontrada = await conciliarPreferencia(pedido, referencia, vendedor, hasta);
      if (!encontrada) throw new ErrorCobro(503, "conciliando", "No pudimos confirmar si Mercado Pago creó el enlace. Tu pedido sigue guardado: esperá un minuto y reintentá, o consultanos con tu código.");
      preferencia = encontrada;
    } else {
      const exclusiones = await mediosExcluidos(hasta);
      const vuelta = new URL(urlSeguimiento(pedido.slug));
      const back = (resultado: string) => { const url = new URL(vuelta); url.searchParams.set("resultado", resultado); return url.href; };
      const modelo = EROS_PRECIOS.models[calculo.modelo as keyof typeof EROS_PRECIOS.models];
      const duracion = EROS_PRECIOS.durations[calculo.duracion as keyof typeof EROS_PRECIOS.durations];
      const baseSupabase = Deno.env.get("SUPABASE_URL") || "";
      // No se envía a Mercado Pago el contenido del regalo ni las fotos o nombres.
      // Un timeout después de este POST es ambiguo: primero se conciliará en el próximo intento.
      retenerReserva = true;
      preferencia = await apiMercadoPago("/checkout/preferences", "POST", {
        items: [{ id: modelo.slug, title: "Eros Web · " + modelo.name + " · " + duracion, quantity: 1, currency_id: "ARS", unit_price: calculo.total }],
        external_reference: pedido.id,
        metadata: { eros_pedido_id: pedido.id, eros_revision: referencia, eros_modo: modo },
        back_urls: { success: back("success"), pending: back("pending"), failure: back("failure") },
        notification_url: baseSupabase + "/functions/v1/webhook-mercadopago",
        auto_return: "approved", binary_mode: false,
        payment_methods: { excluded_payment_types: exclusiones, installments: 1 },
        expires: true, expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }, hasta);
    }
    const initPoint = checkoutSeguro(preferencia.init_point);
    const preferenceId = String(preferencia.id || "");
    const expira = String(preferencia.expiration_date_to || "");
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(preferenceId) || !initPoint || !preferenciaValida(preferencia, pedido, referencia, vendedor) || !Number.isFinite(Date.parse(expira))) {
      throw new ErrorCobro(502, "checkout", "Mercado Pago no devolvió un enlace válido. Tu pedido sigue guardado; volvé a intentar.");
    }
    const guardado = await rpcCobro("eros_guardar_checkout", {
      p_pedido_id: pedido.id, p_revision: revision, p_reserva: reserva,
      p_preference_id: preferenceId, p_init_point: initPoint, p_expira_en: expira,
    }, hasta);
    if (guardado.guardado !== true) throw new ErrorCobro(409, "pedido_cambio", "El pedido cambió antes de abrir el pago. Actualizá el seguimiento.");
    reserva = "";
    return responderJSON({ ...respuestaBase, init_point: initPoint }, 200, headers);
  } catch (error) {
    if (pedido && reserva) {
      const incierto = error instanceof ErrorMercadoPago ? retenerReserva && error.incierto : retenerReserva;
      try { await rpcCobro("eros_fallar_checkout", { p_pedido_id: pedido.id, p_reserva: reserva, p_incierto: incierto }, Date.now() + 750); }
      catch { console.error("checkout_reserva_sin_confirmar"); }
    }
    return responderError(error, headers);
  }
}

Deno.serve(crearPago);
