import { buscarPedido, credencialPedido, estadoPagoPublico } from "../_compartido/cobros.ts";
import { cabecerasNavegador, ErrorCobro, leerCuerpo, limitarCobro, responderError, responderJSON, rpcCobro, urlRegalo } from "../_compartido/http.ts";

export async function estadoPedido(req: Request): Promise<Response> {
  const hasta = Date.now() + 18000;
  let headers: Headers | undefined;
  try {
    headers = cabecerasNavegador(req);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (req.method !== "POST") throw new ErrorCobro(405, "metodo", "Usá el enlace de seguimiento del pedido.");
    await limitarCobro(req, "estado-pedido", 180, 60, hasta);
    const cuerpo = await leerCuerpo(req);
    const pedido = await buscarPedido(credencialPedido(cuerpo), false, hasta);
    const cobro = await rpcCobro("eros_estado_cobro", { p_pedido_id: pedido.id }, hasta);
    const estado = pedido.estado === "publicado" && pedido.vence_en && Date.parse(pedido.vence_en) <= Date.now()
      ? "vencido" : pedido.estado;
    return responderJSON({
      estado, codigo: pedido.codigo, slug: pedido.slug,
      pago: pedido.mp_payment_id ? "aprobado" : estadoPagoPublico(cobro.estado),
      link: estado === "publicado" ? urlRegalo(pedido.slug) : null,
    }, 200, headers);
  } catch (error) { return responderError(error, headers); }
}

Deno.serve(estadoPedido);
