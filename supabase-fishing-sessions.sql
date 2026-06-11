-- ============================================================
-- Pescarias Ativas e Registro de Capturas
-- ============================================================

-- Tabela de sessões de pescaria (eventos em andamento/concluídos)
CREATE TABLE IF NOT EXISTS fishing_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT, -- null para anônimos (usa device_id)
  device_id TEXT NOT NULL,
  
  -- Informações da pescaria
  title TEXT, -- Título opcional (ex: "Pescaria de Domingo")
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed', 'cancelled'
  
  -- Localização selecionada
  watercourse_id TEXT,
  watercourse_name TEXT,
  watercourse_type TEXT,
  location_lat DECIMAL(10, 8),
  location_lon DECIMAL(11, 8),
  
  -- Datas
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  
  -- Métricas
  total_catches INTEGER DEFAULT 0,
  total_weight_kg DECIMAL(8, 3),
  biggest_fish_kg DECIMAL(8, 3),
  biggest_fish_species TEXT,
  
  -- Clima (capturado no início)
  weather_temp_c DECIMAL(4, 1),
  weather_condition TEXT,
  moon_phase TEXT,
  
  -- Notas gerais
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_user ON fishing_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_device ON fishing_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_status ON fishing_sessions(status);
CREATE INDEX IF NOT EXISTS idx_fishing_sessions_started ON fishing_sessions(started_at DESC);

-- Trigger para atualizar updated_at
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
  FOR EACH ROW
  EXECUTE FUNCTION update_fishing_session_timestamp();

-- ============================================================
-- Registro de Capturas Individuais
-- ============================================================

CREATE TABLE IF NOT EXISTS catches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES fishing_sessions(id) ON DELETE CASCADE,
  
  -- Informações do peixe
  species_id TEXT NOT NULL,
  species_name TEXT NOT NULL,
  weight_kg DECIMAL(8, 3),
  length_cm DECIMAL(5, 2),
  
  -- Local exato da captura (pode ser diferente do local geral)
  catch_lat DECIMAL(10, 8),
  catch_lon DECIMAL(11, 8),
  
  -- Momento da captura
  caught_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Equipamento utilizado
  bait_type TEXT,
  lure_type TEXT,
  depth_m DECIMAL(4, 2),
  
  -- Fotos (array de URLs)
  photo_urls TEXT[],
  
  -- Notas específicas
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_catches_session ON catches(session_id);
CREATE INDEX IF NOT EXISTS idx_catches_species ON catches(species_id);
CREATE INDEX IF NOT EXISTS idx_catches_caught ON catches(caught_at DESC);

-- ============================================================
-- RLS Policies (Row Level Security)
-- ============================================================

ALTER TABLE fishing_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE catches ENABLE ROW LEVEL SECURITY;

-- Everyone can read (for public stats)
CREATE POLICY fishing_sessions_select_all ON fishing_sessions
  FOR SELECT USING (true);

CREATE POLICY catches_select_all ON catches
  FOR SELECT USING (true);

-- Only owner can insert/update their sessions
CREATE POLICY fishing_sessions_insert_own ON fishing_sessions
  FOR INSERT WITH CHECK (
    (user_id IS NOT NULL AND user_id = current_setting('app.current_user_id', true)) OR
    (user_id IS NULL AND device_id = current_setting('app.current_device_id', true))
  );

CREATE POLICY fishing_sessions_update_own ON fishing_sessions
  FOR UPDATE USING (
    (user_id IS NOT NULL AND user_id = current_setting('app.current_user_id', true)) OR
    (user_id IS NULL AND device_id = current_setting('app.current_device_id', true))
  );

CREATE POLICY fishing_sessions_delete_own ON fishing_sessions
  FOR DELETE USING (
    (user_id IS NOT NULL AND user_id = current_setting('app.current_user_id', true)) OR
    (user_id IS NULL AND device_id = current_setting('app.current_device_id', true))
  );

-- Only owner can insert/update their catches
CREATE POLICY catches_insert_own ON catches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM fishing_sessions fs
      WHERE fs.id = catches.session_id
      AND (
        (fs.user_id IS NOT NULL AND fs.user_id = current_setting('app.current_user_id', true)) OR
        (fs.user_id IS NULL AND fs.device_id = current_setting('app.current_device_id', true))
      )
    )
  );

CREATE POLICY catches_update_own ON catches
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM fishing_sessions fs
      WHERE fs.id = catches.session_id
      AND (
        (fs.user_id IS NOT NULL AND fs.user_id = current_setting('app.current_user_id', true)) OR
        (fs.user_id IS NULL AND fs.device_id = current_setting('app.current_device_id', true))
      )
    )
  );

CREATE POLICY catches_delete_own ON catches
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM fishing_sessions fs
      WHERE fs.id = catches.session_id
      AND (
        (fs.user_id IS NOT NULL AND fs.user_id = current_setting('app.current_user_id', true)) OR
        (fs.user_id IS NULL AND fs.device_id = current_setting('app.current_device_id', true))
      )
    )
  );
