import React, { useEffect, useRef, useMemo } from 'react';

function computeHourlyStats(occurrences, speciesList, selectedSpeciesId) {
  const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
  const allHours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));

  for (const o of occurrences) {
    if (!o.date) continue;
    const h = new Date(o.date).getHours();
    if (h >= 0 && h < 24) {
      allHours[h].count += 1;
      if (o.speciesId === selectedSpeciesId) hours[h].count += 1;
    }
  }

  const maxCount = Math.max(...hours.map((h) => h.count), 1);
  const totalSelected = hours.reduce((s, h) => s + h.count, 0);

  const ranked = [...hours]
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count);

  let bestWindow = null;

  if (ranked.length > 0) {
    let bestStart = ranked[0].hour;
    let bestSum = 0;

    for (let start = 0; start < 24; start += 1) {
      let windowSum = 0;
      for (let w = 0; w < 3; w += 1) {
        windowSum += hours[(start + w) % 24].count;
      }
      if (windowSum > bestSum) {
        bestSum = windowSum;
        bestStart = start;
      }
    }

    bestWindow = {
      start: bestStart,
      end: (bestStart + 3) % 24,
      count: bestSum,
      pct: totalSelected > 0 ? Math.round((bestSum / totalSelected) * 100) : 0
    };
  }

  return { hours, maxCount, totalSelected, ranked, bestWindow, allHours };
}

function formatHour(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

function periodLabel(hour) {
  if (hour >= 5 && hour < 8) return 'aurora';
  if (hour >= 8 && hour < 12) return 'manhã';
  if (hour >= 12 && hour < 14) return 'meio-dia';
  if (hour >= 14 && hour < 17) return 'tarde';
  if (hour >= 17 && hour < 20) return 'crepúsculo';
  return 'noite';
}

function drawHourlyChart(canvas, hours, maxCount, selectedColor) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const pad = { top: 8, right: 4, bottom: 22, left: 26 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const barWidth = cw / 24 - 2;

  ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(148, 216, 255, 0.08)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 3; i += 1) {
    const y = pad.top + ch - (i / 3) * ch;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    if (i > 0) {
      ctx.fillStyle = '#9ecadd';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round((i / 3) * maxCount), pad.left - 3, y + 3);
    }
  }

  for (let i = 0; i < 24; i += 1) {
    const x = pad.left + i * (cw / 24) + 1;
    const barH = maxCount > 0 ? (hours[i].count / maxCount) * ch : 0;
    const y = pad.top + ch - barH;

    const alpha = hours[i].count > 0 ? 0.3 + 0.7 * (hours[i].count / maxCount) : 0.1;
    ctx.fillStyle = hours[i].count > 0 ? selectedColor : 'rgba(148, 216, 255, 0.08)';
    ctx.globalAlpha = alpha;
    ctx.fillRect(x, y, barWidth, barH || 1);
    ctx.globalAlpha = 1;

    if (i % 3 === 0) {
      ctx.fillStyle = '#9ecadd';
      ctx.font = '8px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${String(i).padStart(2, '0')}`, x + barWidth / 2, height - 4);
    }
  }

  const zones = [
    { start: 5, end: 8, label: '☀', color: 'rgba(250, 204, 21, 0.08)' },
    { start: 17, end: 20, label: '🌅', color: 'rgba(249, 115, 22, 0.08)' }
  ];

  for (const zone of zones) {
    const zx = pad.left + zone.start * (cw / 24);
    const zw = (zone.end - zone.start) * (cw / 24);
    ctx.fillStyle = zone.color;
    ctx.fillRect(zx, pad.top, zw, ch);
  }
}

export default function HourlyRanking({ occurrences, speciesList, selectedSpeciesId }) {
  const canvasRef = useRef(null);
  const selectedSpecies = speciesList.find((s) => s.id === selectedSpeciesId);

  const stats = useMemo(
    () => computeHourlyStats(occurrences, speciesList, selectedSpeciesId),
    [occurrences, speciesList, selectedSpeciesId]
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    drawHourlyChart(canvasRef.current, stats.hours, stats.maxCount, selectedSpecies?.color || '#38bdf8');
  }, [stats, selectedSpecies]);

  useEffect(() => {
    function handleResize() {
      if (!canvasRef.current) return;
      drawHourlyChart(canvasRef.current, stats.hours, stats.maxCount, selectedSpecies?.color || '#38bdf8');
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [stats, selectedSpecies]);

  return (
    <div className="hourly-ranking">
      <canvas ref={canvasRef} className="hourly-canvas" />

      {stats.bestWindow && (
        <div className="hourly-best">
          <strong>Melhor janela:</strong> {formatHour(stats.bestWindow.start)}–{formatHour(stats.bestWindow.end)} ({periodLabel(stats.bestWindow.start)}) · {stats.bestWindow.count} captura{stats.bestWindow.count !== 1 ? 's' : ''} ({stats.bestWindow.pct}%)
        </div>
      )}

      {stats.ranked.length > 0 && (
        <div className="hourly-top">
          {stats.ranked.slice(0, 5).map((h) => (
            <div key={h.hour} className="hourly-row">
              <span className="hourly-hour">{formatHour(h.hour)}</span>
              <span className="hourly-period">{periodLabel(h.hour)}</span>
              <div className="hourly-bar-track">
                <div className="hourly-bar-fill" style={{ width: `${(h.count / stats.maxCount) * 100}%`, backgroundColor: selectedSpecies?.color || '#38bdf8' }} />
              </div>
              <span className="hourly-count">{h.count}</span>
            </div>
          ))}
        </div>
      )}

      {stats.totalSelected === 0 && (
        <p className="hourly-empty">Nenhuma ocorrência de {selectedSpecies?.name || 'espécie'} com horário registrado.</p>
      )}
    </div>
  );
}
