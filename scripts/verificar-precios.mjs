import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import path from "node:path";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rutaCliente = path.join(raiz, "compartido", "precios.js");
const rutaServidor = path.join(
  raiz,
  "supabase",
  "functions",
  "_compartido",
  "precios.ts",
);

function ordenar(valor) {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor).sort().map((clave) => [clave, ordenar(valor[clave])]),
    );
  }
  return valor;
}

try {
  const codigoCliente = await readFile(rutaCliente, "utf8");
  const contexto = { window: {} };
  vm.runInNewContext(codigoCliente, contexto, {
    filename: "compartido/precios.js",
    timeout: 1000,
  });
  const tablaCliente = contexto.window.ErosPrecios?.tabla;
  if (!tablaCliente) throw new Error("No se encontró window.ErosPrecios.tabla.");

  const codigoServidor = await readFile(rutaServidor, "utf8");
  const inicio = "export const EROS_PRECIOS = ";
  const fin = " as const;";
  const desde = codigoServidor.indexOf(inicio);
  const hasta = desde < 0 ? -1 : codigoServidor.indexOf(fin, desde + inicio.length);
  if (desde < 0 || hasta < 0) {
    throw new Error("No se encontró la tabla EROS_PRECIOS en el módulo de servidor.");
  }

  const tablaServidor = JSON.parse(
    codigoServidor.slice(desde + inicio.length, hasta).trim(),
  );
  const clienteOrdenado = JSON.stringify(ordenar(tablaCliente));
  const servidorOrdenado = JSON.stringify(ordenar(tablaServidor));
  if (clienteOrdenado !== servidorOrdenado) {
    throw new Error(
      "Los precios del servidor no coinciden con compartido/precios.js. Actualizá supabase/functions/_compartido/precios.ts.",
    );
  }

  console.log("Precios del navegador y del servidor: coinciden.");
} catch (error) {
  console.error("Verificación de precios fallida:", error.message);
  process.exitCode = 1;
}
