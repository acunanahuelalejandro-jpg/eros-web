-- Eros Web: base mínima para recibir pedidos y fotos de forma privada.
-- Podés volver a ejecutar este archivo en el SQL Editor de Supabase.
-- La clave pública del navegador no reemplaza estas reglas: RLS es quien
-- decide qué puede hacer cada visitante.

begin;

-- Tabla principal. El navegador genera id y codigo antes de insertar.
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

  -- Impide códigos que no tengan exactamente seis letras/números mayúsculos.
  constraint pedidos_codigo_formato check (codigo ~ '^[A-Z0-9]{6}$'),
  -- El estado solo puede avanzar por la cuenta administradora.
  constraint pedidos_estado_valido check (estado in ('nuevo', 'en_proceso', 'pagado', 'publicado', 'vencido')),
  -- Topes de longitud y tamaño que evitan cargas desmedidas desde el navegador.
  constraint pedidos_modelo_largo check (char_length(btrim(modelo)) between 1 and 80),
  constraint pedidos_duracion_larga check (char_length(btrim(duracion)) between 1 and 30),
  constraint pedidos_extras_objeto check (jsonb_typeof(extras) = 'object' and octet_length(extras::text) <= 5000),
  constraint pedidos_tema_largo check (char_length(btrim(tema)) between 1 and 40),
  constraint pedidos_destinatario_largo check (char_length(btrim(para_quien)) between 1 and 120),
  constraint pedidos_remitente_largo check (de_parte is null or char_length(de_parte) <= 120),
  constraint pedidos_musica_larga check (char_length(musica) <= 500),
  constraint pedidos_whatsapp_largo check (whatsapp_cliente is null or char_length(whatsapp_cliente) <= 30),
  constraint pedidos_datos_objeto check (jsonb_typeof(datos) = 'object' and octet_length(datos::text) <= 50000),
  constraint pedidos_total_tope check (total between 1 and 100000),
  constraint pedidos_fotos_tope check (fotos_cantidad between 0 and 12),
  constraint pedidos_notas_largo check (notas is null or char_length(notas) <= 1000)
);

-- RLS queda activada aunque la tabla ya existiera.
alter table public.pedidos enable row level security;

-- Índice para que la bandeja administrativa filtre por estado y fecha.
create index if not exists pedidos_estado_creado_en_idx
  on public.pedidos (estado, creado_en desc);

-- Quitamos permisos directos de esta tabla a los roles del navegador.
-- Después damos solo los permisos mínimos que necesitan nuestras políticas.
revoke all privileges on table public.pedidos from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- El cliente anónimo solo puede enviar los datos necesarios para crear un pedido.
-- No puede elegir estado ni fecha de creación, y no puede escribir notas internas.
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

-- El rol autenticado necesita privilegios SQL para operar; las políticas de abajo
-- reducen estas operaciones al usuario con app_metadata.eros_admin = true.
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

-- Borramos solo las políticas con estos nombres para que el script se pueda
-- volver a ejecutar sin tocar políticas de otras tablas.

-- Esta política permite crear pedidos sin iniciar sesión, pero solo con estado nuevo.
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

-- Además de la regla anterior, este límite restrictivo impide que otra política
-- permisiva existente amplíe lo que puede insertar un visitante anónimo.
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

-- Los usuarios autenticados tampoco pueden crear pedidos desde la API pública.
drop policy if exists pedidos_auth_sin_insertar on public.pedidos;
create policy pedidos_auth_sin_insertar
  on public.pedidos as restrictive
  for insert to authenticated
  with check (false);

-- Una política permisiva da lectura al administrador autenticado.
drop policy if exists pedidos_admin_lee on public.pedidos;
create policy pedidos_admin_lee
  on public.pedidos as permissive
  for select to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- Esta regla restrictiva bloquea lecturas de anon y de cualquier usuario que no
-- tenga el indicador administrado desde app_metadata.
drop policy if exists pedidos_solo_admin_lee on public.pedidos;
create policy pedidos_solo_admin_lee
  on public.pedidos as restrictive
  for select to public
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- El administrador autenticado puede modificar el contenido y el estado del pedido.
drop policy if exists pedidos_admin_actualiza on public.pedidos;
create policy pedidos_admin_actualiza
  on public.pedidos as permissive
  for update to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false))
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- Esta condición restrictiva impide que otra política habilite actualizaciones
-- de pedidos a visitantes o usuarios autenticados que no sean administradores.
drop policy if exists pedidos_solo_admin_actualiza on public.pedidos;
create policy pedidos_solo_admin_actualiza
  on public.pedidos as restrictive
  for update to public
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false))
  with check (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- El administrador autenticado puede borrar pedidos.
drop policy if exists pedidos_admin_borra on public.pedidos;
create policy pedidos_admin_borra
  on public.pedidos as permissive
  for delete to authenticated
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- Esta condición restrictiva garantiza que anon y otros usuarios no borren pedidos.
drop policy if exists pedidos_solo_admin_borra on public.pedidos;
create policy pedidos_solo_admin_borra
  on public.pedidos as restrictive
  for delete to public
  using (coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false));

-- Bucket privado: máximo 5 MiB por archivo y solo tipos de imagen solicitados.
-- El ON CONFLICT corrige estas opciones si el bucket ya existía.
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

-- Supabase mantiene RLS activada en storage.objects. No alteramos sus tablas
-- ni cambiamos sus propietarios o permisos desde este script.


-- El visitante anónimo solo puede subir a una ruta de la forma UUID/archivo.ext.
-- No damos política SELECT, UPDATE ni DELETE a anon.
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

-- Política adicional de subida para el administrador autenticado.
drop policy if exists fotos_admin_sube on storage.objects;
create policy fotos_admin_sube
  on storage.objects as permissive
  for insert to authenticated
  with check (
    bucket_id = 'fotos'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- Esta regla restrictiva protege el bucket aunque existan políticas permisivas
-- más amplias: solo acepta el administrador o un anon con una carpeta UUID.
drop policy if exists fotos_restringe_subidas on storage.objects;
create policy fotos_restringe_subidas
  on storage.objects as restrictive
  for insert to public
  with check (
    bucket_id <> 'fotos'
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    or (
      auth.role() = 'anon'
      and bucket_id = 'fotos'
      and cardinality(storage.foldername(name)) = 1
      and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and storage.filename(name) ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$'
    )
  );

-- Solo el administrador puede leer/listar los objetos del bucket fotos.
drop policy if exists fotos_admin_lee on storage.objects;
create policy fotos_admin_lee
  on storage.objects as permissive
  for select to authenticated
  using (
    bucket_id = 'fotos'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- Regla restrictiva: anon y usuarios sin el claim de administrador no pueden
-- leer ni listar fotos, incluso si otra política amplia estuviera presente.
drop policy if exists fotos_solo_admin_lee on storage.objects;
create policy fotos_solo_admin_lee
  on storage.objects as restrictive
  for select to public
  using (
    bucket_id <> 'fotos'
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- Solo el administrador autenticado puede reemplazar/mover objetos del bucket.
drop policy if exists fotos_admin_actualiza on storage.objects;
create policy fotos_admin_actualiza
  on storage.objects as permissive
  for update to authenticated
  using (
    bucket_id = 'fotos'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  )
  with check (
    bucket_id = 'fotos'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- La regla restrictiva impide actualizaciones de fotos por anon u otros usuarios.
drop policy if exists fotos_solo_admin_actualiza on storage.objects;
create policy fotos_solo_admin_actualiza
  on storage.objects as restrictive
  for update to public
  using (
    bucket_id <> 'fotos'
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  )
  with check (
    bucket_id <> 'fotos'
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- Solo el administrador autenticado puede borrar objetos del bucket.
drop policy if exists fotos_admin_borra on storage.objects;
create policy fotos_admin_borra
  on storage.objects as permissive
  for delete to authenticated
  using (
    bucket_id = 'fotos'
    and coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- Regla restrictiva para que otras políticas existentes no habiliten borrados.
drop policy if exists fotos_solo_admin_borra on storage.objects;
create policy fotos_solo_admin_borra
  on storage.objects as restrictive
  for delete to public
  using (
    bucket_id <> 'fotos'
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'eros_admin') = 'true', false)
  );

-- Actualiza el esquema que ve la API REST después de crear la tabla.
notify pgrst, 'reload schema';

commit;
