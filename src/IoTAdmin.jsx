import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Radio, AlertTriangle } from 'lucide-react';
import { supabase } from './supabase.js';
import { useT } from './i18n.jsx';

const SENSOR_TABLE = 'iot_sensors';

const EMPTY_SENSOR = { id: '', name: '', lat: '', lng: '', water_temp: '', water_level: '', water_ph: '', water_turbidity: '', battery: 100 };

export default function IoTAdmin({ authSession }) {
  const t = useT();
  const [sensors, setSensors] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_SENSOR);
  const [status, setStatus] = useState('idle');

  async function loadSensors() {
    const { data } = await supabase.from(SENSOR_TABLE).select('*').order('name');
    if (data) setSensors(data);
  }

  useEffect(() => { loadSensors(); }, []);

  function startAdd() {
    setEditing('new');
    setForm({ ...EMPTY_SENSOR, id: `sensor-${Date.now().toString(36)}` });
  }

  function startEdit(sensor) {
    setEditing(sensor.id);
    setForm({ ...sensor });
  }

  function cancel() {
    setEditing(null);
    setForm(EMPTY_SENSOR);
  }

  async function save() {
    setStatus('saving');
    const row = {
      id: form.id,
      name: form.name,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      water_temp: form.water_temp !== '' ? parseFloat(form.water_temp) : null,
      water_level: form.water_level !== '' ? parseFloat(form.water_level) : null,
      water_ph: form.water_ph !== '' ? parseFloat(form.water_ph) : null,
      water_turbidity: form.water_turbidity !== '' ? parseFloat(form.water_turbidity) : null,
      battery: parseInt(form.battery) || 100,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from(SENSOR_TABLE).upsert(row, { onConflict: 'id' });

    if (error) {
      setStatus('error');
      return;
    }

    setStatus('saved');
    setEditing(null);
    setForm(EMPTY_SENSOR);
    await loadSensors();
    setTimeout(() => setStatus('idle'), 2000);
  }

  async function remove(id) {
    if (!confirm(t('iotConfirmDelete'))) return;
    await supabase.from(SENSOR_TABLE).delete().eq('id', id);
    await loadSensors();
  }

  if (!authSession) {
    return (
      <div className="iot-admin-locked">
        <AlertTriangle size={16} />
        <span>{t('iotLoginRequired')}</span>
      </div>
    );
  }

  return (
    <div className="iot-admin">
      <div className="iot-admin-header">
        <Radio size={13} />
        <span>{sensors.length} {sensors.length !== 1 ? t('iotSensorCountN') : t('iotSensorCount1')}</span>
        <button className="chip-sm" onClick={startAdd} type="button"><Plus size={12} /> {t('iotAdd')}</button>
      </div>

      {editing && (
        <div className="iot-admin-form">
          <div className="iot-form-grid">
            <label>
              <span>{t('iotLabelName')}</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Paso Pache" />
            </label>
            <label>
              <span>{t('iotLabelLat')}</span>
              <input type="number" step="0.0001" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} placeholder="-34.71" />
            </label>
            <label>
              <span>{t('iotLabelLng')}</span>
              <input type="number" step="0.0001" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} placeholder="-56.22" />
            </label>
            <label>
              <span>{t('iotLabelTemp')}</span>
              <input type="number" step="0.1" value={form.water_temp} onChange={(e) => setForm({ ...form, water_temp: e.target.value })} />
            </label>
            <label>
              <span>{t('iotLabelLevel')}</span>
              <input type="number" step="0.01" value={form.water_level} onChange={(e) => setForm({ ...form, water_level: e.target.value })} />
            </label>
            <label>
              <span>{t('iotLabelPh')}</span>
              <input type="number" step="0.1" min="0" max="14" value={form.water_ph} onChange={(e) => setForm({ ...form, water_ph: e.target.value })} placeholder="7.0" />
            </label>
            <label>
              <span>{t('iotLabelTurbidity')}</span>
              <input type="number" step="0.1" min="0" value={form.water_turbidity} onChange={(e) => setForm({ ...form, water_turbidity: e.target.value })} placeholder="10" />
            </label>
            <label>
              <span>{t('iotLabelBattery')}</span>
              <input type="number" min="0" max="100" value={form.battery} onChange={(e) => setForm({ ...form, battery: e.target.value })} />
            </label>
          </div>
          <div className="iot-form-actions">
            <button className="chip-sm" onClick={save} disabled={!form.name || !form.lat || !form.lng} type="button">
              <Save size={12} /> {status === 'saving' ? t('iotSaving') : status === 'saved' ? t('iotSaved') : status === 'error' ? t('error') : t('iotSave')}
            </button>
            <button className="chip-sm" onClick={cancel} type="button">{t('iotCancel')}</button>
          </div>
        </div>
      )}

      <div className="iot-admin-list">
        {sensors.map((s) => (
          <div key={s.id} className="iot-admin-row">
            <div className="iot-admin-info">
              <strong>{s.name}</strong>
              <small>{s.lat.toFixed(4)}, {s.lng.toFixed(4)} · {s.water_temp != null ? `${s.water_temp}°C` : '—'} · {s.water_level != null ? `${s.water_level}m` : '—'}{s.water_ph != null ? ` · pH ${s.water_ph}` : ''}{s.water_turbidity != null ? ` · ${s.water_turbidity} NTU` : ''} · 🔋{s.battery}%</small>
            </div>
            <button className="iot-admin-edit" onClick={() => startEdit(s)} type="button">✏️</button>
            <button className="iot-admin-delete" onClick={() => remove(s.id)} type="button"><Trash2 size={12} /></button>
          </div>
        ))}
        {sensors.length === 0 && <p className="iot-admin-empty">{t('iotNoSensors')}</p>}
      </div>
    </div>
  );
}
