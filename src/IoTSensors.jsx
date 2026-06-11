import React, { useEffect, useMemo, useState } from 'react';
import { Thermometer, Waves, Radio, RefreshCw, AlertTriangle, BatteryLow, WifiOff } from 'lucide-react';
import { supabase } from './supabase.js';

const SENSOR_TABLE = 'iot_sensors';

const OFFLINE_THRESHOLD_MIN = 30;

const DEMO_SENSORS = [
  { id: 'sensor-01', name: 'Paso Pache', lat: -34.682, lng: -56.147, water_temp: 16.3, water_level: 1.42, water_ph: 7.2, water_turbidity: 12, battery: 87, updated_at: new Date(Date.now() - 12 * 60000).toISOString() },
  { id: 'sensor-02', name: 'Puente Santa Lucía', lat: -34.714, lng: -56.228, water_temp: 15.8, water_level: 1.58, water_ph: 7.5, water_turbidity: 8, battery: 16, updated_at: new Date(Date.now() - 8 * 60000).toISOString() },
  { id: 'sensor-03', name: 'Desembocadura', lat: -34.753, lng: -56.345, water_temp: 17.1, water_level: 2.05, water_ph: null, water_turbidity: null, battery: 64, updated_at: new Date(Date.now() - 45 * 60000).toISOString() },
];

function isOffline(isoString) {
  const diff = (Date.now() - new Date(isoString).getTime()) / 60000;
  return diff > OFFLINE_THRESHOLD_MIN;
}

function minutesAgo(isoString) {
  const diff = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff} min atrás`;
  if (diff < 1440) return `${Math.round(diff / 60)}h atrás`;
  return `${Math.round(diff / 1440)}d atrás`;
}

function batteryIcon(pct) {
  if (pct > 70) return '🟢';
  if (pct > 30) return '🟡';
  return '🔴';
}

export default function IoTSensors({ onSensorData }) {
  const [sensors, setSensors] = useState(DEMO_SENSORS);
  const [source, setSource] = useState('demo');
  const [loading, setLoading] = useState(false);

  async function fetchFromSupabase() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from(SENSOR_TABLE)
        .select('*')
        .order('updated_at', { ascending: false });

      if (!error && data && data.length > 0) {
        setSensors(data);
        setSource('live');
      }
    } catch {
      // keep demo data
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchFromSupabase();

    const channel = supabase
      .channel('sensors-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: SENSOR_TABLE }, (payload) => {
        if (payload.new) {
          setSensors((prev) => {
            const idx = prev.findIndex((s) => s.id === payload.new.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = payload.new;
              return copy;
            }
            return [payload.new, ...prev];
          });
          setSource('live');
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const avgTemp = useMemo(() => {
    if (sensors.length === 0) return null;
    const sum = sensors.reduce((s, d) => s + (d.water_temp || 0), 0);
    return Math.round((sum / sensors.length) * 10) / 10;
  }, [sensors]);

  const avgLevel = useMemo(() => {
    if (sensors.length === 0) return null;
    const sum = sensors.reduce((s, d) => s + (d.water_level || 0), 0);
    return Math.round((sum / sensors.length) * 100) / 100;
  }, [sensors]);

  useEffect(() => {
    if (!onSensorData) return;
    if (source === 'live' && avgTemp != null) {
      onSensorData({ avgTemp, avgLevel, sensorCount: sensors.length, source, sensors });
    } else if (source === 'demo') {
      onSensorData(null);
    }
  }, [avgTemp, avgLevel, sensors.length, source]);

  return (
    <div className="iot-sensors">
      <div className="iot-header">
        <Radio size={12} className={source === 'live' ? 'iot-live-icon' : ''} />
        <span>{source === 'live' ? 'Sensores ao vivo' : 'Dados demonstrativos'}</span>
        <button className="iot-refresh" onClick={fetchFromSupabase} disabled={loading} type="button">
          <RefreshCw size={11} className={loading ? 'spin' : ''} />
        </button>
      </div>

      <div className="iot-summary">
        <div className="iot-stat">
          <Thermometer size={13} />
          <span className="iot-stat-value">{avgTemp ?? '—'}°C</span>
          <span className="iot-stat-label">Água (média)</span>
        </div>
        <div className="iot-stat">
          <Waves size={13} />
          <span className="iot-stat-value">{avgLevel ?? '—'} m</span>
          <span className="iot-stat-label">Nível (média)</span>
        </div>
      </div>

      {/* Alertas */}
      {sensors.some(s => isOffline(s.updated_at)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: '0.75rem', color: '#fca5a5', marginBottom: 6 }}>
          <WifiOff size={12} />
          {sensors.filter(s => isOffline(s.updated_at)).map(s => s.name).join(', ')} — sem sinal há +{OFFLINE_THRESHOLD_MIN}min
        </div>
      )}
      {sensors.some(s => s.battery < 20) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(234,179,8,0.1)', borderRadius: 6, fontSize: '0.75rem', color: '#fde68a', marginBottom: 6 }}>
          <AlertTriangle size={12} />
          Bateria crítica: {sensors.filter(s => s.battery < 20).map(s => `${s.name} (${s.battery}%)`).join(', ')}
        </div>
      )}

      <div className="iot-list">
        {sensors.map((s) => {
          const offline = isOffline(s.updated_at);
          return (
            <div key={s.id} className="iot-row" style={{ opacity: offline ? 0.55 : 1 }}>
              <span className="iot-name">
                {offline && <WifiOff size={10} style={{ color: '#ef4444', marginRight: 3 }} />}
                {s.name}
              </span>
              <span className="iot-temp">{s.water_temp != null ? `${s.water_temp}°C` : '—'}</span>
              <span className="iot-level">{s.water_level != null ? `${s.water_level}m` : '—'}</span>
              {s.water_ph != null && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>pH {s.water_ph}</span>}
              {s.water_turbidity != null && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{s.water_turbidity} NTU</span>}
              <span className="iot-battery" style={{ color: s.battery < 20 ? '#fde68a' : undefined }}>
                {batteryIcon(s.battery)} {s.battery}%
              </span>
              <span className="iot-time" style={{ color: offline ? '#ef4444' : undefined }}>{minutesAgo(s.updated_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function iotSensorSchema() {
  return `
-- Tabela para sensores IoT (v2 — inclui pH e turbidez)
create table if not exists iot_sensors (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  water_temp double precision,
  water_level double precision,
  water_ph double precision,
  water_turbidity double precision,
  battery integer default 100,
  updated_at timestamptz default now()
);

-- Migração (se tabela já existir):
-- alter table iot_sensors add column if not exists water_ph double precision;
-- alter table iot_sensors add column if not exists water_turbidity double precision;

alter table iot_sensors enable row level security;
create policy "Leitura pública sensores" on iot_sensors for select using (true);
create policy "Inserção de sensores" on iot_sensors for insert with check (true);
create policy "Atualização de sensores" on iot_sensors for update using (true);
`;
}
