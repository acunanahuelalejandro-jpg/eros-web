// Pegá acá la URL del proyecto y su clave pública.
// La clave anon/publicable puede estar en el navegador porque no es un secreto:
// RLS y las políticas SQL son las que limitan cada operación. Esto solo es cierto
// si mantenés las políticas activas y nunca habilitás lectura pública de pedidos/fotos.
// NUNCA pegues aquí la service_role ni ninguna clave secret: esas claves pueden
// saltarse RLS y dar acceso administrativo completo.
window.EROS_CONFIG = {
  supabaseUrl: "https://rajroocjlvmtjeaoctzj.supabase.co",
  supabaseKey: "sb_publishable_aUrW9l-84urHpfeYC9B4AQ_3oxhEZcM"
};

