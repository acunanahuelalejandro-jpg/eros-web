# Audio MP3 privado

## Alcance

La música de cada pedido pasa a ser un único MP3 opcional de hasta 10 MiB (10.485.760 bytes) y diez minutos. El cliente declara que tiene derecho a usarlo. El archivo se aloja en el bucket privado `audios`, separado de las fotos. Los pedidos anteriores con enlaces o pistas de catálogo quedan sin música; no se migran ni modifican filas existentes.

## Contrato

El pedido guarda `audio_ruta`, `audio_nombre`, `audio_bytes`, `audio_duracion` y `audio_consentimiento`. Solo el servidor escribe `audio_verificado_en` y `audio_sha256`. La ruta física es `<uuid>/cancion.mp3`; el contenido v2 usa `audio: { src: "audio/cancion.mp3" }`. La vista previa recibe un blob local. El regalo recibe una URL firmada temporal, validada y convertida en un blob distinto de las fotos.

El envío inserta el pedido nuevo, sube el archivo y llama `validar-audio`. Las Edge Functions comprueban MIME, bytes, estructura de frames MP3, duración y hash. Ningún enlace externo ni archivo anterior se interpreta como audio. La publicación requiere el archivo verificado y disponible. Anular permanece permitido.

Si la validación falla después de guardar el pedido, el armador conserva su código y permite reintentar en la misma pestaña sin volver a insertar ni subir el archivo confirmado. El borrador de sesión no guarda el MP3 ni la declaración: al recargar, hay que elegirlo otra vez. Si se interrumpió un envío ya guardado, consultá con el código que apareció antes de generar otro pedido.

La reproducción se inicia desde un toque del visitante. Un bloqueo del navegador deja el botón «Reproducir música». El audio se pausa al ocultarse la pestaña y al destruir el modelo; no se reanuda sin otro toque. Sin archivo o ante un error de carga no hay controles de música.

## Aplicar los cambios en Supabase

Estos pasos los ejecuta el administrador. El trabajo local no ejecuta SQL ni despliega funciones.

1. En el proyecto nuevo que ya tiene las etapas 00 a 05, abrí **SQL Editor → New query**. Pegá el archivo completo `supabase/06-audio.sql` y tocá **Run**. Se puede ejecutar otra vez. No reemplaces el SQL por el contenido de un archivo TypeScript.
2. Verificá que termine sin errores. En **Storage**, debe aparecer el bucket `audios` como privado, con límite de 10.485.760 bytes y tipo permitido `audio/mpeg`. El bucket `fotos` conserva sus límites.
3. Los archivos para el editor del dashboard se generan con `node scripts/preparar-funciones.mjs`. En **Edge Functions**, reemplazá el código de cada función por el archivo del mismo nombre en `supabase/dashboard/` y tocá **Deploy updates**:

   | Función | Archivo para pegar |
   |---|---|
   | `crear-pago` | `supabase/dashboard/crear-pago.ts` |
   | `webhook-mercadopago` | `supabase/dashboard/webhook-mercadopago.ts` |
   | `estado-pedido` | `supabase/dashboard/estado-pedido.ts` |
   | `obtener-pagina` | `supabase/dashboard/obtener-pagina.ts` |
   | `limpiar-vencidos` | `supabase/dashboard/limpiar-vencidos.ts` |
   | `administrar-pedido` | `supabase/dashboard/administrar-pedido.ts` |

4. Creá la función nueva desde **Edge Functions → Deploy a new function → Via Editor**, con el nombre exacto `validar-audio`. Pegá `supabase/dashboard/validar-audio.ts`, desactivá **Verify JWT** y desplegala. La función valida la petición y el pedido en su propio código; no recibe una clave secreta desde el navegador.
5. Conservá las variables de entorno y la configuración de acceso que ya usan las otras funciones. Este cambio no requiere agregar secretos ni modificar el webhook de Mercado Pago.

Los archivos de `supabase/dashboard/` son copias generadas para pegar en Supabase; los fuentes siguen en `supabase/functions/`. No pegues solamente el `index.ts` de una función si el editor no tiene también sus módulos importados.

## Actualizar GitHub Pages

Subí los archivos modificados de `index.html`, `armador/`, `admin/`, `compartido/` y `plantillas/`, junto con `terminos.html` y `privacidad.html`. Los archivos nuevos `armador/audio.js` y `compartido/audio.js` son necesarios. Conservá las rutas y el resto de los archivos existentes.

Si antes publicaste la integración de YouTube, eliminá `compartido/youtube.js` y `compartido/youtube.css` del repositorio al actualizar. También se retiraron del código fuente `_compartido/youtube.ts`, sus pruebas y `docs/youtube.md`. Las demos no forman parte de este cambio y conservan su contenido actual.

Los fuentes de Supabase, el SQL y las pruebas pueden versionarse junto con el sitio. No subas archivos MP3 de pedidos, fotos de clientes ni paquetes ZIP: el armador los envía al almacenamiento privado. `armador/config.js` conserva solo la configuración pública existente.

## Borrado

El borrado automático y manual vacía ambos buckets por la API de Storage antes de redactar los datos. Si falla cualquier parte, conserva la marca de limpieza y reintenta; nunca permite republicar. El SQL comprueba que no queden objetos al cerrar una limpieza y vacía la ruta y los metadatos del audio. No elimina objetos por SQL.

**Descargar paquete** es una copia privada para revisar sin conexión. Puede contener fotos y un MP3. No la publiques en GitHub: la entrega del regalo usa el link del panel y archivos privados con enlaces firmados. La copia descargada no vence ni se borra sola de tu dispositivo.

## Pruebas después de publicar

Usá pedidos ficticios y un MP3 que tengas permiso de usar.

1. En los tres modelos, probá un pedido sin audio: no debe aparecer ningún botón de música en la vista previa ni en el regalo.
2. Elegí un MP3 válido: deben verse el nombre, el peso y las opciones para quitarlo o cambiarlo. La vista previa debe permitir reproducirlo. Cambiarlo o quitarlo debe detener el audio anterior.
3. Probá un archivo de otro formato, uno mayor que 10.485.760 bytes y uno mayor que diez minutos. Deben rechazarse con un aviso. No alcanza con renombrar otro formato como `.mp3`: el servidor también analiza el archivo.
4. Intentá avanzar con audio sin marcar la declaración de derechos. Debe pedirla. Marcala, enviá el pedido y verificá desde el panel que el MP3 figure como validado y se pueda escuchar con tu sesión.
5. Publicá solamente el pedido ficticio mediante el flujo de prueba autorizado. Abrí el link del regalo en un celular: tocá el inicio, el sobre o completá el juego. Si el navegador no permite el sonido, tocá **Reproducir música**. Pasá a otra pestaña: debe pausarse y esperar un nuevo toque para reanudar.
6. Sin iniciar sesión, comprobá que no se pueda listar ni descargar directamente desde `audios`. El regalo vigente puede recibir una URL firmada temporal; un pedido nuevo, programado o vencido no debe recibirla. No compartas esa URL durante la prueba.
7. Con un pedido ficticio vencido, ejecutá el procedimiento de limpieza que ya usás. Comprobá en Storage que no queden archivos de su UUID en `fotos` ni en `audios`, y que el panel muestre los datos eliminados. Si falla una eliminación, el pedido debe seguir bloqueado para publicación y permitir reintentar la limpieza.
8. Probá también **Borrar fotos y audio del pedido** con sus dos confirmaciones. Después del borrado, pago manual, extensión y republicación deben quedar bloqueados. Anular debe seguir disponible cuando corresponda al estado.

## Límites del trabajo local

No se ejecuta SQL, no se despliega, no se consultan pedidos reales ni secretos y no se hace commit o push. Las pruebas de funciones usan red y datos simulados. La validación de RLS en el proyecto real y la reproducción en teléfonos físicos quedan para después de aplicar el SQL y publicar las funciones.
