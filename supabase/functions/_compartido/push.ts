import webpush from "npm:web-push@3.6.7";
import { createECDH } from "node:crypto";
import { EROS_PRECIOS, resolverDuracion, resolverModelo } from "./precios.ts";
import { ErrorCobro, sitioEros } from "./http.ts";

export type SuscripcionPush = { endpoint: string; keys: { p256dh: string; auth: string } };
export type OpcionesPush = {
  vapidDetails: { subject: string; publicKey: string; privateKey: string };
  TTL: number; urgency: "high"; topic: string; timeout: number;
};
export type EnviarPush = (suscripcion: SuscripcionPush, payload: string, opciones: OpcionesPush) => Promise<{ statusCode?: number }>;
export const enviarWebPush: EnviarPush = (suscripcion, payload, opciones) => webpush.sendNotification(suscripcion, payload, opciones);

function bytesBase64URL(valor: string): Uint8Array {
  const normal = valor.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normal + "=".repeat((4 - normal.length % 4) % 4)), c => c.charCodeAt(0));
}
function base64URLBytes(valor: Uint8Array): string {
  return btoa(String.fromCharCode(...valor)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function configurarVapid(): OpcionesPush["vapidDetails"] {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
  try {
    if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) throw new Error();
    const par = createECDH("prime256v1"); par.setPrivateKey(bytesBase64URL(privateKey));
    if (base64URLBytes(par.getPublicKey()) !== publicKey) throw new Error();
  } catch {
    // Nunca incluir las claves ni el error de criptografía en logs o respuestas.
    throw new ErrorCobro(503, "configuracion_vapid", "Revisá las claves VAPID de Supabase.");
  }
  return { subject: new URL("admin/", sitioEros()).href, publicKey, privateKey };
}

export function validarSuscripcionPush(registro: unknown): SuscripcionPush | null {
  if (!registro || typeof registro !== "object") return null;
  const fila = registro as Record<string, unknown>;
  if (typeof fila.endpoint !== "string" || fila.endpoint.length > 2048) return null;
  const raw = fila.suscripcion && typeof fila.suscripcion === "object" ? fila.suscripcion as Record<string, unknown> : {};
  if (raw.endpoint !== fila.endpoint || !raw.keys || typeof raw.keys !== "object") return null;
  const keys = raw.keys as Record<string, unknown>;
  if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string" ||
    !/^[A-Za-z0-9_-]{87}=?$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{22}(?:==)?$/.test(keys.auth)) return null;
  try {
    const url = new URL(fila.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.pathname.length < 2) return null;
    const host = url.hostname.toLowerCase();
    // No se hace fetch a hosts arbitrarios guardados en una suscripción.
    const permitido = host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" ||
      /^[a-z0-9-]+\.push\.apple\.com$/.test(host) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(host);
    if (!permitido || bytesBase64URL(keys.auth).length !== 16) return null;
    const publico = bytesBase64URL(keys.p256dh);
    if (publico.length !== 65 || publico[0] !== 4) return null;
    const verificador = createECDH("prime256v1");
    verificador.generateKeys(); verificador.computeSecret(publico);
    return { endpoint: fila.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
  } catch { return null; }
}

export function payloadAviso(pedido: Record<string, unknown>, tipo: "nuevo" | "pagado", id: string): Record<string, unknown> | null {
  const modelo = resolverModelo(pedido.modelo) as keyof typeof EROS_PRECIOS.models;
  const duracion = resolverDuracion(pedido.duracion) as keyof typeof EROS_PRECIOS.durations;
  if (typeof pedido.codigo !== "string" || !/^[A-Z0-9]{6}$/.test(pedido.codigo) || !modelo || !duracion ||
    !Number.isSafeInteger(pedido.total) || Number(pedido.total) < 1 || Number(pedido.total) > 100000) return null;
  return { version: 1, tipo, codigo: pedido.codigo, modelo: EROS_PRECIOS.models[modelo].name,
    duracion: EROS_PRECIOS.durations[duracion], total: pedido.total, evento: tipo + ":" + id };
}
