import React, { useMemo } from 'react';
import { Award, Target, TrendingUp, Calendar, MapPin } from 'lucide-react';

const BADGES = [
  { id: 'first-catch', label: 'Primeira captura', icon: '🎣', condition: (s) => s.total >= 1 },
  { id: 'explorer-5', label: 'Explorador (5)', icon: '🗺️', condition: (s) => s.uniqueCells >= 5 },
  { id: 'explorer-15', label: 'Explorador master (15)', icon: '🏔️', condition: (s) => s.uniqueCells >= 15 },
  { id: 'collector-3', label: 'Colecionador (3 espécies)', icon: '🐟', condition: (s) => s.uniqueSpecies >= 3 },
  { id: 'collector-6', label: 'Todas as espécies!', icon: '🏆', condition: (s) => s.uniqueSpecies >= 6 },
  { id: 'streak-3', label: 'Sequência 3 dias', icon: '🔥', condition: (s) => s.streak >= 3 },
  { id: 'streak-7', label: 'Sequência 7 dias', icon: '⚡', condition: (s) => s.streak >= 7 },
  { id: 'prolific-20', label: '20 registros', icon: '📊', condition: (s) => s.total >= 20 },
  { id: 'prolific-50', label: '50 registros', icon: '💎', condition: (s) => s.total >= 50 },
];

function computeStats(occurrences, speciesList) {
  const total = occurrences.length;

  if (total === 0) {
    return {
      total: 0,
      uniqueSpecies: 0,
      uniqueCells: 0,
      streak: 0,
      bySpecies: [],
      firstDate: null,
      lastDate: null,
      activeDays: 0,
      topCell: null
    };
  }

  const speciesCount = {};
  const cellSet = new Set();
  const daySet = new Set();
  const cellCount = {};

  for (const o of occurrences) {
    speciesCount[o.speciesId] = (speciesCount[o.speciesId] || 0) + 1;

    if (o.date) daySet.add(o.date.slice(0, 10));

    const cellKey = `${Math.round(o.location[0] * 100)},${Math.round(o.location[1] * 100)}`;
    cellSet.add(cellKey);
    cellCount[cellKey] = (cellCount[cellKey] || 0) + 1;
  }

  const bySpecies = speciesList.map((sp) => ({
    id: sp.id,
    name: sp.name,
    color: sp.color,
    count: speciesCount[sp.id] || 0
  })).sort((a, b) => b.count - a.count);

  const sortedDays = [...daySet].sort();
  let streak = 1;
  let maxStreak = 1;

  for (let i = 1; i < sortedDays.length; i += 1) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diffMs = curr - prev;

    if (diffMs <= 86400000 * 1.5) {
      streak += 1;
      if (streak > maxStreak) maxStreak = streak;
    } else {
      streak = 1;
    }
  }

  if (sortedDays.length <= 1) maxStreak = sortedDays.length;

  const topCellKey = Object.entries(cellCount).sort((a, b) => b[1] - a[1])[0];

  return {
    total,
    uniqueSpecies: Object.keys(speciesCount).length,
    uniqueCells: cellSet.size,
    streak: maxStreak,
    bySpecies,
    firstDate: sortedDays[0] || null,
    lastDate: sortedDays[sortedDays.length - 1] || null,
    activeDays: sortedDays.length,
    topCell: topCellKey ? { key: topCellKey[0], count: topCellKey[1] } : null
  };
}

export default function UserProfile({ occurrences, speciesList, userName }) {
  const stats = useMemo(() => computeStats(occurrences, speciesList), [occurrences, speciesList]);
  const earnedBadges = useMemo(() => BADGES.filter((b) => b.condition(stats)), [stats]);

  return (
    <div className="user-profile">
      <div className="profile-header">
        <div className="profile-avatar">{userName ? userName[0].toUpperCase() : '?'}</div>
        <div>
          <strong>{userName || 'Pescador anônimo'}</strong>
          {stats.firstDate && <small>Ativo desde {stats.firstDate}</small>}
        </div>
      </div>

      <div className="profile-stats-grid">
        <div className="pstat">
          <Target size={16} />
          <span className="pstat-value">{stats.total}</span>
          <span className="pstat-label">Capturas</span>
        </div>
        <div className="pstat">
          <TrendingUp size={16} />
          <span className="pstat-value">{stats.uniqueSpecies}</span>
          <span className="pstat-label">Espécies</span>
        </div>
        <div className="pstat">
          <MapPin size={16} />
          <span className="pstat-value">{stats.uniqueCells}</span>
          <span className="pstat-label">Locais</span>
        </div>
        <div className="pstat">
          <Calendar size={16} />
          <span className="pstat-value">{stats.activeDays}</span>
          <span className="pstat-label">Dias ativos</span>
        </div>
      </div>

      {stats.streak >= 2 && (
        <div className="streak-bar">🔥 Melhor sequência: {stats.streak} dias consecutivos</div>
      )}

      {stats.bySpecies.length > 0 && (
        <div className="species-breakdown">
          {stats.bySpecies.filter((s) => s.count > 0).map((s) => (
            <div key={s.id} className="species-bar-row">
              <span className="species-bar-dot" style={{ backgroundColor: s.color }} />
              <span className="species-bar-name">{s.name}</span>
              <div className="species-bar-track">
                <div className="species-bar-fill" style={{ width: `${Math.min(100, (s.count / Math.max(1, stats.total)) * 100)}%`, backgroundColor: s.color }} />
              </div>
              <span className="species-bar-count">{s.count}</span>
            </div>
          ))}
        </div>
      )}

      {earnedBadges.length > 0 && (
        <div className="badges-section">
          <div className="badges-title"><Award size={14} /> Conquistas</div>
          <div className="badges-grid">
            {earnedBadges.map((b) => (
              <div key={b.id} className="badge-chip">
                <span className="badge-icon">{b.icon}</span>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {BADGES.filter((b) => !b.condition(stats)).length > 0 && (
        <div className="badges-section locked">
          <div className="badges-title">🔒 Próximas conquistas</div>
          <div className="badges-grid">
            {BADGES.filter((b) => !b.condition(stats)).slice(0, 3).map((b) => (
              <div key={b.id} className="badge-chip locked">
                <span className="badge-icon">{b.icon}</span>
                <span>{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
