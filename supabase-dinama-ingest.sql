-- ──────────────────────────────────────────────────────────────────────────────
-- DINAMA Ingest — schema (tabela water_quality_data + log de execuções)
-- Executar no Supabase SQL Editor
-- NOTA: water_quality_data é a tabela real já existente no Supabase.
--       O front-end (waterQuality.js) a consulta diretamente.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. Adicionar colunas faltantes em water_quality_data (idempotente) ────────
-- A tabela já existe no Supabase; apenas garantimos que todas as colunas
-- necessárias estão presentes sem risco de perder dados existentes.
alter table water_quality_data
  add column if not exists source_name      text,
  add column if not exists description      text,
  add column if not exists indicators       jsonb,
  add column if not exists sample_lat       float,
  add column if not exists sample_lon       float,
  add column if not exists measured_at      timestamp with time zone,
  add column if not exists updated_at       timestamp with time zone default now(),
  add column if not exists is_current       boolean default true;

create index if not exists idx_wqd_watercourse on water_quality_data(watercourse_id, is_current);
create index if not exists idx_wqd_score       on water_quality_data(quality_score);

-- Trigger updated_at
create or replace function update_wqd_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_wqd_updated_at on water_quality_data;
create trigger trg_wqd_updated_at
  before update on water_quality_data
  for each row execute function update_wqd_updated_at();

-- ── 2. RLS ────────────────────────────────────────────────────────────────────
alter table water_quality_data enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'water_quality_data' and policyname = 'wqd_public_read'
  ) then
    execute 'create policy wqd_public_read on water_quality_data for select using (true)';
  end if;
end $$;

-- ── 3. Tabela de log de execuções da Edge Function ingest-dinama ──────────────
create table if not exists dinama_ingest_log (
  id       uuid primary key default gen_random_uuid(),
  ran_at   timestamp with time zone default now(),
  upserted int not null default 0,
  failed   int not null default 0,
  stations int not null default 0,
  detail   jsonb,
  error    text
);

create index if not exists idx_dinama_ingest_log_ran_at on dinama_ingest_log(ran_at desc);

-- Comentários
comment on table water_quality_data is
  'Qualidade da água por curso d''água. '
  'source_type=official: dados DINAMA via Edge Function ingest-dinama. '
  'source_type=crowdsourced: reports de usuários validados por moderador.';

comment on table dinama_ingest_log is
  'Log de execuções da Edge Function ingest-dinama. '
  'Cada linha representa uma chamada ao cron agendado (diário 08:00 UTC).';
