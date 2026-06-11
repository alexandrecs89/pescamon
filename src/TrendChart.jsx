import React, { useEffect, useRef } from 'react';

function aggregateByDay(occurrences, speciesList) {
  const byDay = {};

  for (const o of occurrences) {
    const day = o.date ? o.date.slice(0, 10) : null;

    if (!day) continue;

    if (!byDay[day]) {
      byDay[day] = { total: 0 };
      for (const sp of speciesList) byDay[day][sp.id] = 0;
    }

    byDay[day].total += 1;
    if (byDay[day][o.speciesId] != null) byDay[day][o.speciesId] += 1;
  }

  const days = Object.keys(byDay).sort();

  if (days.length === 0) return { days: [], series: [] };

  const first = new Date(days[0]);
  const last = new Date(days[days.length - 1]);
  const allDays = [];
  const current = new Date(first);

  while (current <= last) {
    allDays.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }

  if (allDays.length === 0) allDays.push(days[0]);

  const series = speciesList.map((sp) => ({
    id: sp.id,
    name: sp.name,
    color: sp.color,
    cumulative: [],
    daily: []
  }));

  for (const s of series) {
    let cumSum = 0;

    for (const day of allDays) {
      const count = byDay[day]?.[s.id] || 0;
      cumSum += count;
      s.cumulative.push(cumSum);
      s.daily.push(count);
    }
  }

  return { days: allDays, series };
}

function drawChart(canvas, days, series, selectedSpeciesId, mode) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);

  if (days.length === 0 || series.length === 0) {
    ctx.fillStyle = '#9ecadd';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma ocorrência registrada', width / 2, height / 2);
    return;
  }

  const padding = { top: 16, right: 12, bottom: 32, left: 36 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const dataKey = mode === 'cumulative' ? 'cumulative' : 'daily';

  let maxVal = 1;

  for (const s of series) {
    for (const v of s[dataKey]) {
      if (v > maxVal) maxVal = v;
    }
  }

  const xStep = days.length > 1 ? chartW / (days.length - 1) : chartW;

  ctx.strokeStyle = 'rgba(148, 216, 255, 0.1)';
  ctx.lineWidth = 0.5;
  const gridLines = Math.min(5, maxVal);

  for (let i = 0; i <= gridLines; i += 1) {
    const y = padding.top + chartH - (i / gridLines) * chartH;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = '#9ecadd';
    ctx.font = '9px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round((i / gridLines) * maxVal), padding.left - 4, y + 3);
  }

  const labelInterval = Math.max(1, Math.floor(days.length / 6));

  ctx.fillStyle = '#9ecadd';
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'center';

  for (let i = 0; i < days.length; i += labelInterval) {
    const x = padding.left + (days.length > 1 ? i * xStep : chartW / 2);
    const label = days[i].slice(5);
    ctx.fillText(label, x, height - 6);
  }

  const drawOrder = [...series].sort((a, b) => {
    if (a.id === selectedSpeciesId) return 1;
    if (b.id === selectedSpeciesId) return -1;
    return 0;
  });

  for (const s of drawOrder) {
    const isSelected = s.id === selectedSpeciesId;
    const values = s[dataKey];

    ctx.strokeStyle = s.color;
    ctx.lineWidth = isSelected ? 2.5 : 1.2;
    ctx.globalAlpha = isSelected ? 1 : 0.35;

    ctx.beginPath();

    for (let i = 0; i < values.length; i += 1) {
      const x = padding.left + (days.length > 1 ? i * xStep : chartW / 2);
      const y = padding.top + chartH - (values[i] / maxVal) * chartH;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();

    if (isSelected && values.length > 0) {
      const lastX = padding.left + (days.length > 1 ? (values.length - 1) * xStep : chartW / 2);
      const lastY = padding.top + chartH - (values[values.length - 1] / maxVal) * chartH;

      ctx.beginPath();
      ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }
}

export default function TrendChart({ occurrences, speciesList, selectedSpeciesId }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = React.useState('cumulative');

  useEffect(() => {
    if (!canvasRef.current) return;

    const { days, series } = aggregateByDay(occurrences, speciesList);
    drawChart(canvasRef.current, days, series, selectedSpeciesId, mode);
  }, [occurrences, speciesList, selectedSpeciesId, mode]);

  useEffect(() => {
    function handleResize() {
      if (!canvasRef.current) return;

      const { days, series } = aggregateByDay(occurrences, speciesList);
      drawChart(canvasRef.current, days, series, selectedSpeciesId, mode);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [occurrences, speciesList, selectedSpeciesId, mode]);

  const selectedSpecies = speciesList.find((s) => s.id === selectedSpeciesId);

  return (
    <div className="trend-chart-container">
      <div className="trend-header">
        <div className="trend-mode-toggle">
          <button className={mode === 'cumulative' ? 'active' : ''} onClick={() => setMode('cumulative')} type="button">Acumulado</button>
          <button className={mode === 'daily' ? 'active' : ''} onClick={() => setMode('daily')} type="button">Diário</button>
        </div>
      </div>
      <canvas ref={canvasRef} className="trend-canvas" />
      <div className="trend-legend">
        {speciesList.map((sp) => (
          <span key={sp.id} className={sp.id === selectedSpeciesId ? 'legend-item active' : 'legend-item'}>
            <span className="legend-dot" style={{ backgroundColor: sp.color }} />
            {sp.name}
          </span>
        ))}
      </div>
    </div>
  );
}
