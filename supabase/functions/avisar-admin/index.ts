import { consultarBD, ErrorCobro, hashCobro, leerCuerpo, responderJSON, rpcCobro } from "../_compartido/http.ts";
import { configurarVapid, enviarWebPush, payloadAviso, validarSuscripcionPush, type EnviarPush } from "../_compartido/push.ts";

function secretoAvisosValido(recibido: string, esperado: string): boolean {
  let diferencia = recibido.length ^ esperado.length;
  for (let i = 0; i < 64; i++) diferencia |= (recibido.charCodeAt(i) || 0) ^ (esperado.charCodeAt(i) || 0);
  return diferencia === 0;
}
const uuidAviso = (valor: unknown): valor is string => typeof valor === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(valor);

export function crearManejadorAvisos(enviar: EnviarPush = enviarWebPush) {
  return async function avisarAdmin(req: Request): Promise<Response> {
    const secreto = Deno.env.get("AVISOS_SECRETO") || "";
    if (!/^[a-f0-9]{64}$/.test(secreto)) return responderJSON({ error: "configuracion" }, 503);
    if (!secretoAvisosValido(req.headers.get("x-eros-aviso") || "", secreto)) return responderJSON({ error: "no_autorizado" }, 401);
    if (req.method !== "POST") return responderJSON({ error: "metodo" }, 405);

    const hasta = Date.now() + 20000;
    let id = "", tipo: "nuevo" | "pagado" = "nuevo", prueba = false, reserva = "";
    let enviados = 0, fallidos = 0, descartados = 0, repetido = false, pendientes = false, sinDispositivos = false;
    let errorFatal = "", estadoFatal = 503;
    try {
      const body = await leerCuerpo(req, 131072);
      prueba = body.prueba === true;
      if (!prueba) {
        if (body.type === "INSERT" && body.schema === "public" && body.table === "pedidos") {
          const record = body.record && typeof body.record === "object" ? body.record as Record<string, unknown> : {};
          // El Database Webhook trae una fila completa. Solo se toma su identificador;
          // el mensaje se construye con cuatro campos recargados y filtrados por SQL.
          if (!uuidAviso(record.id)) return responderJSON({ error: "pedido" }, 400);
          id = record.id.toLowerCase(); tipo = "nuevo";
        } else {
          if (!uuidAviso(body.pedido_id) || !["nuevo", "pagado"].includes(String(body.tipo))) return responderJSON({ error: "pedido" }, 400);
          id = body.pedido_id.toLowerCase(); tipo = body.tipo as "nuevo" | "pagado";
        }
      }
      const vapid = configurarVapid();
      let entregas: unknown;
      let payload: Record<string, unknown>;
      if (prueba) {
        const limite = await rpcCobro("eros_limitar_cobro", { p_clave: await hashCobro(secreto + ":prueba-push"), p_limite: 5, p_segundos: 3600 }, hasta);
        if (limite.permitido !== true) return responderJSON({ error: "limite_pruebas" }, 429);
        entregas = await rpcCobro("eros_suscripciones_push", {}, hasta);
        payload = { version: 1, tipo: "prueba", evento: "prueba:" + crypto.randomUUID() };
      } else {
        reserva = crypto.randomUUID();
        const lote = await rpcCobro("eros_reclamar_avisos", { p_pedido_id: id, p_tipo: tipo, p_reserva: reserva }, hasta);
        if (lote.valido !== true) return responderJSON({ ok: true, enviados: 0, fallidos: 0, descartados: 0, repetido: false, omitido: true });
        repetido = lote.repetido === true; sinDispositivos = lote.sin_dispositivos === true;
        pendientes = lote.pendientes === true;
        entregas = lote.entregas;
        const minimo = lote.pedido && typeof lote.pedido === "object" ? lote.pedido as Record<string, unknown> : {};
        const mensaje = payloadAviso(minimo, tipo, id);
        if (!mensaje) throw new ErrorCobro(503, "aviso_invalido", "El pedido requiere revisión.");
        payload = mensaje;
      }
      if (!Array.isArray(entregas) || entregas.length > 50 || entregas.some(s => !s || !uuidAviso(s.id))) throw new ErrorCobro(503, "suscripciones", "No pudimos consultar los dispositivos.");
      sinDispositivos ||= prueba && entregas.length === 0;
      const texto = JSON.stringify(payload), topic = (await hashCobro(String(payload.evento))).slice(0, 32);
      let indice = 0;
      async function terminar(subId: string, resultado: "enviado" | "reintentar" | "descartado") {
        if (prueba) {
          if (resultado === "descartado") await consultarBD("admin_push_subscriptions?id=eq." + encodeURIComponent(subId), "DELETE", undefined, hasta);
        } else {
          const fin = await rpcCobro("eros_finalizar_entrega_aviso", { p_pedido_id: id, p_tipo: tipo, p_reserva: reserva, p_suscripcion_id: subId, p_resultado: resultado }, hasta);
          if (fin.guardado !== true) throw new ErrorCobro(503, "reserva", "No pudimos confirmar el aviso.");
        }
      }
      async function siguiente() {
        while (indice < (entregas as unknown[]).length) {
          if (Date.now() >= hasta - 1800) { pendientes = true; return; }
          const registro = (entregas as Record<string, unknown>[])[indice++];
          const subId = registro.id as string;
          const suscripcion = validarSuscripcionPush(registro);
          if (!suscripcion) { await terminar(subId, "descartado"); descartados++; continue; }
          let resultado: "enviado" | "reintentar" | "descartado";
          try {
            const respuesta = await enviar(suscripcion, texto, { vapidDetails: vapid, TTL: 300, urgency: "high", topic, timeout: Math.max(1, Math.min(5000, hasta - Date.now() - 1800)) });
            if (typeof respuesta.statusCode !== "number" || respuesta.statusCode < 200 || respuesta.statusCode >= 300) throw { statusCode: respuesta.statusCode };
            resultado = "enviado";
          } catch (error) {
            const codigo = error && typeof error === "object" && "statusCode" in error && Number.isInteger(error.statusCode) ? Number(error.statusCode) : null;
            // web-push puede incluir endpoint y claves en el error: nunca registrarlo completo.
            console.error("push_http", codigo);
            resultado = codigo === 404 || codigo === 410 ? "descartado" : "reintentar";
          }
          // Confirmar en BD es una operación distinta del envío al proveedor.
          // Si falla, queda pendiente: no se atribuye el error al transporte.
          try { await terminar(subId, resultado); }
          catch { fallidos++; console.error("aviso_confirmacion_pendiente"); return; }
          if (resultado === "enviado") enviados++;
          else if (resultado === "descartado") descartados++;
          else fallidos++;
        }
      }
      const trabajos = await Promise.allSettled(Array.from({ length: Math.min(4, entregas.length) }, siguiente));
      if (trabajos.some(t => t.status === "rejected")) fallidos++;
    } catch (error) {
      console.error("aviso_admin_error", error instanceof ErrorCobro ? error.codigo : "interno");
      errorFatal = error instanceof ErrorCobro ? error.codigo : "servidor";
      estadoFatal = error instanceof ErrorCobro ? error.estado : 503;
      fallidos++;
    } finally {
      if (reserva && id) {
        try {
          const cierre = await rpcCobro("eros_cerrar_aviso", { p_pedido_id: id, p_tipo: tipo, p_reserva: reserva }, Date.now() + 1000);
          pendientes = cierre.pendientes === true;
        } catch { fallidos++; pendientes = true; console.error("aviso_reserva_pendiente"); }
      }
    }
    const ok = fallidos === 0 && !pendientes;
    if (errorFatal) return responderJSON({ error: errorFatal, ok: false, enviados, fallidos, descartados, pendientes }, estadoFatal);
    return responderJSON({ ok, enviados, fallidos, descartados, repetido, pendientes, sin_dispositivos: sinDispositivos }, ok ? 200 : 207);
  };
}

export const avisarAdmin = crearManejadorAvisos();
Deno.serve(avisarAdmin);
