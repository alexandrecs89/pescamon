import React, { useMemo } from 'react';
import { Calendar, Crown } from 'lucide-react';

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const SEASONS = [
  { id: 'verao', label: 'Verão', months: [12, 1, 2] },
  { id: 'outono', label: 'Outono', months: [3, 4, 5] },
  { id: 'inverno', label: 'Inverno', months: [6, 7, 8] },
  { id: 'primavera', label: 'Primavera', months: [9, 10, 11] },
];

export function filterOccurrences(occurrences, filter) {
  if (!filter || filter.type === 'all') return occurrences;

  return occurrences.filter((o) => {
    if (!o.date) return false;
    const d = new Date(o.date);
    const month = d.getMonth() + 1;

    if (filter.type === 'month') return month === filter.value;
    if (filter.type === 'season') {
      const season = SEASONS.find((s) => s.id === filter.value);
      return season ? season.months.includes(month) : true;
    }
    return true;
  });
}

export default function TemporalFilter({ filter, onFilterChange, occurrences, isPremium = false }) {
  const monthlyCounts = useMemo(() => {
    const counts = new Array(12).fill(0);
    for (const o of occurrences) {
      if (o.date) {
        const m = new Date(o.date).getMonth();
        counts[m]++;
      }
    }
    return counts;
  }, [occurrences]);

  const maxCount = Math.max(...monthlyCounts, 1);

  return (
    <div className="temporal-filter">
      <div className="tf-header">
        <Calendar size={13} />
        <span>Filtro temporal</span>
        {!isPremium && (
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: '#f59e0b' }}>
            <Crown size={12} /> Premium
          </span>
        )}
      </div>

      <div className="tf-seasons">
        <button className={`tf-btn${!filter || filter.type === 'all' ? ' active' : ''}`} onClick={() => onFilterChange({ type: 'all' })} type="button">Todos</button>
        {SEASONS.map((s) => (
          <button 
            key={s.id} 
            className={`tf-btn${filter?.type === 'season' && filter.value === s.id ? ' active' : ''}${!isPremium ? ' premium-lock' : ''}`} 
            onClick={() => onFilterChange({ type: 'season', value: s.id })} 
            type="button"
            title={!isPremium ? 'Requer Premium' : ''}
          >
            {s.label}
            {!isPremium && <Crown size={10} style={{ marginLeft: '4px', opacity: 0.7 }} />}
          </button>
        ))}
      </div>

      <div className="tf-months">
        {MONTHS.map((label, i) => {
          const active = filter?.type === 'month' && filter.value === i + 1;
          const height = monthlyCounts[i] > 0 ? Math.max(4, (monthlyCounts[i] / maxCount) * 24) : 2;
          return (
            <button 
              key={i} 
              className={`tf-month${active ? ' active' : ''}${!isPremium ? ' premium-lock' : ''}`} 
              onClick={() => onFilterChange({ type: 'month', value: i + 1 })} 
              type="button"
              title={!isPremium ? 'Requer Premium' : ''}
            >
              <div className="tf-month-bar" style={{ height: `${height}px` }} />
              <span>{label}</span>
              {monthlyCounts[i] > 0 && <small>{monthlyCounts[i]}</small>}
              {!isPremium && <Crown size={8} style={{ position: 'absolute', top: '2px', right: '2px', opacity: 0.5 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
