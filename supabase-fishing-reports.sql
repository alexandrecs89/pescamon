-- ─────────────────────────────────────────────────────────────
-- Relatórios preditivos personalizados — Pescamon Premium
-- Execute no SQL Editor do Supabase Dashboard
-- ─────────────────────────────────────────────────────────────

-- 1. Espécies favoritas por usuário
CREATE TABLE IF NOT EXISTS favorite_species (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  species_id  text NOT NULL,
  species_name text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, species_id)
);

ALTER TABLE favorite_species ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favorites"
  ON favorite_species FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Configurações de relatório por usuário
CREATE TABLE IF NOT EXISTS user_report_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  home_lat        double precision,
  home_lng        double precision,
  home_address    text,
  radius_km       integer NOT NULL DEFAULT 50,
  monthly_enabled boolean NOT NULL DEFAULT true,
  weekly_enabled  boolean NOT NULL DEFAULT false,
  last_monthly_at timestamptz,
  last_weekly_at  timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE user_report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own report settings"
  ON user_report_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Relatórios gerados
CREATE TABLE IF NOT EXISTS fishing_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type  text NOT NULL CHECK (report_type IN ('monthly', 'weekly')),
  period_label text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  content      jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE fishing_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own reports"
  ON fishing_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts reports"
  ON fishing_reports FOR INSERT
  WITH CHECK (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_favorite_species_user ON favorite_species(user_id);
CREATE INDEX IF NOT EXISTS idx_fishing_reports_user  ON fishing_reports(user_id, generated_at DESC);
