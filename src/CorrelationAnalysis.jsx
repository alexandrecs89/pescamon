import React, { useMemo } from 'react';
import { BarChart3 } from 'lucide-react';

function tempBucket(temp) {
  if (temp < 12) return '< 12°C';
  if (temp < 15) return '12-15°C';
  if (temp < 18) return '15-18°C';
  if (temp < 21) return '18-21°C';
  if (temp < 24) return '21-24°C';
  return '> 24°C';
}

function levelBucket(level) {
  if (level < 1.0) return '< 1.0m';
  if (level < 1.5) return '1.0-1.5m';
  if (level < 2.0) return '1.5-2.0m';
  if (level < 2.5) return '2.0-2.5m';
  return '> 2.5m';
}

function hourBucket(hour) {
  if (hour < 6) return 'Madrugada';
  if (hour < 10) return 'Manhã cedo';
  if (hour < 14) return 'Meio-dia';
  if (hour < 18) return 'Tarde';
  if (hour < 21) return 'Entardecer';
  return 'Noite';
}

export default function CorrelationAnalysis({ occurrences, speciesList, sensorData, climateData }) {
  const analysis = useMemo(() => {
    if (occurrences.length < 3) return null;

    const bySpecies = {};

    for (const o of occurrences) {
      if (!o.date) continue;
      const sp = o.speciesId;
      if (!bySpecies[sp]) bySpecies[sp] = { hours: {}, temps: {}, levels: {}, count: 0 };

      const hour = new Date(o.date).getHours();
      const hb = hourBucket(hour);
      bySpecies[sp].hours[hb] = (bySpecies[sp].hours[hb] || 0) + 1;

      if (climateData) {
        const tb = tempBucket(climateData.waterTemperature);
        bySpecies[sp].temps[tb] = (bySpecies[sp].temps[tb] || 0) + 1;
      }

      if (sensorData && sensorData.avgLevel) {
        const lb = levelBucket(sensorData.avgLevel);
        bySpecies[sp].levels[lb] = (bySpecies[sp].levels[lb] || 0) + 1;
      }

      bySpecies[sp].count += 1;
    }

    return Object.entries(bySpecies).map(([spId, data]) => {
      const sp = speciesList.find((s) => s.id === spId);
      const topHour = Object.entries(data.hours).sort((a, b) => b[1] - a[1])[0];
      const topTemp = Object.entries(data.temps).sort((a, b) => b[1] - a[1])[0];
      const topLevel = Object.entries(data.levels).sort((a, b) => b[1] - a[1])[0];

      return {
        id: spId,
        name: sp?.name || spId,
        color: sp?.color || '#94a3b8',
        count: data.count,
        topHour: topHour ? { label: topHour[0], count: topHour[1], pct: Math.round((topHour[1] / data.count) * 100) } : null,
        topTemp: topTemp ? { label: topTemp[0], count: topTemp[1], pct: Math.round((topTemp[1] / data.count) * 100) } : null,
        topLevel: topLevel ? { label: topLevel[0], count: topLevel[1], pct: Math.round((topLevel[1] / data.count) * 100) } : null,
        hours: data.hours
      };
    }).sort((a, b) => b.count - a.count);
  }, [occurrences, speciesList, sensorData, climateData]);

  if (!analysis || analysis.length === 0) {
    return <p className="corr-empty">Registre mais capturas para visualizar correlações.</p>;
  }

  return (
    <div className="correlation">
      {analysis.map((sp) => (
        <div key={sp.id} className="corr-species">
          <div className="corr-header">
            <span className="corr-dot" style={{ backgroundColor: sp.color }} />
            <strong>{sp.name}</strong>
            <small>{sp.count} captura{sp.count !== 1 ? 's' : ''}</small>
          </div>

          <div className="corr-insights">
            {sp.topHour && (
              <div className="corr-insight">
                <span className="corr-label">⏰ Horário preferido</span>
                <span className="corr-value">{sp.topHour.label} ({sp.topHour.pct}%)</span>
                <div className="corr-bar">
                  <div className="corr-bar-fill" style={{ width: `${sp.topHour.pct}%`, backgroundColor: sp.color }} />
                </div>
              </div>
            )}
            {sp.topTemp && (
              <div className="corr-insight">
                <span className="corr-label">🌡️ Temperatura</span>
                <span className="corr-value">{sp.topTemp.label} ({sp.topTemp.pct}%)</span>
                <div className="corr-bar">
                  <div className="corr-bar-fill" style={{ width: `${sp.topTemp.pct}%`, backgroundColor: sp.color }} />
                </div>
              </div>
            )}
            {sp.topLevel && (
              <div className="corr-insight">
                <span className="corr-label">🌊 Nível</span>
                <span className="corr-value">{sp.topLevel.label} ({sp.topLevel.pct}%)</span>
                <div className="corr-bar">
                  <div className="corr-bar-fill" style={{ width: `${sp.topLevel.pct}%`, backgroundColor: sp.color }} />
                </div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
