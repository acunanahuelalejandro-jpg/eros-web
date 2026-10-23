# Panel de Eros Web

## Entrar

1. Subí `admin/`, `compartido/precios.js`, la etiqueta nueva de `index.html`, `armador/pedido.js`, los archivos actualizados de `plantillas/album-recuerdos/` y `robots.txt`. Conservá el resto del sitio.
2. Abrí `https://acunanahuelalejandro-jpgi.github.io/eros-web/admin/`.
3. Entrá con tu email y contraseña de Supabase. La cuenta debe tener `app_metadata.eros_admin = true`; los pasos para asignarlo están en `supabase/PASOS.md`. Si cambiaste ese permiso, salí y volvé a entrar. No hay registro desde el panel.
4. La configuración se carga desde `../armador/config.js`: solo URL y clave pública. La sesión se guarda en el almacenamiento de esta pestaña, con una clave separada del armador. Usá **Salir** al terminar.

Para usarlo localmente, serví la carpeta `erosweb/` con un servidor estático. Por ejemplo: `python3 -m http.server 8000`, y abrí `http://localhost:8000/admin/`. El panel descarga archivos de los modelos para armar el ZIP; requiere HTTP, no doble clic. Los paquetes exportados sí funcionan con doble clic.

## Preparar y publicar

- Abrí un pedido por su código. Revisá el contenido, las fotos y la verificación de total. El panel y el armador importan la misma tabla en `compartido/precios.js`.
- Podés cambiar estado en la lista y guardar notas o fecha de activación desde el detalle. Cambiar el estado **no publica archivos**.
- Las miniaturas usan enlaces firmados de 10 minutos. La vista previa descarga fotos privadas a URLs locales temporales; no las hace públicas ni las sube a otro lugar.
- **Descargar paquete** genera `<codigo>.zip`. Descomprimí todo y abrí `p/<codigo>/index.html` para probarlo. El ZIP incluye `compartido/` y los módulos necesarios para esa prueba; con juego no incluye `sobre.js`.
- Para publicar, copiá solo `p/<codigo>/` a la carpeta `p/` de tu sitio y subila a GitHub. Conservá los archivos compartidos actualizados. Las fotos del paquete son JPEG y van en `fotos/1.jpg`, `fotos/2.jpg`, etc.; las fotos opcionales del laberinto conservan nombres descriptivos.
- Si hay un archivo de música elegido en `datos.musica`, debe existir en el sitio para incluirlo en el ZIP. Un link de Spotify/YouTube se muestra en el detalle, pero no se convierte en audio ni se descarga.
- Comprobá el link final desde otro dispositivo antes de copiar el mensaje de entrega. Una vez publicado, guardá la fecha de activación y marcá el pedido como **Publicado**.

## Vencimiento y borrado

El plazo empieza a las 00:00 de la fecha de activación en Argentina. Un día son 1 día calendario; una semana son 7 días; un mes llega al mismo día del mes siguiente (o al último día si no existe). Sin fecha de activación no se puede calcular el vencimiento.

La lista de vencidos avisa pero no elimina ni retira nada sola. **Marcar vencido** cambia el estado del pedido. Para dar de baja una página ya publicada, eliminá su carpeta `p/<codigo>/` del repositorio y esperá la actualización de GitHub Pages.

**Borrar fotos del pedido** pide escribir el código y una segunda confirmación. Borra todos los archivos del UUID en el bucket y vacía nombres, contenido, música, WhatsApp, notas y fechas personales del contador. Conserva código, modelo, importe y datos de operación sin contenido personal. No elimina publicaciones ni copias ZIP que ya hayas descargado.

`robots.txt` y `noindex` desalientan indexación; la protección de pedidos y fotos la realizan Auth y RLS. El panel no agrega permisos SQL ni usa claves privilegiadas.

## Dependencia local

`vendor/jszip.min.js`: JSZip 3.10.1, obtenido de la distribución oficial publicada en npm. Licencia incluida en `vendor/licencia-jszip.md` (MIT o GPLv3). No se carga desde CDN.
