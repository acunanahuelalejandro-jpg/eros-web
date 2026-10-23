-- COPIA PUBLICABLE: primero reemplazá PEGAR_ACA_EL_TOPICO_PRIVADO.
-- La copia con el valor real se guarda como aviso-pedido.sql y NO se publica.
-- TOPICO PRIVADO: PEGAR_ACA_EL_TOPICO_PRIVADO
-- El tópico funciona como una contraseña: quien lo conoce puede leer/publicar avisos.

begin;

do $validar$
begin
  if 'PEGAR_ACA_EL_TOPICO_PRIVADO' !~ '^erosweb-[a-f0-9]{40}$' then
    raise exception 'Falta configurar el tópico. Ejecutá la copia privada aviso-pedido.sql.';
  end if;
end;
$validar$;

-- Supabase permite pg_net desde SQL Editor. No se cambian permisos,
-- propietarios ni RLS de tablas del sistema, storage.objects o storage.buckets.
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.eros_avisar_pedido_nuevo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $funcion$
declare
  topico constant text := 'PEGAR_ACA_EL_TOPICO_PRIVADO';
  codigo_aviso text;
  modelo_aviso text;
  duracion_aviso text;
  total_aviso text;
begin
  -- Solo se aceptan etiquetas conocidas: jamás se reenvían campos libres
  -- ni el registro completo. Así tampoco se filtra un nombre puesto por error
  -- en modelo o duración. No se leen nombres, datos, WhatsApp ni fotos.
  codigo_aviso := case when new.codigo ~ '^[A-Z0-9]{6}$' then new.codigo else '------' end;
  modelo_aviso := case pg_catalog.lower(new.modelo)
    when 'carta-para-vos' then 'Carta para vos'
    when 'carta para vos' then 'Carta para vos'
    when 'carta' then 'Carta para vos'
    when 'nuestra-historia' then 'Nuestra historia'
    when 'nuestra historia' then 'Nuestra historia'
    when 'historia' then 'Nuestra historia'
    when 'album-recuerdos' then 'Álbum de recuerdos'
    when 'álbum de recuerdos' then 'Álbum de recuerdos'
    when 'album' then 'Álbum de recuerdos'
    else 'Modelo no reconocido'
  end;
  duracion_aviso := case pg_catalog.lower(new.duracion)
    when '1 día' then '1 día'
    when '1 dia' then '1 día'
    when '1-dia' then '1 día'
    when 'day' then '1 día'
    when '1 semana' then '1 semana'
    when '1-semana' then '1 semana'
    when 'week' then '1 semana'
    when '1 mes' then '1 mes'
    when '1-mes' then '1 mes'
    when 'month' then '1 mes'
    else 'Duración no reconocida'
  end;
  total_aviso := pg_catalog.replace(pg_catalog.to_char(coalesce(new.total, 0), 'FM999,999,999'), ',', '.');

  -- pg_net encola el POST: la red se usa DESPUÉS del COMMIT, sin frenar
  -- el pedido. Al usar JSON, ntfy requiere el endpoint raíz con topic en el cuerpo.
  perform net.http_post(
    url := 'https://ntfy.sh/',
    body := pg_catalog.jsonb_build_object(
      'topic', topico,
      'title', 'Eros Web',
      'message', 'Nuevo pedido ' || codigo_aviso || ' · ' || modelo_aviso ||
        ' · ' || duracion_aviso || ' · $' || total_aviso
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    -- Da margen para conexiones lentas; el envío sigue fuera del INSERT.
    timeout_milliseconds := 30000
  );
  return new;
exception
  when others then
    -- Si ni siquiera pudo encolarse, el pedido se guarda igualmente.
    -- Se registra solo SQLSTATE, sin tópico ni datos del cliente.
    raise warning 'No se pudo encolar el aviso de Eros Web (SQLSTATE %). El pedido se conserva.', sqlstate;
    return new;
end;
$funcion$;

-- La API pública no puede ejecutar manualmente esta función SECURITY DEFINER.
-- El trigger sí se ejecuta al insertar; sus permisos se comprueban al crearlo.
revoke all on function public.eros_avisar_pedido_nuevo() from public, anon, authenticated;

drop trigger if exists eros_aviso_pedido_nuevo on public.pedidos;
create trigger eros_aviso_pedido_nuevo
after insert on public.pedidos
for each row execute function public.eros_avisar_pedido_nuevo();

commit;
