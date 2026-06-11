import { useState, useMemo, useEffect } from 'react';
import {
  X, ChevronRight, ChevronLeft, Calendar, MapPin, Fish,
  Sun, Clock, Check, Star, ExternalLink, Tent, Sunrise, Package,
  User, AlertTriangle, CloudRain, Wind, Thermometer, Droplets,
  FileDown, Download, Share2, Copy, CheckCheck, Crosshair
} from 'lucide-react';
import FishIcon from './FishIcon.jsx';
import { GEAR_DB } from './GearRecommendation.jsx';
import { savePlannedTrip } from './supabase.js';

function buildRecommendedGear(speciesIds) {
  const fields = ['rod', 'reel', 'line', 'hook', 'leader'];
  const labels = { rod: 'Vara', reel: 'Molinete', line: 'Linha', hook: 'Anzol', leader: 'Líder' };
  const seen = {};
  for (const field of fields) seen[field] = new Set();

  for (const id of speciesIds) {
    const db = GEAR_DB[id];
    if (!db) continue;
    const gear = db.general[0];
    for (const field of fields) {
      if (gear[field]) seen[field].add(gear[field]);
    }
  }

  return fields
    .filter((f) => seen[f].size > 0)
    .map((f) => `${labels[f]}: ${[...seen[f]].join(' / ')}`)
    .join(' · ');
}

const STEPS = [
  { id: 'type',     label: 'Tipo de pesca' },
  { id: 'species',  label: 'Espécies' },
  { id: 'location', label: 'Local' },
  { id: 'date',     label: 'Data e horário' },
  { id: 'extras',   label: 'Detalhes' },
  { id: 'summary',  label: 'Itinerário' },
];

function generateItineraryPdf(plan, cell) {
  const now = new Date();
  const fmt = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Itinerário de Pescaria — Pescamon</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,'Segoe UI',sans-serif; color:#1e293b; padding:40px; font-size:13px; }
  h1 { font-size:22px; color:#0f172a; margin-bottom:4px; }
  h2 { font-size:14px; color:#475569; margin:20px 0 8px; border-bottom:2px solid #e2e8f0; padding-bottom:4px; }
  .sub { color:#64748b; font-size:11px; margin-bottom:20px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:16px; }
  .card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; }
  .card-label { font-size:10px; color:#94a3b8; text-transform:uppercase; margin-bottom:2px; }
  .card-value { font-size:15px; font-weight:700; color:#0f172a; }
  .gear { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; margin-top:4px; font-size:12px; }
  .notes { background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:10px 14px; margin-top:4px; font-size:12px; }
  .footer { margin-top:32px; font-size:10px; color:#94a3b8; text-align:center; border-top:1px solid #e2e8f0; padding-top:8px; }
  @media print { body { padding:20px; } }
</style></head><body>
<h1>&#127907; Itinerário de Pescaria</h1>
<p class="sub">Gerado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})} via Pescamon · Rio Santa Lucía</p>
<h2>Planejamento</h2>
<div class="grid">
  <div class="card"><div class="card-label">Tipo</div><div class="card-value">${plan.tripType === 'day' ? 'Pescaria de um dia' : 'Viagem de vários dias'}</div></div>
  <div class="card"><div class="card-label">Grupo</div><div class="card-value">${plan.partySize} pescador${plan.partySize !== 1 ? 'es' : ''}</div></div>
  <div class="card"><div class="card-label">Espécies alvo</div><div class="card-value">${plan.speciesNames.join(', ')}</div></div>
  <div class="card"><div class="card-label">Local</div><div class="card-value">${plan.locationName}${cell ? ` (${cell.probability}%)` : ''}</div></div>
  <div class="card"><div class="card-label">${plan.tripType === 'multi' ? 'Saída' : 'Data'}</div><div class="card-value">${fmt(plan.startDate)} · ${plan.startTime}</div></div>
  <div class="card"><div class="card-label">Retorno</div><div class="card-value">${fmt(plan.endDate)} · ${plan.endTime}</div></div>
</div>
${plan.gear ? `<h2>Equipamentos</h2><div class="gear">${plan.gear}</div>` : ''}
${plan.notes ? `<h2>Notas</h2><div class="notes">${plan.notes}</div>` : ''}
${cell ? `<h2>Dados do local</h2><div class="grid">
  <div class="card"><div class="card-label">Probabilidade</div><div class="card-value">${cell.probability}%</div></div>
  <div class="card"><div class="card-label">Profundidade aprox.</div><div class="card-value">${cell.depth} m</div></div>
  <div class="card"><div class="card-label">Sinuosidade</div><div class="card-value">${cell.sinuosity}%</div></div>
  <div class="card"><div class="card-label">Modelo</div><div class="card-value">${cell.modelType || '—'}</div></div>
</div>` : ''}
<div class="footer">Pescamon Santa Lucía · Modelagem bayesiana espacial · ${now.getFullYear()}</div>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) win.addEventListener('load', () => { setTimeout(() => { win.print(); URL.revokeObjectURL(url); }, 500); });
}

function downloadGpx(plan, cell) {
  if (!cell) return;
  const center = cell.center || (cell.path?.[Math.floor(cell.path.length / 2)] ?? null);
  if (!center) return;
  const [lat, lon] = center;
  const name = (plan.locationName || cell.name || 'Local de pesca').replace(/[<>&"]/g, '');
  const desc = `${plan.speciesNames?.join(', ')} — ${plan.startDate} · Probabilidade: ${cell.probability}%`;
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pescamon" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Pescaria ${plan.startDate}</name><time>${new Date().toISOString()}</time></metadata>
  <wpt lat="${lat}" lon="${lon}"><name>${name}</name><desc>${desc}</desc><sym>Fishing</sym></wpt>
</gpx>`;
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pescamon-${plan.startDate || 'rota'}.gpx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function buildGoogleCalendarUrl(plan) {
  const fmt = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const start = new Date(plan.startDate + 'T' + (plan.startTime || '06:00'));
  const end = new Date(plan.endDate + 'T' + (plan.endTime || '18:00'));
  const title = encodeURIComponent(`🎣 Pescaria — ${plan.speciesNames.join(', ')}`);
  const location = encodeURIComponent(plan.locationName || 'Rio Santa Lucía');
  const details = encodeURIComponent(
    `Espécies: ${plan.speciesNames.join(', ')}\n` +
    `Local: ${plan.locationName}\n` +
    (plan.notes ? `Notas: ${plan.notes}\n` : '') +
    `Equipamentos recomendados: ${plan.gear}\n` +
    `Planejado via Pescamon`
  );
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${location}&details=${details}`;
}

function PlannerShare({ plan, cell }) {
  const [copied, setCopied] = useState(false);

  function buildText() {
    const lines = [
      '🎣 Vou pescar no Rio Santa Lucía!',
      `📍 Local: ${plan.locationName || '—'}${cell ? ` (${cell.probability}% de probabilidade)` : ''}`,
      `📅 Data: ${plan.startDate}${plan.tripType === 'multi' && plan.endDate !== plan.startDate ? ` → ${plan.endDate}` : ''} · ${plan.startTime}–${plan.endTime}`,
      `🐟 Espécies: ${plan.speciesNames?.join(', ') || '—'}`,
      plan.partySize > 1 ? `👥 Grupo: ${plan.partySize} pescadores` : '',
      plan.notes ? `📝 ${plan.notes}` : '',
      '',
      '📲 Planejado com Pescamon — https://pescamon-app.netlify.app',
    ].filter(Boolean).join('\n');
    return lines;
  }

  async function handleShare() {
    const text = buildText();
    if (navigator.share) {
      try {
        await navigator.share({ title: '🎣 Pescaria no Santa Lucía', text });
        return;
      } catch { /* cancelled or unsupported */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <button
      type="button"
      className={`planner-export-btn${copied ? ' copied' : ''}`}
      onClick={handleShare}
      title="Compartilhar pescaria"
    >
      {copied ? <><CheckCheck size={14} /> Copiado!</> : <><Share2 size={14} /> Compartilhar</>}
    </button>
  );
}

export default function FishingPlanner({ isOpen, onClose, speciesList, scoredSegments, watercourseList, climateScenarios, authSession, onOpenAuth, onOpenDashboard }) {
  const wcList = watercourseList || [];
  const [step, setStep] = useState(0);
  const [locationSearch, setLocationSearch] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [forecast, setForecast] = useState(null);
  const [forecastStatus, setForecastStatus] = useState('idle'); // 'idle'|'loading'|'ready'|'error'

  useEffect(() => {
    if (!isOpen) return;
    setForecastStatus('loading');
    fetch(
      'https://api.open-meteo.com/v1/forecast?latitude=-34.735&longitude=-56.275' +
      '&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode' +
      '&timezone=America%2FMontevideo&forecast_days=7'
    )
      .then((r) => r.json())
      .then((data) => {
        const d = data.daily;
        const days = d.time.map((date, i) => ({
          date,
          tMax: d.temperature_2m_max[i],
          tMin: d.temperature_2m_min[i],
          rain: d.precipitation_sum[i],
          wind: d.windspeed_10m_max[i],
          code: d.weathercode[i],
          score: calcFishingScore(d.temperature_2m_max[i], d.precipitation_sum[i], d.windspeed_10m_max[i], d.weathercode[i]),
        }));
        setForecast(days);
        setForecastStatus('ready');
      })
      .catch(() => setForecastStatus('error'));
  }, [isOpen]);

  function calcFishingScore(tMax, rain, wind, code) {
    let s = 100;
    if (tMax > 35) s -= 20; else if (tMax < 10) s -= 15; else if (tMax >= 18 && tMax <= 28) s += 5;
    if (rain > 20) s -= 25; else if (rain > 5) s -= 10; else if (rain === 0) s += 5;
    if (wind > 40) s -= 20; else if (wind > 20) s -= 8;
    if ([95, 96, 99].includes(code)) s -= 30;
    else if ([61, 63, 65, 80, 81, 82].includes(code)) s -= 15;
    else if ([0, 1].includes(code)) s += 10;
    return Math.max(0, Math.min(100, Math.round(s)));
  }

  function wmoIcon(code) {
    if ([0, 1].includes(code)) return '☀️';
    if ([2, 3].includes(code)) return '⛅';
    if ([45, 48].includes(code)) return '🌫️';
    if ([51, 53, 55, 61, 63, 65].includes(code)) return '🌧️';
    if ([80, 81, 82].includes(code)) return '🌦️';
    if ([95, 96, 99].includes(code)) return '⚡';
    return '🌤️';
  }

  function scoreLabel(s) {
    if (s >= 80) return { text: 'Excelente', color: '#22c55e' };
    if (s >= 60) return { text: 'Boa', color: '#eab308' };
    if (s >= 40) return { text: 'Regular', color: '#f97316' };
    return { text: 'Ruim', color: '#ef4444' };
  }

  function fmtDate(iso) {
    const [,, d] = iso.split('-');
    const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    return { day: d, weekday: days[new Date(iso + 'T12:00:00').getDay()] };
  }

  const [plan, setPlan] = useState({
    tripType: null,        // 'day' | 'multi'
    speciesIds: [],
    locationId: null,
    startDate: '',
    endDate: '',
    startTime: '06:00',
    endTime: '18:00',
    partySize: 1,
    gear: '',
    notes: '',
  });

  function update(key, value) {
    setPlan((p) => ({ ...p, [key]: value }));
  }

  function reset() {
    setStep(0);
    setLocationSearch('');
    setSaveStatus('idle');
    setPlan({ tripType: null, speciesIds: [], locationId: null, startDate: '', endDate: '', startTime: '06:00', endTime: '18:00', partySize: 1, gear: '', notes: '' });
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canNext = useMemo(() => {
    const s = STEPS[step].id;
    if (s === 'type') return !!plan.tripType;
    if (s === 'species') return plan.speciesIds.length > 0;
    if (s === 'location') return !!plan.locationId;
    if (s === 'date') return !!plan.startDate && (plan.tripType === 'day' || !!plan.endDate);
    return true;
  }, [step, plan]);

  const selectedWatercourse = wcList.find((w) => w.id === plan.locationId) || null;

  const selectedSpeciesObjs = speciesList.filter((s) => plan.speciesIds.includes(s.id));

  // Normaliza string: remove acentos e converte para minúsculas
  function normalize(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // Filtered watercourse list by search
  const filteredWatercourses = useMemo(() => {
    if (!locationSearch.trim()) return wcList;
    const q = normalize(locationSearch.trim());
    return wcList.filter((w) => normalize(w.name).includes(q));
  }, [wcList, locationSearch]);

  // Best scored segment inside the selected watercourse (across scoredSegments for main river)
  const bestKeyPoint = useMemo(() => {
    if (!scoredSegments || scoredSegments.length === 0) return null;
    return scoredSegments[0];
  }, [scoredSegments]);

  const summaryPlan = {
    ...plan,
    speciesNames: selectedSpeciesObjs.map((s) => s.name),
    locationName: selectedWatercourse?.name || '',
    gear: selectedSpeciesObjs.map((s) => s.name).join(' / '),
    endDate: plan.tripType === 'day' ? plan.startDate : plan.endDate,
  };

  if (!isOpen) return null;

  const currentStepId = STEPS[step].id;

  return (
    <div className="planner-overlay" onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className="planner-modal">

        {/* Header */}
        <div className="planner-header">
          <div className="planner-title">
            <Fish size={20} />
            <span>Planejar pescaria</span>
          </div>
          <button className="planner-close" onClick={handleClose} type="button"><X size={18} /></button>
        </div>

        {/* Step bar */}
        <div className="planner-steps">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`planner-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}`}>
              <div className="planner-step-dot">{i < step ? <Check size={10} /> : i + 1}</div>
              <span className="planner-step-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="planner-body">

          {/* STEP 1 — Tipo */}
          {currentStepId === 'type' && (
            <div className="planner-section">
              <h3>Que tipo de pescaria você planeja?</h3>
              <div className="planner-type-cards">
                <button
                  type="button"
                  className={`planner-type-card${plan.tripType === 'day' ? ' selected' : ''}`}
                  onClick={() => update('tripType', 'day')}
                >
                  <Sunrise size={36} />
                  <strong>Pescaria de um dia</strong>
                  <p>Saída e retorno no mesmo dia</p>
                </button>
                <button
                  type="button"
                  className={`planner-type-card${plan.tripType === 'multi' ? ' selected' : ''}`}
                  onClick={() => update('tripType', 'multi')}
                >
                  <Tent size={36} />
                  <strong>Viagem de vários dias</strong>
                  <p>Acampamento ou hospedagem</p>
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 — Espécies */}
          {currentStepId === 'species' && (
            <div className="planner-section">
              <h3>Quais espécies você quer pescar?</h3>
              <p className="planner-hint">Selecione uma ou mais espécies.</p>
              <div className="planner-species-grid">
                {[...speciesList].sort((a, b) => a.name.localeCompare(b.name, 'pt')).map((sp) => {
                  const sel = plan.speciesIds.includes(sp.id);
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      className={`planner-species-card${sel ? ' selected' : ''}`}
                      onClick={() => update('speciesIds', sel
                        ? plan.speciesIds.filter((x) => x !== sp.id)
                        : [...plan.speciesIds, sp.id]
                      )}
                    >
                      <span className="planner-swatch" style={{ background: sp.color }} />
                      <FishIcon speciesId={sp.id} color={sp.color} size={34} />
                      <div>
                        <strong>{sp.name}</strong>
                        <em>{sp.scientificName}</em>
                      </div>
                      {sel && <Check size={14} className="planner-check" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3 — Local */}
          {currentStepId === 'location' && (
            <div className="planner-section">
              <h3>Onde você quer pescar?</h3>
              <p className="planner-hint">Selecione o curso d'água onde deseja pescar.</p>
              <div className="planner-location-search">
                <MapPin size={14} />
                <input
                  type="text"
                  placeholder="Buscar por nome…"
                  value={locationSearch}
                  onChange={(e) => setLocationSearch(e.target.value)}
                  autoFocus
                />
                {locationSearch && (
                  <button type="button" className="planner-search-clear" onClick={() => setLocationSearch('')}>
                    <X size={13} />
                  </button>
                )}
              </div>
              <div className="planner-location-list">
                {filteredWatercourses.length === 0 && (
                  <p className="planner-hint" style={{ textAlign: 'center', marginTop: 16 }}>Nenhum local encontrado.</p>
                )}
                {filteredWatercourses.map((w, idx) => {
                  const icon = w.type === 'rio' ? '🌊' : w.type === 'canada' ? '🌿' : w.type === 'quebrada' ? '⛰️' : w.type === 'canal' ? '🏗️' : '〰️';
                  const wcLabel = w.type === 'rio' ? 'Rio' : w.type === 'canada' ? 'Cañada' : w.type === 'quebrada' ? 'Quebrada' : w.type === 'canal' ? 'Canal' : 'Arroio';
                  const sel = plan.locationId === w.id;
                  // Badges de destaque
                  const badges = [];
                  // Alerta de qualidade da água (poluição) - prioridade máxima
                  if (w.waterQuality < 50) {
                    badges.push({ label: '⚠️ Possivelmente poluído', color: '#ef4444' });
                  } else if (w.waterQuality < 65) {
                    badges.push({ label: '⚡ Qualidade duvidosa', color: '#f97316' });
                  }
                  if (idx === 0 && w.distKm < 5) badges.push({ label: 'Perto de você', color: '#22c55e' });
                  else if (idx === 0) badges.push({ label: 'Mais próximo', color: '#22c55e' });
                  const closestBig = filteredWatercourses.find((x) => x.hasBigFish);
                  if (w.id === closestBig?.id && w.hasBigFish) badges.push({ label: 'Monstros te aguardam', color: '#f59e0b' });
                  const mostPopular = [...filteredWatercourses].sort((a, b) => b.occurrenceCount - a.occurrenceCount)[0];
                  if (w.id === mostPopular?.id && w.occurrenceCount > 0) badges.push({ label: 'Favorito dos pescadores', color: '#a78bfa' });
                  return (
                    <button
                      key={w.id}
                      type="button"
                      className={`planner-location-row${sel ? ' selected' : ''}`}
                      onClick={() => update('locationId', w.id)}
                    >
                      <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>{icon}</span>
                      <div className="planner-location-info">
                        {badges.length > 0 && (
                          <span className="wc-badges" style={{ marginBottom: 2 }}>
                            {badges.map((b) => (
                              <span key={b.label} className="wc-badge" style={{ background: b.color + '22', color: b.color, borderColor: b.color + '55' }}>{b.label}</span>
                            ))}
                          </span>
                        )}
                        <strong>{w.name}</strong>
                        <span>{wcLabel} · {w.distKm < 1 ? `${Math.round(w.distKm * 1000)}m` : `${w.distKm.toFixed(1)}km`}{w.avgProb > 0 ? ` · ${w.avgProb}% prob` : ''}{w.occurrenceCount > 0 ? ` · ⭐ ${w.occurrenceCount} capturas` : ''}{w.waterQuality ? ` · 💧 ${w.waterQuality}% qualidade` : ''}</span>
                      </div>
                      {sel && <Check size={14} className="planner-check" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 4 — Data */}
          {currentStepId === 'date' && (
            <div className="planner-section">
              <h3>Quando você vai pescar?</h3>

              {/* Forecast strip */}
              {forecastStatus === 'loading' && (
                <p className="planner-hint" style={{textAlign:'center'}}>Carregando previsão do tempo…</p>
              )}
              {forecastStatus === 'ready' && forecast && (
                <div className="planner-forecast-strip">
                  <div className="planner-forecast-label"><Sun size={13} /> Previsão 7 dias — selecione uma data</div>
                  <div className="planner-forecast-days">
                    {forecast.map((day) => {
                      const { day: d, weekday } = fmtDate(day.date);
                      const sel = plan.startDate === day.date;
                      const lbl = scoreLabel(day.score);
                      return (
                        <button
                          key={day.date}
                          type="button"
                          className={`planner-forecast-day${sel ? ' selected' : ''}`}
                          onClick={() => {
                            update('startDate', day.date);
                            if (plan.tripType === 'day') update('endDate', day.date);
                          }}
                        >
                          <span className="pf-weekday">{weekday}</span>
                          <span className="pf-day">{d}</span>
                          <span className="pf-icon">{wmoIcon(day.code)}</span>
                          <span className="pf-temp">{Math.round(day.tMax)}°/{Math.round(day.tMin)}°</span>
                          <span className="pf-score" style={{color: lbl.color}}>{lbl.text}</span>
                          {day.rain > 0 && <span className="pf-rain">{day.rain}mm</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Selected day detail */}
              {forecastStatus === 'ready' && plan.startDate && (() => {
                const day = forecast?.find((d) => d.date === plan.startDate);
                if (!day) return null;
                const lbl = scoreLabel(day.score);
                return (
                  <div className="planner-forecast-detail">
                    <div className="pfd-row"><Thermometer size={13} /> <span>Temperatura</span> <strong>{Math.round(day.tMin)}°–{Math.round(day.tMax)}°C</strong></div>
                    <div className="pfd-row"><CloudRain size={13} /> <span>Chuva</span> <strong>{day.rain} mm</strong></div>
                    <div className="pfd-row"><Wind size={13} /> <span>Vento máx.</span> <strong>{day.wind} km/h</strong></div>
                    <div className="pfd-row"><Fish size={13} /> <span>Score de pesca</span> <strong style={{color: lbl.color}}>{day.score}/100 — {lbl.text}</strong></div>
                  </div>
                );
              })()}

              <div className="planner-date-grid">
                <label>
                  <span>{plan.tripType === 'multi' ? 'Data de saída' : 'Data'}</span>
                  <input type="date" value={plan.startDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => { update('startDate', e.target.value); if (plan.tripType === 'day') update('endDate', e.target.value); }} />
                </label>
                {plan.tripType === 'multi' && (
                  <label>
                    <span>Data de retorno</span>
                    <input type="date" value={plan.endDate} min={plan.startDate || new Date().toISOString().split('T')[0]} onChange={(e) => update('endDate', e.target.value)} />
                  </label>
                )}
                <label>
                  <span>Horário de saída</span>
                  <input type="time" value={plan.startTime} onChange={(e) => update('startTime', e.target.value)} />
                </label>
                <label>
                  <span>Horário de retorno</span>
                  <input type="time" value={plan.endTime} onChange={(e) => update('endTime', e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {/* STEP 5 — Extras */}
          {currentStepId === 'extras' && (
            <div className="planner-section">
              <h3>Detalhes adicionais</h3>
              <div className="planner-extras-grid">
                <label>
                  <span>Número de pescadores</span>
                  <div className="planner-counter">
                    <button type="button" onClick={() => update('partySize', Math.max(1, plan.partySize - 1))}>−</button>
                    <span>{plan.partySize}</span>
                    <button type="button" onClick={() => update('partySize', plan.partySize + 1)}>+</button>
                  </div>
                </label>
                <label>
                  <span>Equipamentos principais (opcional)</span>
                  <input type="text" placeholder="Ex: vara 2m, carretilha, multifilamento 30lb…" value={plan.gear} onChange={(e) => update('gear', e.target.value)} />
                  <button
                    type="button"
                    className="planner-gear-autofill"
                    onClick={() => update('gear', buildRecommendedGear(plan.speciesIds))}
                  >
                    <Package size={12} /> Adicionar equipamento recomendado
                  </button>
                </label>
                <label className="planner-notes-label">
                  <span>Notas adicionais (opcional)</span>
                  <textarea rows={3} placeholder="Observações, combinações com o grupo, etc." value={plan.notes} onChange={(e) => update('notes', e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {/* STEP 6 — Resumo */}
          {currentStepId === 'summary' && (
            <div className="planner-section">
              <h3>Seu itinerário</h3>
              <div className="planner-summary">

                <div className="summary-row">
                  <div className="summary-icon"><Sun size={16} /></div>
                  <div>
                    <span className="summary-label">Tipo de pescaria</span>
                    <strong>{plan.tripType === 'day' ? 'Pescaria de um dia' : 'Viagem de vários dias'}</strong>
                  </div>
                </div>

                <div className="summary-row">
                  <div className="summary-icon"><Fish size={16} /></div>
                  <div>
                    <span className="summary-label">Espécies alvo</span>
                    <strong>{summaryPlan.speciesNames.join(', ')}</strong>
                  </div>
                </div>

                <div className="summary-row">
                  <div className="summary-icon"><MapPin size={16} /></div>
                  <div>
                    <span className="summary-label">Local</span>
                    <strong>{summaryPlan.locationName}</strong>
                    {selectedWatercourse && selectedWatercourse.avgProb > 0 && (
                      <span className="summary-prob">{selectedWatercourse.avgProb}% probabilidade média</span>
                    )}
                  </div>
                </div>

                {bestKeyPoint && selectedWatercourse?.id === '__santa_lucia__' && (
                  <div className="summary-row">
                    <div className="summary-icon"><Crosshair size={16} /></div>
                    <div>
                      <span className="summary-label">Ponto chave recomendado</span>
                      <strong>{bestKeyPoint.name}</strong>
                      <span className="summary-prob">{bestKeyPoint.probability}% — trecho com maior probabilidade para as espécies selecionadas</span>
                    </div>
                  </div>
                )}

                <div className="summary-row">
                  <div className="summary-icon"><Calendar size={16} /></div>
                  <div>
                    <span className="summary-label">Data e horário</span>
                    <strong>
                      {plan.startDate}{plan.tripType === 'multi' && plan.endDate !== plan.startDate ? ` → ${plan.endDate}` : ''}
                      {' · '}{plan.startTime} – {plan.endTime}
                    </strong>
                  </div>
                </div>

                <div className="summary-row">
                  <div className="summary-icon"><Clock size={16} /></div>
                  <div>
                    <span className="summary-label">Grupo</span>
                    <strong>{plan.partySize} pescador{plan.partySize !== 1 ? 'es' : ''}</strong>
                  </div>
                </div>

                {plan.gear && (
                  <div className="summary-row">
                    <div className="summary-icon"><Fish size={16} /></div>
                    <div>
                      <span className="summary-label">Equipamentos</span>
                      <strong>{plan.gear}</strong>
                    </div>
                  </div>
                )}

                {plan.notes && (
                  <div className="summary-row">
                    <div className="summary-icon"><ChevronRight size={16} /></div>
                    <div>
                      <span className="summary-label">Notas</span>
                      <strong>{plan.notes}</strong>
                    </div>
                  </div>
                )}

                <div className="planner-summary-actions">
                  <a
                    href={buildGoogleCalendarUrl(summaryPlan)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="planner-gcal-btn"
                  >
                    <ExternalLink size={15} />
                    Google Calendar
                  </a>

                  {authSession ? (
                    <button
                      type="button"
                      className={`planner-save-btn${saveStatus === 'saved' ? ' saved' : ''}`}
                      disabled={saveStatus === 'saving' || saveStatus === 'saved'}
                      onClick={async () => {
                        setSaveStatus('saving');
                        try {
                          await savePlannedTrip({ ...summaryPlan, id: Date.now(), createdAt: new Date().toISOString() });
                          setSaveStatus('saved');
                        } catch { setSaveStatus('error'); }
                      }}
                    >
                      {saveStatus === 'saving' ? <><Clock size={14}/> Salvando…</> :
                       saveStatus === 'saved' ? <><Check size={14}/> Salvo no perfil</> :
                       saveStatus === 'error' ? <><AlertTriangle size={14}/> Erro, tente novamente</> :
                       <><User size={14}/> Salvar no perfil</>}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="planner-save-btn planner-save-login"
                      onClick={() => { handleClose(); onOpenAuth?.(); }}
                    >
                      <User size={14}/> Entre para salvar no perfil
                    </button>
                  )}
                </div>

                <div className="planner-export-actions">
                  <button
                    type="button"
                    className="planner-export-btn"
                    onClick={() => generateItineraryPdf(summaryPlan, bestKeyPoint)}
                    title="Exportar itinerário em PDF"
                  >
                    <FileDown size={14} /> PDF
                  </button>
                  <button
                    type="button"
                    className="planner-export-btn"
                    onClick={() => downloadGpx(summaryPlan, bestKeyPoint)}
                    disabled={!bestKeyPoint}
                    title="Baixar rota GPX para GPS/apps de navegação"
                  >
                    <Download size={14} /> GPX
                  </button>
                  <PlannerShare plan={summaryPlan} cell={bestKeyPoint} />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer nav */}
        <div className="planner-footer">
          <button
            type="button"
            className="planner-btn planner-btn-back"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            <ChevronLeft size={16} /> Voltar
          </button>
          <div className="planner-step-counter">{step + 1} / {STEPS.length}</div>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              className="planner-btn planner-btn-next"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext}
            >
              Avançar <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="planner-btn planner-btn-next"
              disabled={saveStatus === 'saving'}
              onClick={async () => {
                if (authSession && saveStatus === 'idle') {
                  setSaveStatus('saving');
                  try {
                    await savePlannedTrip({ ...summaryPlan, id: Date.now(), createdAt: new Date().toISOString() });
                    setSaveStatus('saved');
                  } catch {
                    setSaveStatus('error');
                  }
                }
                handleClose();
              }}
            >
              {saveStatus === 'saving' ? <><Clock size={16} /> Salvando…</> : <><Check size={16} /> Concluir</>}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
