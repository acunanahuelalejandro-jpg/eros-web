-- Eros Web · etapa B. Ejecutar después de 00-setup-completo.sql y 01-pagos.sql.
-- Solo tablas y funciones propias. No modifica Storage ni tablas del sistema.
begin;

create schema if not exists eros_private;

-- Estos datos no se exponen en la Data API ni contienen nombres, textos o fotos.
create table if not exists eros_private.cobros_limites (
  clave text primary key check (clave ~ '^[a-f0-9]{64}$'),
  ventana_en timestamptz not null,
  cantidad integer not null check (cantidad > 0)
);
create index if not exists cobros_limites_ventana_idx on eros_private.cobros_limites (ventana_en);

create table if not exists eros_private.cobros_checkout (
  pedido_id uuid primary key references public.pedidos (id) on delete cascade,
  referencia text not null check (referencia ~ '^[a-f0-9]{64}$'),
  modo text not null check (modo in ('test', 'produccion')),
  fase text not null check (fase in ('creando', 'listo', 'incierto')),
  reserva uuid not null,
  bloqueo_hasta timestamptz not null,
  preference_id text,
  init_point text,
  expira_en timestamptz,
  ventana_en timestamptz not null default now(),
  intentos integer not null default 0,
  dia_en timestamptz not null default now(),
  intentos_dia integer not null default 0,
  ultimo_pago_estado text,
  ultimo_pago_en timestamptz
);

-- Conserva identificadores y estados de pago para deduplicar, sin datos del pagador.
create table if not exists eros_private.cobros_pagos (
  mp_payment_id text primary key check (mp_payment_id ~ '^[0-9]{1,20}$'),
  pedido_id uuid not null references public.pedidos (id) on delete cascade,
  estado text not null,
  total integer not null check (total between 1 and 100000),
  actualizado_en timestamptz not null
);

alter table eros_private.cobros_limites enable row level security;
alter table eros_private.cobros_checkout enable row level security;
alter table eros_private.cobros_pagos enable row level security;
revoke all on table eros_private.cobros_limites, eros_private.cobros_checkout, eros_private.cobros_pagos
  from public, anon, authenticated;
grant usage on schema eros_private to service_role;
grant select, insert, update, delete on table eros_private.cobros_limites, eros_private.cobros_checkout, eros_private.cobros_pagos
  to service_role;

-- Contador atómico. La clave es un hash del servidor; nunca una IP en claro.
create or replace function public.eros_limitar_cobro(p_clave text, p_limite integer, p_segundos integer)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare cantidad_actual integer; ahora timestamptz := clock_timestamp();
begin
  if p_clave !~ '^[a-f0-9]{64}$' or p_limite not between 1 and 1000 or p_segundos not between 1 and 86400 then
    return jsonb_build_object('permitido', false);
  end if;
  insert into eros_private.cobros_limites as limite (clave, ventana_en, cantidad)
  values (p_clave, ahora, 1)
  on conflict (clave) do update set
    ventana_en = case when limite.ventana_en <= ahora - make_interval(secs => p_segundos) then ahora else limite.ventana_en end,
    cantidad = case when limite.ventana_en <= ahora - make_interval(secs => p_segundos) then 1 else limite.cantidad + 1 end
  returning cantidad into cantidad_actual;
  -- Las claves auxiliares vencidas no se acumulan indefinidamente.
  delete from eros_private.cobros_limites where ventana_en < ahora - interval '2 days';
  return jsonb_build_object('permitido', cantidad_actual <= p_limite);
end;
$funcion$;

-- El bloqueo vive en la base: dos pestañas o dos instancias no crean dos checkouts.
create or replace function public.eros_reservar_checkout(
  p_pedido_id uuid, p_revision jsonb, p_referencia text, p_modo text, p_reserva uuid
)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare
  pedido public.pedidos%rowtype;
  checkout eros_private.cobros_checkout%rowtype;
  ahora timestamptz := clock_timestamp();
  accion text := 'crear';
begin
  if p_referencia !~ '^[a-f0-9]{64}$' or p_modo not in ('test', 'produccion') then
    return jsonb_build_object('accion', 'invalido');
  end if;
  select * into pedido from public.pedidos where id = p_pedido_id for update;
  if not found or pedido.estado <> 'nuevo' then return jsonb_build_object('accion', 'estado'); end if;
  if jsonb_build_object('modelo', pedido.modelo, 'duracion', pedido.duracion, 'extras', pedido.extras,
    'total', pedido.total, 'activar_el', pedido.activar_el) is distinct from p_revision then
    return jsonb_build_object('accion', 'cambio');
  end if;
  select * into checkout from eros_private.cobros_checkout where pedido_id = p_pedido_id for update;
  if found then
    if checkout.fase = 'listo' and checkout.referencia = p_referencia and checkout.modo = p_modo
      and checkout.expira_en > ahora + interval '2 minutes' then
      return jsonb_build_object('accion', 'reutilizar', 'init_point', checkout.init_point, 'preference_id', checkout.preference_id);
    end if;
    if checkout.bloqueo_hasta > ahora and checkout.fase <> 'listo' then
      return jsonb_build_object('accion', 'ocupado');
    end if;
    -- Un POST que perdió su respuesta se busca en Mercado Pago antes de crear otro.
    if checkout.fase in ('creando', 'incierto') then accion := 'conciliar'; end if;
    if checkout.ventana_en <= ahora - interval '30 minutes' then checkout.intentos := 0; checkout.ventana_en := ahora; end if;
    if checkout.dia_en <= ahora - interval '24 hours' then checkout.intentos_dia := 0; checkout.dia_en := ahora; end if;
    if checkout.intentos >= 5 or checkout.intentos_dia >= 20 then return jsonb_build_object('accion', 'limite'); end if;
    update eros_private.cobros_checkout set
      referencia = p_referencia, modo = p_modo, fase = 'creando', reserva = p_reserva,
      bloqueo_hasta = ahora + interval '60 seconds', ventana_en = checkout.ventana_en,
      dia_en = checkout.dia_en, intentos = checkout.intentos + 1, intentos_dia = checkout.intentos_dia + 1
    where pedido_id = p_pedido_id;
  else
    if pedido.mp_preference_id is not null then accion := 'conciliar'; end if;
    insert into eros_private.cobros_checkout (pedido_id, referencia, modo, fase, reserva, bloqueo_hasta, intentos, intentos_dia)
    values (p_pedido_id, p_referencia, p_modo, 'creando', p_reserva, ahora + interval '60 seconds', 1, 1);
  end if;
  return jsonb_build_object('accion', accion);
end;
$funcion$;

create or replace function public.eros_guardar_checkout(
  p_pedido_id uuid, p_revision jsonb, p_reserva uuid, p_preference_id text, p_init_point text, p_expira_en timestamptz
)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare pedido public.pedidos%rowtype; cambio integer;
begin
  select * into pedido from public.pedidos where id = p_pedido_id for update;
  if not found or pedido.estado <> 'nuevo' or
    jsonb_build_object('modelo', pedido.modelo, 'duracion', pedido.duracion, 'extras', pedido.extras,
    'total', pedido.total, 'activar_el', pedido.activar_el) is distinct from p_revision then
    return jsonb_build_object('guardado', false);
  end if;
  if char_length(p_preference_id) not between 1 and 200 or char_length(p_init_point) not between 1 and 2048
    or p_expira_en <= now() then return jsonb_build_object('guardado', false); end if;
  update eros_private.cobros_checkout set preference_id = p_preference_id, init_point = p_init_point,
    expira_en = p_expira_en, fase = 'listo', bloqueo_hasta = now()
    where pedido_id = p_pedido_id and reserva = p_reserva and fase = 'creando';
  get diagnostics cambio = row_count;
  if cambio <> 1 then return jsonb_build_object('guardado', false); end if;
  update public.pedidos set mp_preference_id = p_preference_id where id = p_pedido_id;
  return jsonb_build_object('guardado', true);
end;
$funcion$;

create or replace function public.eros_fallar_checkout(p_pedido_id uuid, p_reserva uuid, p_incierto boolean)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
begin
  update eros_private.cobros_checkout set fase = case when p_incierto then 'incierto' else 'listo' end,
    bloqueo_hasta = now(), expira_en = null
    where pedido_id = p_pedido_id and reserva = p_reserva and fase = 'creando';
  return jsonb_build_object('ok', true);
end;
$funcion$;

-- Lecturas mínimas usadas únicamente por el servidor. El visitante no puede invocarlas.
create or replace function public.eros_identificar_pago(p_pedido_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $funcion$
  select coalesce((select jsonb_build_object('codigo', codigo) from public.pedidos where id = p_pedido_id), '{}'::jsonb);
$funcion$;

create or replace function public.eros_estado_cobro(p_pedido_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $funcion$
  select coalesce((select jsonb_build_object('estado', ultimo_pago_estado) from eros_private.cobros_checkout where pedido_id = p_pedido_id), '{}'::jsonb);
$funcion$;

-- El servidor ya consultó el pago a Mercado Pago y verificó cuenta, modo, monto y moneda.
-- Esta transacción vuelve a comprobar el pedido y evita extenderlo por un webhook repetido.
create or replace function public.eros_registrar_pago(
  p_pedido_id uuid, p_payment_id text, p_estado text, p_total integer,
  p_revision jsonb, p_referencia text, p_actualizado_en timestamptz, p_dias integer
)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare
  pedido public.pedidos%rowtype;
  checkout eros_private.cobros_checkout%rowtype;
  pago_anterior eros_private.cobros_pagos%rowtype;
  inicio timestamptz;
  ahora timestamptz := clock_timestamp();
begin
  if p_payment_id !~ '^[0-9]{1,20}$' or p_estado not in ('approved', 'pending', 'in_process', 'authorized', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back')
    or p_dias not in (1, 7, 30) then return jsonb_build_object('accion', 'invalido'); end if;
  select * into pedido from public.pedidos where id = p_pedido_id for update;
  if not found then return jsonb_build_object('accion', 'invalido'); end if;
  if pedido.mp_payment_id = p_payment_id and pedido.estado in ('pagado', 'publicado', 'vencido') then
    return jsonb_build_object('accion', 'repetido');
  end if;
  if pedido.estado in ('publicado', 'vencido') or pedido.mp_payment_id is not null then
    return jsonb_build_object('accion', 'ya_pagado');
  end if;
  if pedido.total <> p_total or jsonb_build_object('modelo', pedido.modelo, 'duracion', pedido.duracion, 'extras', pedido.extras,
    'total', pedido.total, 'activar_el', pedido.activar_el) is distinct from p_revision then
    return jsonb_build_object('accion', 'cambio');
  end if;
  select * into checkout from eros_private.cobros_checkout where pedido_id = p_pedido_id for update;
  if not found or checkout.referencia <> p_referencia then return jsonb_build_object('accion', 'revision'); end if;
  select * into pago_anterior from eros_private.cobros_pagos where mp_payment_id = p_payment_id for update;
  if found and pago_anterior.pedido_id <> p_pedido_id then return jsonb_build_object('accion', 'otro_pedido'); end if;
  insert into eros_private.cobros_pagos (mp_payment_id, pedido_id, estado, total, actualizado_en)
  values (p_payment_id, p_pedido_id, p_estado, p_total, coalesce(p_actualizado_en, ahora))
  on conflict (mp_payment_id) do update set estado = excluded.estado, actualizado_en = excluded.actualizado_en
    where eros_private.cobros_pagos.estado <> 'approved'
      and eros_private.cobros_pagos.actualizado_en <= excluded.actualizado_en;
  if p_estado <> 'approved' then
    update eros_private.cobros_checkout set ultimo_pago_estado = p_estado, ultimo_pago_en = coalesce(p_actualizado_en, ahora)
      where pedido_id = p_pedido_id and (ultimo_pago_en is null or ultimo_pago_en <= coalesce(p_actualizado_en, ahora));
    return jsonb_build_object('accion', 'registrado');
  end if;
  inicio := greatest(ahora, coalesce(pedido.activar_el::timestamp at time zone 'America/Argentina/Buenos_Aires', ahora));
  update public.pedidos set estado = 'publicado', mp_payment_id = p_payment_id,
    pagado_en = coalesce(pagado_en, ahora), publicado_en = inicio,
    vence_en = inicio + make_interval(hours => p_dias * 24)
    where id = p_pedido_id;
  update eros_private.cobros_checkout set ultimo_pago_estado = 'approved', ultimo_pago_en = coalesce(p_actualizado_en, ahora)
    where pedido_id = p_pedido_id;
  return jsonb_build_object('accion', 'publicado');
end;
$funcion$;

-- Estas funciones no son APIs anónimas. Solo las invocan las Edge Functions.
-- SECURITY INVOKER conserva los permisos del rol; no eleva privilegios del visitante.
revoke all on function public.eros_limitar_cobro(text, integer, integer) from public, anon, authenticated;
revoke all on function public.eros_reservar_checkout(uuid, jsonb, text, text, uuid) from public, anon, authenticated;
revoke all on function public.eros_guardar_checkout(uuid, jsonb, uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.eros_fallar_checkout(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.eros_identificar_pago(uuid) from public, anon, authenticated;
revoke all on function public.eros_estado_cobro(uuid) from public, anon, authenticated;
revoke all on function public.eros_registrar_pago(uuid, text, text, integer, jsonb, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.eros_limitar_cobro(text, integer, integer) to service_role;
grant execute on function public.eros_reservar_checkout(uuid, jsonb, text, text, uuid) to service_role;
grant execute on function public.eros_guardar_checkout(uuid, jsonb, uuid, text, text, timestamptz) to service_role;
grant execute on function public.eros_fallar_checkout(uuid, uuid, boolean) to service_role;
grant execute on function public.eros_identificar_pago(uuid) to service_role;
grant execute on function public.eros_estado_cobro(uuid) to service_role;
grant execute on function public.eros_registrar_pago(uuid, text, text, integer, jsonb, text, timestamptz, integer) to service_role;

notify pgrst, 'reload schema';
commit;
