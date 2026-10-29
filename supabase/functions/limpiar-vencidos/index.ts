import { baseSupabaseServidor, cabecerasServidor, ErrorCobro, fetchConTiempo, leerCuerpo, responderJSON, rpcCobro } from "../_compartido/http.ts";

class LimpiezaPendiente extends Error {}
class ErrorStorageLimpieza extends Error {
  constructor(public codigo: string, public estadoHTTP: number | null = null) { super(codigo); }
}

function secretoLimpiezaValido(recibido: string, esperado: string): boolean {
  let diferencia = recibido.length ^ esperado.length;
  // El secreto tiene exactamente 64 caracteres. Nunca termina antes por una diferencia.
  for (let i = 0; i < 64; i++) diferencia |= (recibido.charCodeAt(i) || 0) ^ (esperado.charCodeAt(i) || 0);
  return diferencia === 0;
}

function nombreStorageSeguro(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0 && valor.length <= 200 &&
    valor !== "." && valor !== ".." && !/[\\/\u0000-\u001f%]/.test(valor);
}

async function vaciarCarpeta(id: string, hasta: number): Promise<void> {
  let operaciones = 0;
  function margen() {
    if (Date.now() >= hasta - 100 || operaciones >= 12) throw new LimpiezaPendiente();
  }
  async function storage(ruta: string, metodo: string, body: unknown): Promise<Response> {
    margen(); operaciones++;
    let respuesta: Response;
    try {
      respuesta = await fetchConTiempo(baseSupabaseServidor() + "/storage/v1/" + ruta, {
        method: metodo, headers: cabecerasServidor(), body: JSON.stringify(body), redirect: "error",
      }, 7000, hasta);
    } catch {
      if (Date.now() >= hasta - 100) throw new LimpiezaPendiente();
      throw new ErrorStorageLimpieza("conexion");
    }
    if (!respuesta.ok) throw new ErrorStorageLimpieza("http", respuesta.status);
    return respuesta;
  }
  async function carpeta(bucket: "fotos" | "audios", prefix: string, profundidad: number): Promise<void> {
    if (profundidad > 5 || (prefix !== id && !prefix.startsWith(id + "/"))) throw new ErrorStorageLimpieza("prefijo");
    let listaAnterior = "";
    while (true) {
      const respuesta = await storage("object/list/" + bucket, "POST", { prefix, limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } });
      let lista: unknown;
      try { lista = await respuesta.json(); } catch { throw new ErrorStorageLimpieza("respuesta"); }
      if (!Array.isArray(lista) || lista.length > 100) throw new ErrorStorageLimpieza("respuesta");
      if (!lista.length) return; // Verificación explícita antes de marcar el pedido como limpio.
      const archivos: string[] = [], subcarpetas: string[] = [];
      for (const item of lista) {
        if (!item || typeof item !== "object" || !nombreStorageSeguro(item.name)) throw new ErrorStorageLimpieza("nombre");
        const ruta = prefix + "/" + item.name;
        if (typeof item.id === "string" && item.id.length > 0) archivos.push(ruta);
        else if (item.id === null && item.metadata == null) subcarpetas.push(ruta);
        else throw new ErrorStorageLimpieza("respuesta");
      }
      const huella = JSON.stringify(lista.map(item => [item.name, item.id]));
      if (huella === listaAnterior) throw new ErrorStorageLimpieza("sin_progreso");
      listaAnterior = huella;
      if (archivos.length) {
        // La API, no SQL, elimina los archivos físicos. Nunca se sale del UUID reclamado.
        await storage("object/" + bucket, "DELETE", { prefixes: archivos });
      }
      for (const subcarpeta of subcarpetas) await carpeta(bucket, subcarpeta, profundidad + 1);
      // Después de borrar siempre vuelve a offset 0: los índices anteriores ya cambiaron.
    }
  }
  for (const bucket of ["fotos", "audios"] as const) await carpeta(bucket, id, 0);
}

export async function limpiarVencidos(req: Request): Promise<Response> {
  const secreto = Deno.env.get("LIMPIEZA_SECRETO") || "";
  if (!/^[a-f0-9]{64}$/.test(secreto)) return responderJSON({ error: "configuracion" }, 503);
  if (!secretoLimpiezaValido(req.headers.get("x-eros-limpieza") || "", secreto)) return responderJSON({ error: "no_autorizado" }, 401);
  if (req.method !== "POST") return responderJSON({ error: "metodo" }, 405);

  // No se permite elegir códigos, UUIDs, fechas ni filtros desde la petición.
  try {
    const body = await leerCuerpo(req, 128);
    if (Object.keys(body).length) return responderJSON({ error: "cuerpo" }, 400);
  } catch { return responderJSON({ error: "cuerpo" }, 400); }

  const hasta = Date.now() + 22000;
  const operacionesHasta = hasta - 2000;
  const token = crypto.randomUUID();
  let procesados = 0, limpiados = 0, fallidos = 0, pendientes = true, fatal = false;
  try {
    const lote: unknown = await rpcCobro("eros_reclamar_vencidos", { p_token: token, p_limite: 5 }, operacionesHasta);
    if (!Array.isArray(lote) || lote.length > 5 || lote.some(p => !p || typeof p.id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(p.id))) {
      throw new ErrorStorageLimpieza("lote");
    }
    for (const pedido of lote) {
      if (Date.now() >= operacionesHasta - 1000) break;
      procesados++;
      try {
        const permiso = await rpcCobro("eros_validar_limpieza", { p_pedido_id: pedido.id, p_token: token }, operacionesHasta);
        if (permiso.valido !== true) throw new ErrorStorageLimpieza("reserva");
        await vaciarCarpeta(pedido.id, operacionesHasta);
        const resultado = await rpcCobro("eros_finalizar_limpieza", { p_pedido_id: pedido.id, p_token: token }, operacionesHasta);
        if (resultado.limpiado !== true) throw new ErrorStorageLimpieza("confirmacion");
        limpiados++;
      } catch (error) {
        if (error instanceof LimpiezaPendiente || Date.now() >= operacionesHasta - 100) break;
        fallidos++;
        // Solo etiquetas fijas/estado HTTP. Nunca nombres, UUID, rutas ni cuerpos de error.
        if (error instanceof ErrorStorageLimpieza) console.error("limpieza_storage", error.codigo, error.estadoHTTP);
        else console.error("limpieza_pedido", error instanceof ErrorCobro ? error.codigo : "interno");
      }
    }
  } catch {
    fatal = true;
    console.error("limpieza_lote_incompleto");
  } finally {
    try { await rpcCobro("eros_liberar_limpieza", { p_token: token }, Date.now() + 1000); }
    catch { fatal = true; console.error("limpieza_reservas_pendientes"); }
  }
  try {
    const cola = await rpcCobro("eros_limpiezas_pendientes", {}, Date.now() + 1000);
    if (typeof cola.pendientes !== "boolean") throw new ErrorStorageLimpieza("cola");
    pendientes = cola.pendientes;
  } catch { fatal = true; console.error("limpieza_cola_no_confirmada"); }
  const ok = !fatal && fallidos === 0;
  return responderJSON({ ok, procesados, limpiados, fallidos, pendientes }, fatal ? 503 : ok ? 200 : 207);
}

Deno.serve(limpiarVencidos);
