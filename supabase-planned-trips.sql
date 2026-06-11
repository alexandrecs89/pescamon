-- ============================================================
-- Tabela de Pescarias Planejadas (Planned Trips)
-- ============================================================
-- Colunas alinhadas com savePlannedTrip / fetchPlannedTrips em supabase.js

DROP TABLE IF EXISTS planned_trips CASCADE;

CREATE TABLE planned_trips (
  id TEXT PRIMARY KEY,               -- Date.now() string ou UUID
  user_id TEXT,                      -- null para anônimos (usa device_id)
  device_id TEXT NOT NULL,

  -- Tipo e grupo
  trip_type TEXT NOT NULL DEFAULT 'day',  -- 'day' | 'multi'
  party_size INTEGER NOT NULL DEFAULT 1,

  -- Espécies alvo
  species_ids TEXT[],
  species_names TEXT[],

  -- Localização
  location_id TEXT,
  location_name TEXT NOT NULL DEFAULT '',

  -- Período
  start_date DATE,
  end_date DATE,
  start_time TEXT,
  end_time TEXT,

  -- Equipamento e notas
  gear TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',

  -- Status e execução
  status TEXT NOT NULL DEFAULT 'planned', -- 'planned' | 'in_progress' | 'completed' | 'cancelled'
  actual_start_date TIMESTAMPTZ,
  actual_end_date TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_planned_trips_user ON planned_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_planned_trips_device ON planned_trips(device_id);
CREATE INDEX IF NOT EXISTS idx_planned_trips_status ON planned_trips(status);
CREATE INDEX IF NOT EXISTS idx_planned_trips_dates ON planned_trips(start_date);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION set_planned_trips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS planned_trips_updated_at ON planned_trips;
CREATE TRIGGER planned_trips_updated_at
  BEFORE UPDATE ON planned_trips
  FOR EACH ROW
  EXECUTE FUNCTION set_planned_trips_updated_at();

-- ============================================================
-- RLS Policies (Row Level Security)
-- ============================================================

ALTER TABLE planned_trips ENABLE ROW LEVEL SECURITY;

-- Política permissiva total (simplificada para máxima compatibilidade)
CREATE POLICY planned_trips_all ON planned_trips
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Fim
