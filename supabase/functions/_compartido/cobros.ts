import { calcularPrecioPedido, EROS_PRECIOS } from "./precios.ts";
import { consultarBD, ErrorCobro, hashCobro } from "./http.ts";
import type { AudioPedido } from "./audio.ts";

export type PedidoCobro = AudioPedido & {
  id: string; codigo: string; slug: string; estado: string;
  modelo: string; duracion: string; extras: Record<string, unknown>;
  datos: Record<string, unknown>; total: number; activar_el: string | null;
  fotos_cantidad: number; mp_preference_id: string | null; mp_payment_id: string | null;
  vence_en?: string | null;
};

export type CredencialPedido = { slug: string } | { id: string; codigo: string };

export function credencialPedido(cuerpo: Record<string, unknown>): CredencialPedido {
  if (typeof cuerpo.slug === "string" && /^[23456789abcdefgh]{12,32}$/.test(cuerpo.slug)) {
    return { slug: cuerpo.slug };
  }
  if (typeof cuerpo.id === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(cuerpo.id) &&
    typeof cuerpo.codigo === "string" && /^[A-Z0-9]{6}$/.test(cuerpo.codigo)) {
    return { id: cuerpo.id.toLowerCase(), codigo: cuerpo.codigo };
  }
  throw new ErrorCobro(400, "pedido", "Abrí el seguimiento de tu pedido o volvé al armador.");
}

export async function buscarPedido(credencial: CredencialPedido, completo = true, hasta = Infinity): Promise<PedidoCobro> {
  const columnas = completo
    ? "id,codigo,slug,estado,modelo,duracion,extras,datos,total,activar_el,fotos_cantidad,mp_preference_id,mp_payment_id,audio_ruta,audio_nombre,audio_bytes,audio_duracion,audio_consentimiento,audio_verificado_en,audio_sha256,limpiado_en,limpieza_intentada_en"
    : "id,codigo,slug,estado,mp_payment_id,vence_en";
  const filtro = "slug" in credencial
    ? "slug=eq." + encodeURIComponent(credencial.slug)
    : "id=eq." + encodeURIComponent(credencial.id) + "&codigo=eq." + encodeURIComponent(credencial.codigo);
  const filas = await consultarBD("pedidos?select=" + columnas + "&" + filtro + "&limit=1", "GET", undefined, hasta) as PedidoCobro[];
  if (!Array.isArray(filas) || !filas[0]) {
    throw new ErrorCobro(404, "pedido", "No pudimos encontrar ese pedido. Revisá el enlace o consultanos con tu código.");
  }
  return filas[0];
}

export function revisionPedido(pedido: PedidoCobro): Record<string, unknown> {
  // Se compara esta copia dentro de una transacción para detectar cambios mientras se cobra.
  return {
    modelo: pedido.modelo, duracion: pedido.duracion, extras: pedido.extras,
    total: pedido.total, activar_el: pedido.activar_el,
  };
}

export function jsonOrdenado(valor: unknown): string {
  if (Array.isArray(valor)) return "[" + valor.map(jsonOrdenado).join(",") + "]";
  if (valor && typeof valor === "object") {
    return "{" + Object.entries(valor).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) =>
      JSON.stringify(k) + ":" + jsonOrdenado(v)
    ).join(",") + "}";
  }
  return JSON.stringify(valor) ?? "null";
}

export function validarPrecio(pedido: PedidoCobro) {
  let calculo;
  try { calculo = calcularPrecioPedido(pedido); } catch {
    throw new ErrorCobro(409, "precio", "El modelo, la duración o los extras del pedido no son válidos. Consultanos con tu código.");
  }
  if (!Number.isSafeInteger(pedido.total) || calculo.total !== pedido.total) {
    throw new ErrorCobro(409, "precio", "El total del pedido no coincide con el precio vigente. Consultanos con tu código antes de pagar.");
  }
  const datos = pedido.datos;
  if (!datos || typeof datos !== "object" || !datos.extras || typeof datos.extras !== "object") {
    throw new ErrorCobro(409, "contenido", "Falta revisar el contenido del pedido. Consultanos con tu código.");
  }
  // El contenido y el resumen deben cobrar los mismos extras; no alcanza con confiar en el total.
  const extrasDatos = datos.extras as Record<string, unknown>;
  let calculoDatos;
  try { calculoDatos = calcularPrecioPedido({ ...pedido, extras: extrasDatos }); } catch {
    throw new ErrorCobro(409, "contenido", "Los extras del contenido no coinciden con el pedido.");
  }
  const juego = (v: unknown) => v === "pintar" ? "pintar-corazon" : (v || "");
  if (calculoDatos.total !== calculo.total || juego(extrasDatos.juego) !== juego(pedido.extras.juego)) {
    throw new ErrorCobro(409, "contenido", "Los extras del contenido no coinciden con el pedido. Consultanos antes de pagar.");
  }
  const modelo = EROS_PRECIOS.models[calculo.modelo as keyof typeof EROS_PRECIOS.models];
  if (!Number.isInteger(pedido.fotos_cantidad) || pedido.fotos_cantidad < 0 || pedido.fotos_cantidad > modelo.limit) {
    throw new ErrorCobro(409, "fotos", "La cantidad de fotos no coincide con el modelo elegido.");
  }
  return calculo;
}

export async function referenciaPrecio(pedido: PedidoCobro): Promise<string> {
  const calculo = validarPrecio(pedido);
  return await hashCobro(jsonOrdenado({
    modelo: calculo.modelo, duracion: calculo.duracion, total: calculo.total,
    juego: pedido.extras.juego === "pintar" ? "pintar-corazon" : (pedido.extras.juego || ""),
    contador: calculo.contador > 0, activar_el: pedido.activar_el,
  }));
}

export function checkoutSeguro(valor: unknown): string {
  if (typeof valor !== "string" || valor.length > 2048) return "";
  try {
    const url = new URL(valor);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    if (!["www.mercadopago.com", "www.mercadopago.com.ar", "mercadopago.com", "mercadopago.com.ar"].includes(url.hostname)) return "";
    if (!/^\/(?:mla\/)?checkout\//.test(url.pathname)) return "";
    return url.href;
  } catch { return ""; }
}

export function estadoPagoPublico(valor: unknown): "pendiente" | "rechazado" | "aprobado" | null {
  if (valor === "approved") return "aprobado";
  if (["pending", "in_process", "authorized", "in_mediation"].includes(String(valor))) return "pendiente";
  if (["rejected", "cancelled"].includes(String(valor))) return "rechazado";
  return null;
}
