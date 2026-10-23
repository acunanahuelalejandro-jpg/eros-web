# Preparar Supabase para Eros Web

Esta etapa prepara la tabla y el bucket de fotos. Todavía no conecta el armador de pedidos.

## 1. Ejecutar la configuración SQL

1. Entrá a tu proyecto de Supabase.
2. Abrí **SQL Editor** y elegí crear una consulta nueva.
3. Abrí `supabase/setup.sql` en tu computadora, copiá todo su contenido y pegalo en la consulta.
4. Presioná **Run**. Si Supabase muestra un error, detenete y corregilo antes de seguir.
5. En **Table Editor** debe aparecer la tabla `pedidos`. En **Storage** debe aparecer el bucket `fotos` como privado.

El SQL permite que un visitante cree un pedido nuevo y suba imágenes a una carpeta con UUID. No le permite leer pedidos ni listar, descargar o borrar fotos. El límite del bucket es 5 MiB por archivo y admite JPEG, PNG y WebP.

## 2. Crear tu usuario administrador

1. En **Authentication → Users**, elegí **Add user** y creá tu cuenta con tu correo y una contraseña segura.
2. Volvé al **SQL Editor** y ejecutá esta consulta. Reemplazá el correo de ejemplo por el mismo correo de tu cuenta:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"eros_admin": true}'::jsonb
where email = 'TU_CORREO';
```

3. Revisá que Supabase indique que se actualizó una fila. Si indica cero, verificá el correo.
4. Cerrá sesión y volvé a iniciar sesión. Así tu nuevo token incluye el permiso de administrador.

El permiso se guarda en `app_metadata`, que el usuario no puede cambiar desde el navegador. No uses `user_metadata` para permisos.

## 3. Desactivar registros nuevos

Después de crear tu cuenta, andá a la configuración de **Authentication** y apagá **Allow new users to sign up** (permitir que se registren usuarios nuevos). Así solo vos vas a poder entrar como usuario autenticado.

## 4. Pegar la URL y la clave pública

1. En la configuración del proyecto, copiá la **Project URL** y la clave **anon/public** o **publishable**.
2. Abrí `armador/config.js` y reemplazá `PEGAR_ACA_MI_URL` y `PEGAR_ACA_MI_CLAVE_PUBLICA` por esos valores, respetando las comillas.
3. Guardá el archivo.

La clave pública puede estar en el navegador porque las políticas RLS limitan lo que permite. La clave `service_role` o una clave `secret` nunca va en `config.js`, en GitHub Pages ni en ningún archivo público: puede saltarse RLS.

## 5. Probar la conexión

1. Abrí `supabase/probar-conexion.html` en el navegador. Si la abrís desde GitHub Pages, usá la ruta de esa página dentro de tu sitio.
2. Presioná **Probar envío de pedido de prueba**. Lo esperado es `✅ Envío correcto`; crea un pedido ficticio y sube un PNG pequeño dibujado en el navegador. No usa tus fotos.
3. Después presioná **Probar lectura sin sesión**. Lo esperado es `✅ Seguro`: la tabla debe rechazar la lectura o devolver cero filas, y el bucket debe rechazar la lectura/listado o devolver vacío.
4. Si aparece `❌ ¡Alerta!`, no conectes el armador. Volvé al SQL Editor y revisá que ejecutaste `setup.sql` completo y que el bucket siga privado.
5. Si aparece `⚠️ No se pudo confirmar`, revisá primero la URL, la clave pública, que exista el bucket y que la conexión a internet funcione.

Cada envío de prueba deja una fila y una imagen pequeña en el proyecto. Es normal que queden allí: el navegador no tiene permiso para borrarlas. Podés eliminarlas desde el panel de Supabase con tu usuario administrador.

## Si después vas a publicar estos archivos

Subí `supabase/` y `armador/config.js` al repositorio. Antes de hacerlo, confirmá que `config.js` solo tenga la URL y la clave pública; nunca publiques una clave secreta.
