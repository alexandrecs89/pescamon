import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Droplets, Wind, Thermometer, Fish, Gauge } from 'lucide-react';
import { useT, useLang } from './i18n.jsx';

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fishingScore(day, species) {
  if (!day) return 0;
  let score = 50;

  // Chuva penaliza
  if (day.rain > 10) score -= 20;
  else if (day.rain > 3) score -= 8;
  else if (day.rain === 0) score += 5;

  // Temperatura da água
  const optTemp = species?.preferences?.temperature ?? 18;
  const diff = Math.abs(day.waterTemp - optTemp);
  if (diff <= 2) score += 20;
  else if (diff <= 5) score += 10;
  else if (diff > 10) score -= 15;

  // Vento forte penaliza
  if (day.wind > 35) score -= 15;
  else if (day.wind > 20) score -= 5;

  // Radiação — manhã/tarde é melhor
  if (day.radiation > 15) score += 8;

  // Pressão barométrica
  if (day.pressure) {
    const sensitivity = species?.preferences?.pressureSensitivity ?? 0.5;
    if (day.pressureTrend === 'caindo') score += Math.round(8 * sensitivity);    // frente fria chegando → peixe ativo
    else if (day.pressureTrend === 'subindo') score -= Math.round(4 * sensitivity); // pós-tempestade → adaptação
    if (day.pressure >= 1008 && day.pressure <= 1022) score += Math.round(3 * sensitivity); // faixa ideal
    else if (day.pressure > 1022) score -= Math.round(5 * sensitivity);  // muito alta
    else if (day.pressure < 1000) score -= Math.round(8 * sensitivity);  // muito baixa
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreColor(score) {
  if (score >= 75) return '#22c55e';
  if (score >= 50) return '#f5c800';
  if (score >= 30) return '#f97316';
  return '#ef4444';
}

function scoreLabel(score, lang) {
  const L = {
    pt: ['Excelente','Bom','Regular','Ruim'],
    es: ['Excelente','Bueno','Regular','Malo'],
    en: ['Excellent','Good','Fair','Poor'],
  }[lang] || ['Excelente','Bom','Regular','Ruim'];
  if (score >= 75) return L[0];
  if (score >= 50) return L[1];
  if (score >= 30) return L[2];
  return L[3];
}

function rainIcon(mm) {
  if (mm === 0) return '☀️';
  if (mm < 2) return '🌤️';
  if (mm < 8) return '🌧️';
  return '⛈️';
}

function pressureIcon(trend) {
  if (trend === 'caindo') return '📉';
  if (trend === 'subindo') return '📈';
  return '➡️';
}

function pressureTrendLabel(trend, lang) {
  const labels = {
    pt: { caindo: 'caindo', subindo: 'subindo', estável: 'estável' },
    es: { caindo: 'bajando', subindo: 'subiendo', estável: 'estable' },
    en: { caindo: 'falling', subindo: 'rising', estável: 'stable' },
  };
  return labels[lang]?.[trend] || trend;
}

export default function WeekForecastWidget({ forecast, selectedSpecies, loading }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const t = useT();
  const { lang } = useLang();
  const DAY_NAMES = lang === 'en' ? DAYS_EN : lang === 'es' ? DAYS_ES : DAYS_PT;

  if (loading) {
    return (
      <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ color: '#64748b', fontSize: '0.82rem', textAlign: 'center' }}>⏳ {t('loading')}</div>
      </div>
    );
  }

  if (!forecast || forecast.length === 0) return null;

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'transparent', border: 'none', color: '#c8e6ff', cursor: 'pointer', gap: 8 }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          🎣 {t('weekForecast')}
        </span>
        {expanded ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 0.75rem 0.75rem' }}>
          {/* Day cards */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
            {forecast.map((day, i) => {
              const date = new Date(day.date + 'T12:00:00');
              const dayName = i === 0 ? t('today') : DAY_NAMES[date.getDay()];
              const score = fishingScore(day, selectedSpecies);
              const isSelected = selectedDay === i;

              return (
                <button
                  key={day.date}
                  onClick={() => setSelectedDay(isSelected ? null : i)}
                  style={{
                    flex: '0 0 auto',
                    minWidth: 62,
                    padding: '8px 6px',
                    borderRadius: 10,
                    border: `1px solid ${isSelected ? scoreColor(score) : 'rgba(255,255,255,0.08)'}`,
                    background: isSelected ? `${scoreColor(score)}18` : 'rgba(255,255,255,0.04)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    transition: '150ms ease',
                  }}
                >
                  <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{dayName}</span>
                  <span style={{ fontSize: '1.2rem' }}>{rainIcon(day.rain)}</span>
                  <span style={{ fontSize: '0.78rem', color: scoreColor(score), fontWeight: 800 }}>{score}%</span>
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{day.tempMin}–{day.tempMax}°</span>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          {selectedDay !== null && forecast[selectedDay] && (() => {
            const day = forecast[selectedDay];
            const score = fishingScore(day, selectedSpecies);
            return (
              <div style={{ marginTop: 10, padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: `1px solid ${scoreColor(score)}33` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#e5f6ff', fontWeight: 700, fontSize: '0.88rem' }}>
                    {new Date(day.date + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-UY' : 'pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })}
                  </span>
                  <span style={{ color: scoreColor(score), fontWeight: 800, fontSize: '0.9rem' }}>
                    {scoreLabel(score, lang)} ({score}%)
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Thermometer size={13} color="#f97316" />
                    {t('air')}: {day.tempMin}–{day.tempMax}°C
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Fish size={13} color="#22d3ee" />
                    {t('water')}: ~{day.waterTemp}°C
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Droplets size={13} color="#60a5fa" />
                    {t('rain')}: {day.rain} mm
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Wind size={13} color="#a78bfa" />
                    {t('wind')}: {day.wind} km/h
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    🌅 {day.sunrise} – 🌇 {day.sunset}
                  </div>
                  {day.pressure && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', gridColumn: '1 / -1' }}>
                      <Gauge size={13} color={day.pressureTrend === 'caindo' ? '#22c55e' : day.pressureTrend === 'subindo' ? '#f97316' : '#94a3b8'} />
                      <span style={{ color: day.pressureTrend === 'caindo' ? '#22c55e' : day.pressureTrend === 'subindo' ? '#f97316' : '#94a3b8' }}>
                        {t('pressure')}: {day.pressure} hPa {pressureIcon(day.pressureTrend)} {pressureTrendLabel(day.pressureTrend, lang)}
                      </span>
                    </div>
                  )}
                </div>
                {day.rain > 8 && (
                  <div style={{ marginTop: 8, padding: '5px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 6, fontSize: '0.75rem', color: '#fca5a5' }}>
                    ⚠️ {t('heavyRainWarning')}
                  </div>
                )}
                {fishingScore(day, selectedSpecies) >= 75 && (
                  <div style={{ marginTop: 8, padding: '5px 8px', background: 'rgba(34,197,94,0.1)', borderRadius: 6, fontSize: '0.75rem', color: '#86efac' }}>
                    ✅ {t('excellentConditions')} {selectedSpecies?.name || t('species').toLowerCase()}!
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
