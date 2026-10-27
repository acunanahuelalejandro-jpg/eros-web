-- Eros Web · etapa E. Ejecutar después de 00-setup-completo.sql y 01/02/03.
-- La tabla de pedidos mantiene sus grants y políticas: anon sigue sin poder leerla.
begin;

create schema if not exists eros_private;

-- Realtime transmite cambios únicamente a sesiones con SELECT permitido por RLS.
-- No se habilita REPLICA IDENTITY FULL: el panel conserva su base de pagos conocidos.
do $publicacion$
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pedidos'
  ) then
    alter publication supabase_realtime add table public.pedidos;
  end if;
end;
$publicacion$;

-- Un evento conserva solo sus identificadores y el resultado de entrega.
-- Nunca guarda una copia del contenido del regalo ni datos del cliente.
create table if not exists eros_private.avisos_eventos (
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  tipo text not null check (tipo in ('nuevo', 'pagado')),
  creado_en timestamptz not null default now(),
  completo_en timestamptz,
  primary key (pedido_id, tipo)
);

create table if not exists eros_private.avisos_entregas (
  pedido_id uuid not null,
  tipo text not null,
  suscripcion_id uuid not null references public.admin_push_subscriptions (id) on delete cascade,
  enviado_en timestamptz,
  reserva uuid,
  reserva_hasta timestamptz,
  intentos integer not null default 0 check (intentos >= 0),
  primary key (pedido_id, tipo, suscripcion_id),
  foreign key (pedido_id, tipo) references eros_private.avisos_eventos (pedido_id, tipo) on delete cascade,
  constraint avisos_entregas_reserva_valida
    check ((reserva is null and reserva_hasta is null) or (reserva is not null and reserva_hasta is not null))
);
create index if not exists avisos_entregas_pendientes_idx
  on eros_private.avisos_entregas (pedido_id, tipo, reserva_hasta)
  where enviado_en is null;

alter table eros_private.avisos_eventos enable row level security;
alter table eros_private.avisos_entregas enable row level security;
revoke all on table eros_private.avisos_eventos, eros_private.avisos_entregas from public, anon, authenticated;
grant usage on schema eros_private to service_role;
grant select, insert, update, delete on table eros_private.avisos_eventos, eros_private.avisos_entregas to service_role;

-- La función privada comprueba el permiso ACTUAL del dueño. No confía en una
-- copia antigua del JWT ni en user_metadata. SECURITY DEFINER evita conceder
-- SELECT sobre auth.users al rol servidor o a los visitantes.
create or replace function eros_private.suscripciones_admin_autorizadas()
returns table (suscripcion_id uuid, endpoint text, suscripcion jsonb)
language sql stable security definer set search_path = ''
as $funcion$
  select s.id, s.endpoint, s.suscripcion
    from public.admin_push_subscriptions as s
    join auth.users as u on u.id = s.admin_user_id
   where coalesce(u.raw_app_meta_data ->> 'eros_admin' = 'true', false)
   order by s.creado_en, s.id;
$funcion$;
revoke all on function eros_private.suscripciones_admin_autorizadas() from public, anon, authenticated, service_role;
grant execute on function eros_private.suscripciones_admin_autorizadas() to service_role;

-- Solo el servidor puede pedir las suscripciones de administradores vigentes.
-- El modo de prueba usa esta lectura sin crear eventos reales del negocio.
create or replace function public.eros_suscripciones_push()
returns jsonb language sql stable security invoker set search_path = ''
as $funcion$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.suscripcion_id,
    'endpoint', s.endpoint, 'suscripcion', s.suscripcion)), '[]'::jsonb)
  from (select * from eros_private.suscripciones_admin_autorizadas() limit 50) as s;
$funcion$;

-- Una transacción fija la audiencia del evento al crearlo y reclama únicamente
-- las entregas pendientes. Las repeticiones no agregan dispositivos nuevos.
create or replace function public.eros_reclamar_avisos(p_pedido_id uuid, p_tipo text, p_reserva uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare
  pedido record;
  evento eros_private.avisos_eventos%rowtype;
  entrega record;
  creado boolean;
  cantidad integer;
  pendientes boolean;
  audiencia_vacia boolean;
  lote jsonb := '[]'::jsonb;
  ahora timestamptz := clock_timestamp();
begin
  if p_pedido_id is null or p_reserva is null or p_tipo is null or p_tipo not in ('nuevo', 'pagado') then
    return jsonb_build_object('valido', false, 'repetido', false, 'sin_dispositivos', false, 'entregas', lote, 'pendientes', false);
  end if;
  -- Solo se leen estos datos mínimos para armar el aviso y comprobar su momento.
  select id, codigo, modelo, duracion, total, estado, creado_en, pagado_en
    into pedido from public.pedidos where id = p_pedido_id for update;
  if not found or pedido.estado not in ('nuevo', 'pagado', 'publicado')
    or (p_tipo = 'nuevo' and (pedido.creado_en < ahora - interval '24 hours' or pedido.creado_en > ahora + interval '1 minute'))
    or (p_tipo = 'pagado' and (pedido.pagado_en is null or pedido.estado not in ('pagado', 'publicado')
      or pedido.pagado_en < ahora - interval '24 hours' or pedido.pagado_en > ahora + interval '1 minute')) then
    return jsonb_build_object('valido', false, 'repetido', false, 'sin_dispositivos', false, 'entregas', lote, 'pendientes', false);
  end if;
  insert into eros_private.avisos_eventos (pedido_id, tipo)
    values (p_pedido_id, p_tipo) on conflict (pedido_id, tipo) do nothing;
  get diagnostics cantidad = row_count;
  creado := cantidad = 1;
  select * into evento from eros_private.avisos_eventos
    where pedido_id = p_pedido_id and tipo = p_tipo for update;
  if creado then
    insert into eros_private.avisos_entregas (pedido_id, tipo, suscripcion_id)
      select p_pedido_id, p_tipo, s.suscripcion_id
      from eros_private.suscripciones_admin_autorizadas() as s
      limit 50;
  end if;
  -- Si se revocó el permiso de un administrador, sus entregas pendientes se retiran.
  delete from eros_private.avisos_entregas as d
    where d.pedido_id = p_pedido_id and d.tipo = p_tipo and d.enviado_en is null
      and not exists (select 1 from eros_private.suscripciones_admin_autorizadas() as s where s.suscripcion_id = d.suscripcion_id);
  select not exists (select 1 from eros_private.avisos_entregas
    where pedido_id = p_pedido_id and tipo = p_tipo) into audiencia_vacia;
  select exists (select 1 from eros_private.avisos_entregas
    where pedido_id = p_pedido_id and tipo = p_tipo and enviado_en is null) into pendientes;
  if evento.completo_en is not null or not pendientes then
    update eros_private.avisos_eventos set completo_en = coalesce(completo_en, ahora)
      where pedido_id = p_pedido_id and tipo = p_tipo;
    return jsonb_build_object('valido', true, 'repetido', not creado, 'sin_dispositivos', audiencia_vacia,
      'pedido', jsonb_build_object('codigo', pedido.codigo, 'modelo', pedido.modelo, 'duracion', pedido.duracion, 'total', pedido.total),
      'entregas', lote, 'pendientes', false);
  end if;
  for entrega in
    select d.suscripcion_id, s.endpoint, s.suscripcion
      from eros_private.avisos_entregas as d
      join eros_private.suscripciones_admin_autorizadas() as s on s.suscripcion_id = d.suscripcion_id
     where d.pedido_id = p_pedido_id and d.tipo = p_tipo and d.enviado_en is null
       and (d.reserva_hasta is null or d.reserva_hasta <= ahora)
     order by d.intentos, d.suscripcion_id
     limit 20 for update of d skip locked
  loop
    update eros_private.avisos_entregas set reserva = p_reserva,
      reserva_hasta = ahora + interval '60 seconds', intentos = intentos + 1
      where pedido_id = p_pedido_id and tipo = p_tipo and suscripcion_id = entrega.suscripcion_id;
    lote := lote || jsonb_build_array(jsonb_build_object('id', entrega.suscripcion_id,
      'endpoint', entrega.endpoint, 'suscripcion', entrega.suscripcion));
  end loop;
  return jsonb_build_object('valido', true, 'repetido', false, 'sin_dispositivos', audiencia_vacia,
    'pedido', jsonb_build_object('codigo', pedido.codigo, 'modelo', pedido.modelo, 'duracion', pedido.duracion, 'total', pedido.total),
    'entregas', lote, 'pendientes', true);
end;
$funcion$;

create or replace function public.eros_finalizar_entrega_aviso(
  p_pedido_id uuid, p_tipo text, p_reserva uuid, p_suscripcion_id uuid, p_resultado text
)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare entrega eros_private.avisos_entregas%rowtype;
begin
  if p_reserva is null or p_resultado is null or p_resultado not in ('enviado', 'reintentar', 'descartado') then
    return jsonb_build_object('guardado', false);
  end if;
  select * into entrega from eros_private.avisos_entregas
    where pedido_id = p_pedido_id and tipo = p_tipo and suscripcion_id = p_suscripcion_id for update;
  if not found or entrega.enviado_en is not null or entrega.reserva is distinct from p_reserva
    or entrega.reserva_hasta is null or entrega.reserva_hasta <= clock_timestamp() then
    return jsonb_build_object('guardado', false);
  end if;
  if p_resultado = 'descartado' then
    -- Un endpoint 404/410 ya no sirve; su eliminación retira todas sus entregas.
    delete from public.admin_push_subscriptions where id = p_suscripcion_id;
  else
    update eros_private.avisos_entregas set
      enviado_en = case when p_resultado = 'enviado' then clock_timestamp() else null end,
      reserva = null, reserva_hasta = null
      where pedido_id = p_pedido_id and tipo = p_tipo and suscripcion_id = p_suscripcion_id;
  end if;
  return jsonb_build_object('guardado', true);
end;
$funcion$;

create or replace function public.eros_cerrar_aviso(p_pedido_id uuid, p_tipo text, p_reserva uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare pendientes boolean;
begin
  perform 1 from eros_private.avisos_eventos where pedido_id = p_pedido_id and tipo = p_tipo for update;
  update eros_private.avisos_entregas set reserva = null, reserva_hasta = null
    where pedido_id = p_pedido_id and tipo = p_tipo and reserva = p_reserva and enviado_en is null;
  select exists (select 1 from eros_private.avisos_entregas
    where pedido_id = p_pedido_id and tipo = p_tipo and enviado_en is null) into pendientes;
  if not pendientes then
    update eros_private.avisos_eventos set completo_en = coalesce(completo_en, clock_timestamp())
      where pedido_id = p_pedido_id and tipo = p_tipo;
  end if;
  return jsonb_build_object('pendientes', pendientes);
end;
$funcion$;

-- Las RPC públicas son invocadoras: no elevan permisos. Solo el servidor las usa.
revoke all on function public.eros_suscripciones_push() from public, anon, authenticated;
revoke all on function public.eros_reclamar_avisos(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.eros_finalizar_entrega_aviso(uuid, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.eros_cerrar_aviso(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.eros_suscripciones_push() to service_role;
grant execute on function public.eros_reclamar_avisos(uuid, text, uuid) to service_role;
grant execute on function public.eros_finalizar_entrega_aviso(uuid, text, uuid, uuid, text) to service_role;
grant execute on function public.eros_cerrar_aviso(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
