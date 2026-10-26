-- Eros Web · etapa D. Ejecutar después de 00-setup-completo.sql, 01-pagos.sql y 02-cobros.sql.
-- No elimina archivos por SQL: el borrado físico lo hace la API de Storage.
begin;

-- Metadatos del servidor. Ninguna de estas columnas se puede enviar desde el armador.
alter table public.pedidos
  add column if not exists limpiado_en timestamptz,
  add column if not exists limpieza_token uuid,
  add column if not exists limpieza_hasta timestamptz,
  add column if not exists limpieza_intentada_en timestamptz;
revoke insert (limpiado_en, limpieza_token, limpieza_hasta, limpieza_intentada_en),
       update (limpiado_en, limpieza_token, limpieza_hasta, limpieza_intentada_en)
  on public.pedidos from public, anon, authenticated;
grant select, update on public.pedidos to service_role;

-- Evita que una página sea republicada mientras la API está borrando sus fotos.
-- Un intento parcial también pudo quitar fotos: no se recupera cambiando solo el estado.
alter table public.pedidos drop constraint if exists pedidos_limpieza_bloqueo_valido;
alter table public.pedidos add constraint pedidos_limpieza_bloqueo_valido check (
  (limpieza_token is null and limpieza_hasta is null)
  or (estado = 'vencido' and limpieza_token is not null and limpieza_hasta is not null)
);
alter table public.pedidos drop constraint if exists pedidos_limpiado_solo_vencido;
alter table public.pedidos add constraint pedidos_limpiado_solo_vencido
  check ((limpiado_en is null and limpieza_intentada_en is null) or estado = 'vencido');
create index if not exists pedidos_limpieza_pendiente_idx
  on public.pedidos (limpieza_intentada_en nulls first, vence_en, id)
  where limpiado_en is null and estado in ('publicado', 'vencido');

-- El armador sube antes de insertar el pedido: un UUID todavía inexistente se permite.
-- Una vez cobrado/publicado/vencido ya no acepta nuevas cargas anónimas en esa carpeta.
-- La función vive en un esquema no expuesto por la Data API y solo responde un booleano.
-- SECURITY DEFINER es necesario aquí porque anon no tiene SELECT sobre pedidos.
-- No concede lectura de filas ni permite modificar nada.
create schema if not exists eros_private;
create or replace function eros_private.puede_subir_fotos(p_carpeta text)
returns boolean language plpgsql stable security definer set search_path = ''
as $funcion$
declare estado_pedido text;
begin
  if p_carpeta is null or p_carpeta !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then return false; end if;
  select estado into estado_pedido from public.pedidos where id = p_carpeta::uuid;
  if not found then return true; end if;
  return estado_pedido = 'nuevo';
end;
$funcion$;
revoke all on function eros_private.puede_subir_fotos(text) from public, anon, authenticated, service_role;
grant usage on schema eros_private to anon, service_role;
grant execute on function eros_private.puede_subir_fotos(text) to anon, service_role;

-- Solo políticas sobre Storage: no ALTER, OWNER ni GRANT/REVOKE sobre sus tablas.
drop policy if exists fotos_anon_solo_antes_del_cobro on storage.objects;
create policy fotos_anon_solo_antes_del_cobro on storage.objects as restrictive
  for insert to anon
  with check (bucket_id <> 'fotos' or eros_private.puede_subir_fotos((storage.foldername(name))[1]));

-- Reclama un lote corto. La reserva evita dos limpiezas simultáneas y se recupera
-- sola después de tres minutos si una ejecución se interrumpe.
create or replace function public.eros_reclamar_vencidos(p_token uuid, p_limite integer)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare
  pedido record;
  lote jsonb := '[]'::jsonb;
  ahora timestamptz := clock_timestamp();
begin
  if p_token is null or p_limite is null or p_limite not between 1 and 10 then return lote; end if;
  for pedido in
    select id from public.pedidos
    where limpiado_en is null
      and (estado = 'vencido' or (estado = 'publicado' and vence_en <= ahora))
      and (limpieza_hasta is null or limpieza_hasta <= ahora)
    -- Reparte los intentos para que una carpeta con errores no bloquee toda la cola.
    order by limpieza_intentada_en asc nulls first, vence_en asc nulls first, id
    limit p_limite for update skip locked
  loop
    update public.pedidos set estado = 'vencido', limpieza_token = p_token,
      limpieza_hasta = ahora + interval '3 minutes', limpieza_intentada_en = ahora where id = pedido.id;
    lote := lote || jsonb_build_array(jsonb_build_object('id', pedido.id));
  end loop;
  return lote;
end;
$funcion$;

create or replace function public.eros_validar_limpieza(p_pedido_id uuid, p_token uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $funcion$
  select jsonb_build_object('valido', exists (
    select 1 from public.pedidos where id = p_pedido_id and estado = 'vencido'
      and limpiado_en is null and limpieza_token = p_token and limpieza_hasta > statement_timestamp()
  ));
$funcion$;

-- Solo se llama después de que Storage confirmó que la carpeta está vacía.
-- No recibe contenidos del navegador ni datos personales para redactar.
create or replace function public.eros_finalizar_limpieza(p_pedido_id uuid, p_token uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare pedido public.pedidos%rowtype; juego text; con_contador boolean;
begin
  select * into pedido from public.pedidos where id = p_pedido_id for update;
  if not found or p_token is null or pedido.estado <> 'vencido' or pedido.limpiado_en is not null
    or pedido.limpieza_token is distinct from p_token or pedido.limpieza_hasta is null
    or pedido.limpieza_hasta <= clock_timestamp() then
    return jsonb_build_object('limpiado', false);
  end if;
  juego := case pedido.extras ->> 'juego'
    when 'pintar' then 'pintar-corazon' when 'pintar-corazon' then 'pintar-corazon'
    when 'margarita' then 'margarita' when 'laberinto' then 'laberinto' else '' end;
  con_contador := coalesce(pedido.extras -> 'contador' = 'true'::jsonb, false)
    or coalesce(pedido.extras -> 'contador' ->> 'activo' = 'true', false)
    or coalesce(char_length(pedido.extras -> 'contador' ->> 'desde') > 0, false);
  update public.pedidos set estado = 'vencido', para_quien = 'Datos eliminados', de_parte = null,
    musica = '', whatsapp_cliente = null, datos = '{}'::jsonb, fotos_cantidad = 0, notas = null,
    tema = 'eros', extras = jsonb_build_object('juego', juego, 'sobre', juego = '',
      'contador', jsonb_build_object('activo', con_contador)),
    limpiado_en = clock_timestamp(), limpieza_token = null, limpieza_hasta = null
    where id = p_pedido_id;
  -- El checkout temporal ya no se necesita; se conservan pedidos y cobros_pagos
  -- con código, modelo, duración, precios, fechas e identificadores contables.
  delete from eros_private.cobros_checkout where pedido_id = p_pedido_id;
  return jsonb_build_object('limpiado', true);
end;
$funcion$;

-- Libera trabajos incompletos para que se reintenten, sin marcar éxito ni tocar textos.
create or replace function public.eros_liberar_limpieza(p_token uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $funcion$
declare cantidad integer;
begin
  update public.pedidos set limpieza_token = null, limpieza_hasta = null
    where limpieza_token = p_token and estado = 'vencido' and limpiado_en is null;
  get diagnostics cantidad = row_count;
  return jsonb_build_object('liberados', cantidad);
end;
$funcion$;

create or replace function public.eros_limpiezas_pendientes()
returns jsonb language sql stable security invoker set search_path = ''
as $funcion$
  select jsonb_build_object('pendientes', exists (
    select 1 from public.pedidos where limpiado_en is null
      and (estado = 'vencido' or (estado = 'publicado' and vence_en <= statement_timestamp()))
  ));
$funcion$;

-- Todas las RPC de borrado quedan reservadas al servidor, sin elevar al visitante.
revoke all on function public.eros_reclamar_vencidos(uuid, integer) from public, anon, authenticated;
revoke all on function public.eros_validar_limpieza(uuid, uuid) from public, anon, authenticated;
revoke all on function public.eros_finalizar_limpieza(uuid, uuid) from public, anon, authenticated;
revoke all on function public.eros_liberar_limpieza(uuid) from public, anon, authenticated;
revoke all on function public.eros_limpiezas_pendientes() from public, anon, authenticated;
grant execute on function public.eros_reclamar_vencidos(uuid, integer) to service_role;
grant execute on function public.eros_validar_limpieza(uuid, uuid) to service_role;
grant execute on function public.eros_finalizar_limpieza(uuid, uuid) to service_role;
grant execute on function public.eros_liberar_limpieza(uuid) to service_role;
grant execute on function public.eros_limpiezas_pendientes() to service_role;

notify pgrst, 'reload schema';
commit;
