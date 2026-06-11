import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle, Droplets, Fish, Radio,
  RefreshCw, ThermometerSun, Waves, WifiOff, X, Zap
} from 'lucide-react';
import { supabase } from './supabase.js';
import { useT } from './i18n.jsx';

const OFFLINE_MIN = 30;
const PH_NORMAL = [6.5, 8.5];
const TURBIDITY_HIGH = 50; // NTU
const TEMP_ALERT_HIGH = 28; // °C — stress térmico para peixes
const TEMP_ALERT_LOW = 8;   // °C

function minutesAgo(iso) {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'agora';
  if (diff < 60) return `${diff} min atrás`;
  if (diff < 1440) return `${Math.round(diff / 60)}h atrás`;
  return `${Math.round(diff / 1440)}d atrás`;
}

function qualityColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#eab308';
  if (score >= 30) return '#f97316';
  return '#ef4444';
}

function qualityLabel(score, t) {
  if (score >= 75) return t ? t('wqGood') : 'Boa';
  if (score >= 50) return t ? t('wqFair') : 'Regular';
  if (score >= 30) return t ? t('wqPoor') : 'Ruim';
  return t ? t('wqCritical') : 'Crítica';
}

function phStatus(ph) {
  if (ph == null) return null;
  if (ph < PH_NORMAL[0]) return { label: `pH ${ph} — ácido`, color: '#f97316', severity: 'warn' };
  if (ph > PH_NORMAL[1]) return { label: `pH ${ph} — alcalino`, color: '#a78bfa', severity: 'warn' };
  return { label: `pH ${ph} — normal`, color: '#22c55e', severity: 'ok' };
}

function buildAlerts(sensors, waterQualityMap, dischargeData) {
  const alerts = [];

  // Alertas de sensores IoT
  for (const s of sensors) {
    const offline = (Date.now() - new Date(s.updated_at).getTime()) / 60000 > OFFLINE_MIN;
    if (offline) alerts.push({ id: `offline-${s.id}`, type: 'error', icon: '📡', text: `Sensor "${s.name}" sem sinal há +${OFFLINE_MIN}min` });
    if (!offline && s.battery < 20) alerts.push({ id: `bat-${s.id}`, type: 'warn', icon: '🔋', text: `Bateria crítica: ${s.name} (${s.battery}%)` });
    if (!offline && s.water_temp > TEMP_ALERT_HIGH) alerts.push({ id: `temp-high-${s.id}`, type: 'warn', icon: '🌡️', text: `Temperatura alta: ${s.name} — ${s.water_temp}°C (stress térmico para peixes)` });
    if (!offline && s.water_temp < TEMP_ALERT_LOW) alerts.push({ id: `temp-low-${s.id}`, type: 'info', icon: '❄️', text: `Temperatura baixa: ${s.name} — ${s.water_temp}°C` });
    if (!offline && s.water_ph != null) {
      const p = phStatus(s.water_ph);
      if (p?.severity !== 'ok') alerts.push({ id: `ph-${s.id}`, type: 'warn', icon: '⚗️', text: `${p.label} em ${s.name}` });
    }
    if (!offline && s.water_turbidity > TURBIDITY_HIGH) alerts.push({ id: `turb-${s.id}`, type: 'warn', icon: '🌊', text: `Turbidez alta: ${s.name} — ${s.water_turbidity} NTU` });
  }

  // Alertas de vazão
  if (dischargeData?.alerts?.length > 0) {
    for (const a of dischargeData.alerts) {
      const isFlood = a.type.startsWith('flood');
      alerts.push({
        id: `discharge-${a.day}`,
        type: isFlood ? 'error' : 'warn',
        icon: isFlood ? '🌊' : '🏜️',
        text: `${a.label} prevista em ${a.day} — ${Math.round(a.value)} m³/s`,
      });
    }
  }

  // Alertas de qualidade dos cursos
  for (const [wid, wq] of Object.entries(waterQualityMap || {})) {
    if (wq?.score < 30) alerts.push({ id: `wq-${wid}`, type: 'error', icon: '☣️', text: `Qualidade crítica: ${wq.name || wid} (${wq.score}/100)` });
  }

  return alerts;
}

export default function EnvironmentalDashboard({ isOpen, onClose, sensors = [], waterQualityMap = {}, dischargeData, occurrences = [], watercourseList = [] }) {
  const t = useT();
  const [wqData, setWqData] = useState({});
  const [loadingWq, setLoadingWq] = useState(false);
  const [tab, setTab] = useState('overview'); // overview | sensors | quality | catches

  // Carrega relatórios de qualidade da água do Supabase
  useEffect(() => {
    if (!isOpen) return;
    setLoadingWq(true);
    supabase.from('water_quality_data').select('*').order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const grouped = {};
        for (const r of data) {
          if (!grouped[r.watercourse_id] || r.source_type === 'official') grouped[r.watercourse_id] = r;
        }
        setWqData(grouped);
      })
      .finally(() => setLoadingWq(false));
  }, [isOpen]);

  const alerts = useMemo(() => buildAlerts(sensors, wqData, dischargeData), [sensors, wqData, dischargeData]);

  const onlineSensors = sensors.filter(s => (Date.now() - new Date(s.updated_at).getTime()) / 60000 <= OFFLINE_MIN);
  const avgTemp = onlineSensors.length > 0 ? (onlineSensors.reduce((s, x) => s + (x.water_temp || 0), 0) / onlineSensors.length).toFixed(1) : null;
  const avgPh = onlineSensors.filter(s => s.water_ph != null).length > 0
    ? (onlineSensors.filter(s => s.water_ph != null).reduce((s, x) => s + x.water_ph, 0) / onlineSensors.filter(s => s.water_ph != null).length).toFixed(1)
    : null;

  // Capturas por zona (agrupa por watercourse mais próximo)
  const catchesByZone = useMemo(() => {
    const map = {};
    for (const o of occurrences) {
      const wid = o.watercourseId || '__other__';
      const wname = watercourseList.find(w => w.id === wid)?.name || 'Outros';
      if (!map[wname]) map[wname] = { name: wname, count: 0, species: new Set() };
      map[wname].count++;
      if (o.speciesId) map[wname].species.add(o.speciesId);
    }
    return Object.values(map).map(z => ({ ...z, species: z.species.size })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [occurrences, watercourseList]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 780, maxHeight: '90vh',
        background: '#0f2233', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Droplets size={20} color="#22d3ee" />
            <div>
              <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#e5f6ff' }}>{t('envDashTitle')}</h2>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>{t('envDashSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* KPI bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { icon: <Radio size={14} color="#22d3ee" />, label: t('envSensorsOnline'), value: `${onlineSensors.length}/${sensors.length}`, color: onlineSensors.length === sensors.length ? '#22c55e' : '#f97316' },
            { icon: <ThermometerSun size={14} color="#f97316" />, label: t('envAvgTemp'), value: avgTemp ? `${avgTemp}°C` : '—', color: avgTemp > TEMP_ALERT_HIGH ? '#ef4444' : '#e5f6ff' },
            { icon: <Zap size={14} color="#a78bfa" />, label: t('envAvgPh'), value: avgPh ?? '—', color: '#e5f6ff' },
            { icon: <AlertTriangle size={14} color="#eab308" />, label: t('envActiveAlerts'), value: alerts.length, color: alerts.filter(a => a.type === 'error').length > 0 ? '#ef4444' : alerts.length > 0 ? '#eab308' : '#22c55e' },
          ].map((kpi, i) => (
            <div key={i} style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: '0.72rem' }}>{kpi.icon}{kpi.label}</div>
              <span style={{ fontSize: '1.1rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0 12px' }}>
          {[
            { id: 'overview', label: t('envTabOverview') },
            { id: 'sensors', label: t('envTabSensors') },
            { id: 'quality', label: t('envTabQuality') },
            { id: 'catches', label: t('envTabCatches') },
          ].map(ti => (
            <button key={ti.id} onClick={() => setTab(ti.id)} style={{
              padding: '10px 14px', fontSize: '0.78rem', fontWeight: tab === ti.id ? 700 : 400,
              color: tab === ti.id ? '#22d3ee' : '#64748b',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${tab === ti.id ? '#22d3ee' : 'transparent'}`,
              transition: '150ms',
            }}>{ti.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* VISÃO GERAL */}
          {tab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Alertas */}
              {alerts.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)', color: '#86efac', fontSize: '0.82rem' }}>
                  <CheckCircle size={16} /> {t('envNoAlerts')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('envActiveAlerts')}</h4>
                  {alerts.map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px',
                      borderRadius: 8, fontSize: '0.8rem',
                      background: a.type === 'error' ? 'rgba(239,68,68,0.08)' : a.type === 'warn' ? 'rgba(234,179,8,0.08)' : 'rgba(59,130,246,0.08)',
                      border: `1px solid ${a.type === 'error' ? 'rgba(239,68,68,0.25)' : a.type === 'warn' ? 'rgba(234,179,8,0.25)' : 'rgba(59,130,246,0.25)'}`,
                      color: a.type === 'error' ? '#fca5a5' : a.type === 'warn' ? '#fde68a' : '#93c5fd',
                    }}>
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>{a.icon}</span>
                      <span>{a.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Vazão */}
              {dischargeData && (
                <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Waves size={13} /> {t('envDischarge')}
                  </h4>
                  <div style={{ display: 'flex', gap: 20, fontSize: '0.82rem', color: '#94a3b8' }}>
                    <span>{t('envCurrent')}: <strong style={{ color: '#e5f6ff' }}>{dischargeData.current} m³/s</strong></span>
                    <span>{t('envTrend')}: <strong style={{ color: dischargeData.trend === 'subindo' ? '#f97316' : dischargeData.trend === 'caindo' ? '#22d3ee' : '#94a3b8' }}>{dischargeData.trend}</strong></span>
                    <span>{t('envAvg30')}: <strong style={{ color: '#e5f6ff' }}>{dischargeData.avg30} m³/s</strong></span>
                  </div>
                </div>
              )}

              {/* Resumo capturas */}
              <div style={{ padding: '12px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Fish size={13} /> {t('envCapturesRegistered')}
                </h4>
                <div style={{ display: 'flex', gap: 20, fontSize: '0.82rem', color: '#94a3b8' }}>
                  <span>{t('envTotal')}: <strong style={{ color: '#e5f6ff' }}>{occurrences.length}</strong></span>
                  <span>{t('envThisMonth')}: <strong style={{ color: '#e5f6ff' }}>
                    {occurrences.filter(o => {
                      const d = new Date(o.date), n = new Date();
                      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
                    }).length}
                  </strong></span>
                  <span>{t('envActiveZones')}: <strong style={{ color: '#e5f6ff' }}>{catchesByZone.length}</strong></span>
                </div>
              </div>
            </div>
          )}

          {/* SENSORES */}
          {tab === 'sensors' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sensors.length === 0 && <p style={{ color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>{t('envNoSensors')}</p>}
              {sensors.map(s => {
                const offline = (Date.now() - new Date(s.updated_at).getTime()) / 60000 > OFFLINE_MIN;
                const ph = phStatus(s.water_ph);
                return (
                  <div key={s.id} style={{
                    padding: '12px 14px', borderRadius: 10, opacity: offline ? 0.6 : 1,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${offline ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#e5f6ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {offline ? <WifiOff size={13} color="#ef4444" /> : <Radio size={13} color="#22c55e" />}
                        {s.name}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: offline ? '#ef4444' : '#64748b' }}>
                        {offline ? t('envOffline') : '●'} {minutesAgo(s.updated_at)}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px 12px', fontSize: '0.78rem', color: '#94a3b8' }}>
                      <span>🌡️ {s.water_temp != null ? `${s.water_temp}°C` : '—'}</span>
                      <span>🌊 {s.water_level != null ? `${s.water_level}m` : '—'}</span>
                      <span style={{ color: s.battery < 20 ? '#fde68a' : undefined }}>🔋 {s.battery}%</span>
                      {s.water_ph != null && <span style={{ color: ph?.color }}>⚗️ pH {s.water_ph}</span>}
                      {s.water_turbidity != null && <span style={{ color: s.water_turbidity > TURBIDITY_HIGH ? '#f97316' : undefined }}>🌫️ {s.water_turbidity} NTU</span>}
                      <span style={{ color: '#475569', fontSize: '0.7rem' }}>📍 {s.lat?.toFixed(3)}, {s.lng?.toFixed(3)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* QUALIDADE DA ÁGUA */}
          {tab === 'quality' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loadingWq && <p style={{ color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>{t('envLoadingQuality')}</p>}
              {!loadingWq && Object.keys(wqData).length === 0 && (
                <p style={{ color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>{t('envNoQuality')}</p>
              )}
              {Object.entries(wqData).map(([wid, wq]) => {
                const wname = watercourseList.find(w => w.id === wid)?.name || wq.watercourse_name || wid;
                const score = wq.score ?? 50;
                return (
                  <div key={wid} style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: `1px solid ${qualityColor(score)}33` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e5f6ff' }}>{wname}</span>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: qualityColor(score), background: `${qualityColor(score)}15`, padding: '2px 8px', borderRadius: 8 }}>
                        {qualityLabel(score, t)} · {score}/100
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                        <div style={{ width: `${score}%`, height: '100%', background: qualityColor(score), borderRadius: 3 }} />
                      </div>
                    </div>
                    {wq.description && <p style={{ margin: '5px 0 0', fontSize: '0.73rem', color: '#64748b' }}>{wq.description}</p>}
                    <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#475569' }}>
                      Fonte: {wq.source_type === 'official' ? t('envSourceOfficial') : t('envSourceCommunity')} · {wq.updated_at ? minutesAgo(wq.updated_at) : '—'}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* CAPTURAS POR ZONA */}
          {tab === 'catches' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h4 style={{ margin: '0 0 4px', fontSize: '0.8rem', color: '#64748b' }}>{t('envTop8Zones')}</h4>
              {catchesByZone.length === 0 && <p style={{ color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>{t('envNoCatches')}</p>}
              {catchesByZone.map((z, i) => {
                const max = catchesByZone[0]?.count || 1;
                return (
                  <div key={z.name}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', color: '#e5f6ff' }}>#{i + 1} {z.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{z.count} {z.count !== 1 ? t('envCatchesPlural') : t('envCatchesSingular')} · {z.species} {z.species !== 1 ? t('envSpeciesPlural') : t('envSpeciesSingular')}</span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 3 }}>
                      <div style={{ width: `${(z.count / max) * 100}%`, height: '100%', background: '#22d3ee', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}

              {/* Distribuição mensal */}
              {occurrences.length > 0 && (() => {
                const monthly = Array(12).fill(0);
                for (const o of occurrences) {
                  const m = new Date(o.date).getMonth();
                  if (!isNaN(m)) monthly[m]++;
                }
                const months = t('envMonths').split(',');
                const max = Math.max(...monthly, 1);
                return (
                  <>
                    <h4 style={{ margin: '12px 0 6px', fontSize: '0.8rem', color: '#64748b' }}>{t('envMonthlyDist')}</h4>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 60 }}>
                      {monthly.map((count, m) => (
                        <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <div style={{ width: '100%', height: Math.round((count / max) * 48) || 2, background: count > 0 ? '#22d3ee' : 'rgba(255,255,255,0.08)', borderRadius: 2 }} />
                          <span style={{ fontSize: '0.55rem', color: '#475569' }}>{months[m]}</span>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
