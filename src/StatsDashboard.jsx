import React, { useMemo, useRef, useEffect } from 'react';
import { TrendingUp } from 'lucide-react';

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function MonthlyChart({ data, maxVal, color }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padding = { top: 8, bottom: 20, left: 4, right: 4 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const barW = chartW / 12 - 4;
    const max = maxVal || 1;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(padding.left, padding.top, chartW, chartH);

    for (let i = 0; i < 12; i++) {
      const x = padding.left + (chartW / 12) * i + 2;
      const val = data[i] || 0;
      const barH = (val / max) * chartH;

      const gradient = ctx.createLinearGradient(0, padding.top + chartH - barH, 0, padding.top + chartH);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + '33');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, padding.top + chartH - barH, barW, barH, 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(MONTH_NAMES[i], x + barW / 2, h - 4);

      if (val > 0) {
        ctx.fillStyle = 'rgba(226,232,240,0.8)';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(val, x + barW / 2, padding.top + chartH - barH - 3);
      }
    }
  }, [data, maxVal, color]);

  return <canvas ref={canvasRef} className="stats-chart" />;
}

export default function StatsDashboard({ occurrences, speciesList }) {
  const stats = useMemo(() => {
    const monthly = new Array(12).fill(0);
    const bySpecies = {};
    const byWeekday = new Array(7).fill(0);
    const byHour = new Array(24).fill(0);

    for (const o of occurrences) {
      if (!o.date) continue;
      const d = new Date(o.date);
      monthly[d.getMonth()]++;
      byWeekday[d.getDay()]++;
      byHour[d.getHours()]++;

      if (!bySpecies[o.speciesId]) bySpecies[o.speciesId] = new Array(12).fill(0);
      bySpecies[o.speciesId][d.getMonth()]++;
    }

    const maxMonthly = Math.max(...monthly, 1);

    const topMonth = monthly.indexOf(Math.max(...monthly));
    const topWeekday = byWeekday.indexOf(Math.max(...byWeekday));
    const topHour = byHour.indexOf(Math.max(...byHour));
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const speciesRanking = Object.entries(bySpecies)
      .map(([id, months]) => {
        const sp = speciesList.find((s) => s.id === id);
        const total = months.reduce((a, b) => a + b, 0);
        return { id, name: sp?.name || id, color: sp?.color || '#94a3b8', total, months };
      })
      .sort((a, b) => b.total - a.total);

    const growthRate = monthly.reduce((acc, val, i) => {
      if (i === 0 || monthly[i - 1] === 0) return acc;
      return acc + (val - monthly[i - 1]) / monthly[i - 1];
    }, 0);

    return { monthly, maxMonthly, bySpecies, speciesRanking, topMonth, topWeekday: weekdays[topWeekday], topHour, growthRate, total: occurrences.length };
  }, [occurrences, speciesList]);

  if (stats.total === 0) {
    return <p className="stats-empty">Registre capturas para visualizar estatísticas.</p>;
  }

  return (
    <div className="stats-dashboard">
      <div className="sd-kpis">
        <div className="sd-kpi">
          <span className="sd-kpi-value">{stats.total}</span>
          <span className="sd-kpi-label">Total capturas</span>
        </div>
        <div className="sd-kpi">
          <span className="sd-kpi-value">{MONTH_NAMES[stats.topMonth]}</span>
          <span className="sd-kpi-label">Mês mais ativo</span>
        </div>
        <div className="sd-kpi">
          <span className="sd-kpi-value">{stats.topWeekday}</span>
          <span className="sd-kpi-label">Dia preferido</span>
        </div>
        <div className="sd-kpi">
          <span className="sd-kpi-value">{stats.topHour}h</span>
          <span className="sd-kpi-label">Horário pico</span>
        </div>
      </div>

      <div className="sd-chart-section">
        <span className="sd-chart-label">Capturas por mês (total)</span>
        <MonthlyChart data={stats.monthly} maxVal={stats.maxMonthly} color="#0ea5e9" />
      </div>

      {stats.speciesRanking.slice(0, 3).map((sp) => (
        <div key={sp.id} className="sd-chart-section">
          <span className="sd-chart-label" style={{ color: sp.color }}>{sp.name} ({sp.total})</span>
          <MonthlyChart data={sp.months} maxVal={stats.maxMonthly} color={sp.color} />
        </div>
      ))}

      <div className="sd-trend">
        <TrendingUp size={12} />
        <span>Tendência: {stats.growthRate > 0.1 ? '📈 Crescente' : stats.growthRate < -0.1 ? '📉 Decrescente' : '➡️ Estável'}</span>
      </div>
    </div>
  );
}
