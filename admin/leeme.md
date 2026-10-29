# Panel de Eros Web

## Entrar

1. Abrí la carpeta `admin/` de tu sitio publicado, por ejemplo `https://acunanahuelalejandro-jpg.github.io/eros-web/admin/`.
2. Entrá con tu email y contraseña de Supabase. La cuenta debe tener `app_metadata.eros_admin = true`; los pasos están en `supabase/NUEVO-PROYECTO.md`. Si cambiaste ese permiso, salí y volvé a entrar. No hay registro desde el panel.
3. La configuración se carga desde `../armador/config.js`: solo URL y clave pública. La sesión se guarda en el almacenamiento de esta pestaña, con una clave separada del armador. Usá **Salir** al terminar.

Para usarlo localmente, serví la carpeta `erosweb/` con un servidor estático. Por ejemplo: `python3 -m http.server 8000`, y abrí `http://localhost:8000/admin/`. El panel requiere HTTP. Las copias privadas exportadas se pueden abrir con doble clic después de descomprimirlas.

## Revisar un pedido y entregar el regalo

- Abrí un pedido por su código. Revisá el contenido, las fotos y la verificación de total. El panel y el armador importan la tabla de `compartido/precios.js`; el servidor también recalcula el importe antes de cobrar o publicar.
- Las miniaturas usan enlaces firmados de diez minutos. La vista previa descarga las fotos y el audio a URLs locales temporales; no los hace públicos ni los sube a otro lugar.
- Si el pedido tiene MP3, **Audio del pedido** muestra su nombre, peso, estado de validación y un control para escucharlo con tu sesión. Si el enlace venció o el archivo no carga, tocá **Actualizar**. Los pedidos antiguos con enlaces o canciones del sistema anterior quedan sin música.
- Podés guardar notas y definir una fecha de activación antes de confirmar el pago. Para registrar un cobro recibido por fuera de Mercado Pago, usá **Marcar pago manual** y confirmá el código solo después de verificar que lo recibiste.
- **Republicar**, **Extender vigencia** y **Anular acceso** pasan por el servidor y piden confirmación. Publicar o ampliar un pedido se bloquea si el contenido entró en limpieza, el total no coincide o falta el MP3 que el pedido declaró.
- Entregá el enlace de **Link para entregar**. Aparece cuando el pedido está publicado y vigente. **Copiar mensaje** incluye el vencimiento; **Mandar por WhatsApp** usa el número del cliente si lo cargó. La entrega usa `p/?c=<slug>` y acceso controlado por el servidor.

## Copia privada del paquete

**Descargar paquete** genera `<codigo>.zip` para revisar sin conexión. Descomprimí todo y abrí `p/<codigo>/index.html`. Incluye los módulos compartidos necesarios, las fotos y, si existe, `audio/cancion.mp3`. Con juego, el juego reemplaza al sobre.

No subas ese ZIP ni su contenido a GitHub ni a un sitio público. Contiene archivos privados y la copia descargada no vence ni se borra automáticamente de tu dispositivo. La publicación normal usa el enlace del panel; no requiere subir una carpeta con las fotos y el MP3 del pedido al repositorio.

## Vencimiento y borrado

La vigencia confirmada está en **Publicación** y **Vencimiento**, en hora de Argentina. Las duraciones del servidor son de 1, 7 o 30 días según el plan. Si hay una activación futura, el regalo no se abre antes de esa fecha. Revisá siempre las fechas que devuelve el servidor.

Al vencer, el regalo deja de entregar contenido. El proceso de limpieza borra los archivos mediante la API de Storage y después vacía los datos personales. Si falla parte del borrado, conserva la marca de limpieza para reintentar y bloquea la republicación.

**Borrar fotos y audio del pedido** pide escribir el código y una segunda confirmación. Primero anula el acceso y marca la limpieza; después elimina los archivos del UUID en ambos buckets privados y vacía los datos personales, incluidos los metadatos del audio. Conserva el código, modelo, importe y datos de operación necesarios sin contenido personal. Si el proceso se interrumpe, volvé a abrir el pedido y reintentá el borrado.

El borrado de Supabase no elimina copias ZIP que hayas descargado ni archivos que hayas publicado por otro medio. Retiralos también de esos lugares.

`robots.txt` y `noindex` desalientan la indexación; Auth, RLS y las funciones del servidor controlan el acceso a pedidos y archivos. El panel usa la clave pública y tu sesión, sin claves privilegiadas en el navegador.

## Actualizar el sistema de audio

Los pasos de SQL, funciones y publicación, junto con las pruebas, están en `docs/audio.md`. Requiere `supabase/06-audio.sql` y la función nueva `validar-audio`, además de actualizar las funciones existentes que allí se indican.

## Dependencia local

`vendor/jszip.min.js`: JSZip 3.10.1, obtenido de la distribución oficial publicada en npm. Licencia incluida en `vendor/licencia-jszip.md` (MIT o GPLv3). No se carga desde CDN.
