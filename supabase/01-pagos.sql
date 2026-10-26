-- Eros Web · etapa A: base para pagos, publicación y vencimientos.
-- Ejecutar después de 00-setup-completo.sql en el proyecto que se conservará.
-- Idempotente. Solo modifica tablas propias de Eros Web; no altera tablas del
-- sistema de Supabase ni configura Mercado Pago o notificaciones.

begin;

-- Función auxiliar fuera del esquema expuesto por defecto en la Data API.
-- Convierte un UUID aleatorio a 32 caracteres de un alfabeto sin 0, 1, i, l ni o.
create schema if not exists eros_private;
grant usage on schema eros_private to anon, authenticated, service_role;

create or replace function eros_private.generar_slug_pedido()
returns text
language sql
volatile
set search_path = ''
as $funcion$
  select pg_catalog.translate(
    pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
    '0123456789abcdef',
    '23456789abcdefgh'
  );
$funcion$;

-- El valor se usa como DEFAULT. La función no consulta ni devuelve datos de pedidos.
revoke all on function eros_private.generar_slug_pedido()
  from public, anon, authenticated, service_role;
grant execute on function eros_private.generar_slug_pedido()
  to anon, authenticated, service_role;
comment on function eros_private.generar_slug_pedido() is
  'Genera un slug aleatorio para pedidos; no lee datos ni acepta parámetros.';

-- Columnas nuevas para checkout, publicación y vencimiento automático.
alter table public.pedidos
  add column if not exists slug text,
  add column if not exists mp_preference_id text,
  add column if not exists mp_payment_id text,
  add column if not exists pagado_en timestamptz,
  add column if not exists publicado_en timestamptz,
  add column if not exists vence_en timestamptz;

-- En el flujo nuevo, los pedidos antiguos "en_proceso" vuelven a "nuevo",
-- porque todavía esperan la confirmación de pago.
update public.pedidos
   set estado = 'nuevo'
 where estado = 'en_proceso';

-- Repara slugs ausentes o fuera del alfabeto y corrige duplicados históricos.
update public.pedidos
   set slug = eros_private.generar_slug_pedido()
 where slug is null
    or slug !~ '^[23456789abcdefgh]{12,32}$';

with repetidos as (
  select id,
         row_number() over (partition by slug order by id) as numero
    from public.pedidos
)
update public.pedidos as pedido
   set slug = eros_private.generar_slug_pedido()
  from repetidos
 where pedido.id = repetidos.id
   and repetidos.numero > 1;

alter table public.pedidos
  alter column slug set default eros_private.generar_slug_pedido(),
  alter column slug set not null;

-- El conjunto válido de estados del flujo automático reemplaza al estado antiguo.
alter table public.pedidos
  drop constraint if exists pedidos_estado_valido;
alter table public.pedidos
  drop constraint if exists pedidos_estado_pago_valido;
alter table public.pedidos
  add constraint pedidos_estado_pago_valido
  check (estado in ('nuevo', 'pagado', 'publicado', 'vencido'));

-- Los slugs son opacos, largos y sin caracteres ambiguos.
alter table public.pedidos
  drop constraint if exists pedidos_slug_formato;
alter table public.pedidos
  add constraint pedidos_slug_formato
  check (slug ~ '^[23456789abcdefgh]{12,32}$');

alter table public.pedidos
  drop constraint if exists pedidos_mp_preference_id_largo;
alter table public.pedidos
  add constraint pedidos_mp_preference_id_largo
  check (mp_preference_id is null or char_length(mp_preference_id) between 1 and 200);

alter table public.pedidos
  drop constraint if exists pedidos_mp_payment_id_largo;
alter table public.pedidos
  add constraint pedidos_mp_payment_id_largo
  check (mp_payment_id is null or char_length(mp_payment_id) between 1 and 100);

create unique index if not exists pedidos_slug_uidx
  on public.pedidos (slug);
create unique index if not exists pedidos_mp_preference_id_uidx
  on public.pedidos (mp_preference_id)
  where mp_preference_id is not null;
create unique index if not exists pedidos_mp_payment_id_uidx
  on public.pedidos (mp_payment_id)
  where mp_payment_id is not null;
create index if not exists pedidos_publicados_vence_en_idx
  on public.pedidos (vence_en)
  where estado = 'publicado';

-- RLS permanece activa también si el script se ejecuta sobre una base existente.
alter table public.pedidos enable row level security;
grant usage on schema public to anon, authenticated, service_role;

-- Quita permisos de tabla y permisos previos por columna antes de volver a
-- conceder solo lo que cada rol necesita.
revoke all privileges on table public.pedidos
  from public, anon, authenticated;
revoke select (
  id, codigo, creado_en, estado, modelo, duracion, extras, tema, para_quien,
  de_parte, musica, activar_el, whatsapp_cliente, datos, total, fotos_cantidad,
  notas, slug, mp_preference_id, mp_payment_id, pagado_en, publicado_en, vence_en
) on table public.pedidos from public, anon, authenticated;
revoke insert (
  id, codigo, creado_en, estado, modelo, duracion, extras, tema, para_quien,
  de_parte, musica, activar_el, whatsapp_cliente, datos, total, fotos_cantidad,
  notas, slug, mp_preference_id, mp_payment_id, pagado_en, publicado_en, vence_en
) on table public.pedidos from public, anon, authenticated;
revoke update (
  id, codigo, creado_en, estado, modelo, duracion, extras, tema, para_quien,
  de_parte, musica, activar_el, whatsapp_cliente, datos, total, fotos_cantidad,
  notas, slug, mp_preference_id, mp_payment_id, pagado_en, publicado_en, vence_en
) on table public.pedidos from public, anon, authenticated;
revoke references (
  id, codigo, creado_en, estado, modelo, duracion, extras, tema, para_quien,
  de_parte, musica, activar_el, whatsapp_cliente, datos, total, fotos_cantidad,
  notas, slug, mp_preference_id, mp_payment_id, pagado_en, publicado_en, vence_en
) on table public.pedidos from public, anon, authenticated;

-- El visitante inserta el pedido y sus datos elegidos, pero no controla estado,
-- slug, campos de pago ni fechas generadas por el servidor. activar_el se conserva
-- porque representa la fecha de inicio que el cliente eligió para su página.
grant insert (
  id, codigo, modelo, duracion, extras, tema, para_quien, de_parte, musica,
  activar_el, whatsapp_cliente, datos, total, fotos_cantidad
) on table public.pedidos to anon;

-- El panel lee y borra como administrador. Los campos de pago y fechas se
-- habilitan para el administrador y para las funciones servidoras; el slug no
-- se puede editar una vez generado.
grant select, delete on table public.pedidos to authenticated;
grant update (
  estado, modelo, duracion, extras, tema, para_quien, de_parte, musica,
  activar_el, whatsapp_cliente, datos, total, fotos_cantidad, notas,
  mp_preference_id, mp_payment_id, pagado_en, publicado_en, vence_en
) on table public.pedidos to authenticated;
grant select, insert, update, delete on table public.pedidos to service_role;

-- Esta política restrictiva se combina con las políticas existentes y garantiza
-- que todo INSERT anónimo sea un pedido nuevo sin datos de pago o publicación.
drop policy if exists pedidos_anon_solo_campos_servidor on public.pedidos;
create policy pedidos_anon_solo_campos_servidor
  on public.pedidos as restrictive
  for insert to anon
  with check (
    estado = 'nuevo'
    and slug ~ '^[23456789abcdefgh]{12,32}$'
    and mp_preference_id is null
    and mp_payment_id is null
    and pagado_en is null
    and publicado_en is null
    and vence_en is null
  );

-- Suscripciones de Web Push para la etapa E. La tabla queda protegida ahora,
-- aunque todavía no la usa el panel ni ninguna función.
create table if not exists public.admin_push_subscriptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  admin_user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  suscripcion jsonb not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint admin_push_subscriptions_endpoint_unico unique (endpoint),
  constraint admin_push_subscriptions_endpoint_valido
    check (
      char_length(endpoint) between 1 and 2048
      and endpoint ~ '^https://[^[:space:]]+$'
    ),
  constraint admin_push_subscriptions_suscripcion_objeto
    check (
      jsonb_typeof(suscripcion) = 'object'
      and octet_length(suscripcion::text) <= 8192
    )
);

create index if not exists admin_push_subscriptions_admin_user_idx
  on public.admin_push_subscriptions (admin_user_id);

alter table public.admin_push_subscriptions enable row level security;
revoke all privileges on table public.admin_push_subscriptions
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.admin_push_subscriptions to authenticated;
grant select, insert, update, delete
  on table public.admin_push_subscriptions to service_role;

drop policy if exists admin_push_subscriptions_admin_select
  on public.admin_push_subscriptions;
create policy admin_push_subscriptions_admin_select
  on public.admin_push_subscriptions as permissive
  for select to authenticated
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    and admin_user_id = (select auth.uid())
  );

drop policy if exists admin_push_subscriptions_admin_insert
  on public.admin_push_subscriptions;
create policy admin_push_subscriptions_admin_insert
  on public.admin_push_subscriptions as permissive
  for insert to authenticated
  with check (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    and admin_user_id = (select auth.uid())
  );

drop policy if exists admin_push_subscriptions_admin_update
  on public.admin_push_subscriptions;
create policy admin_push_subscriptions_admin_update
  on public.admin_push_subscriptions as permissive
  for update to authenticated
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    and admin_user_id = (select auth.uid())
  )
  with check (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    and admin_user_id = (select auth.uid())
  );

drop policy if exists admin_push_subscriptions_admin_delete
  on public.admin_push_subscriptions;
create policy admin_push_subscriptions_admin_delete
  on public.admin_push_subscriptions as permissive
  for delete to authenticated
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    and admin_user_id = (select auth.uid())
  );

-- Ninguna política permisiva futura podrá quitar el requisito de ser admin
-- ni permitirá consultar o modificar la suscripción de otro administrador.
drop policy if exists admin_push_subscriptions_solo_admin
  on public.admin_push_subscriptions;
create policy admin_push_subscriptions_solo_admin
  on public.admin_push_subscriptions as restrictive
  for all to public
  using (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    and admin_user_id = (select auth.uid())
  )
  with check (
    coalesce(((select auth.jwt()) -> 'app_metadata' ->> 'eros_admin') = 'true', false)
    and admin_user_id = (select auth.uid())
  );

notify pgrst, 'reload schema';
commit;
