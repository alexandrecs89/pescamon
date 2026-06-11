import React, { useMemo } from 'react';
import { MapPinned, Navigation, Fish, Star } from 'lucide-react';

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function difficultyLabel(prob) {
  if (prob >= 70) return { text: 'Fácil', color: '#22c55e' };
  if (prob >= 45) return { text: 'Moderado', color: '#eab308' };
  return { text: 'Desafiador', color: '#f97316' };
}

export default function FishingGuide({ scoredSegments, selectedSpecies, climateData, dischargeData }) {
  const route = useMemo(() => {
    if (scoredSegments.length === 0) return [];

    const top = scoredSegments.slice(0, 8);

    const ordered = [top[0]];
    const remaining = top.slice(1);

    while (remaining.length > 0 && ordered.length < 5) {
      const last = ordered[ordered.length - 1];
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const dist = distanceKm(last.center[0], last.center[1], remaining[i].center[0], remaining[i].center[1]);
        const proxScore = remaining[i].probability - dist * 10;
        if (proxScore > bestScore) {
          bestScore = proxScore;
          bestIdx = i;
        }
      }

      ordered.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    }

    return ordered.map((seg, i) => {
      const prevSeg = i > 0 ? ordered[i - 1] : null;
      const dist = prevSeg ? distanceKm(prevSeg.center[0], prevSeg.center[1], seg.center[0], seg.center[1]) : 0;
      const diff = difficultyLabel(seg.probability);

      return {
        order: i + 1,
        name: seg.name,
        probability: seg.probability,
        center: seg.center,
        topography: seg.topography,
        depth: seg.depth,
        distFromPrev: Math.round(dist * 100) / 100,
        difficulty: diff,
        tip: generateTip(seg, selectedSpecies, climateData)
      };
    });
  }, [scoredSegments, selectedSpecies, climateData]);

  const totalDist = route.reduce((s, r) => s + r.distFromPrev, 0);

  if (route.length === 0) return <p className="guide-empty">Carregando roteiro...</p>;

  return (
    <div className="fishing-guide">
      <div className="fg-summary">
        <span><MapPinned size={12} /> {route.length} pontos</span>
        <span><Navigation size={12} /> {Math.round(totalDist * 10) / 10} km total</span>
        <span><Fish size={12} /> {selectedSpecies.name}</span>
      </div>

      <div className="fg-route">
        {route.map((stop, i) => (
          <div key={i} className="fg-stop">
            <div className="fg-stop-number">{stop.order}</div>
            <div className="fg-stop-info">
              <div className="fg-stop-header">
                <strong>{stop.name}</strong>
                <span className="fg-prob">{stop.probability}%</span>
              </div>
              <div className="fg-stop-meta">
                <span style={{ color: stop.difficulty.color }}>{stop.difficulty.text}</span>
                <span>{stop.topography} · {stop.depth}m prof.</span>
                {stop.distFromPrev > 0 && <span>↗ {stop.distFromPrev} km</span>}
              </div>
              <p className="fg-tip">{stop.tip}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="fg-conditions">
        <p><strong>Condições atuais:</strong> {climateData?.airTemperature}°C ar · {climateData?.waterTemperature}°C água · vento {climateData?.wind} km/h</p>
        {dischargeData && <p><strong>Rio:</strong> {dischargeData.current} m³/s · {dischargeData.trend}</p>}
      </div>
    </div>
  );
}

function generateTip(seg, species, climate) {
  const tips = [];

  if (seg.depth > 3) tips.push('Ponto profundo — ideal para iscas de fundo');
  else if (seg.depth < 1.5) tips.push('Raso — use iscas de superfície');

  if (seg.vegetation > 0.6) tips.push('vegetação densa, procure bordas');
  if (seg.sinuosity > 40) tips.push('curva acentuada, correnteza variada');

  if (climate?.wind > 20) tips.push('vento forte — prefira margem protegida');
  if (climate?.waterTemperature < 14) tips.push('água fria — peixes menos ativos');

  if (species.activity.includes('crepuscular')) tips.push('melhor ao amanhecer/entardecer');
  if (species.activity.includes('noturna')) tips.push('espécie noturna — rende mais à noite');

  return tips.slice(0, 2).join('. ') + (tips.length > 0 ? '.' : 'Bom ponto geral para esta espécie.');
}
