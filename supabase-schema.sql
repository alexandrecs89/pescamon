-- Execute este SQL no Supabase Dashboard > SQL Editor
-- Se a tabela já existe, rode apenas os ALTER/CREATE POLICY necessários.

-- ============================================================
-- TABELA
-- ============================================================
create table if not exists occurrences (
  id text primary key,
  species_id text not null,
  species_name text not null,
  lat double precision not null,
  lng double precision not null,
  notes text default '',
  created_at timestamptz default now(),
  device_id text,
  user_id uuid references auth.users(id)
);

-- Índices
create index if not exists idx_occurrences_species on occurrences(species_id);
create index if not exists idx_occurrences_created on occurrences(created_at);
create index if not exists idx_occurrences_user on occurrences(user_id);

-- Se a tabela já existia sem user_id:
-- alter table occurrences add column if not exists user_id uuid references auth.users(id);

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
alter table occurrences enable row level security;

-- Leitura pública (todos veem todas as ocorrências = dados compartilhados)
create policy "Leitura pública" on occurrences
  for select using (true);

-- Inserção: qualquer um (anon ou autenticado)
create policy "Inserção livre" on occurrences
  for insert with check (true);

-- Atualização: apenas o dono (user_id = auth.uid()) ou se user_id é null (anônimo)
create policy "Atualização pelo dono" on occurrences
  for update using (user_id = auth.uid() or user_id is null);

-- Deleção: apenas o dono ou anônimo
create policy "Deleção pelo dono" on occurrences
  for delete using (user_id = auth.uid() or user_id is null);

-- ============================================================
-- TABELA IoT SENSORS
-- ============================================================
create table if not exists iot_sensors (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  water_temp double precision,
  water_level double precision,
  battery integer default 100,
  updated_at timestamptz default now()
);

create index if not exists idx_iot_sensors_updated on iot_sensors(updated_at);

alter table iot_sensors enable row level security;

create policy "Leitura pública sensores" on iot_sensors
  for select using (true);

create policy "Inserção de sensores" on iot_sensors
  for insert with check (true);

create policy "Atualização de sensores" on iot_sensors
  for update using (true);

-- ============================================================
-- TABELA RIVER CHAT
-- ============================================================
create table if not exists river_chat (
  id text primary key,
  segment text not null,
  device_id text,
  user_name text not null default 'Anônimo',
  message text not null,
  created_at timestamptz default now()
);

create index if not exists idx_river_chat_segment on river_chat(segment);
create index if not exists idx_river_chat_created on river_chat(created_at);

alter table river_chat enable row level security;

create policy "Leitura pública chat" on river_chat
  for select using (true);

create policy "Inserção de mensagens" on river_chat
  for insert with check (true);

-- ============================================================
-- TABELA CAPTURE VALIDATIONS (validação cruzada de capturas)
-- ============================================================
create table if not exists capture_validations (
  occurrence_id text not null,
  device_id     text not null,
  vote          text not null check (vote in ('confirm', 'contest')),
  created_at    timestamptz default now(),
  primary key (occurrence_id, device_id)
);

create index if not exists idx_capture_valid_occurrence on capture_validations(occurrence_id);

alter table capture_validations enable row level security;

create policy "Leitura pública validações" on capture_validations
  for select using (true);

create policy "Inserção de validação" on capture_validations
  for insert with check (true);

create policy "Upsert de validação" on capture_validations
  for update using (device_id = current_setting('request.headers', true)::json->>'x-device-id' or true);

create policy "Remoção de validação própria" on capture_validations
  for delete using (true);

-- ============================================================
-- TABELA PLANNED TRIPS (pescarias planejadas)
-- ============================================================
create table if not exists planned_trips (
  id            text primary key,
  device_id     text,
  user_id       uuid references auth.users(id),
  trip_type     text not null check (trip_type in ('day', 'multi')),
  species_ids   text[] default '{}',
  species_names text[] default '{}',
  location_id   text,
  location_name text default '',
  start_date    date,
  end_date      date,
  start_time    text,
  end_time      text,
  party_size    integer default 1,
  gear          text default '',
  notes         text default '',
  created_at    timestamptz default now()
);

create index if not exists idx_planned_trips_user     on planned_trips(user_id);
create index if not exists idx_planned_trips_device   on planned_trips(device_id);
create index if not exists idx_planned_trips_start    on planned_trips(start_date);

alter table planned_trips enable row level security;

create policy "Leitura própria trips (user)" on planned_trips
  for select using (user_id = auth.uid() or user_id is null);

create policy "Leitura própria trips (device)" on planned_trips
  for select using (true);

create policy "Inserção de trips" on planned_trips
  for insert with check (true);

create policy "Atualização de trips" on planned_trips
  for update using (user_id = auth.uid() or user_id is null);

create policy "Deleção de trips" on planned_trips
  for delete using (user_id = auth.uid() or user_id is null or true);

-- ============================================================
-- TABELA FISHING SPOTS (postos de pesca da comunidade)
-- ============================================================
create table if not exists fishing_spots (
  id            text primary key,
  name          text not null,
  description   text default '',
  lat           double precision not null,
  lng           double precision not null,
  watercourse_id   text default '',
  watercourse_name text default '',
  access_type   text default 'bank' check (access_type in ('bank', 'boat', 'wading', 'pier')),
  species_ids   text[] default '{}',
  species_names text[] default '{}',
  photo_url     text default '',
  device_id     text,
  user_id       uuid references auth.users(id),
  upvotes       integer default 0,
  created_at    timestamptz default now()
);

create index if not exists idx_fishing_spots_created  on fishing_spots(created_at);
create index if not exists idx_fishing_spots_user     on fishing_spots(user_id);
create index if not exists idx_fishing_spots_location on fishing_spots using gist(point(lng, lat));

alter table fishing_spots enable row level security;

create policy "Leitura pública postos" on fishing_spots
  for select using (true);

create policy "Inserção de postos" on fishing_spots
  for insert with check (true);

create policy "Atualização de postos" on fishing_spots
  for update using (user_id = auth.uid() or user_id is null);

create policy "Deleção de postos" on fishing_spots
  for delete using (user_id = auth.uid() or user_id is null);

-- ── Lojas de pesca parceiras ──────────────────────────────────────────────────
create table if not exists fishing_stores (
  id          text primary key,
  name        text not null,
  address     text default '',
  city        text default '',
  department  text default '',
  phone       text default '',
  whatsapp    text default '',
  website     text default '',
  lat         double precision,
  lng         double precision,
  logo_url    text default '',
  description text default '',
  user_id     uuid references auth.users(id),
  verified    boolean default false,
  created_at  timestamptz default now()
);

create index if not exists idx_fishing_stores_user on fishing_stores(user_id);

alter table fishing_stores enable row level security;

create policy "Leitura pública lojas" on fishing_stores
  for select using (true);

create policy "Inserção de lojas" on fishing_stores
  for insert with check (true);

create policy "Atualização de lojas" on fishing_stores
  for update using (user_id = auth.uid());

create policy "Deleção de lojas" on fishing_stores
  for delete using (user_id = auth.uid());

-- ── Produtos cadastrados pelas lojas ─────────────────────────────────────────
create table if not exists store_products (
  id          text primary key,
  store_id    text not null references fishing_stores(id) on delete cascade,
  gear_key    text not null,      -- chave que mapeia para GEAR_DB (ex: 'rod', 'reel', 'line', 'hook', 'leader', 'bait')
  gear_type   text not null check (gear_type in ('rod','reel','line','hook','leader','bait','other')),
  name        text not null,
  brand       text default '',
  model       text default '',
  species_ids text[] default '{}',  -- espécies para as quais o produto é indicado
  price_uyu   numeric(10,2),        -- preço em pesos uruguayos (opcional)
  in_stock    boolean default true,
  created_at  timestamptz default now()
);

create index if not exists idx_store_products_store   on store_products(store_id);
create index if not exists idx_store_products_gear    on store_products(gear_key);
create index if not exists idx_store_products_species on store_products using gin(species_ids);

alter table store_products enable row level security;

create policy "Leitura pública produtos" on store_products
  for select using (true);

create policy "Inserção de produtos" on store_products
  for insert with check (
    exists (select 1 from fishing_stores s where s.id = store_id and s.user_id = auth.uid())
  );

create policy "Atualização de produtos" on store_products
  for update using (
    exists (select 1 from fishing_stores s where s.id = store_id and s.user_id = auth.uid())
  );

create policy "Deleção de produtos" on store_products
  for delete using (
    exists (select 1 from fishing_stores s where s.id = store_id and s.user_id = auth.uid())
  );

-- ============================================================
-- TABELA BAIT HISTORY (iscas utilizadas — agregação servidor)
-- ============================================================
create table if not exists bait_history (
  id          uuid primary key default gen_random_uuid(),
  species_id  text not null,          -- ID da espécie (ex: 'dourado', 'tararira')
  bait_name   text not null,          -- nome normalizado da isca
  cell_id     text,                   -- ID da célula do heatmap (opcional)
  device_id   text,                   -- identificador anônimo do dispositivo
  user_id     uuid references auth.users(id), -- null para anônimos
  recorded_at timestamptz default now()
);

create index if not exists idx_bait_history_species on bait_history(species_id);
create index if not exists idx_bait_history_cell    on bait_history(cell_id) where cell_id is not null;

alter table bait_history enable row level security;

create policy "Leitura pública bait_history" on bait_history
  for select using (true);

create policy "Inserção bait_history" on bait_history
  for insert with check (true);

-- ============================================================
-- FUNÇÃO RPC: get_hot_baits
-- Agrega iscas mais usadas por espécie/célula no servidor.
-- Evita transferir todos os registros para o cliente.
-- ============================================================
create or replace function get_hot_baits(
  p_species_id text,
  p_cell_id    text    default null,
  p_limit      integer default 3
)
returns table(bait_name text, cnt bigint)
language sql
stable
as $$
  select
    lower(trim(bait_name)) as bait_name,
    count(*)               as cnt
  from bait_history
  where species_id = p_species_id
    and (p_cell_id is null or cell_id = p_cell_id)
  group by lower(trim(bait_name))
  order by cnt desc
  limit p_limit;
$$;
