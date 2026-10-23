-- Función de lectura inocua para GitHub Actions. Puede volver a ejecutarse.
-- No concede lectura de pedidos, Storage ni ninguna tabla.
begin;

create or replace function public.eros_keepalive()
returns integer
language sql
stable
security invoker
set search_path = ''
as $funcion$
  select 1;
$funcion$;

-- Solo el rol visitante necesita ejecutar esta función sin parámetros.
revoke all on function public.eros_keepalive() from public, anon, authenticated;
grant usage on schema public to anon;
grant execute on function public.eros_keepalive() to anon;

comment on function public.eros_keepalive() is
  'Comprobación pública de disponibilidad. Devuelve solo el entero 1.';

notify pgrst, 'reload schema';
commit;
