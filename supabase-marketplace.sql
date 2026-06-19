-- ============================================================
-- Pescamon — Marketplace transacional (Fase 1: camada de dados)
-- Estende o sistema de lojas existente (fishing_stores + store_products)
-- com checkout Mercado Pago Split, comissão, pedidos e funil.
-- Execute no Supabase SQL Editor. Idempotente (IF NOT EXISTS / IF EXISTS).
-- Ver desenho completo em docs/MARKETPLACE.md
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1) Estender fishing_stores → vira o "merchant" do marketplace
-- ════════════════════════════════════════════════════════════
alter table public.fishing_stores
  add column if not exists slug                   text,
  add column if not exists home_country           text,                    -- 'UY' | 'AR' | 'BR'
  add column if not exists default_commission_pct numeric(5,2) default 10, -- % de comissão padrão do Pescamon
  add column if not exists active                 boolean default true,    -- visível/vendável no marketplace
  add column if not exists featured               boolean default false;   -- loja em destaque

-- slug único quando preenchido (permite NULL para lojas antigas)
create unique index if not exists idx_fishing_stores_slug
  on public.fishing_stores(slug) where slug is not null;

create index if not exists idx_fishing_stores_active
  on public.fishing_stores(active) where active = true;

-- ════════════════════════════════════════════════════════════
-- 2) Estender store_products → preço/moeda genéricos + flags
--    (price_uyu e in_stock continuam existindo p/ compatibilidade)
-- ════════════════════════════════════════════════════════════
alter table public.store_products
  add column if not exists price        numeric(10,2),          -- preço genérico (substitui price_uyu no marketplace)
  add column if not exists currency     text default 'UYU',     -- 'UYU' | 'ARS' | 'BRL'
  add column if not exists product_type text default 'acessorio',-- 'rig'|'isca'|'vara'|'molinete'|'linha'|'acessorio'
  add column if not exists featured     boolean default false,  -- produto em destaque na recomendação
  add column if not exists active       boolean default true;   -- vendável no marketplace

-- Backfill: usa price_uyu como price quando price ainda não foi definido
update public.store_products
  set price = price_uyu, currency = coalesce(currency, 'UYU')
  where price is null and price_uyu is not null;

create index if not exists idx_store_products_featured
  on public.store_products(featured) where featured = true;
create index if not exists idx_store_products_active
  on public.store_products(active) where active = true;

-- ════════════════════════════════════════════════════════════
-- 3) merchant_accounts — conta de recebimento POR PAÍS (habilita o checkout)
--    Tokens OAuth ficam aqui, mas SÓ o service_role acessa (RLS sem policy p/ cliente).
-- ════════════════════════════════════════════════════════════
create table if not exists public.merchant_accounts (
  id            uuid primary key default gen_random_uuid(),
  store_id      text not null references public.fishing_stores(id) on delete cascade,
  country       text not null,                    -- 'UY' | 'AR' | 'BR'
  provider      text not null default 'mercadopago',
  mp_user_id    text,                             -- ID do vendedor no Mercado Pago
  oauth_status  text not null default 'pending',  -- 'pending' | 'connected' | 'revoked'
  access_token  text,                             -- ⚠ sensível — nunca exposto ao cliente
  refresh_token text,                             -- ⚠ sensível
  token_expires_at timestamptz,
  connected_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (store_id, country, provider)
);

create index if not exists idx_merchant_accounts_store on public.merchant_accounts(store_id);

alter table public.merchant_accounts enable row level security;
-- Sem policies para authenticated/anon ⇒ clientes NÃO leem nada (tokens protegidos).
-- O service_role (Edge Functions) ignora RLS e gerencia tudo.
drop policy if exists "Service manage merchant accounts" on public.merchant_accounts;
create policy "Service manage merchant accounts" on public.merchant_accounts
  for all to service_role using (true) with check (true);

-- View segura: expõe só o STATUS da conexão (sem tokens) e SÓ da loja do próprio usuário.
-- security_invoker=false (a view ignora a RLS da tabela base), por isso o filtro
-- por auth.uid() AQUI dentro é o que garante o isolamento — nunca remover.
create or replace view public.merchant_connection_status
with (security_invoker = false) as
  select ma.store_id, ma.country, ma.provider, ma.oauth_status, ma.connected_at
    from public.merchant_accounts ma
    join public.fishing_stores s on s.id = ma.store_id
   where s.user_id = auth.uid();

grant select on public.merchant_connection_status to authenticated;

-- ════════════════════════════════════════════════════════════
-- 4) orders — pedido (criado no checkout, atualizado pelo webhook)
--    1 pedido por lojista (o MP faz split de 1 marketplace ↔ 1 lojista).
-- ════════════════════════════════════════════════════════════
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  store_id          text not null references public.fishing_stores(id) on delete restrict,
  buyer_user_id     uuid references auth.users(id) on delete set null,
  country           text not null,                       -- país do comprador
  status            text not null default 'pending',     -- 'pending'|'paid'|'failed'|'refunded'
  currency          text not null default 'UYU',
  subtotal          numeric(10,2) not null default 0,
  total             numeric(10,2) not null default 0,
  commission_pct    numeric(5,2),                         -- congelado na criação do pedido
  commission_amount numeric(10,2),                        -- gravado pelo webhook
  mp_preference_id  text,                                 -- referência do checkout no MP
  mp_payment_id     text,                                 -- referência do pagamento no MP
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  paid_at           timestamptz
);

create index if not exists idx_orders_buyer on public.orders(buyer_user_id);
create index if not exists idx_orders_store on public.orders(store_id);
create index if not exists idx_orders_status on public.orders(status);

-- ════════════════════════════════════════════════════════════
-- 5) order_items — itens do pedido (carrinho multi-itens)
-- ════════════════════════════════════════════════════════════
create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  text references public.store_products(id) on delete set null,
  name        text not null,            -- snapshot do nome (resiste a edição/remoção do produto)
  qty         integer not null default 1 check (qty > 0),
  unit_price  numeric(10,2) not null,
  currency    text not null default 'UYU'
);

create index if not exists idx_order_items_order on public.order_items(order_id);

-- ════════════════════════════════════════════════════════════
-- 6) marketplace_events — funil (view → click_buy)
-- ════════════════════════════════════════════════════════════
create table if not exists public.marketplace_events (
  id          uuid primary key default gen_random_uuid(),
  product_id  text references public.store_products(id) on delete cascade,
  store_id    text references public.fishing_stores(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  type        text not null check (type in ('view','click_buy')),
  country     text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mkt_events_product on public.marketplace_events(product_id);
create index if not exists idx_mkt_events_store   on public.marketplace_events(store_id);
create index if not exists idx_mkt_events_type    on public.marketplace_events(type);

-- ════════════════════════════════════════════════════════════
-- 7) RLS — pedidos, itens e eventos
-- ════════════════════════════════════════════════════════════
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.marketplace_events enable row level security;

-- Orders: comprador vê os próprios; dono da loja vê os da sua loja; service_role gerencia.
drop policy if exists "Buyer reads own orders" on public.orders;
create policy "Buyer reads own orders" on public.orders
  for select using (auth.uid() = buyer_user_id);

drop policy if exists "Store owner reads store orders" on public.orders;
create policy "Store owner reads store orders" on public.orders
  for select using (
    exists (select 1 from public.fishing_stores s where s.id = store_id and s.user_id = auth.uid())
  );

drop policy if exists "Service manage orders" on public.orders;
create policy "Service manage orders" on public.orders
  for all to service_role using (true) with check (true);

-- Order items: visíveis se o pedido-pai for visível ao usuário; service_role gerencia.
drop policy if exists "Read items of visible orders" on public.order_items;
create policy "Read items of visible orders" on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (
          o.buyer_user_id = auth.uid()
          or exists (select 1 from public.fishing_stores s where s.id = o.store_id and s.user_id = auth.uid())
        )
    )
  );

drop policy if exists "Service manage order items" on public.order_items;
create policy "Service manage order items" on public.order_items
  for all to service_role using (true) with check (true);

-- Marketplace events: qualquer um registra o funil; dono da loja lê os seus; service_role gerencia.
drop policy if exists "Anyone logs funnel" on public.marketplace_events;
create policy "Anyone logs funnel" on public.marketplace_events
  for insert with check (true);

drop policy if exists "Store owner reads events" on public.marketplace_events;
create policy "Store owner reads events" on public.marketplace_events
  for select using (
    exists (select 1 from public.fishing_stores s where s.id = store_id and s.user_id = auth.uid())
  );

drop policy if exists "Service manage events" on public.marketplace_events;
create policy "Service manage events" on public.marketplace_events
  for all to service_role using (true) with check (true);

-- ════════════════════════════════════════════════════════════
-- 8) Trigger: updated_at em orders
-- ════════════════════════════════════════════════════════════
create or replace function public.touch_order_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.touch_order_updated_at();

-- ════════════════════════════════════════════════════════════
-- 9) Seed — Taralinea (lojista semente) + chicote para tarariras
--    Substitua <USER_ID_DO_DONO> pelo auth.users.id que administrará a Taralinea.
--    A linha do produto fica comentada até a loja existir com um dono real.
-- ════════════════════════════════════════════════════════════
-- insert into public.fishing_stores
--   (id, name, slug, home_country, description, logo_url, default_commission_pct, active, featured, verified, user_id)
-- values
--   ('taralinea', 'Taralinea', 'taralinea', 'UY',
--    'Marca uruguaia especializada em pesca de tarariras (chicote + isca artificial + leader).',
--    '', 10, true, true, true, '<USER_ID_DO_DONO>')
-- on conflict (id) do update set
--   name = excluded.name, slug = excluded.slug, home_country = excluded.home_country,
--   description = excluded.description, active = excluded.active, featured = excluded.featured;

-- insert into public.store_products
--   (id, store_id, gear_key, gear_type, product_type, name, brand, species_ids,
--    price, currency, featured, active, in_stock)
-- values
--   ('taralinea-chicote', 'taralinea', 'leader', 'leader', 'rig',
--    'Chicote Taralinea para Tararira', 'Taralinea', array['tararira'],
--    null, 'UYU', true, true, true)
-- on conflict (id) do update set
--   product_type = excluded.product_type, featured = excluded.featured, active = excluded.active;

-- Fim — Fase 1 (camada de dados do marketplace)
