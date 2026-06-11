-- ============================================================
-- Migração: adicionar colunas faltantes em fishing_sessions e catches
-- Execute no SQL Editor do Supabase (dashboard.supabase.com)
-- ============================================================

-- fishing_sessions: colunas possivelmente faltantes
ALTER TABLE fishing_sessions
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS watercourse_id TEXT,
  ADD COLUMN IF NOT EXISTS watercourse_name TEXT,
  ADD COLUMN IF NOT EXISTS watercourse_type TEXT,
  ADD COLUMN IF NOT EXISTS location_lat DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS location_lon DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS total_catches INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_weight_kg DECIMAL(8, 3),
  ADD COLUMN IF NOT EXISTS biggest_fish_kg DECIMAL(8, 3),
  ADD COLUMN IF NOT EXISTS biggest_fish_species TEXT,
  ADD COLUMN IF NOT EXISTS weather_temp_c DECIMAL(4, 1),
  ADD COLUMN IF NOT EXISTS weather_condition TEXT,
  ADD COLUMN IF NOT EXISTS moon_phase TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Índices úteis (ignorados se já existirem)
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_user    ON fishing_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_device  ON fishing_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_status  ON fishing_sessions(status);
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_started ON fishing_sessions(started_at DESC);

-- Trigger updated_at (recria sem erro se já existir)
CREATE OR REPLACE FUNCTION update_fishing_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fishing_sessions_updated_at ON fishing_sessions;
CREATE TRIGGER fishing_sessions_updated_at
  BEFORE UPDATE ON fishing_sessions
  FOR EACH ROW EXECUTE FUNCTION update_fishing_session_timestamp();

-- ============================================================
-- catches: cria a tabela se não existir (ou adiciona colunas)
-- ============================================================
CREATE TABLE IF NOT EXISTS catches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES fishing_sessions(id) ON DELETE CASCADE,
  species_id TEXT NOT NULL,
  species_name TEXT,
  weight_kg DECIMAL(8, 3),
  length_cm DECIMAL(6, 1),
  catch_lat DECIMAL(10, 8),
  catch_lon DECIMAL(11, 8),
  caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bait_type TEXT,
  lure_type TEXT,
  depth_m DECIMAL(6, 2),
  photo_urls TEXT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Caso catches já exista, adiciona colunas faltantes
ALTER TABLE catches
  ADD COLUMN IF NOT EXISTS weight_kg DECIMAL(8, 3),
  ADD COLUMN IF NOT EXISTS length_cm DECIMAL(6, 1),
  ADD COLUMN IF NOT EXISTS catch_lat DECIMAL(10, 8),
  ADD COLUMN IF NOT EXISTS catch_lon DECIMAL(11, 8),
  ADD COLUMN IF NOT EXISTS bait_type TEXT,
  ADD COLUMN IF NOT EXISTS lure_type TEXT,
  ADD COLUMN IF NOT EXISTS depth_m DECIMAL(6, 2),
  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_catches_session ON catches(session_id);
CREATE INDEX IF NOT EXISTS idx_catches_species ON catches(species_id);
CREATE INDEX IF NOT EXISTS idx_catches_caught  ON catches(caught_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================
ALTER TABLE fishing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fishing_sessions_select_all  ON fishing_sessions;
DROP POLICY IF EXISTS fishing_sessions_insert_own  ON fishing_sessions;
DROP POLICY IF EXISTS fishing_sessions_update_own  ON fishing_sessions;
DROP POLICY IF EXISTS fishing_sessions_delete_own  ON fishing_sessions;
DROP POLICY IF EXISTS catches_select_all           ON catches;
DROP POLICY IF EXISTS catches_insert_own           ON catches;
DROP POLICY IF EXISTS catches_update_own           ON catches;
DROP POLICY IF EXISTS catches_delete_own           ON catches;

CREATE POLICY fishing_sessions_select_all ON fishing_sessions FOR SELECT USING (true);
CREATE POLICY fishing_sessions_insert_own ON fishing_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY fishing_sessions_update_own ON fishing_sessions FOR UPDATE USING (true);
CREATE POLICY fishing_sessions_delete_own ON fishing_sessions FOR DELETE USING (true);

CREATE POLICY catches_select_all ON catches FOR SELECT USING (true);
CREATE POLICY catches_insert_own ON catches FOR INSERT WITH CHECK (true);
CREATE POLICY catches_update_own ON catches FOR UPDATE USING (true);
CREATE POLICY catches_delete_own ON catches FOR DELETE USING (true);
