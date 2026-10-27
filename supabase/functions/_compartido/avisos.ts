import { baseSupabaseServidor, fetchConTiempo } from "./http.ts";

// Un fallo del aviso nunca cancela un pago confirmado ni su publicación.
export async function avisarPagoAdmin(pedidoId: string): Promise<void> {
  const secreto = Deno.env.get("AVISOS_SECRETO") || "";
  if (!/^[a-f0-9]{64}$/.test(secreto)) return;
  const trabajo = (async () => {
    try {
      const respuesta = await fetchConTiempo(baseSupabaseServidor() + "/functions/v1/avisar-admin", {
        method: "POST", headers: { "Content-Type": "application/json", "x-eros-aviso": secreto },
        body: JSON.stringify({ pedido_id: pedidoId, tipo: "pagado" }),
      }, 22000);
      if (!respuesta.ok || respuesta.status === 207) console.error("aviso_pago_pendiente", respuesta.status);
    } catch { console.error("aviso_pago_no_disponible"); }
  })();
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(trabajo);
  else await trabajo;
}
