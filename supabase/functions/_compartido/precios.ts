// Copia de servidor verificada contra compartido/precios.js.
// Ejecutá `node scripts/verificar-precios.mjs` después de cambiar precios.js.
export const EROS_PRECIOS = {
  "models": {
    "carta": {
      "name": "Carta para vos",
      "slug": "carta-para-vos",
      "limit": 3,
      "prices": {
        "day": 5000,
        "week": 8000,
        "month": 12000
      }
    },
    "historia": {
      "name": "Nuestra historia",
      "slug": "nuestra-historia",
      "limit": 8,
      "prices": {
        "day": 7500,
        "week": 12000,
        "month": 18000
      }
    },
    "album": {
      "name": "Álbum de recuerdos",
      "slug": "album-recuerdos",
      "limit": 12,
      "prices": {
        "day": 10000,
        "week": 16000,
        "month": 24000
      }
    }
  },
  "durations": {
    "day": "1 día",
    "week": "1 semana",
    "month": "1 mes"
  },
  "extras": {
    "game": 3000,
    "counter": 2000
  }
} as const;

const normalizar = (valor: unknown): string => String(valor || "")
  .trim()
  .toLocaleLowerCase("es")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[\s_-]+/g, "");

export function resolverModelo(valor: unknown): string {
  return Object.keys(EROS_PRECIOS.models).find((clave) => {
    const modelo = EROS_PRECIOS.models[clave as keyof typeof EROS_PRECIOS.models];
    return [clave, modelo.slug, modelo.name].some((opcion) =>
      normalizar(opcion) === normalizar(valor)
    );
  }) ?? "";
}

export function resolverDuracion(valor: unknown): string {
  return Object.keys(EROS_PRECIOS.durations).find((clave) => {
    const duracion = EROS_PRECIOS.durations[
      clave as keyof typeof EROS_PRECIOS.durations
    ];
    return [clave, duracion].some((opcion) =>
      normalizar(opcion) === normalizar(valor)
    );
  }) ?? "";
}

export type CalculoPrecio = {
  modelo: string;
  duracion: string;
  base: number;
  juego: number;
  contador: number;
  total: number;
};

export function calcularPrecioPedido(pedido: {
  modelo?: unknown;
  duracion?: unknown;
  extras?: unknown;
}): CalculoPrecio {
  const modelo = resolverModelo(pedido.modelo);
  const duracion = resolverDuracion(pedido.duracion);
  const extras = pedido.extras && typeof pedido.extras === "object"
    ? pedido.extras as Record<string, unknown>
    : {};

  if (!modelo || !duracion) {
    throw new Error("Modelo o duración desconocidos. Revisá el pedido.");
  }

  const juego = extras.juego || "";
  const juegosPermitidos = [
    "pintar",
    "pintar-corazon",
    "margarita",
    "laberinto",
  ];
  if (juego && !juegosPermitidos.includes(juego as string)) {
    throw new Error("El juego del pedido no está en la tabla de precios.");
  }

  const contador = extras.contador;
  const conContador = contador === true || (
    !!contador && typeof contador === "object" && (
      (contador as Record<string, unknown>).activo === true ||
      !!(contador as Record<string, unknown>).desde
    )
  );
  const base = EROS_PRECIOS.models[
    modelo as keyof typeof EROS_PRECIOS.models
  ].prices[duracion as keyof typeof EROS_PRECIOS.durations];
  const precioJuego = juego ? EROS_PRECIOS.extras.game : 0;
  const precioContador = conContador ? EROS_PRECIOS.extras.counter : 0;

  return {
    modelo,
    duracion,
    base,
    juego: precioJuego,
    contador: precioContador,
    total: base + precioJuego + precioContador,
  };
}

export function formatoARS(valor: number): string {
  return "$" + new Intl.NumberFormat("es-AR", {
    maximumFractionDigits: 0,
  }).format(valor);
}
