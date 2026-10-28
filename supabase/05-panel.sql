-- Eros Web · etapa F. Ejecutar después de 00, 01, 02, 03 y 04.
-- Los controles del panel no cobran ni reembolsan en Mercado Pago.
begin;

alter table public.pedidos add column if not exists pago_manual_en timestamptz;
revoke insert (pago_manual_en), update (pago_manual_en) on public.pedidos from public, anon, authenticated;
grant select, update on public.pedidos to service_role;
alter table public.pedidos drop constraint if exists pedidos_pago_manual_valido;
alter table public.pedidos add constraint pedidos_pago_manual_valido
  check (pago_manual_en is null or pagado_en is not null);

-- Solo identificadores técnicos y fechas. No se copian cartas, fotos ni nombres.
create table if not exists eros_private.panel_acciones (
  solicitud_id uuid primary key,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  admin_id uuid not null,
  accion text not null check (accion in ('pago-manual', 'republicar', 'extender', 'anular')),
  huella text not null check (huella ~ '^[a-f0-9]{64}$'),
  creado_en timestamptz not null default now(),
  antes jsonb not null,
  despues jsonb not null
);
create index if not exists panel_acciones_pedido_fecha_idx on eros_private.panel_acciones(pedido_id, creado_en desc);
alter table eros_private.panel_acciones enable row level security;
revoke all on eros_private.panel_acciones from public, anon, authenticated;
grant select, insert on eros_private.panel_acciones to service_role;

-- Esta lectura interna requiere privilegios del propietario para consultar Auth.
-- Solo el servidor la puede invocar; nunca devuelve un usuario ni sus metadatos.
create or replace function eros_private.panel_admin_vigente(p_admin_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $f$
  select exists(select 1 from auth.users where id = p_admin_id
    and raw_app_meta_data -> 'eros_admin' = 'true'::jsonb);
$f$;
revoke all on function eros_private.panel_admin_vigente(uuid) from public, anon, authenticated;
grant execute on function eros_private.panel_admin_vigente(uuid) to service_role;

create or replace function eros_private.panel_resumen(p_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $f$
  select jsonb_build_object('id',id,'codigo',codigo,'estado',estado,'slug',slug,
    'mp_preference_id',mp_preference_id,'mp_payment_id',mp_payment_id,'pagado_en',pagado_en,
    'publicado_en',publicado_en,'vence_en',vence_en,'activar_el',activar_el,
    'pago_manual_en',pago_manual_en,'limpiado_en',limpiado_en,'limpieza_intentada_en',limpieza_intentada_en)
  from public.pedidos where id = p_id;
$f$;
revoke all on function eros_private.panel_resumen(uuid) from public, anon, authenticated;
grant execute on function eros_private.panel_resumen(uuid) to service_role;

-- La sesión admin puede conocer el último estado registrado por el servidor.
-- SECURITY DEFINER queda dentro del esquema privado, con comprobación de
-- auth.uid(), app_metadata del JWT y permiso actual de Auth en cada llamada.
create or replace function eros_private.panel_leer_pago(p_pedido_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $f$
declare pedido record; estado_pago text;
begin
  if auth.uid() is null
    or coalesce(auth.jwt() -> 'app_metadata' -> 'eros_admin' = 'true'::jsonb, false) is not true
    or not eros_private.panel_admin_vigente(auth.uid()) then
    raise insufficient_privilege using message = 'Se requiere una sesión administradora.';
  end if;
  select mp_payment_id, pago_manual_en into pedido from public.pedidos where id = p_pedido_id;
  if not found then return jsonb_build_object('estado',null,'manual',false); end if;
  select estado into estado_pago from eros_private.cobros_pagos
    where pedido_id = p_pedido_id and (pedido.mp_payment_id is null or mp_payment_id = pedido.mp_payment_id)
    order by actualizado_en desc, mp_payment_id desc limit 1;
  return jsonb_build_object('estado',estado_pago,'manual',pedido.pago_manual_en is not null);
end;
$f$;
revoke all on function eros_private.panel_leer_pago(uuid) from public, anon, authenticated;
grant usage on schema eros_private to authenticated, service_role;
grant execute on function eros_private.panel_leer_pago(uuid) to authenticated;
create or replace function public.eros_admin_estado_pago(p_pedido_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $f$ select eros_private.panel_leer_pago(p_pedido_id); $f$;
revoke all on function public.eros_admin_estado_pago(uuid) from public, anon, authenticated;
grant execute on function public.eros_admin_estado_pago(uuid) to authenticated;

-- Permite recuperar el resultado de una operación cuya respuesta se perdió.
-- No se vuelve a publicar ni a extender al repetir el mismo UUID y la misma huella.
create or replace function public.eros_admin_buscar_accion(
  p_admin_id uuid, p_pedido_id uuid, p_solicitud_id uuid, p_huella text
)
returns jsonb language plpgsql security invoker set search_path = ''
as $f$
declare anterior eros_private.panel_acciones%rowtype;
begin
  if not eros_private.panel_admin_vigente(p_admin_id) then return jsonb_build_object('ok',false,'error','permiso'); end if;
  select * into anterior from eros_private.panel_acciones where solicitud_id = p_solicitud_id;
  if not found then return jsonb_build_object('encontrada',false); end if;
  if anterior.admin_id is distinct from p_admin_id or anterior.pedido_id is distinct from p_pedido_id or anterior.huella is distinct from p_huella then
    return jsonb_build_object('ok',false,'error','solicitud');
  end if;
  return jsonb_build_object('encontrada',true,'ok',true,'repetido',true,
    'pedido',eros_private.panel_resumen(p_pedido_id));
end;
$f$;

-- El servidor autentica al admin y recalcula los precios con precios.ts.
-- Aquí se comprueba otra vez su permiso y se bloquea la fila para coordinar
-- estas acciones con el webhook de pago y con la limpieza de fotos.
-- Quita una firma previa sin la marca de borrado, si se instaló una copia local anterior.
drop function if exists public.eros_admin_accion(uuid,uuid,text,text,uuid,text,jsonb,integer,timestamptz);
create or replace function public.eros_admin_accion(
  p_admin_id uuid, p_pedido_id uuid, p_codigo text, p_accion text,
  p_solicitud_id uuid, p_huella text, p_revision jsonb, p_total_esperado integer,
  p_vence_en timestamptz default null, p_preparar_borrado boolean default false
)
returns jsonb language plpgsql security invoker set search_path = ''
as $f$
declare
  pedido public.pedidos%rowtype;
  anterior eros_private.panel_acciones%rowtype;
  resumen_antes jsonb;
  resumen_despues jsonb;
  dias integer;
  ahora timestamptz := clock_timestamp();
begin
  if not eros_private.panel_admin_vigente(p_admin_id) then return jsonb_build_object('ok',false,'error','permiso'); end if;
  if p_solicitud_id is null or p_pedido_id is null or p_huella is null or p_huella !~ '^[a-f0-9]{64}$'
    or p_accion is null or p_accion not in ('pago-manual','republicar','extender','anular')
    or p_preparar_borrado is null or (p_preparar_borrado and p_accion <> 'anular') then
    return jsonb_build_object('ok',false,'error','solicitud');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_solicitud_id::text,0));
  select * into anterior from eros_private.panel_acciones where solicitud_id = p_solicitud_id;
  if found then return public.eros_admin_buscar_accion(p_admin_id,p_pedido_id,p_solicitud_id,p_huella); end if;
  select * into pedido from public.pedidos where id = p_pedido_id for update;
  if not found or p_codigo is distinct from pedido.codigo then return jsonb_build_object('ok',false,'error','pedido'); end if;
  if p_revision is null or jsonb_typeof(p_revision) <> 'object'
    or (p_revision - array['pagado_en','publicado_en','vence_en']) is distinct from jsonb_build_object(
      'modelo',pedido.modelo,'duracion',pedido.duracion,'extras',pedido.extras,'total',pedido.total,
      'activar_el',pedido.activar_el,'estado',pedido.estado,'datos',pedido.datos,'fotos_cantidad',pedido.fotos_cantidad)
    or (p_revision ->> 'pagado_en')::timestamptz is distinct from pedido.pagado_en
    or (p_revision ->> 'publicado_en')::timestamptz is distinct from pedido.publicado_en
    or (p_revision ->> 'vence_en')::timestamptz is distinct from pedido.vence_en then
    return jsonb_build_object('ok',false,'error','cambio');
  end if;
  resumen_antes := eros_private.panel_resumen(p_pedido_id)
    - array['id','codigo','slug','mp_preference_id','mp_payment_id','activar_el'];
  if p_accion = 'anular' then
    -- Anular corta el acceso; el workflow de D borra después los datos y fotos.
    -- No consulta ni modifica un cobro en Mercado Pago.
    -- El botón de borrado manual marca el inicio antes de tocar Storage. Aunque
    -- la red falle después de quitar una foto, nadie puede republicar el resto.
    update public.pedidos set estado = 'vencido', vence_en = least(coalesce(vence_en,ahora),ahora),
      limpieza_intentada_en = case when p_preparar_borrado then coalesce(limpieza_intentada_en,ahora) else limpieza_intentada_en end
      where id = p_pedido_id;
  else
    if pedido.limpiado_en is not null or pedido.limpieza_intentada_en is not null or pedido.limpieza_token is not null
      or pedido.datos = '{}'::jsonb then return jsonb_build_object('ok',false,'error','limpieza'); end if;
    if p_total_esperado is null or pedido.total <> p_total_esperado then return jsonb_build_object('ok',false,'error','precio'); end if;
    dias := case lower(pedido.duracion) when 'day' then 1 when '1 día' then 1 when '1 dia' then 1 when '1-dia' then 1
      when 'week' then 7 when '1 semana' then 7 when '1-semana' then 7
      when 'month' then 30 when '1 mes' then 30 when '1-mes' then 30 else null end;
    if dias is null then return jsonb_build_object('ok',false,'error','precio'); end if;
    if p_accion = 'pago-manual' then
      if pedido.estado <> 'nuevo' or pedido.pagado_en is not null or pedido.mp_payment_id is not null then
        return jsonb_build_object('ok',false,'error','estado');
      end if;
      if exists(select 1 from eros_private.cobros_checkout where pedido_id = p_pedido_id
        and (ultimo_pago_estado in ('pending','in_process','authorized','in_mediation')
          or (fase = 'creando' and bloqueo_hasta > ahora))) then
        return jsonb_build_object('ok',false,'error','pago_pendiente');
      end if;
      update public.pedidos set estado = 'publicado', pagado_en = ahora, pago_manual_en = ahora,
        publicado_en = greatest(ahora,coalesce(activar_el::timestamp at time zone 'America/Argentina/Buenos_Aires',ahora)),
        vence_en = greatest(ahora,coalesce(activar_el::timestamp at time zone 'America/Argentina/Buenos_Aires',ahora)) + make_interval(hours => dias*24)
        where id = p_pedido_id;
    elsif p_accion = 'republicar' then
      if pedido.pagado_en is null or pedido.estado not in ('pagado','publicado','vencido') then return jsonb_build_object('ok',false,'error','estado'); end if;
      -- Esta operación de soporte publica ahora y reinicia el plazo completo.
      update public.pedidos set estado = 'publicado', publicado_en = ahora, activar_el = null,
        vence_en = ahora + make_interval(hours => dias*24) where id = p_pedido_id;
    else
      if pedido.estado <> 'publicado' or pedido.pagado_en is null or pedido.vence_en is null then return jsonb_build_object('ok',false,'error','estado'); end if;
      if p_vence_en is null or not isfinite(p_vence_en) or p_vence_en <= greatest(ahora,pedido.vence_en)
        or p_vence_en > ahora + interval '366 days' then return jsonb_build_object('ok',false,'error','fecha'); end if;
      update public.pedidos set vence_en = p_vence_en where id = p_pedido_id;
    end if;
  end if;
  resumen_despues := eros_private.panel_resumen(p_pedido_id);
  insert into eros_private.panel_acciones(solicitud_id,pedido_id,admin_id,accion,huella,antes,despues)
    values(p_solicitud_id,p_pedido_id,p_admin_id,p_accion,p_huella,resumen_antes,
      resumen_despues - array['id','codigo','slug','mp_preference_id','mp_payment_id','activar_el']);
  return jsonb_build_object('ok',true,'repetido',false,'pedido',resumen_despues);
end;
$f$;

revoke all on function public.eros_admin_buscar_accion(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.eros_admin_accion(uuid,uuid,text,text,uuid,text,jsonb,integer,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.eros_admin_buscar_accion(uuid,uuid,uuid,text) to service_role;
grant execute on function public.eros_admin_accion(uuid,uuid,text,text,uuid,text,jsonb,integer,timestamptz,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
