import React, { useMemo, useState } from 'react';
import { Bell, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { generateRecommendations, analyzeSeasonalPatterns, detectHotMonths, MONTHS_PT, MONTHS_ES, MONTHS_EN, SEASONS_PT, SEASONS_ES, SEASONS_EN } from './mlInsights.js';
import { checkLSTMReadiness, LSTM_MIN_SAMPLES } from './lstm.js';
import { useT, useLang } from './i18n.jsx';

const CONFIDENCE_COLOR = (c) => c >= 75 ? '#22c55e' : c >= 55 ? '#eab308' : '#f97316';

export default function PredictiveAlerts({ occurrences, speciesList, currentWeather, selectedSpeciesIds }) {
  const [expanded, setExpanded] = useState(false);
  const t = useT();
  const { lang } = useLang();

  const MONTHS = lang === 'en' ? MONTHS_EN : lang === 'es' ? MONTHS_ES : MONTHS_PT;
  const SEASONS = lang === 'en' ? SEASONS_EN : lang === 'es' ? SEASONS_ES : SEASONS_PT;

  const recommendations = useMemo(() =>
    generateRecommendations(occurrences, speciesList, currentWeather, lang),
    [occurrences, speciesList, currentWeather, lang]
  );

  const hotMonths = useMemo(() => detectHotMonths(occurrences), [occurrences]);

  const lstmStatus = useMemo(() => {
    if (!selectedSpeciesIds?.length) return null;
    return selectedSpeciesIds.map(id => ({
      id,
      name: (() => { const sp = speciesList?.find(s => s.id === id); return sp ? (lang === 'pt' ? sp.namePt : lang === 'es' ? sp.nameEs : sp.nameEn) || sp.name : id; })(),
      ...checkLSTMReadiness(occurrences, id),
    }));
  }, [occurrences, selectedSpeciesIds, speciesList]);

  if (!occurrences || occurrences.length < 3) return null;

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'transparent', border: 'none', color: '#c8e6ff', cursor: 'pointer', gap: 8 }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Zap size={15} color="#eab308" />
          Alertas preditivos
          {recommendations.length > 0 && (
            <span style={{ background: '#eab308', color: '#000', borderRadius: 10, padding: '1px 6px', fontSize: '0.7rem', fontWeight: 800 }}>
              {recommendations.length}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={16} color="#64748b" /> : <ChevronDown size={16} color="#64748b" />}
      </button>

      {expanded && (
        <div style={{ padding: '0 0.75rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Recomendações */}
          {recommendations.length === 0 && (
            <p style={{ color: '#64748b', fontSize: '0.8rem', textAlign: 'center', margin: '4px 0' }}>
              Registre mais capturas para ativar as recomendações personalizadas.
            </p>
          )}

          {recommendations.map((rec, i) => (
            <div key={i} style={{
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${CONFIDENCE_COLOR(rec.confidence)}33`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e5f6ff' }}>
                  {rec.icon} {rec.title}
                </span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 800,
                  color: CONFIDENCE_COLOR(rec.confidence),
                  background: `${CONFIDENCE_COLOR(rec.confidence)}18`,
                  padding: '1px 6px', borderRadius: 8,
                }}>
                  {rec.confidence}%
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0 }}>{rec.body}</p>
            </div>
          ))}

          {/* Meses quentes */}
          {hotMonths.length > 0 && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#e5f6ff', marginBottom: 5 }}>
                🔥 Seus meses mais produtivos
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {hotMonths.map(m => (
                  <span key={m} style={{
                    padding: '2px 8px', borderRadius: 10, fontSize: '0.72rem',
                    background: 'rgba(234,179,8,0.15)', color: '#fde68a',
                    border: '1px solid rgba(234,179,8,0.3)',
                  }}>
                    {MONTHS[m]}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Status LSTM */}
          {lstmStatus?.length > 0 && (
            <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                🤖 LSTM — previsão avançada
              </div>
              {lstmStatus.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>{s.name}</span>
                  {s.ready ? (
                    <span style={{ fontSize: '0.7rem', color: '#22c55e', fontWeight: 700 }}>✓ Pronto</span>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                        <div style={{
                          width: `${Math.min(100, (s.count / LSTM_MIN_SAMPLES) * 100)}%`,
                          height: '100%',
                          background: '#3b82f6',
                          borderRadius: 2,
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{s.count}/{LSTM_MIN_SAMPLES}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
