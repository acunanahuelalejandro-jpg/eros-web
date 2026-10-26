import { ErrorCobro, fetchConTiempo, modoMercadoPago } from "./http.ts";

export class ErrorMercadoPago extends ErrorCobro {
  constructor(public httpProveedor: number | null, public incierto: boolean) {
    super(502, "mercado_pago", "Mercado Pago no pudo completar la consulta. Esperá un momento y volvé a intentar.");
  }
}

export async function apiMercadoPago(ruta: string, metodo = "GET", cuerpo?: unknown, hasta = Infinity): Promise<Record<string, unknown>> {
  const token = Deno.env.get("MP_ACCESS_TOKEN") || "";
  if (!token || /PEGAR|TU_TOKEN|[\r\n]/.test(token)) {
    throw new ErrorCobro(503, "configuracion", "Todavía no está configurado Mercado Pago.");
  }
  let respuesta: Response;
  try {
    respuesta = await fetchConTiempo("https://api.mercadopago.com" + ruta, {
      method: metodo,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    }, 8000, hasta);
  } catch {
    throw new ErrorMercadoPago(null, true);
  }
  if (!respuesta.ok) {
    console.error("mercadopago_http", respuesta.status);
    throw new ErrorMercadoPago(respuesta.status, respuesta.status >= 500);
  }
  try { return await respuesta.json(); } catch { throw new ErrorMercadoPago(respuesta.status, true); }
}

export async function verificarVendedor(hasta = Infinity): Promise<string> {
  const vendedor = await apiMercadoPago("/users/me", "GET", undefined, hasta);
  const id = String(vendedor.id || "");
  const esPrueba = Array.isArray(vendedor.tags) && vendedor.tags.includes("test_user");
  const modo = modoMercadoPago();
  if (!/^\d{1,20}$/.test(id) || (modo === "test" ? !esPrueba : esPrueba)) {
    throw new ErrorCobro(503, "modo_mercado_pago", "La cuenta de Mercado Pago no coincide con el modo configurado. Consultanos antes de pagar.");
  }
  return id;
}

export async function mediosExcluidos(hasta = Infinity): Promise<{ id: string }[]> {
  // Solo tarjeta y dinero disponible. Se excluyen también tipos nuevos que la API anuncie.
  const respuesta = await apiMercadoPago("/v1/payment_methods", "GET", undefined, hasta) as unknown;
  if (!Array.isArray(respuesta)) throw new ErrorMercadoPago(null, false);
  const tipos = new Set<string>(["ticket", "atm", "bank_transfer"]);
  for (const medio of respuesta) {
    const tipo = medio && typeof medio === "object" ? (medio as Record<string, unknown>).payment_type_id : "";
    if (typeof tipo === "string" && /^[a-z_]{1,40}$/.test(tipo) && !tipoAcreditacionInmediata(tipo)) tipos.add(tipo);
  }
  return Array.from(tipos, id => ({ id }));
}

export function tipoAcreditacionInmediata(valor: unknown): boolean {
  return ["credit_card", "debit_card", "prepaid_card", "account_money"].includes(String(valor));
}

export async function firmaMercadoPagoValida(req: Request, id: string): Promise<boolean> {
  const secreto = Deno.env.get("MP_WEBHOOK_SECRET") || "";
  if (!secreto) {
    if (modoMercadoPago() === "produccion") {
      throw new ErrorCobro(503, "configuracion", "Falta configurar la firma del webhook.");
    }
    return true;
  }
  const url = new URL(req.url);
  if (url.searchParams.get("data.id") !== id) return false;
  const requestId = req.headers.get("x-request-id") || "";
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(requestId)) return false;
  const firma = req.headers.get("x-signature") || "";
  if (firma.length > 1024) return false;
  const partes = firma.split(",").map(p => p.trim().split("="));
  const marcas = partes.filter(([k]) => k === "ts");
  const firmas = partes.filter(([k, v]) => k === "v1" && /^[a-f0-9]{64}$/i.test(v || ""));
  if (marcas.length !== 1 || !/^\d{10,16}$/.test(marcas[0][1] || "") || !firmas.length) return false;
  // Se usa el data.id de la URL, como exige Mercado Pago. Los reenvíos se deduplican en SQL.
  const manifiesto = "id:" + id.toLowerCase() + ";request-id:" + requestId + ";ts:" + marcas[0][1] + ";";
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firmaBytes = new Uint8Array(await crypto.subtle.sign("HMAC", clave, new TextEncoder().encode(manifiesto)));
  const esperada = Array.from(firmaBytes, b => b.toString(16).padStart(2, "0")).join("");
  let coincide = 0;
  for (const [, recibida] of firmas) {
    let diferencia = 0;
    for (let i = 0; i < 64; i++) diferencia |= esperada.charCodeAt(i) ^ recibida.toLowerCase().charCodeAt(i);
    coincide |= diferencia === 0 ? 1 : 0;
  }
  return coincide === 1;
}
