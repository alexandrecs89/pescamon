import React, { useMemo } from 'react';
import { Clock, Star } from 'lucide-react';

const HOUR_LABELS = [
  '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
  '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23'
];

function periodLabel(hour) {
  if (hour >= 5 && hour < 7) return 'Amanhecer';
  if (hour >= 7 && hour < 10) return 'Manhã cedo';
  if (hour >= 10 && hour < 14) return 'Meio-dia';
  if (hour >= 14 && hour < 17) return 'Tarde';
  if (hour >= 17 && hour < 20) return 'Entardecer';
  if (hour >= 20 && hour < 23) return 'Noite';
  return 'Madrugada';
}

export default function BestTimePrediction({ occurrences, selectedSpecies, climateData }) {
  const prediction = useMemo(() => {
    const speciesOccs = occurrences.filter((o) => o.speciesId === selectedSpecies.id && o.date);
    const hourCounts = new Array(24).fill(0);

    for (const o of speciesOccs) {
      const h = new Date(o.date).getHours();
      hourCounts[h] += 1;
    }

    const activityPref = selectedSpecies.activity;
    const activityBonus = new Array(24).fill(0);

    if (activityPref.includes('crepuscular')) {
      [5, 6, 7, 17, 18, 19].forEach((h) => { activityBonus[h] += 3; });
    }
    if (activityPref.includes('diurna')) {
      for (let h = 7; h <= 17; h++) activityBonus[h] += 2;
    }
    if (activityPref.includes('noturna')) {
      for (let h = 20; h <= 23; h++) activityBonus[h] += 2;
      for (let h = 0; h <= 5; h++) activityBonus[h] += 2;
    }

    const tempPref = selectedSpecies.preferences.temperature;
    const currentTemp = climateData?.waterTemperature || 17;
    const tempFit = Math.max(0, 1 - Math.abs(currentTemp - tempPref) / 10);

    const solarPref = selectedSpecies.preferences.solar;
    const solarBonus = new Array(24).fill(0);
    for (let h = 0; h < 24; h++) {
      const solarAvail = h >= 6 && h <= 19 ? Math.sin((h - 6) / 13 * Math.PI) * 100 : 0;
      solarBonus[h] = 1 - Math.abs(solarAvail - solarPref) / 100;
    }

    const scores = hourCounts.map((count, h) => {
      const historicalWeight = speciesOccs.length > 0 ? (count / Math.max(1, ...hourCounts)) * 40 : 0;
      const activityWeight = (activityBonus[h] / 3) * 30;
      const tempWeight = tempFit * 15;
      const solarWeight = solarBonus[h] * 15;
      return Math.round(historicalWeight + activityWeight + tempWeight + solarWeight);
    });

    const maxScore = Math.max(...scores, 1);
    const topHours = scores
      .map((s, h) => ({ hour: h, score: s, pct: Math.round((s / maxScore) * 100) }))
      .sort((a, b) => b.score - a.score);

    const best3 = topHours.slice(0, 3);

    return { scores, maxScore, topHours, best3, hasHistorical: speciesOccs.length > 0 };
  }, [occurrences, selectedSpecies, climateData]);

  return (
    <div className="best-time">
      <div className="bt-top3">
        {prediction.best3.map((item, i) => (
          <div key={item.hour} className={`bt-pick${i === 0 ? ' best' : ''}`}>
            {i === 0 && <Star size={12} className="bt-star" />}
            <span className="bt-hour">{HOUR_LABELS[item.hour]}:00</span>
            <span className="bt-period">{periodLabel(item.hour)}</span>
            <span className="bt-score">{item.pct}%</span>
          </div>
        ))}
      </div>

      <div className="bt-chart">
        {prediction.scores.map((score, h) => {
          const height = Math.max(2, (score / prediction.maxScore) * 32);
          const isBest = prediction.best3[0]?.hour === h;
          return (
            <div key={h} className={`bt-bar-col${isBest ? ' best' : ''}`}>
              <div className="bt-bar" style={{ height: `${height}px`, backgroundColor: isBest ? selectedSpecies.color : 'rgba(255,255,255,0.15)' }} />
              <span>{h % 3 === 0 ? HOUR_LABELS[h] : ''}</span>
            </div>
          );
        })}
      </div>

      <p className="bt-note">
        {prediction.hasHistorical
          ? 'Baseado em capturas históricas + perfil de atividade + condições climáticas.'
          : 'Estimativa baseada no perfil de atividade e condições climáticas. Registre capturas para refinar.'}
      </p>
    </div>
  );
}
