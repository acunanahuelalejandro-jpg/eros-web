# Eros Web · preparar el proyecto nuevo de Supabase

Esta guía es para un proyecto **nuevo**. El proyecto anterior queda como respaldo: no pegues este SQL allí y no lo borres.

El archivo de instalación es [`00-setup-completo.sql`](00-setup-completo.sql). El aviso a ntfy y `pg_net` quedan afuera de esta etapa; no se instalan.

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

## Qué queda fuera de esta etapa

- No se cambia ni se borra el proyecto anterior de Supabase.
- No se configura ntfy, `pg_net` ni ningún aviso de pedidos.
- No se modifican el armador ni el panel; `armador/config.js` solo queda con marcadores para que pegues los datos del proyecto nuevo.
- No se hizo commit ni push. Primero probá el proyecto nuevo; después decidimos qué publicar.
