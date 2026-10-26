const json = (status: number, value: Record<string, unknown>): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

// AVISO_SECRETO se genera con 64 caracteres hexadecimales.
// El bucle recorre siempre 64 posiciones y no termina al encontrar diferencias.
function secretoCoincide(recibido: string, esperado: string): boolean {
  let diferencia = recibido.length ^ esperado.length;
  for (let i = 0; i < 64; i += 1) {
    diferencia |= (recibido.charCodeAt(i) || 0) ^ (esperado.charCodeAt(i) || 0);
  }
  return diferencia === 0;
}

function normalizarEtiqueta(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor
    .trim()
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_-]+/g, "");
}

const MODELOS: Record<string, string> = {
  cartaparavos: "Carta para vos",
  carta: "Carta para vos",
  nuestrahistoria: "Nuestra historia",
  historia: "Nuestra historia",
  albumrecuerdos: "Álbum de recuerdos",
  albumderecuerdos: "Álbum de recuerdos",
  album: "Álbum de recuerdos",
};

const DURACIONES: Record<string, string> = {
  "1dia": "1 día",
  dia: "1 día",
  day: "1 día",
  "1semana": "1 semana",
  semana: "1 semana",
  week: "1 semana",
  "1mes": "1 mes",
  mes: "1 mes",
  month: "1 mes",
};

type Publicacion = {
  ok: boolean;
  httpStatus: number | null;
  timeout?: boolean;
  configuracion?: boolean;
  usedToken: boolean;
  ntfyError?: Record<string, string | number>;
  retryAfter?: string;
  rateLimitHeaders?: Record<string, string>;
};

function leerRetryAfter(valor: string | null, ahora: number): number | null {
  if (!valor) return null;
  const segundos = valor.trim();
  if (/^\d+(?:\.\d+)?$/.test(segundos)) {
    const milisegundos = Number(segundos) * 1_000;
    return Number.isFinite(milisegundos) ? milisegundos : null;
  }
  const fecha = Date.parse(segundos);
  return Number.isFinite(fecha) ? Math.max(0, fecha - ahora) : null;
}

function ocultarDatoSensible(texto: string, topico: string, token: string): string {
  let seguro = texto;
  if (topico) seguro = seguro.replaceAll(topico, "[oculto]");
  if (token) seguro = seguro.replaceAll(token, "[oculto]");
  return seguro
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[oculto]")
    .replace(/(?:www\.)?ntfy\.sh(?:\/[^\s"'<>]*)?/gi, "[oculto]")
    .slice(0, 200);
}

async function leerErrorNtfy(
  respuesta: Response,
  topico: string,
  token: string,
): Promise<Record<string, string | number>> {
  try {
    const cuerpo: unknown = await respuesta.json();
    if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
      return { error: "Respuesta de ntfy sin campos JSON reconocidos" };
    }

    const origen = cuerpo as Record<string, unknown>;
    const error: Record<string, string | number> = {};
    for (const campo of ["code", "http", "error", "message"]) {
      const valor = origen[campo];
      if (typeof valor === "string") {
        error[campo] = ocultarDatoSensible(valor, topico, token);
      } else if (typeof valor === "number" && Number.isFinite(valor)) {
        error[campo] = valor;
      }
    }
    return Object.keys(error).length
      ? error
      : { error: "Respuesta de ntfy sin campos JSON reconocidos" };
  } catch {
    return { error: "No se pudo leer el JSON de error de ntfy" };
  }
}

function leerEncabezadosDiagnostico(
  respuesta: Response,
  topico: string,
  token: string,
): Pick<Publicacion, "retryAfter" | "rateLimitHeaders"> {
  const retry = respuesta.headers.get("retry-after");
  const rateLimitHeaders: Record<string, string> = {};
  for (const [nombre, valor] of respuesta.headers.entries()) {
    const clave = nombre.toLowerCase();
    if (/^(?:x-)?rate[-]?limit-/.test(clave)) {
      rateLimitHeaders[clave] = ocultarDatoSensible(valor, topico, token);
    }
  }
  return {
    ...(retry !== null
      ? { retryAfter: ocultarDatoSensible(retry, topico, token) }
      : {}),
    ...(Object.keys(rateLimitHeaders).length ? { rateLimitHeaders } : {}),
  };
}

async function publicarEnNtfy(
  mensaje: string,
  diagnosticoPrueba = false,
): Promise<Publicacion> {
  const topico = Deno.env.get("NTFY_TOPICO") ?? "";
  // Un tópico se usa como un solo segmento de ruta, nunca como URL o texto libre.
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(topico)) {
    return {
      ok: false,
      httpStatus: null,
      configuracion: true,
      usedToken: false,
    };
  }

  const token = (Deno.env.get("NTFY_TOKEN") ?? "").trim();
  const usadosToken = token.length > 0;
  const cabeceras = new Headers({
    "Content-Type": "text/plain; charset=utf-8",
    "Title": "Eros Web",
    "Priority": "high",
    "Tags": "heart",
  });
  if (usadosToken) {
    cabeceras.set("Authorization", `Bearer ${token}`);
  }

  // Tres intentos como máximo; el presupuesto global deja margen bajo los 20 s.
  const limite = performance.now() + 18_000;
  const esperasBase = [1_000, 3_000];
  let ultimoEstado: number | null = null;
  let ultimoDiagnostico: Pick<
    Publicacion,
    "ntfyError" | "retryAfter" | "rateLimitHeaders"
  > = {};

  for (let intento = 0; intento < 3; intento += 1) {
    const restante = limite - performance.now();
    if (restante <= 0) break;

    const abortador = new AbortController();
    const temporizador = setTimeout(
      () => abortador.abort(),
      Math.min(8_000, restante),
    );

    try {
      const respuesta = await fetch(`https://ntfy.sh/${topico}`, {
        method: "POST",
        headers: cabeceras,
        body: mensaje,
        signal: abortador.signal,
      });
      if (!diagnosticoPrueba) clearTimeout(temporizador);
      ultimoEstado = respuesta.status;
      const encabezadosDiagnostico = diagnosticoPrueba
        ? leerEncabezadosDiagnostico(respuesta, topico, token)
        : {};

      if (respuesta.ok) {
        return {
          ok: true,
          httpStatus: respuesta.status,
          usedToken: usadosToken,
          ...encabezadosDiagnostico,
        };
      }

      const ntfyError = diagnosticoPrueba
        ? await leerErrorNtfy(respuesta, topico, token)
        : undefined;
      if (diagnosticoPrueba) clearTimeout(temporizador);
      ultimoDiagnostico = {
        ...encabezadosDiagnostico,
        ...(ntfyError ? { ntfyError } : {}),
      };

      if (respuesta.status !== 429 || intento === 2) {
        return {
          ok: false,
          httpStatus: respuesta.status,
          usedToken: usadosToken,
          ...ultimoDiagnostico,
        };
      }

      // Si ntfy indicó una espera, se respeta; si no, se usa 1 s y luego 3 s.
      const retryAfter = leerRetryAfter(
        respuesta.headers.get("retry-after"),
        Date.now(),
      );
      const espera = retryAfter ?? esperasBase[intento];
      if (!diagnosticoPrueba) {
        void respuesta.body?.cancel().catch(() => undefined);
      }

      if (espera >= limite - performance.now()) {
        return {
          ok: false,
          httpStatus: respuesta.status,
          usedToken: usadosToken,
          ...ultimoDiagnostico,
        };
      }

      await new Promise<void>((resolve) => setTimeout(resolve, espera));
    } catch {
      return {
        ok: false,
        httpStatus: null,
        timeout: abortador.signal.aborted,
        usedToken: usadosToken,
        ...ultimoDiagnostico,
      };
    } finally {
      clearTimeout(temporizador);
    }
  }

  return {
    ok: false,
    httpStatus: ultimoEstado,
    usedToken: usadosToken,
    ...ultimoDiagnostico,
  };
}

function informarPrueba(resultado: Publicacion): Response {
  if (resultado.ok) {
    return json(200, {
      ok: true,
      ntfy: "respondio",
      httpStatus: resultado.httpStatus,
      usedToken: resultado.usedToken,
    ...(resultado.retryAfter !== undefined
      ? { retryAfter: resultado.retryAfter }
      : {}),
    ...(resultado.rateLimitHeaders
      ? { rateLimitHeaders: resultado.rateLimitHeaders }
      : {}),
    });
  }
  return json(200, {
    ok: false,
    ntfy: "fallo",
    httpStatus: resultado.httpStatus,
    usedToken: resultado.usedToken,
    ...(resultado.ntfyError ? { ntfyError: resultado.ntfyError } : {}),
    ...(resultado.retryAfter !== undefined
      ? { retryAfter: resultado.retryAfter }
      : {}),
    ...(resultado.rateLimitHeaders
      ? { rateLimitHeaders: resultado.rateLimitHeaders }
      : {}),
    motivo: resultado.configuracion
      ? "configuracion"
      : resultado.timeout
      ? "timeout"
      : "http_error",
  });
}

Deno.serve(async (solicitud: Request): Promise<Response> => {
  if (solicitud.method !== "POST") {
    return json(405, { ok: false, error: "metodo_no_permitido" });
  }

  const esperado = Deno.env.get("AVISO_SECRETO") ?? "";
  if (!/^[a-f0-9]{64}$/.test(esperado)) {
    return json(500, { ok: false, error: "secreto_no_configurado" });
  }

  const recibido = solicitud.headers.get("x-eros-secreto") ?? "";
  if (!secretoCoincide(recibido, esperado)) {
    return json(401, { ok: false, error: "no_autorizado" });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await solicitud.json();
  } catch {
    return json(400, { ok: false, error: "json_invalido" });
  }

  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return json(400, { ok: false, error: "json_invalido" });
  }

  const datos = cuerpo as Record<string, unknown>;

  // Prueba manual: publica una frase fija y no necesita una fila de pedidos.
  if (datos.prueba === true) {
    return informarPrueba(await publicarEnNtfy("Prueba de Eros Web", true));
  }

  const registro = datos.record;
  if (!registro || typeof registro !== "object" || Array.isArray(registro)) {
    return json(200, { ok: false, ignorado: true });
  }

  const pedido = registro as Record<string, unknown>;
  // Se leen solo estos cuatro campos; los demás datos del registro no se usan.
  const codigo = typeof pedido.codigo === "string" ? pedido.codigo : "";
  const modelo = MODELOS[normalizarEtiqueta(pedido.modelo)];
  const duracion = DURACIONES[normalizarEtiqueta(pedido.duracion)];
  const total = pedido.total;

  if (
    !/^[A-Z0-9]{6}$/.test(codigo) ||
    !modelo ||
    !duracion ||
    typeof total !== "number" ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > 100_000
  ) {
    return json(200, { ok: false, ignorado: true });
  }

  const pesos = new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(total);
  const mensaje = `Nuevo pedido ${codigo} · ${modelo} · ${duracion} · $${pesos}`;
  const resultado = await publicarEnNtfy(mensaje);

  if (!resultado.ok) {
    // Solo queda registrado el estado HTTP; no se imprime el tópico ni el pedido.
    console.warn(`ntfy_http_status=${resultado.httpStatus ?? "unavailable"}`);
  }

  // La notificación no debe hacer que Supabase reintente el webhook.
  return json(200, {
    ok: resultado.ok,
    httpStatus: resultado.httpStatus,
  });
});
