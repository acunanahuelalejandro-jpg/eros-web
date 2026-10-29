import { EROS_PRECIOS, resolverModelo } from "./precios.ts";
import type { AudioPedido } from "./audio.ts";

type ObjetoPagina = Record<string, unknown>;
export type PedidoPagina = AudioPedido & {
  id: string; estado: string; modelo: string; datos: unknown; extras: unknown;
  tema: string; para_quien: string; de_parte: string | null;
  publicado_en: string | null; vence_en: string | null; activar_el: string | null;
};
const objetoPagina = (v: unknown): ObjetoPagina => v && typeof v === "object" && !Array.isArray(v) ? v as ObjetoPagina : {};
const textoPagina = (v: unknown, maximo: number): string => typeof v === "string" ? v.slice(0, maximo).trim() : "";

export function modeloPagina(pedido: PedidoPagina): string {
  const clave = resolverModelo(pedido.modelo) as keyof typeof EROS_PRECIOS.models;
  return EROS_PRECIOS.models[clave]?.slug || "";
}

export function disponibilidadPagina(pedido: PedidoPagina | null, ahora: number): "disponible" | "vencido" | "no_disponible" {
  if (!pedido) return "no_disponible";
  if (pedido.estado === "vencido") return "vencido";
  if (pedido.estado !== "publicado") return "no_disponible";
  if (!Object.keys(objetoPagina(pedido.datos)).length) return "no_disponible";
  const inicio = Date.parse(pedido.publicado_en || "");
  const fin = Date.parse(pedido.vence_en || "");
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) return "no_disponible";
  if (ahora >= fin) return "vencido";
  if (ahora < inicio) return "no_disponible";
  // La fecha elegida por el cliente se interpreta siempre en Argentina.
  if (/^\d{4}-\d{2}-\d{2}$/.test(pedido.activar_el || "") &&
    ahora < Date.parse(pedido.activar_el + "T00:00:00-03:00")) return "no_disponible";
  return modeloPagina(pedido) ? "disponible" : "no_disponible";
}

export function nombreFotoPagina(valor: unknown): string {
  if (typeof valor !== "string") return "";
  // Solo archivos del propio pedido. Nunca se acepta un UUID, una URL ni un ../ del cliente.
  const ruta = valor.trim();
  const match = /^(?:imagenes|fotos)\/((?:foto(?:[1-9]|1[0-2])|[1-9]|1[0-2]|juego-jugador|juego-regala)\.(?:jpe?g|png|webp))$/i.exec(ruta);
  return match?.[1] || "";
}

// Proyecta solo los campos públicos del regalo. No serializa el registro del pedido.
export function datosPublicosPagina(pedido: PedidoPagina, resolverFoto: (nombre: string) => string, audioURL = ""): ObjetoPagina {
  const raw = objetoPagina(pedido.datos);
  const extra = objetoPagina(pedido.extras);
  const juegoRaw = textoPagina(extra.juego, 40);
  const juego = juegoRaw === "pintar" ? "pintar-corazon" : juegoRaw;
  const juegoValido = ["pintar-corazon", "margarita", "laberinto"].includes(juego) ? juego : "";
  const contador = objetoPagina(extra.contador);
  const temas = ["eros", "dorado", "azul-cielo", "rosa", "atardecer", "bosque", "lavanda", "medianoche", "galaxia"];
  const inicio = objetoPagina(raw.inicio);
  const modelo = modeloPagina(pedido);
  const foto = (valor: unknown): string => { const nombre = nombreFotoPagina(valor); return nombre ? resolverFoto(nombre) : ""; };
  const extras: ObjetoPagina = {
    juego: juegoValido, sobre: !juegoValido,
    contador: {
      desde: /^\d{4}-\d{2}-\d{2}$/.test(String(contador.desde || "")) ? contador.desde : "",
      etiqueta: textoPagina(contador.etiqueta, 120) || "Juntos desde hace",
    },
  };
  if (juegoValido === "laberinto") {
    const cfg = objetoPagina(extra.laberinto || objetoPagina(raw.extras).laberinto);
    const laberinto: ObjetoPagina = { fotoQuienJuega: foto(cfg.fotoQuienJuega), fotoQuienRegala: foto(cfg.fotoQuienRegala) };
    if (cfg.dificultad === "media") laberinto.dificultad = "media";
    if (Number.isSafeInteger(cfg.semilla) && Number(cfg.semilla) >= 0 && Number(cfg.semilla) <= 0xffffffff) laberinto.semilla = cfg.semilla;
    extras.laberinto = laberinto;
  }
  if (juegoValido === "margarita") {
    const cfg = objetoPagina(extra.margarita);
    const margarita: ObjetoPagina = {};
    if (Number.isInteger(cfg.cantidadPetalos) && Number(cfg.cantidadPetalos) >= 3 && Number(cfg.cantidadPetalos) <= 21) margarita.cantidadPetalos = cfg.cantidadPetalos;
    for (const campo of ["textoMeAma", "textoNoMeAma"]) if (typeof cfg[campo] === "string") margarita[campo] = textoPagina(cfg[campo], 100);
    extras.margarita = margarita;
  }
  if (juegoValido === "pintar-corazon") {
    const cfg = objetoPagina(extra["pintar-corazon"]);
    extras["pintar-corazon"] = {
      coloresPincel: Array.isArray(cfg.coloresPincel) ? cfg.coloresPincel.filter(c => typeof c === "string" && /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(c)).slice(0, 8) : [],
    };
  }
  const datos: ObjetoPagina = {
    version: 2, para: textoPagina(pedido.para_quien, 120), de: textoPagina(pedido.de_parte, 120),
    tema: temas.includes(pedido.tema) ? pedido.tema : "eros", extras,
    inicio: { titulo: textoPagina(inicio.titulo, 200), boton: textoPagina(inicio.boton, 80) || "Tocá para empezar" },
    firma: textoPagina(raw.firma, 200), audio: audioURL ? {src:audioURL} : null,
    colorPrincipal: typeof raw.colorPrincipal === "string" && /^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(raw.colorPrincipal) ? raw.colorPrincipal : "",
  };
  if (modelo === "carta-para-vos") {
    const carta = objetoPagina(raw.carta);
    let fotos = 0;
    const bloques = (Array.isArray(carta.bloques) ? carta.bloques : []).slice(0, 20).flatMap(b => {
      const bloque = objetoPagina(b);
      if (typeof bloque.texto === "string") return [{ texto: textoPagina(bloque.texto, 600) }] as ObjetoPagina[];
      if (typeof bloque.foto === "string" && fotos++ < 3) return [{ foto: foto(bloque.foto), alt: textoPagina(bloque.alt, 200) }] as ObjetoPagina[];
      return [];
    });
    datos.carta = { titulo: textoPagina(carta.titulo, 200), bloques };
  } else {
    const principal = objetoPagina(raw.principal);
    datos.principal = { titulo: textoPagina(principal.titulo, 200), subtitulo: textoPagina(principal.subtitulo, 500) };
    datos.cierre = { mensaje: textoPagina(objetoPagina(raw.cierre).mensaje, 2000) };
    if (modelo === "nuestra-historia") datos.momentos = (Array.isArray(raw.momentos) ? raw.momentos : []).slice(0, 8).map(m => {
      const momento = objetoPagina(m);
      return { fecha: textoPagina(momento.fecha, 80), titulo: textoPagina(momento.titulo, 200), texto: textoPagina(momento.texto, 1000), foto: foto(momento.foto), alt: textoPagina(momento.alt, 200) };
    });
    if (modelo === "album-recuerdos") {
      datos.fotos = (Array.isArray(raw.fotos) ? raw.fotos : []).slice(0, 12).map(f => {
        const registro = objetoPagina(f);
        return { src: foto(registro.src), alt: textoPagina(registro.alt, 200), epigrafe: textoPagina(registro.epigrafe, 80) };
      });
      datos.automatico = Number.isInteger(raw.automatico) ? Math.max(0, Math.min(3600, Number(raw.automatico))) : 0;
    }
  }
  return datos;
}
