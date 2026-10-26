# Eros Web · preparar el proyecto nuevo de Supabase

Esta guía es para un proyecto **nuevo**. El proyecto anterior queda como respaldo: no pegues este SQL allí y no lo borres.

El archivo de instalación es [`00-setup-completo.sql`](00-setup-completo.sql). Ese SQL no instala `pg_net` ni el aviso; los pasos opcionales para ntfy están al final de esta guía.

## 1. Crear el proyecto nuevo

1. Entrá a [Supabase](https://supabase.com/dashboard) e iniciá sesión.
2. En tu organización, tocá **New project**.
3. Poné un nombre fácil de reconocer, por ejemplo `eros-web-nuevo`, y elegí el plan **Free**.
4. En **Region**, elegí la región más cercana a Argentina que aparezca (normalmente **South America (São Paulo)**).
5. Generá una contraseña fuerte para la base de datos y guardala en un lugar privado. No la pegues en un archivo del sitio ni en GitHub.
6. Si aparece **Automatically expose new tables and functions**, dejalo desactivado: este SQL concede explícitamente solo los permisos necesarios.
7. Tocá **Create new project** y esperá a que el estado indique que terminó de inicializarse.

**Verificación:** el proyecto aparece en el panel como activo y podés abrir su Overview. El proyecto anterior sigue sin cambios.

## 2. Crear tu usuario administrador

1. En el proyecto nuevo, abrí **Authentication → Users**.
2. Tocá **Add user** y creá tu usuario con tu correo y una contraseña segura. Si aparece la opción, confirmá/verificá el email desde el panel.
3. Abrí **SQL Editor → New query** y pegá esto, reemplazando `TU_CORREO` por el correo exacto con el que creaste el usuario:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"eros_admin": true}'::jsonb
where lower(email) = lower('acunanahuelalejandro@gmail.com');
```

4. Tocá **Run**. Debe actualizar exactamente una fila. Si actualiza cero, revisá que el correo coincida.
5. Cerrá sesión y volvé a entrar más tarde para que el permiso aparezca en una sesión nueva.

Este permiso se guarda en `app_metadata`, que el cliente no puede cambiar desde la página. No uses `user_metadata` para autorizar al panel.

**Verificación:** Authentication → Users muestra tu usuario y la consulta indica `UPDATE 1` o una fila afectada.

## 3. Instalar la base y el bucket

1. En el proyecto nuevo, abrí **SQL Editor → New query**.
2. En tu computadora, abrí `supabase/00-setup-completo.sql`, copiá todo el contenido y pegalo en la consulta.
3. Revisá arriba que el proyecto seleccionado sea el nuevo. No ejecutes este archivo en el respaldo.
4. Tocá **Run**.

El SQL crea `public.pedidos`, el índice, el bucket privado `fotos`, sus políticas y la función `eros_keepalive()`. No instala avisos, extensiones ni triggers de ntfy.

**Verificación:** el editor indica **Success**; en **Table Editor** aparece `pedidos` y en **Storage** aparece `fotos` como privado.

## 4. Desactivar los registros públicos

Después de crear el usuario administrador:

1. Abrí **Authentication → Settings** (o **General configuration**).
2. Buscá **Allow new users to sign up** y apagalo.
3. Guardá el cambio si el panel muestra un botón para hacerlo.

**Verificación:** el control queda apagado. Tu usuario existente puede iniciar sesión, pero una persona nueva no puede registrarse desde la página.

## 5. Copiar la URL y la clave pública

1. Abrí **Project Settings → API Keys**. En algunas vistas, la URL del proyecto aparece en **Project Settings → API** o en **Connect**.
2. Copiá la **Project URL**. Tiene un formato como `https://xxxxx.supabase.co`.
3. Copiá una clave **Publishable** (`sb_publishable_…`) o la clave pública antigua **anon**. Nunca copies `service_role` ni una clave `secret`.
4. Abrí `armador/config.js` en la carpeta del sitio. Reemplazá los dos marcadores, conservando las comillas:

```js
window.EROS_CONFIG = {
  supabaseUrl: "PEGAR_ACA_URL_DEL_PROYECTO_NUEVO",
  supabaseKey: "PEGAR_ACA_CLAVE_PUBLICA_DEL_PROYECTO_NUEVO"
};
```

5. Guardá el archivo. La URL y la clave pública pueden estar en el navegador; nunca pongas una contraseña, clave `secret` o `service_role` ahí.

**Verificación:** `armador/config.js` tiene la URL nueva y una clave que empieza con `sb_publishable_` o `eyJ`; no tiene marcadores ni claves privadas.

## 6. Probar el envío y la privacidad

Para que el navegador lea la configuración local sin depender de la versión publicada:

1. En Linux, abrí **Terminal** y pegá:

```bash
cd ~/Descargas/ChatGPT/erosweb && python3 -m http.server 8000
```

2. Dejá la Terminal abierta y visitá `http://localhost:8000/supabase/probar-conexion.html`.
3. En el cuadro de diagnóstico, confirmá que `config.js` cargó y que la URL y el tipo de clave aparecen válidos.
4. Tocá **Probar envío de pedido de prueba**. Debe decir `✅ Envío correcto`.
5. Tocá **Probar lectura sin sesión**. Debe decir `✅ Seguro`; no debe poder leer pedidos, listar fotos ni descargar la imagen de prueba.
6. Al terminar, volvé a la Terminal y presioná **Ctrl+C** para cerrar el servidor local.

La prueba crea un pedido ficticio y una imagen generada por el navegador. No usa fotos reales. El registro y esa imagen quedan como datos de prueba hasta que los limpies desde el panel de Supabase con tu cuenta administradora.

**Verificación:** envío correcto y lectura marcada como `✅ Seguro`. Si aparece una alerta roja, no conectes el armador todavía.

## 7. Actualizar los Secrets de GitHub

Hacelo después de que la prueba de conexión del paso 6 salga bien:

1. Abrí el repositorio de Eros Web en GitHub.
2. Entrá en **Settings → Secrets and variables → Actions**.
3. Para `SUPABASE_URL`, tocá **New repository secret** (o **Update** si ya existe), pegá la URL nueva y guardá.
4. Para `SUPABASE_ANON_KEY`, repetí el paso con la clave pública nueva. No uses una clave `secret` ni `service_role`.

**Verificación:** aparecen los Secrets `SUPABASE_URL` y `SUPABASE_ANON_KEY`. GitHub no vuelve a mostrar sus valores después de guardarlos.

## 8. Ejecutar el keep-alive

1. En GitHub, abrí **Actions → Supabase keepalive**.
2. Tocá **Run workflow**, elegí la rama `main` y confirmá **Run workflow**.
3. Abrí la ejecución que acaba de empezar y el trabajo `consultar`.

**Verificación:** la ejecución queda verde y el registro dice `OK: eros_keepalive devolvió 1. No se consultaron pedidos ni fotos.`

## Etapa A · preparar pedidos para pagos y páginas públicas

Hacé esta etapa **en el proyecto nuevo**, después de completar `00-setup-completo.sql`. No borra pedidos ni fotos. Los registros antiguos `en_proceso` pasan a `nuevo`, porque todavía esperan el pago en el flujo nuevo.

### Ejecutar la migración

1. En el panel, confirmá que estás en el proyecto nuevo de Eros Web.
2. Abrí **SQL Editor → New query**.
3. En tu computadora, abrí `supabase/01-pagos.sql`, copiá el archivo completo y pegalo en la consulta.
4. Tocá **Run** y esperá el resultado.

**Verificación:** debe decir **Success**. El script usa una transacción: si hay un error, no queda aplicada una migración a medias. No lo ejecutes en el proyecto de respaldo.

### Verificar columnas, estados y permisos

En una consulta nueva, pegá esta consulta de solo lectura y tocá **Run**:

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'pedidos'
  and column_name in (
    'slug', 'mp_preference_id', 'mp_payment_id', 'pagado_en',
    'publicado_en', 'vence_en'
  )
order by column_name;
```

**Verificación:** aparecen las seis columnas. El `slug` se genera en la base, tiene 32 caracteres aleatorios y no usa `0`, `1`, `i`, `l` ni `o`.

Comprobá además que `anon` no pueda leer pedidos ni insertar o modificar campos del servidor:

```sql
select
  has_table_privilege('anon', 'public.pedidos', 'SELECT') as anon_lee,
  has_table_privilege('anon', 'public.pedidos', 'UPDATE') as anon_actualiza,
  has_column_privilege('anon', 'public.pedidos', 'estado', 'INSERT') as anon_inserta_estado,
  has_column_privilege('anon', 'public.pedidos', 'slug', 'INSERT') as anon_inserta_slug,
  has_column_privilege('anon', 'public.pedidos', 'mp_payment_id', 'INSERT') as anon_inserta_pago,
  has_column_privilege('anon', 'public.pedidos', 'vence_en', 'INSERT') as anon_inserta_vencimiento,
  has_column_privilege('anon', 'public.pedidos', 'activar_el', 'INSERT') as anon_inserta_fecha_elegida;
```

**Verificación:** los primeros seis resultados son `false`; el último es `true`, porque `activar_el` es la fecha que puede elegir el cliente. El `estado` por defecto es `nuevo`; los campos de pago y fechas del servidor quedan vacíos hasta que los escriban las funciones autorizadas.

Revisá la restricción de estados y los valores actuales:

```sql
select conname, pg_get_constraintdef(oid) as regla
from pg_constraint
where conrelid = 'public.pedidos'::regclass
  and conname = 'pedidos_estado_pago_valido';

select distinct estado
from public.pedidos
order by estado;
```

**Verificación:** la regla permite `nuevo`, `pagado`, `publicado` y `vencido`; los pedidos antiguos `en_proceso` aparecen como `nuevo`.

Comprobá que las dos tablas tengan RLS y revisá las políticas:

```sql
select c.relname as tabla, c.relrowsecurity as rls_activa
from pg_class as c
where c.oid in (
  'public.pedidos'::regclass,
  'public.admin_push_subscriptions'::regclass
)
order by c.relname;

select tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('pedidos', 'admin_push_subscriptions')
order by tablename, policyname;
```

**Verificación:** ambas filas tienen `rls_activa = true`. `admin_push_subscriptions` solo da acceso de fila a administradores autenticados y queda preparada para la etapa E; todavía no la usa el sitio.

### Verificar la tabla de precios

La fuente única sigue siendo `compartido/precios.js`. La copia de servidor está en `supabase/functions/_compartido/precios.ts`; cuando cambies la tabla compartida, actualizá la copia y verificá la igualdad desde una Terminal:

```bash
cd ~/Descargas/ChatGPT/erosweb
node scripts/verificar-precios.mjs
```

**Verificación:** tiene que imprimir `Precios del navegador y del servidor: coinciden.` Si hay diferencias, termina con error para que no se publiquen valores distintos. El total que manda hoy el navegador todavía no es confiable: se validará en la etapa B, del lado del servidor.

### Límites temporales de esta etapa

- Esta etapa no crea secretos ni despliega Edge Functions. No hay que cambiar `armador/config.js` ni los Secrets de GitHub.
- El panel actual todavía muestra la opción vieja **En proceso**; no la elijas. La base la convierte a **Nuevo** y rechaza ese estado desde esta migración. La interfaz se actualizará en su etapa correspondiente.
- No se aplicó este SQL contra Supabase desde acá. Después de ejecutarlo, completá las verificaciones de arriba antes de decir **“etapa A lista”**.

## Lista final de comprobación en SQL Editor

Estas consultas son solo de lectura. Ejecutalas en el proyecto nuevo.

### La tabla existe y tiene RLS activada

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'pedidos';
```

Debe aparecer una fila con `rowsecurity = true`.

### Ver las políticas de pedidos y fotos

```sql
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename = 'pedidos')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;
```

Revisá que en `pedidos` no haya una política de `SELECT` para `anon`, y que las operaciones administrativas exijan `eros_admin = true`. En `storage.objects`, no debe haber una política de lectura para `anon` sobre `fotos`.

### El bucket es privado y tiene límites

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'fotos';
```

Debe decir `public = false`, `file_size_limit = 5242880` y aceptar `image/jpeg`, `image/png` e `image/webp`.

### Anon no tiene permiso SQL para leer pedidos

```sql
select
  has_table_privilege('anon', 'public.pedidos', 'SELECT') as anon_lee_pedidos,
  has_column_privilege('anon', 'public.pedidos', 'id', 'SELECT') as anon_lee_id,
  has_column_privilege('anon', 'public.pedidos', 'id', 'INSERT') as anon_puede_insertar_id;
```

Los resultados esperados son `false`, `false` y `true`, respectivamente. La prueba del navegador confirma además que sin sesión no se leen pedidos ni fotos.

### La función del keep-alive solo responde 1

```sql
select public.eros_keepalive();
```

Debe devolver `1`. Esa función no consulta `pedidos` ni Storage.

## Alcance de esta guía

- No se cambia ni se borra el proyecto anterior de Supabase.
- No se modifican el armador ni el panel; `armador/config.js` solo queda con marcadores para que pegues los datos del proyecto nuevo.
- No se hizo commit ni push al preparar la base. Las instrucciones siguientes configuran únicamente el aviso por ntfy en el proyecto nuevo.

## Aviso opcional de pedidos nuevos por ntfy

Hacé esta parte solo después de que el proyecto nuevo ya reciba pedidos y fotos, y el panel los muestre correctamente. La función publica únicamente un mensaje fijo de prueba o el código, modelo, duración y total del pedido. No escribe esos datos en los logs. Si configurás `NTFY_TOKEN`, autentica la publicación; ante un `429` respeta `Retry-After` y reintenta hasta dos veces dentro de un límite total de 18 segundos.

> **Privacidad del webhook:** el Database Webhook de Supabase envía el registro completo a la función. El código de esta función solo lee cuatro campos, pero la vista **Invocations** del panel puede mostrar cuerpo y encabezados. No compartas capturas ni exportaciones de esos registros. El encabezado secreto también queda guardado en la definición del webhook; no incluyas esa definición en un volcado SQL público. Si necesitás evitar que el registro completo llegue a la función o a las invocaciones, frená antes de crear el webhook: habría que usar un disparador propio que envíe solo los cuatro campos permitidos.

### 1. Generar el secreto compartido

1. En el proyecto nuevo, abrí **SQL Editor → New query**.
2. Pegá y ejecutá esta consulta:

```sql
select replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '') as aviso_secreto;
```

3. Copiá el resultado completo: es una cadena aleatoria de 64 caracteres. Guardala en un lugar privado para poder pegarla en dos campos; no la escribas en `index.html`, `config.js`, esta guía ni en GitHub.

**Verificación:** el resultado tiene 64 caracteres hexadecimales. No copies el resultado dentro del texto de la consulta.

### 2. Crear una cuenta y un token de ntfy

1. Abrí [ntfy.sh](https://ntfy.sh/) e iniciá sesión o creá una cuenta.
2. En el menú de tu cuenta, entrá a **Account** y buscá **Access tokens**.
3. Creá un token para Eros Web, copiá su valor y guardalo en un lugar privado. ntfy indica que un token de acceso permite operar la cuenta; no lo compartas ni lo pongas en el repositorio. Consultá la [documentación oficial de tokens de ntfy](https://docs.ntfy.sh/publish/#access-tokens).

**Verificación:** tenés el token copiado y seguís suscripto desde el celular al mismo tópico de Eros Web.

### 3. Guardar los secretos en Supabase

1. En el panel del proyecto nuevo, abrí **Edge Functions → Secrets**.
2. Agregá la clave `AVISO_SECRETO` y pegá el valor que generaste.
3. Agregá la clave `NTFY_TOPICO` y pegá el nombre del mismo tópico al que está suscripto tu celular. Pegá solo el tópico, sin `https://ntfy.sh/`.
4. Agregá la clave `NTFY_TOKEN` y pegá el token de ntfy. Si la dejás sin configurar, la función vuelve a publicar sin autenticación.
5. Tocá **Save**.

**Verificación:** el panel confirma que guardó los tres nombres. No pegues sus valores en archivos locales ni consultas guardadas. Supabase permite que la función lea los secretos con `Deno.env.get(...)`; al guardar secretos no hace falta volver a desplegarla.

### 4. Desplegar o actualizar la función desde el editor del dashboard

1. Para crearla, abrí **Edge Functions → Deploy a new function → Via Editor**, elegí una función nueva y poné exactamente `aviso-pedido` como nombre.
2. Para actualizarla, abrí **Edge Functions → aviso-pedido** y tocá **Edit** o **Code** para volver al editor.
3. En el editor, reemplazá todo el contenido por el archivo local [`functions/aviso-pedido/index.ts`](functions/aviso-pedido/index.ts), incluida la versión nueva que agrega `NTFY_TOKEN` y los reintentos.
4. Tocá **Deploy function** y esperá el aviso de despliegue exitoso.
5. Abrí la configuración de `aviso-pedido` y apagá **Verify JWT**. La autenticación de esta función la hace el encabezado secreto `x-eros-secreto`.

**Verificación:** `aviso-pedido` aparece desplegada. En su configuración, **Verify JWT** está desactivado.

### 5. Probar ntfy antes de crear el webhook

Usá el probador integrado del dashboard. No uses una página pública para mandar el secreto.

1. En **Edge Functions → aviso-pedido**, tocá **Test**.
2. Elegí el método **POST**.
3. En **Headers**, agregá `Content-Type` con valor `application/json` y `x-eros-secreto` con el mismo `AVISO_SECRETO` que guardaste.
4. En **Request Body**, pegá exactamente:

```json
{"prueba": true}
```

5. Tocá **Send Request**. La función publica el texto fijo `Prueba de Eros Web`.

**Verificación:** debe llegar una notificación al celular. El probador debe responder HTTP `200` y un cuerpo parecido a `{"ok":true,"ntfy":"respondio","httpStatus":200,"usedToken":true}`. `usedToken` solo confirma si se incluyó un token; nunca lo muestra. Si responde `401`, el encabezado no coincide con el secreto guardado. Si responde `200` con `ok:false`, mirá `httpStatus` y `motivo`; el modo de prueba no incluye el tópico ni información personal.

Si aparece `ntfyError`, `http` es el estado HTTP, `code` el código de ntfy y `error`/`message` explican el rechazo; `retryAfter` y `rateLimitHeaders` muestran la espera y los límites informados, con URL, tópico y token ocultos.

### 6. Crear el Database Webhook

Crealo solo después de recibir la notificación de prueba:

1. Abrí **Database → Webhooks** y tocá **Create a new webhook**.
2. Poné un nombre, por ejemplo `pedido-nuevo-ntfy`.
3. Elegí el esquema `public`, la tabla `pedidos` y únicamente el evento **INSERT**.
4. Elegí **Supabase Edge Functions**, seleccioná `aviso-pedido` y usá el método **POST**.
5. En **HTTP Headers**, agregá `Content-Type: application/json` y el encabezado personalizado `x-eros-secreto` con el valor de `AVISO_SECRETO`. No pongas el secreto en el URL.
6. Guardá el webhook.

**Verificación:** el webhook aparece habilitado para `public.pedidos` e `INSERT`, apuntando a `aviso-pedido`.

### 7. Probar con un pedido real y revisar errores

1. Abrí la página pública de Eros Web y enviá un pedido de prueba normal.
2. Confirmá que el pedido aparece en el panel y que el celular recibe un aviso con el código, modelo, duración y total.

**Si algo falla:**

- **401:** en **Edge Functions → aviso-pedido → Invocations**, revisá el estado de la llamada y comprobá que el valor de `x-eros-secreto` del webhook sea idéntico a `AVISO_SECRETO`.
- **No aparece ninguna invocación:** revisá en **Database → Webhooks** que el webhook esté activo, apunte al proyecto y función correctos, y tenga seleccionado `INSERT` en `public.pedidos`.
- **La invocación da HTTP 200 pero no llega ntfy:** abrí **Edge Functions → aviso-pedido → Logs** y buscá `ntfy_http_status=...`. La función registra solo el estado HTTP o que no hubo respuesta; no escribe el tópico ni el pedido.
- **La prueba muestra `429`:** todavía no crees el webhook. Confirmá que `NTFY_TOKEN` esté guardado y que hayas desplegado de nuevo el código actualizado. La función reintenta como máximo dos veces; si sigue el `429`, revisá los límites de ntfy o consultá su soporte. El aviso sigue siendo solo por ntfy; no se configura otro canal.
- **La prueba muestra otro HTTP de error o timeout:** todavía no crees el webhook. Verificá que `NTFY_TOPICO` sea el tópico correcto. Si sigue fallando, se puede probar el método oficial `GET https://ntfy.sh/<topico>/publish` con título y mensaje en parámetros, o consultar al soporte de ntfy. El aviso sigue siendo solo por ntfy; no se configura otro canal.

No compartas capturas de **Invocations** ni exportaciones de la base: esa vista puede incluir el cuerpo completo enviado por el webhook y sus encabezados. Si el código `AVISO_SECRETO` se pierde, generá otro y actualizá tanto **Edge Functions → Secrets** como el encabezado del webhook.

## Etapa B · cobrar con Mercado Pago y seguir el pedido

Hacé esta etapa después de completar la A. Por ahora probá con cuentas y tarjetas de prueba: la página pública que abre el regalo se conecta en la **etapa C**. En B se prepara el cobro, se confirma desde el servidor y se muestra el link y el QR en el seguimiento; hasta terminar C, ese link todavía no carga el regalo desde Supabase. La limpieza automática corresponde a D y los avisos al panel a E.

### 1. Instalar las funciones SQL de cobro

1. En el proyecto nuevo, abrí **SQL Editor → New query**.
2. Copiá todo [`02-cobros.sql`](02-cobros.sql), pegalo y tocá **Run**. No vuelvas a pegar el archivo de instalación inicial para hacer este paso.
3. Si aparece un error, guardá el mensaje completo y detené la prueba de pago hasta corregirlo.

**Verificación:** el editor indica **Success**. El SQL deja los controles de cobro disponibles solo para las funciones del servidor; un visitante sigue sin poder leer la tabla `pedidos`.

En otra consulta de solo lectura, comprobá los permisos nuevos:

```sql
select p.proname as funcion,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('eros_limitar_cobro', 'eros_reservar_checkout',
    'eros_guardar_checkout', 'eros_fallar_checkout', 'eros_identificar_pago',
    'eros_estado_cobro', 'eros_registrar_pago')
order by p.proname;
```

**Verificación:** hay siete filas; `anon` y `authenticated` dicen `false`, y `servidor` dice `true`. Las tres tablas auxiliares están en el esquema privado `eros_private`, con RLS activada y sin permiso de lectura para visitantes.

### 2. Preparar Mercado Pago para probar sin dinero real

1. Entrá a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/es) con tu cuenta y abrí **Tus integraciones → Crear aplicación**. Poné un nombre reconocible, elegí **Pagos online** y **Checkout Pro**. Si pide un sitio, usá la URL pública de Eros Web.
2. Dentro de la aplicación, abrí **Cuentas de prueba → Crear cuenta de prueba**. Creá una cuenta **Vendedor** y otra **Comprador**, ambas de **Argentina**. Guardá sus credenciales de forma privada.
3. En otra ventana de incógnito, iniciá sesión con el **vendedor de prueba**. Entrá a Developers, creá una aplicación **Checkout Pro** para ese vendedor y abrí **Credenciales de producción** de esa aplicación de prueba.
4. Copiá su **Access Token** para cargarlo en Supabase en el paso siguiente. El nombre “producción” de esa pantalla no convierte la cuenta ficticia en una cuenta real. Para Checkout Pro se usa el token del vendedor de prueba y el `init_point` normal; no se elige la URL por el prefijo del token. [Instrucciones oficiales de prueba de Mercado Pago](https://www.mercadopago.com.ar/developers/es/news/2023/11/16/Questions-on-how-to-test-your-integration--).
5. En la aplicación del vendedor de prueba, abrí **Webhooks → Configurar notificaciones**. Buscá **Clave secreta**, tocá **Mostrar** y copiala de forma privada. Si todavía te exige guardar una URL, usá `https://TU_PROYECTO.supabase.co/functions/v1/webhook-mercadopago`, reemplazando `TU_PROYECTO` por el identificador del proyecto nuevo.

**Verificación:** tenés dos cuentas ficticias distintas y sabés que el Access Token pertenece al vendedor de prueba. No uses tu tarjeta ni tu cuenta compradora real durante estas pruebas.

### 3. Guardar la configuración del cobro en Supabase

1. En Supabase, abrí **Edge Functions → Secrets → Add new secret**.
2. Cargá estos nombres, uno por uno, con sus valores:

| Nombre | Valor que tenés que pegar |
| --- | --- |
| `MP_ACCESS_TOKEN` | Access Token privado del vendedor **de prueba** del paso anterior. |
| `MP_WEBHOOK_SECRET` | Clave secreta de Webhooks de la misma aplicación. |
| `MP_MODO` | `test`, exactamente así, mientras hagas pruebas. |
| `EROS_SITE_URL` | La raíz pública de tu sitio, con `https://` y el nombre del repositorio; copiá la dirección real que muestra **GitHub → repo → Settings → Pages**. Ejemplo de formato: `https://TU_USUARIO.github.io/eros-web/`. |

3. Tocá **Save**. No copies el Access Token ni la clave de Webhooks en `armador/config.js`, en el SQL, en esta guía o en GitHub.
4. Comprobá que las variables internas de Supabase para acceder a la base estén disponibles. El servidor usa `SUPABASE_SECRET_KEYS` y, como compatibilidad, `SUPABASE_SERVICE_ROLE_KEY`. Son claves internas del servidor: no tenés que mandarlas al navegador ni agregarlas a `config.js`. [Secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets).

**Verificación:** los cuatro nombres aparecen guardados. `EROS_SITE_URL` incluye `/eros-web/` si tu sitio está dentro de ese repositorio; no termina en `index.html`. `MP_MODO=test` exige que la cuenta del token sea un vendedor de prueba.

### 4. Preparar los tres archivos para pegar en el editor

El código fuente comparte las validaciones y los precios dentro de `supabase/functions/_compartido/`. Para que no tengas que reconstruir carpetas en el editor del navegador, prepará una copia completa por función:

1. En Linux, abrí la carpeta `Descargas/ChatGPT/erosweb/` y una terminal en esa carpeta.
2. Ejecutá:

```bash
node scripts/verificar-precios.mjs
node scripts/preparar-funciones.mjs
```

3. Se generan estos archivos locales, listos para copiar completos:

```text
supabase/dashboard/crear-pago.ts
supabase/dashboard/webhook-mercadopago.ts
supabase/dashboard/estado-pedido.ts
```

No edites las copias generadas. Si cambia el código original, repetí los dos comandos antes de desplegar. La carpeta `supabase/dashboard/` queda excluida de Git para evitar mantener otra copia manual de los precios.

**Verificación:** la terminal confirma que los precios coinciden y que preparó las tres funciones. Si alguno de los comandos falla, no pegues una copia vieja en el dashboard.

### 5. Desplegar las tres Edge Functions

Repetí estos pasos para `crear-pago`, `webhook-mercadopago` y `estado-pedido`:

1. En Supabase, abrí **Edge Functions → Deploy a new function → Via Editor**.
2. Poné exactamente el nombre de la función, con minúsculas y guiones.
3. Borrá el ejemplo del editor y pegá el archivo completo del mismo nombre de `supabase/dashboard/`.
4. Tocá **Deploy function** y esperá el aviso de éxito.
5. Abrí la función desplegada, entrá a **Details/Settings** y desactivá **Verify JWT**. Guardá el cambio si aparece un botón para hacerlo.
6. Para actualizar una función, abrila, tocá **Code/Edit**, reemplazá el contenido por la copia recién generada y tocá **Deploy updates**.

Este flujo de Checkout Pro no pide login al comprador. `crear-pago` comprueba el pedido mediante su id y código, o su slug largo; `estado-pedido` exige esos mismos identificadores; `webhook-mercadopago` valida la firma de Mercado Pago cuando está configurada y vuelve a consultar el pago en su API. No depende de que el navegador diga “aprobado”. En producción se exige la clave de Webhooks. Desactivar Verify JWT permite recibir esas llamadas externas; no concede acceso público a la tabla. [Editor de Edge Functions del dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard).

**Verificación:** las tres funciones aparecen desplegadas y tienen Verify JWT desactivado. Al llamar `crear-pago` o `estado-pedido` sin un identificador válido deben devolver un error, sin mostrar nombres, textos, música ni fotos.

### 6. Configurar las notificaciones de Mercado Pago

1. Volvé a **Mercado Pago Developers → Tus integraciones → aplicación del vendedor de prueba → Webhooks → Configurar notificaciones**.
2. Pegá como URL de notificaciones:

```text
https://TU_PROYECTO.supabase.co/functions/v1/webhook-mercadopago
```

3. Elegí el evento **Pagos** (`payment`) y guardá. Asegurate de usar la aplicación a la que pertenecen el Access Token y la clave secreta guardados en Supabase.
4. Si se muestran dos casilleros, **modo pruebas** y **modo producción**, configurá la URL correspondiente al flujo de cuentas de prueba que estás usando; no mezcles secretos de aplicaciones distintas. Las preferencias creadas por Eros Web también incluyen esa misma `notification_url`.
5. Si usás **Simular notificación**, elegí `payment`. El simulador sirve para comprobar la recepción y los encabezados; un pago inventado por el simulador no debe publicar un pedido, porque la función consulta el pago real antes de aprobarlo.

No agregues un Database Webhook sobre `pedidos` para confirmar pagos: en este paso la notificación la manda Mercado Pago. La dirección puesta en la preferencia tiene prioridad sobre una URL distinta guardada en el panel. [Notificaciones oficiales de Mercado Pago](https://www.mercadopago.com.ar/developers/es/docs/prestashop/additional-content/your-integrations/notifications/webhooks).

**Verificación:** la aplicación tiene guardada la URL de `webhook-mercadopago` para pagos. `MP_WEBHOOK_SECRET` coincide con la clave de esa aplicación. No basta con ver que una simulación llegó: la prueba que confirma todo es pagar un pedido de prueba y verlo publicado.

### 7. Publicar los archivos del sitio de esta etapa

1. Subí al mismo repositorio el `index.html` actualizado, los archivos modificados de `armador/`, la nueva carpeta `pedido/` y la librería local de QR con su licencia dentro de `vendor/`.
2. Conservá `armador/config.js` apuntando al **proyecto nuevo** con su clave pública. No agregues ninguna credencial de Mercado Pago allí.
3. Esperá el resultado verde del despliegue de Pages y abrí la URL publicada en una ventana de incógnito.
4. El seguimiento va en `pedido/?c=SLUG_LARGO`. El código de seis caracteres queda para soporte; no alcanza por sí solo para consultar un pedido.

**Verificación:** después de enviar un pedido aparecen el código, el total y **Pagar con Mercado Pago**. Ya no se pide transferir a un alias ni avisar el pago por WhatsApp en esa pantalla. WhatsApp queda como soporte.

### 8. Probar el recorrido completo antes de cobrar de verdad

1. Abrí la web publicada y armá un pedido con datos ficticios. Guardá su código y el enlace de seguimiento.
2. Tocá **Pagar con Mercado Pago**. Tiene que abrir el checkout de Mercado Pago con el importe correcto.
3. Iniciá sesión con la cuenta **compradora de prueba**, distinta del vendedor. Usá una tarjeta de prueba oficial de Argentina; por ejemplo Visa `4509 9535 6623 3704`, vencimiento `11/30`, código `123`. Para simular aprobación, usá `APRO` como nombre del titular y los datos de documento de prueba indicados por Mercado Pago. [Tarjetas y escenarios oficiales de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases).
4. Completá el pago y volvé a Eros Web. El seguimiento consulta al servidor cada pocos segundos. Primero puede decir que está esperando confirmación; cuando el servidor consulta un pago aprobado y verifica el importe, debe cambiar a **publicado** y mostrar link, **Copiar**, **Abrir mi página**, **Compartir** y QR descargable.
5. En Supabase, abrí **Table Editor → pedidos**, buscá el código y revisá `estado`, `mp_preference_id`, `mp_payment_id`, `pagado_en`, `publicado_en` y `vence_en`.
6. Repetí con otro pedido para probar un rechazo usando `OTHE` como titular de prueba. Si probás un caso pendiente con `CONT`, el pedido debe seguir sin publicarse hasta que la API informe aprobación; no habilites efectivo ni tickets para forzar un pendiente.
7. Volvé a cargar el seguimiento, cerrá y abrí la pestaña y tocá **Reintentar pago** cuando corresponda. No debe duplicarse el pedido ni extenderse su vencimiento por recibir de nuevo la misma notificación.

Si el checkout pide un código enviado por email a una cuenta ficticia, buscá el código de seis dígitos de esa cuenta en **Tus integraciones → tu aplicación → Cuentas de prueba**. No uses datos reales para resolver el acceso de la cuenta de prueba.

**Verificación:** el pago aprobado aparece en Supabase; uno rechazado o pendiente no publica nada. El total tiene que coincidir, por ejemplo **Carta 1 día sin extras: $5.000** y **Álbum 1 mes + juego + contador: $29.000**. El link y el QR corresponden al mismo slug; abrir el regalo desde Supabase se verifica después de la etapa C.

### 9. Qué revisar si algo falla

- **No se puede crear el pago:** en **Supabase → Edge Functions → crear-pago → Logs/Invocations**, revisá el estado de la llamada. Un importe alterado en el pedido se rechaza: no se usa el total enviado por el navegador como precio definitivo.
- **Mensaje de modo o cuenta incompatible:** revisá que `MP_MODO=test` use un vendedor de prueba y que `produccion` use tu vendedor real. El prefijo `APP_USR` aparece también en cuentas ficticias; no alcanza para distinguirlas.
- **HTTP 429:** hay un límite de 30 consultas de creación cada 15 minutos por conexión y de cinco creaciones/conciliaciones cada 30 minutos por pedido (20 cada 24 horas). Las conexiones se cuentan mediante un hash; no se guarda la IP en claro. Si el límite es del pedido, esperá 30 minutos; si alcanzaste el diario, consultanos con tu código. Una preferencia vigente se reutiliza.
- **Pago pendiente:** el botón cambia a **Revisar estado del pago** y solo consulta el estado. No abre otro checkout mientras Mercado Pago lo está revisando. Un pago rechazado o cancelado sí permite reintentar.
- **La consulta tarda:** el servidor corta las consultas de creación a los 18 segundos; el navegador tiene un margen adicional. No hace falta volver a enviar el pedido. Si la respuesta del POST a Mercado Pago se perdió, el siguiente intento busca la preferencia existente antes de crear otra.
- **Sigue diciendo que no pudo confirmar el enlace:** ese pedido queda en estado interno `incierto` para evitar crear otro checkout a ciegas. Reintentar no garantiza resolverlo. Revisá primero en Mercado Pago si existe una preferencia o pago con la referencia externa del pedido; si existe, conservá el bloqueo y revisá el historial de notificaciones. Si confirmaste que **no existe ningún pago ni una preferencia activa**, podés habilitar un nuevo intento desde SQL Editor con la consulta de recuperación de abajo.
- **Pago aprobado en Mercado Pago pero seguimiento en espera:** abrí **Mercado Pago Developers → tu aplicación → Webhooks**, revisá el historial de notificaciones y después **Supabase → Edge Functions → webhook-mercadopago → Invocations/Logs**. Comprobá la URL, el proyecto y la clave secreta. Las credenciales de prueba estáticas pueden no generar notificaciones; para Checkout Pro seguí el flujo de vendedor/comprador ficticios indicado arriba.
- **HTTP 401 en el webhook:** la firma no coincide con `MP_WEBHOOK_SECRET` o faltan sus encabezados. Revisá la aplicación y su clave; no desactives esa validación para resolver un pago real.
- **El seguimiento recibe error de conexión:** revisá `armador/config.js`, que `estado-pedido` esté desplegada y que Verify JWT esté desactivado. Las llamadas del navegador usan la clave pública en `apikey`.
- **Un pedido ya publicado recibe otra notificación:** debe conservar su mismo link y fechas. No vuelvas a pagar ese pedido para probar un reintento.

Recuperación administrada, solo después de esa comprobación en Mercado Pago. Reemplazá `CODIGO` por los seis caracteres del pedido y ejecutá en el proyecto nuevo:

```sql
update eros_private.cobros_checkout as cobro
set fase = 'listo', expira_en = null, bloqueo_hasta = now()
from public.pedidos as pedido
where cobro.pedido_id = pedido.id
  and pedido.codigo = 'CODIGO'
  and pedido.estado = 'nuevo'
  and pedido.mp_payment_id is null
  and cobro.fase = 'incierto'
returning pedido.codigo;
```

**Verificación:** devuelve solamente el código indicado. No borra el pedido ni cambia su total; habilita otra creación cuando ya verificaste que no hay un cobro en curso. Si devuelve cero filas, no fuerces el cambio de estado.

### 10. Pasar a producción, solo después de terminar las etapas restantes

1. Entrá a Developers con tu cuenta vendedora **real**, abrí su aplicación y activá **Credenciales de producción** completando lo que pida Mercado Pago.
2. Configurá el webhook de esa aplicación real con la misma dirección de la función y el evento **Pagos**. Copiá la clave secreta de esa aplicación.
3. En **Supabase → Edge Functions → Secrets**, reemplazá `MP_ACCESS_TOKEN` y `MP_WEBHOOK_SECRET` por los de la cuenta real. Cambiá `MP_MODO` a `produccion`; conservá `EROS_SITE_URL` con la URL pública correcta.
4. Probá nuevamente el flujo acordado para producción y revisá los primeros pagos y sus notificaciones. No mezcles pedidos o credenciales de prueba con producción.

**Verificación:** en producción la función exige firma y pago aprobado real, en pesos argentinos, para el vendedor correcto y por el importe recalculado. Ninguna credencial privada aparece en archivos del sitio.

### Lista de comprobación de la etapa B

- [ ] `02-cobros.sql` terminó con Success en el proyecto nuevo.
- [ ] Los precios de navegador y servidor coinciden.
- [ ] Las tres funciones están desplegadas y los cuatro Secrets están guardados.
- [ ] La cuenta compradora y la vendedora son ficticias y diferentes durante las pruebas.
- [ ] `crear-pago` no acepta un pedido inexistente ni uno con total alterado.
- [ ] El pago aprobado se confirma consultando a Mercado Pago y cambia a publicado una sola vez.
- [ ] Un pago rechazado o pendiente no publica el pedido.
- [ ] El seguimiento muestra el mismo link tras recargar y genera un QR descargable.
- [ ] Ninguna respuesta pública muestra nombres, textos, WhatsApp, música ni fotos.
- [ ] Los controles de cobro no quedan ejecutables por `anon` ni `authenticated`.

**Lo que falta comprobar en tus cuentas:** el SQL aplicado en Supabase, las credenciales, la firma real del webhook, un pago de prueba con Mercado Pago y el despliegue de Pages. Preparar los archivos locales no ejecuta ninguno de esos pasos. Cuando lo hayas probado, respondé **“etapa B lista”** para seguir con C.

## Etapa C · abrir el regalo desde Supabase

Hacé esta etapa después de completar la B. Ahora el link `p/?c=SLUG_LARGO` carga el contenido del pedido desde Supabase y usa el diseño del modelo elegido. Cada pedido comparte el código de su modelo; no hace falta crear una carpeta ni subir fotos de clientes a GitHub. La limpieza automática de los datos sigue pendiente de la etapa D.

### 1. Preparar la función pública

1. Abrí una terminal dentro de `Descargas/ChatGPT/erosweb/`.
2. Ejecutá:

```bash
node scripts/verificar-precios.mjs
node scripts/preparar-funciones.mjs
```

3. Abrí el archivo local `supabase/dashboard/obtener-pagina.ts`. Es la copia completa que vas a pegar en el editor del navegador; no la edites directamente.

Esta etapa no necesita otro SQL de instalación ni modifica las políticas de lectura de `pedidos` o del bucket. Reutiliza la función de límites de la etapa B. No vuelvas a ejecutar la instalación inicial ni habilites lectura anónima para resolver un error de carga.

**Verificación:** la terminal confirma que los precios coinciden y que preparó `obtener-pagina.ts`, además de las funciones de cobro que ya existían.

### 2. Revisar la configuración existente

1. En Supabase, abrí **Edge Functions → Secrets**.
2. Confirmá que `EROS_SITE_URL` sea la raíz real de tu web de GitHub Pages, incluyendo `/eros-web/` si corresponde. Debe tener `https://` y no terminar en `index.html`.
3. En tu computadora, confirmá que `armador/config.js` siga apuntando al proyecto nuevo con su URL y clave **pública**.

No hace falta generar otro secreto para `obtener-pagina`. El navegador identifica el regalo con su slug largo; la función usa la clave interna del servidor para consultar únicamente ese pedido y firmar sus fotos. Nunca pegues una clave privada o `service_role` en `config.js`.

**Verificación:** usás el mismo proyecto y el mismo sitio que en B. No agregaste claves privadas al sitio.

### 3. Desplegar `obtener-pagina`

1. Abrí **Supabase → Edge Functions → Deploy a new function → Via Editor**.
2. Poné exactamente `obtener-pagina` como nombre.
3. Borrá el ejemplo del editor y pegá todo el contenido de `supabase/dashboard/obtener-pagina.ts`.
4. Tocá **Deploy function** y esperá el aviso de éxito.
5. Abrí **obtener-pagina → Details/Settings** y desactivá **Verify JWT**. Guardá si el panel lo pide.
6. Si tenés que volver a desplegarla, regenerá primero el archivo con el comando del paso 1; después abrí **Code/Edit**, reemplazá el contenido completo y tocá **Deploy updates**.

La función acepta `POST` y responde el preflight `OPTIONS` del navegador con `204`. Comprueba que el pedido esté `publicado`, que haya comenzado su fecha de publicación y que todavía no haya vencido. No devuelve contactos, notas, información del pago ni otros pedidos. Hay límites de 120 consultas por minuto por conexión y 60 por minuto por slug.

**Verificación:** la función aparece desplegada y Verify JWT está apagado. No alcanza con regenerar el archivo en tu computadora: el código nuevo también tiene que estar desplegado en Supabase. [Editor del dashboard](https://supabase.com/docs/guides/functions/quickstart-dashboard).

### 4. Subir el código del sitio

1. Actualizá en GitHub los archivos modificados de las tres carpetas `plantillas/carta-para-vos/`, `plantillas/nuestra-historia/` y `plantillas/album-recuerdos/`. Subí tanto el `index.html` como su JavaScript del modelo.
2. Subí la nueva página `p/` y los archivos compartidos nuevos de carga pública dentro de `compartido/` (`pagina.js` y sus recursos, si los hay).
3. Subí los archivos modificados de `armador/`, `compartido/preview.js`, `admin/admin.js` y `admin/index.html`. Conservá la configuración pública del proyecto nuevo.
4. Conservá los juegos, temas, efectos y el resto de `compartido/`; las plantillas los siguen usando mediante rutas relativas.
5. Esperá el resultado verde de GitHub Pages y probá desde la URL publicada.

No subas fotos de pedidos a `p/`: esta carpeta contiene solamente la página de entrada. Las fotos siguen en el bucket privado `fotos`. No hay cambios en `demos/`; las plantillas abiertas sin `?c=` conservan su funcionamiento con `datos.js`.

**Verificación:** existe la ruta pública `p/` en tu sitio y las tres plantillas cargan sus archivos JavaScript sin errores 404.

### 5. Probar los tres modelos y los juegos

1. Armá un pedido ficticio de **Carta para vos**, subí fotos de prueba, elegí un tema y completá el pago con las cuentas de prueba de B.
2. Cuando el seguimiento diga que está publicado, tocá **Abrir mi página**. El link debe tener `p/?c=` seguido del slug largo; el código de seis caracteres queda para soporte.
3. Tocá **Tocá para empezar**. Sin juego elegido, debe aparecer el sobre; al abrirlo, deben verse la carta, las fotos y la firma reales del pedido, sin ejemplos ni lugares vacíos de la vista previa.
4. Repetí el recorrido con **Nuestra historia** y **Álbum de recuerdos**. Revisá el orden de las fotos, los epígrafes o momentos, el lightbox y el contador si lo elegiste.
5. Probá un pedido con cada juego: **Pintar el corazón**, **Me ama / no me ama** y **Llegá a mí**. En el regalo real el juego se juega con el dedo o el mouse; no se resuelve solo. Al ganar aparece el contenido, sin mostrar también un sobre.
6. Si usaste fotos opcionales para el laberinto, comprobá que sean las del pedido correcto.
7. Repetí en celular y computadora. Abrí otra pestaña del mismo link y comprobá que muestre el mismo pedido.

**Verificación:** los tres modelos muestran su propio contenido y los tres juegos respetan la apertura elegida. La vista previa sigue siendo automática, pero el link público conserva la experiencia real.

### 6. Probar fechas, fotos y acceso limitado

1. Creá un pedido de prueba con una fecha de activación futura y pagalo con las cuentas ficticias. Antes de esa fecha debe aparecer un mensaje amable de que la página todavía no está disponible, sin mostrar su contenido ni fotos.
2. Para probar un vencimiento sin esperar, abrí **Supabase → Table Editor → pedidos**, filtrá por el código de un pedido ficticio ya publicado y cambiá **solo su `vence_en`** por una fecha pasada. Conservá su estado para comprobar que el servidor rechaza el acceso por la fecha, aunque todavía diga `publicado`.
3. Abrí ese link otra vez: debe decir **Esta página ya venció**. En esta etapa se corta el acceso, pero todavía no se borran automáticamente los archivos o textos; eso se configura en D.
4. Probá un slug inventado y un pedido que todavía esté `nuevo`: no deben mostrar contenido. No pruebes buscando slugs de otras personas.
5. En un pedido ficticio, probá sin fotos y con una foto ausente. El resto del regalo debe seguir funcionando.
6. Dejá un regalo vigente abierto varios minutos y tocá una foto para ampliarla. Al recargar se vuelven a pedir enlaces firmados; al vencer el regalo no se puede volver a pedir su contenido.

Las URLs de las fotos duran como máximo diez minutos y se acortan si al regalo le queda menos tiempo. El navegador puede mantener las imágenes de la experiencia actual en memoria; no se guardan los textos o fotos del regalo en `localStorage`. Cualquiera que reciba el link puede abrir el regalo mientras esté vigente. `noindex` evita pedir su indexación, pero el link no es una contraseña. [URLs firmadas de Storage](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurls).

Las fotos nuevas se optimizan en el navegador antes de subirlas: lado mayor de hasta **1400 px**, JPEG con calidad **0.8**, respetando su orientación. No se usa la transformación de imágenes de Storage, que es una función de planes pagos. Las fotos que ya estaban subidas no se comprimen de nuevo. [Transformaciones de imágenes de Supabase](https://supabase.com/docs/guides/storage/serving/image-transformations).

**Verificación:** fecha futura, vencido, inexistente y pendiente no revelan fotos ni contenido. Un regalo vigente se ve correctamente y la tabla continúa sin permitir lectura anónima.

### 7. Abrir desde el panel y revisar la música

1. Entrá a tu panel `admin/` con tu sesión administradora y tocá **Actualizar**.
2. Abrí un pedido publicado y vigente. En **Link para entregar** tiene que aparecer **Abrir página**, junto con el link y los controles para copiarlo o mandarlo por WhatsApp.
3. Abrí un pedido programado, vencido o todavía nuevo: el panel explica su estado y no habilita **Abrir página**. La fecha de vencimiento mostrada toma primero `vence_en`, calculada por el servidor.
4. En el armador, dejá la música sin elegir: ya no debe aparecer el texto **Música: seleccion: pendiente**. Elegí una canción disponible o pegá un enlace válido y comprobá que la información aparezca; al borrarlo debe ocultarse.
5. La música conserva el funcionamiento actual: un archivo de la selección debe existir en el sitio para poder sonar. Un link de Spotify o YouTube no se convierte automáticamente en un MP3 ni se descarga del servicio.

**Verificación:** el panel usa `p/?c=SLUG_LARGO`, no una carpeta basada en el código. La vista previa no muestra música pendiente y las fotos nuevas están optimizadas.

Si usás el borrado manual de fotos y datos del panel, ese pedido también queda marcado como `vencido` para cerrar nuevas consultas de su página. La limpieza automática por fecha se configura en la etapa D.

### Si algo falla

- **La web no puede llamar a la función:** revisá en **obtener-pagina → Invocations** que `OPTIONS` responda `204`, Verify JWT esté apagado y `EROS_SITE_URL` tenga el dominio real. Subí y desplegá el archivo generado más reciente.
- **La página dice que todavía no está disponible:** revisá en `pedidos` su estado, `publicado_en`, `activar_el` y `vence_en`. No cambies a mano un pedido real para evitar revisar un pago pendiente.
- **La página dice que venció:** comprobá `vence_en` en hora argentina. Los datos de un pedido vencido todavía se conservan hasta configurar D o borrarlos con el panel.
- **Aparece un `429`:** dejá de recargar y esperá un minuto. La página no necesita consultas continuas para mostrar las mismas fotos.
- **Una foto no aparece:** verificá en **Storage → fotos** que el archivo del pedido exista. No cambies el bucket a público. Abrí de nuevo el link para pedir URLs nuevas.
- **No suena la música:** tocá primero el botón de inicio, revisá el botón de pausa y que el archivo elegido exista; no esperes que un enlace de Spotify o YouTube se reproduzca como un MP3.
- **En el panel sigue apareciendo una dirección vieja:** asegurate de haber subido `admin/admin.js` y `admin/index.html`, recargá y tocá **Actualizar** para volver a leer slug y fechas del servidor.

### Lista de comprobación de la etapa C

- [ ] `obtener-pagina` está desplegada, responde OPTIONS y tiene Verify JWT desactivado.
- [ ] El link corto `p/?c=` abre el modelo correcto.
- [ ] Carta, Historia y Álbum muestran sus textos, fotos y firma reales.
- [ ] Los tres juegos se pueden jugar de verdad y reemplazan al sobre.
- [ ] Funciona un pedido sin fotos y no se rompe por una foto ausente.
- [ ] Un pedido nuevo, futuro, vencido o inexistente no entrega contenido.
- [ ] Las fotos mantienen el bucket privado y usan URLs firmadas temporales.
- [ ] El panel abre solo páginas publicadas y vigentes, usando el slug.
- [ ] No aparece música pendiente cuando todavía no elegiste nada.
- [ ] Las demos y las plantillas sin `?c=` siguen funcionando.

**Lo que tenés que verificar en tus cuentas:** el despliegue de la función y de Pages, los pedidos y pagos ficticios, la firma y descarga real de fotos en Storage y el acceso desde otro dispositivo. Las pruebas locales no ejecutan esos pasos. Cuando termines, respondé **“etapa C lista”** para seguir con D.
