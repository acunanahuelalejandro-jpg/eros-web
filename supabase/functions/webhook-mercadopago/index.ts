import { buscarPedido, referenciaPrecio, revisionPedido, validarPrecio } from "../_compartido/cobros.ts";
import { cabecerasNavegador, ErrorCobro, leerCuerpo, limitarCobro, modoMercadoPago, responderError, responderJSON, responderPreflight, rpcCobro } from "../_compartido/http.ts";
import { apiMercadoPago, firmaMercadoPagoValida, tipoAcreditacionInmediata, verificarVendedor } from "../_compartido/mercadopago.ts";

export async function webhookMercadoPago(req: Request): Promise<Response> {
  let headers: Headers | undefined;
  try {
    const preflight = responderPreflight(req);
    if (preflight) return preflight;
    headers = cabecerasNavegador(req);
    if (req.method !== "POST") throw new ErrorCobro(405, "metodo", "Método no permitido.");
    const cuerpo = await leerCuerpo(req, 16384);
    const url = new URL(req.url);
    const tipo = cuerpo.type || url.searchParams.get("type") || url.searchParams.get("topic");
    if (tipo !== "payment") return responderJSON({ recibido: true, accion: "ignorado" }, 200, headers);
    const data = cuerpo.data && typeof cuerpo.data === "object" ? cuerpo.data as Record<string, unknown> : {};
    const idURL = url.searchParams.get("data.id");
    const idCuerpo = data.id == null ? "" : String(data.id);
    const paymentId = idURL || idCuerpo;
    if (!/^\d{1,20}$/.test(paymentId) || (idURL && idCuerpo && idURL !== idCuerpo)) throw new ErrorCobro(400, "pago", "Identificador no válido.");
    if (!await firmaMercadoPagoValida(req, paymentId)) throw new ErrorCobro(401, "firma", "Firma no válida.");
    await limitarCobro(req, "webhook-mercadopago", 600, 60);
    // Nunca se confirma un pago con el cuerpo recibido ni con el redirect del checkout.
    const pago = await apiMercadoPago("/v1/payments/" + encodeURIComponent(paymentId));
    if (String(pago.id) !== paymentId) throw new ErrorCobro(400, "pago", "El pago consultado no coincide.");
    const idPedido = String(pago.external_reference || "");
    const metadata = pago.metadata && typeof pago.metadata === "object" ? pago.metadata as Record<string, unknown> : {};
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(idPedido) || metadata.eros_pedido_id !== idPedido) {
      return responderJSON({ recibido: true, accion: "sin_referencia" }, 200, headers);
    }
    const vendedor = await verificarVendedor();
    if (String(pago.collector_id) !== vendedor || metadata.eros_modo !== modoMercadoPago() ||
      (modoMercadoPago() === "produccion" && pago.live_mode !== true)) {
      console.error("pago_cuenta_o_modo_no_coincide");
      return responderJSON({ recibido: true, accion: "cuenta" }, 200, headers);
    }
    // Solo se buscan datos del pedido cuya referencia salió de la API autenticada.
    const filas = await rpcCobro("eros_identificar_pago", { p_pedido_id: idPedido });
    if (typeof filas.codigo !== "string") return responderJSON({ recibido: true, accion: "sin_pedido" }, 200, headers);
    const pedido = await buscarPedido({ id: idPedido, codigo: filas.codigo });
    if (pedido.mp_payment_id === paymentId && ["pagado", "publicado", "vencido"].includes(pedido.estado)) {
      return responderJSON({ recibido: true, accion: "repetido" }, 200, headers);
    }
    const calculo = validarPrecio(pedido);
    const referencia = await referenciaPrecio(pedido);
    if (pago.currency_id !== "ARS" || typeof pago.transaction_amount !== "number" ||
      !Number.isSafeInteger(pago.transaction_amount) || pago.transaction_amount !== calculo.total ||
      metadata.eros_revision !== referencia || !tipoAcreditacionInmediata(pago.payment_type_id)) {
      console.error("pago_importe_o_revision_no_coincide");
      return responderJSON({ recibido: true, accion: "importe" }, 200, headers);
    }
    const estados = ["approved", "pending", "in_process", "authorized", "in_mediation", "rejected", "cancelled", "refunded", "charged_back"];
    if (!estados.includes(String(pago.status))) return responderJSON({ recibido: true, accion: "estado_ignorado" }, 200, headers);
    const actualizado = Date.parse(String(pago.date_last_updated || pago.date_created));
    const resultado = await rpcCobro("eros_registrar_pago", {
      p_pedido_id: pedido.id, p_payment_id: paymentId, p_estado: pago.status,
      p_total: calculo.total, p_revision: revisionPedido(pedido), p_referencia: referencia,
      p_actualizado_en: Number.isFinite(actualizado) ? new Date(actualizado).toISOString() : null,
      p_dias: ({ day: 1, week: 7, month: 30 } as Record<string, number>)[calculo.duracion],
    });
    // Una repetición no vuelve a publicar ni cambia publicado_en/vence_en.
    const acciones = ["publicado", "repetido", "registrado", "ya_pagado", "cambio", "revision", "otro_pedido", "invalido"];
    const accion = acciones.includes(String(resultado.accion)) ? resultado.accion : "revisar";
    if (["cambio", "revision", "otro_pedido", "invalido", "revisar"].includes(String(accion))) console.error("pago_requiere_revision", accion);
    return responderJSON({ recibido: true, accion }, 200, headers);
  } catch (error) {
    // Un 5xx permite el reenvío de Mercado Pago ante una caída transitoria real.
    return responderError(error, headers);
  }
}

Deno.serve(webhookMercadoPago);
