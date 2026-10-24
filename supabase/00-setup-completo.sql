-- Eros Web · instalación inicial para un proyecto NUEVO de Supabase.
-- Ejecutar en SQL Editor usando la cuenta postgres del proyecto nuevo.
-- Reejecutable: no instala pg_net, triggers ni avisos a ntfy.
-- La clave pública del navegador no reemplaza grants + RLS.

begin;

-- Pedidos enviados por el armador. El navegador genera id y codigo.
create table if not exists public.pedidos (
  id uuid primary key,
  codigo text not null unique,
  creado_en timestamptz not null default now(),
  estado text not null default 'nuevo',
  modelo text not null,
  duracion text not null,
  extras jsonb not null default '{}'::jsonb,
  tema text not null default 'eros',
  para_quien text not null,
  de_parte text,
  musica text not null default '',
  activar_el date,
  whatsapp_cliente text,
  datos jsonb not null default '{}'::jsonb,
  total integer not null,
  fotos_cantidad integer not null default 0,
  notas text,

  constraint pedidos_codigo_formato
    check (codigo ~ '^[A-Z0-9]{6}$'),
  constraint pedidos_estado_valido
    check (estado in ('nuevo', 'en_proceso', 'pagado', 'publicado', 'vencido')),
  constraint pedidos_modelo_largo
    check (char_length(btrim(modelo)) between 1 and 80),
  constraint pedidos_duracion_larga
    check (char_length(btrim(duracion)) between 1 and 30),
  constraint pedidos_extras_objeto
    check (jsonb_typeof(extras) = 'object' and octet_length(extras::text) <= 5000),
  constraint pedidos_tema_largo
    check (char_length(btrim(tema)) between 1 and 40),
  constraint pedidos_destinatario_largo
    check (char_length(btrim(para_quien)) between 1 and 120),
  constraint pedidos_remitente_largo
    check (de_parte is null or char_length(de_parte) <= 120),
  constraint pedidos_musica_larga
    check (char_length(musica) <= 500),
  constraint pedidos_whatsapp_largo
    check (whatsapp_cliente is null or char_length(whatsapp_cliente) <= 30),
  constraint pedidos_datos_objeto
    check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 50000),
  constraint pedidos_total_tope
    check (total between 1 and 100000),
  constraint pedidos_fotos_tope
    check (fotos_cantidad between 0 and 12),
  constraint pedidos_notas_largo
    check (notas is null or char_length(notas) <= 1000)
);

-- La tabla propia de Eros Web usa RLS. Este ALTER no modifica tablas del sistema.
alter table public.pedidos enable row level security;

create index if not exists pedidos_estado_creado_en_idx
  on public.pedidos (estado, creado_en desc);

-- Grants y RLS son dos capas distintas: primero limitamos qué operaciones
-- existen en la API y luego las políticas limitan qué filas puede tocar cada rol.
-- Estos permisos son solo para la tabla propia public.pedidos, no para tablas
-- internas de Supabase.
revoke all privileges on table public.pedidos from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- El visitante solo puede insertar las columnas del pedido. Estado, creado_en
-- y notas usan sus valores del servidor y no se pueden elegir desde el armador.
grant insert (
  id,
  codigo,
  modelo,
  duracion,
  extras,
  tema,
  para_quien,
  de_parte,
  musica,
  activar_el,
  whatsapp_cliente,
  datos,
  total,
  fotos_cantidad
) on table public.pedidos to anon;

-- El panel requiere estos permisos SQL; RLS debajo los reserva al admin.
grant select, delete on table public.pedidos to authenticated;
grant update (
  estado,
  modelo,
  duracion,
  extras,
  tema,
  para_quien,
  de_parte,
  musica,
  activar_el,
  whatsapp_cliente,
  datos,
  total,
  fotos_cantidad,
  notas
) on table public.pedidos to authenticated;

-- Cada política se elimina antes de recrearse, así el bloque se puede repetir.
-- Solo anon crea pedidos nuevos, con campos limitados y sin notas internas.
drop policy if exists pedidos_anon_crea_nuevo on public.pedidos;
create policy pedidos_anon_crea_nuevo
  on public.pedidos as permissive
  for insert to anon
  with check (
    estado = 'nuevo'
    and total between 1 and 100000
    and fotos_cantidad between 0 and 12
    and char_length(btrim(modelo)) between 1 and 80
    and char_length(btrim(duracion)) between 1 and 30
    and jsonb_typeof(extras) = 'object'
    and octet_length(extras::text) <= 5000
    and char_length(btrim(tema)) between 1 and 40
    and char_length(btrim(para_quien)) between 1 and 120
    and (de_parte is null or char_length(de_parte) <= 120)
    and char_length(musica) <= 500
    and (whatsapp_cliente is null or char_length(whatsapp_cliente) <= 30)
    and jsonb_typeof(datos) = 'object'
    and octet_length(datos::text) <= 50000
    and id is not null
    and codigo ~ '^[A-Z0-9]{6}$'
  );

-- La regla restrictiva impide que otra política permisiva habilite inserts
-- anónimos con estado distinto de nuevo o valores que excedan los topes.
drop policy if exists pedidos_anon_solo_nuevo_y_limitado on public.pedidos;
create policy pedidos_anon_solo_nuevo_y_limitado
  on public.pedidos as restrictive
  for insert to anon
  with check (
    estado = 'nuevo'
    and total between 1 and 100000
    and fotos_cantidad between 0 and 12
    and char_length(btrim(modelo)) between 1 and 80
    and char_length(btrim(duracion)) between 1 and 30
    and jsonb_typeof(extras) = 'object'
    and octet_length(extras::text) <= 5000
    and char_length(btrim(tema)) between 1 and 40
    and char_length(btrim(para_quien)) between 1 and 120
    and (de_parte is null or char_length(de_parte) <= 120)
    and char_length(musica) <= 500
    and (whatsapp_cliente is null or char_length(whatsapp_cliente) <= 30)
    and jsonb_typeof(datos) = 'object'
    and octet_length(datos::text) <= 50000
    and id is not null
    and codigo ~ '^[A-Z0-9]{6}$'
  );

-- Una sesión normal tampoco puede insertar pedidos por la API pública.
drop policy if exists pedidos_auth_no_inserta on public.pedidos;
create policy pedidos_auth_no_inserta
  on public.pedidos as restrictive
  for insert to authenticated
  with check (false);

-- Solo un usuario autenticado cuyo app_metadata.eros_admin sea true puede leer.
drop policy if exists pedidos_admin_lee on public.pedidos;
create policy pedidos_admin_lee
  on public.pedidos as permissive
  for select to authenticated
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false));

drop policy if exists pedidos_solo_admin_lee on public.pedidos;
create policy pedidos_solo_admin_lee
  on public.pedidos as restrictive
  for select to public
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- El panel puede editar pedidos únicamente con el permiso administrado.
drop policy if exists pedidos_admin_actualiza on public.pedidos;
create policy pedidos_admin_actualiza
  on public.pedidos as permissive
  for update to authenticated
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false))
  with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false));

drop policy if exists pedidos_solo_admin_actualiza on public.pedidos;
create policy pedidos_solo_admin_actualiza
  on public.pedidos as restrictive
  for update to public
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false))
  with check (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- Solo el administrador autenticado puede borrar pedidos.
drop policy if exists pedidos_admin_borra on public.pedidos;
create policy pedidos_admin_borra
  on public.pedidos as permissive
  for delete to authenticated
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false));

drop policy if exists pedidos_solo_admin_borra on public.pedidos;
create policy pedidos_solo_admin_borra
  on public.pedidos as restrictive
  for delete to public
  using (coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- Bucket privado: hasta 5 MiB por archivo; solo JPEG, PNG y WebP.
-- La tabla de buckets es propiedad de Supabase: solo insertamos su configuración
-- permitida. No alteramos ni cambiamos permisos/propietario de tablas de Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos',
  'fotos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Anon solo sube a una carpeta cuyo primer nivel es el UUID del pedido.
-- No se crea ninguna política anónima de lectura, listado, actualización o borrado.
drop policy if exists fotos_anon_sube_en_carpeta_uuid on storage.objects;
create policy fotos_anon_sube_en_carpeta_uuid
  on storage.objects as permissive
  for insert to anon
  with check (
    bucket_id = 'fotos'
    and cardinality(storage.foldername(name)) = 1
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
  );

drop policy if exists fotos_anon_restringe_subida on storage.objects;
create policy fotos_anon_restringe_subida
  on storage.objects as restrictive
  for insert to anon
  with check (
    bucket_id <> 'fotos'
    or (
      bucket_id = 'fotos'
      and cardinality(storage.foldername(name)) = 1
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
    )
  );

-- El administrador puede cargar y administrar archivos del bucket privado.
drop policy if exists fotos_admin_sube on storage.objects;
create policy fotos_admin_sube
  on storage.objects as permissive
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

drop policy if exists fotos_admin_lee on storage.objects;
create policy fotos_admin_lee
  on storage.objects as permissive
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

drop policy if exists fotos_solo_admin_lee on storage.objects;
create policy fotos_solo_admin_lee
  on storage.objects as restrictive
  for select to public
  using (
    bucket_id <> 'fotos'
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

drop policy if exists fotos_admin_actualiza on storage.objects;
create policy fotos_admin_actualiza
  on storage.objects as permissive
  for update to authenticated
  using (
    bucket_id = 'fotos'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  )
  with check (
    bucket_id = 'fotos'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

drop policy if exists fotos_solo_admin_actualiza on storage.objects;
create policy fotos_solo_admin_actualiza
  on storage.objects as restrictive
  for update to public
  using (
    bucket_id <> 'fotos'
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  )
  with check (
    bucket_id <> 'fotos'
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

drop policy if exists fotos_admin_borra on storage.objects;
create policy fotos_admin_borra
  on storage.objects as permissive
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

drop policy if exists fotos_solo_admin_borra on storage.objects;
create policy fotos_solo_admin_borra
  on storage.objects as restrictive
  for delete to public
  using (
    bucket_id <> 'fotos'
    or coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- Esta función no consulta tablas. El workflow solo recibe el entero 1.
create or replace function public.eros_keepalive()
returns integer
language sql
immutable
security invoker
set search_path = ''
as $funcion$
  select 1;
$funcion$;

-- Postgres concede EXECUTE a PUBLIC por defecto al crear funciones. Lo quitamos
-- y habilitamos únicamente la ejecución pública requerida por GitHub Actions.
revoke all on function public.eros_keepalive() from public, anon, authenticated;
grant execute on function public.eros_keepalive() to anon;

comment on function public.eros_keepalive() is
  'Comprobación liviana para GitHub Actions. Devuelve únicamente el entero 1.';

-- Hace visibles la tabla y la función a PostgREST sin conceder lectura anónima.
notify pgrst, 'reload schema';

commit;
