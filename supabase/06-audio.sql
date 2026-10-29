-- Eros Web: audio MP3 privado. Ejecutar después de las etapas 00 a 05.
-- Reejecutable. No ejecuta borrados físicos ni modifica permisos de tablas del sistema.
begin;

alter table public.pedidos
  add column if not exists audio_ruta text,
  add column if not exists audio_nombre text,
  add column if not exists audio_bytes integer,
  add column if not exists audio_duracion numeric,
  add column if not exists audio_consentimiento boolean not null default false,
  add column if not exists audio_verificado_en timestamptz,
  add column if not exists audio_sha256 text;

-- Los pedidos anteriores conservan sus datos. Los campos nuevos empiezan vacíos.
-- La ruta siempre pertenece al UUID del pedido; el nombre original no forma la URL.
alter table public.pedidos drop constraint if exists pedidos_audio_valido;
alter table public.pedidos add constraint pedidos_audio_valido check (
  (audio_ruta is null and audio_nombre is null and audio_bytes is null
    and audio_duracion is null and audio_consentimiento = false
    and audio_verificado_en is null and audio_sha256 is null)
  or
  (audio_ruta is not null and audio_ruta = id::text || '/cancion.mp3'
    and audio_nombre is not null and char_length(audio_nombre) between 1 and 120
    and audio_bytes is not null and audio_bytes between 1 and 10485760
    and (audio_duracion is null or (audio_duracion > 0 and audio_duracion <= 600))
    and audio_consentimiento = true
    and ((audio_verificado_en is null and audio_sha256 is null)
      or (audio_verificado_en is not null and audio_sha256 is not null and audio_sha256 ~ '^[a-f0-9]{64}$')))
);

-- Solo se amplía INSERT sobre columnas propias del pedido. El visitante nunca
-- puede declarar que el servidor verificó el archivo, ni cambiarlo tras insertar.
grant insert (audio_ruta, audio_nombre, audio_bytes, audio_duracion, audio_consentimiento)
  on public.pedidos to anon;
revoke insert (audio_verificado_en, audio_sha256),
  update (audio_ruta, audio_nombre, audio_bytes, audio_duracion, audio_consentimiento, audio_verificado_en, audio_sha256)
  on public.pedidos from public, anon, authenticated;
grant select, update on public.pedidos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios', 'audios', false, 10485760, array['audio/mpeg']::text[])
on conflict (id) do update set name = excluded.name, public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Anon no tiene SELECT sobre pedidos. Este booleano privado permite a la política
-- comprobar únicamente que existe el pedido nuevo y la ruta exacta declarada.
create or replace function eros_private.puede_subir_audio(p_nombre text)
returns boolean language plpgsql stable security definer set search_path = ''
as $f$
begin
  if p_nombre is null or p_nombre !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/cancion\.mp3$' then return false; end if;
  return exists(select 1 from public.pedidos p
    where p.id::text = split_part(p_nombre,'/',1) and p.audio_ruta = p_nombre
      and p.estado = 'nuevo' and p.audio_consentimiento = true
      and p.audio_verificado_en is null and p.limpiado_en is null
      and p.limpieza_intentada_en is null and p.limpieza_token is null);
end;
$f$;
revoke all on function eros_private.puede_subir_audio(text) from public, anon, authenticated, service_role;
grant usage on schema eros_private to anon, authenticated, service_role;
grant execute on function eros_private.puede_subir_audio(text) to anon, service_role;

-- Archivo único, sin upsert: nadie desde el navegador puede reemplazarlo una vez
-- verificado. Storage además exige audio/mpeg y el tope de diez MiB del bucket.
drop policy if exists audios_anon_sube on storage.objects;
create policy audios_anon_sube on storage.objects as permissive for insert to anon
  with check (bucket_id = 'audios' and eros_private.puede_subir_audio(name));
drop policy if exists audios_anon_solo_nuevo on storage.objects;
create policy audios_anon_solo_nuevo on storage.objects as restrictive for insert to anon
  with check (bucket_id <> 'audios' or eros_private.puede_subir_audio(name));
drop policy if exists audios_auth_no_sube on storage.objects;
create policy audios_auth_no_sube on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'audios');
drop policy if exists audios_no_reemplaza on storage.objects;
create policy audios_no_reemplaza on storage.objects as restrictive for update to public
  using (bucket_id <> 'audios') with check (bucket_id <> 'audios');

-- Solo la sesión administradora puede leer/listar o borrar. No hay política de
-- lectura anónima. La Edge Function firma enlaces con la credencial del servidor.
drop policy if exists audios_admin_lee on storage.objects;
create policy audios_admin_lee on storage.objects as permissive for select to authenticated
  using (bucket_id = 'audios' and (select auth.uid()) is not null
    and coalesce(((select auth.jwt())->'app_metadata'->>'eros_admin') = 'true', false));
drop policy if exists audios_solo_admin_lee on storage.objects;
create policy audios_solo_admin_lee on storage.objects as restrictive for select to public
  using (bucket_id <> 'audios' or ((select auth.uid()) is not null
    and coalesce(((select auth.jwt())->'app_metadata'->>'eros_admin') = 'true', false)));
drop policy if exists audios_admin_borra on storage.objects;
create policy audios_admin_borra on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'audios' and (select auth.uid()) is not null
    and coalesce(((select auth.jwt())->'app_metadata'->>'eros_admin') = 'true', false));
drop policy if exists audios_solo_admin_borra on storage.objects;
create policy audios_solo_admin_borra on storage.objects as restrictive for delete to public
  using (bucket_id <> 'audios' or ((select auth.uid()) is not null
    and coalesce(((select auth.jwt())->'app_metadata'->>'eros_admin') = 'true', false)));

-- Solo el servidor puede certificar bytes, duración y hash después de leer y
-- analizar todos los frames MP3. El bloqueo coordina esta confirmación con pagos.
create or replace function public.eros_confirmar_audio(
  p_pedido_id uuid, p_ruta text, p_bytes integer, p_duracion numeric, p_sha256 text
)
returns jsonb language plpgsql security invoker set search_path = ''
as $f$
declare pedido public.pedidos%rowtype;
begin
  select * into pedido from public.pedidos where id = p_pedido_id for update;
  if not found or pedido.estado <> 'nuevo' or pedido.limpiado_en is not null
    or pedido.limpieza_intentada_en is not null or pedido.limpieza_token is not null
    or pedido.audio_consentimiento is distinct from true
    or p_ruta is distinct from pedido.audio_ruta or p_ruta is distinct from p_pedido_id::text || '/cancion.mp3'
    or p_bytes is null or p_bytes not between 1 and 10485760 or p_bytes is distinct from pedido.audio_bytes
    or p_duracion is null or not (p_duracion > 0 and p_duracion <= 600)
    or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
    or not exists(select 1 from storage.objects where bucket_id = 'audios' and name = p_ruta) then
    return jsonb_build_object('ok',false);
  end if;
  if pedido.audio_verificado_en is not null and pedido.audio_sha256 is distinct from p_sha256 then
    return jsonb_build_object('ok',false);
  end if;
  update public.pedidos set audio_duracion = p_duracion, audio_sha256 = p_sha256,
    audio_verificado_en = coalesce(audio_verificado_en,clock_timestamp()) where id = p_pedido_id;
  return jsonb_build_object('ok',true);
end;
$f$;
revoke all on function public.eros_confirmar_audio(uuid,text,integer,numeric,text) from public, anon, authenticated;
grant execute on function public.eros_confirmar_audio(uuid,text,integer,numeric,text) to service_role;

-- Defensa transaccional adicional a las Edge Functions: impide publicar o ampliar
-- un pedido cuyo audio no fue verificado o cuyo objeto ya falta. Anular sigue permitido.
-- Cuando la limpieza termina, exige ambos buckets vacíos y vacía también el audio.
create or replace function eros_private.proteger_audio_pedido()
returns trigger language plpgsql security definer set search_path = ''
as $f$
begin
  if new.limpiado_en is not null and old.limpiado_en is null then
    if new.estado <> 'vencido' or exists(select 1 from storage.objects
      where bucket_id in ('fotos','audios') and name like old.id::text || '/%') then
      raise exception 'La limpieza de archivos no termino' using errcode = '23514';
    end if;
    new.audio_ruta := null; new.audio_nombre := null; new.audio_bytes := null;
    new.audio_duracion := null; new.audio_consentimiento := false;
    new.audio_verificado_en := null; new.audio_sha256 := null;
  end if;
  if new.estado in ('pagado','publicado') and (
    new.estado is distinct from old.estado or new.pagado_en is distinct from old.pagado_en
    or new.publicado_en is distinct from old.publicado_en or new.vence_en is distinct from old.vence_en
  ) then
    if new.audio_ruta is null and coalesce(new.datos->'audio','null'::jsonb) <> 'null'::jsonb then
      raise exception 'Falta el archivo de audio del pedido' using errcode = '23514';
    end if;
    if new.audio_ruta is not null and (new.audio_verificado_en is null or new.audio_sha256 is null
      or not exists(select 1 from storage.objects where bucket_id = 'audios' and name = new.audio_ruta)) then
      raise exception 'El audio del pedido no esta disponible o no fue verificado' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$f$;
revoke all on function eros_private.proteger_audio_pedido() from public, anon, authenticated, service_role;
drop trigger if exists eros_proteger_audio_pedido on public.pedidos;
create trigger eros_proteger_audio_pedido before update on public.pedidos
  for each row execute function eros_private.proteger_audio_pedido();

-- El panel marca primero el inicio de limpieza mediante administrar-pedido.
-- Esta función no borra objetos: comprueba que la API ya vació las dos carpetas.
-- El esquema privado y la comprobación de admin vigente evitan exponer una RPC
-- que permita a cualquier sesión redactar pedidos ajenos.
create or replace function eros_private.finalizar_borrado_manual(p_pedido_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $f$
declare pedido public.pedidos%rowtype; juego text; con_contador boolean;
begin
  if (select auth.uid()) is null or not eros_private.panel_admin_vigente((select auth.uid())) then
    return jsonb_build_object('ok',false,'error','permiso');
  end if;
  select * into pedido from public.pedidos where id = p_pedido_id for update;
  if not found then return jsonb_build_object('ok',false,'error','pedido'); end if;
  if pedido.limpiado_en is not null then return jsonb_build_object('ok',true,'limpiado',true); end if;
  if pedido.estado <> 'vencido' or pedido.limpieza_intentada_en is null
    or (pedido.limpieza_hasta is not null and pedido.limpieza_hasta > clock_timestamp()) then
    return jsonb_build_object('ok',false,'error','limpieza');
  end if;
  if exists(select 1 from storage.objects where bucket_id in ('fotos','audios') and name like pedido.id::text || '/%') then
    return jsonb_build_object('ok',false,'error','archivos_pendientes');
  end if;
  juego := case pedido.extras->>'juego' when 'pintar' then 'pintar-corazon' when 'pintar-corazon' then 'pintar-corazon'
    when 'margarita' then 'margarita' when 'laberinto' then 'laberinto' else '' end;
  con_contador := coalesce(pedido.extras->'contador' = 'true'::jsonb,false)
    or coalesce(pedido.extras->'contador'->>'activo' = 'true',false)
    or coalesce(char_length(pedido.extras->'contador'->>'desde') > 0,false);
  update public.pedidos set para_quien = 'Datos eliminados', de_parte = null, musica = '',
    whatsapp_cliente = null, datos = '{}'::jsonb, fotos_cantidad = 0, notas = null, tema = 'eros',
    extras = jsonb_build_object('juego',juego,'sobre',juego = '', 'contador',jsonb_build_object('activo',con_contador)),
    limpiado_en = clock_timestamp(), limpieza_token = null, limpieza_hasta = null where id = p_pedido_id;
  delete from eros_private.cobros_checkout where pedido_id = p_pedido_id;
  return jsonb_build_object('ok',true,'limpiado',true);
end;
$f$;
revoke all on function eros_private.finalizar_borrado_manual(uuid) from public, anon, authenticated, service_role;
grant execute on function eros_private.finalizar_borrado_manual(uuid) to authenticated;
create or replace function public.eros_finalizar_borrado_manual(p_pedido_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $f$ select eros_private.finalizar_borrado_manual(p_pedido_id); $f$;
revoke all on function public.eros_finalizar_borrado_manual(uuid) from public, anon, authenticated;
grant execute on function public.eros_finalizar_borrado_manual(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
