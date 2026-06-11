import React, { useMemo } from 'react';
import { Trophy, Flame, Star, Users } from 'lucide-react';

function getWeekId(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function formatShortDate(d) {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const WEEKLY_CHALLENGES = [
  { id: 'catch-5', label: 'Registrar 5 capturas', icon: '🎯', target: 5, metric: 'total' },
  { id: 'species-3', label: 'Capturar 3 espécies diferentes', icon: '🐟', target: 3, metric: 'uniqueSpecies' },
  { id: 'locations-3', label: 'Pescar em 3 locais diferentes', icon: '📍', target: 3, metric: 'uniqueCells' },
  { id: 'daily-streak-3', label: 'Pescar 3 dias seguidos', icon: '🔥', target: 3, metric: 'streak' },
  { id: 'catch-10', label: 'Registrar 10 capturas', icon: '💪', target: 10, metric: 'total' },
  { id: 'species-all', label: 'Capturar todas as 6 espécies', icon: '🏆', target: 6, metric: 'uniqueSpecies' },
];

function selectWeeklyChallenges(weekId) {
  let hash = 0;
  for (let i = 0; i < weekId.length; i++) hash = ((hash << 5) - hash + weekId.charCodeAt(i)) | 0;
  const seed = Math.abs(hash);
  const indices = [];
  const pool = [...WEEKLY_CHALLENGES.keys()];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = (seed + i * 7) % pool.length;
    indices.push(pool.splice(idx, 1)[0]);
  }
  return indices.map((i) => WEEKLY_CHALLENGES[i]);
}

function computeWeeklyStats(occurrences, weekRange) {
  const weekOccs = occurrences.filter((o) => {
    if (!o.date) return false;
    const d = new Date(o.date);
    return d >= weekRange.start && d <= weekRange.end;
  });

  const speciesSet = new Set();
  const cellSet = new Set();
  const daySet = new Set();

  for (const o of weekOccs) {
    speciesSet.add(o.speciesId);
    cellSet.add(`${Math.round(o.location[0] * 100)},${Math.round(o.location[1] * 100)}`);
    if (o.date) daySet.add(o.date.slice(0, 10));
  }

  const sortedDays = [...daySet].sort();
  let streak = sortedDays.length > 0 ? 1 : 0;
  let maxStreak = streak;
  for (let i = 1; i < sortedDays.length; i++) {
    const diff = new Date(sortedDays[i]) - new Date(sortedDays[i - 1]);
    if (diff <= 86400000 * 1.5) { streak++; maxStreak = Math.max(maxStreak, streak); }
    else streak = 1;
  }

  return {
    total: weekOccs.length,
    uniqueSpecies: speciesSet.size,
    uniqueCells: cellSet.size,
    streak: maxStreak
  };
}

function buildLeaderboard(occurrences, weekRange) {
  const weekOccs = occurrences.filter((o) => {
    if (!o.date) return false;
    const d = new Date(o.date);
    return d >= weekRange.start && d <= weekRange.end;
  });

  const userMap = {};
  for (const o of weekOccs) {
    const uid = o.userId || o.deviceId || 'anon';
    if (!userMap[uid]) userMap[uid] = { id: uid, count: 0, species: new Set() };
    userMap[uid].count += 1;
    userMap[uid].species.add(o.speciesId);
  }

  return Object.values(userMap)
    .map((u) => ({ ...u, speciesCount: u.species.size }))
    .sort((a, b) => b.count - a.count || b.speciesCount - a.speciesCount)
    .slice(0, 5);
}

export default function Challenges({ occurrences, currentDeviceId }) {
  const weekId = useMemo(() => getWeekId(), []);
  const weekRange = useMemo(() => getWeekRange(), []);
  const challenges = useMemo(() => selectWeeklyChallenges(weekId), [weekId]);
  const weekStats = useMemo(() => computeWeeklyStats(occurrences, weekRange), [occurrences, weekRange]);
  const leaderboard = useMemo(() => buildLeaderboard(occurrences, weekRange), [occurrences, weekRange]);

  return (
    <div className="challenges">
      <div className="challenges-header">
        <Flame size={14} />
        <span>Semana {weekId.split('-W')[1]} · {formatShortDate(weekRange.start)} – {formatShortDate(weekRange.end)}</span>
      </div>

      <div className="challenges-list">
        {challenges.map((ch) => {
          const current = weekStats[ch.metric] || 0;
          const pct = Math.min(100, Math.round((current / ch.target) * 100));
          const done = current >= ch.target;
          return (
            <div key={ch.id} className={`challenge-row${done ? ' done' : ''}`}>
              <span className="challenge-icon">{ch.icon}</span>
              <div className="challenge-info">
                <span className="challenge-label">{ch.label}</span>
                <div className="challenge-bar-track">
                  <div className="challenge-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="challenge-progress">{current}/{ch.target}</span>
              {done && <Star size={12} className="challenge-star" />}
            </div>
          );
        })}
      </div>

      {leaderboard.length > 0 && (
        <div className="leaderboard">
          <div className="leaderboard-title"><Users size={13} /> Ranking semanal</div>
          {leaderboard.map((user, i) => {
            const isMe = user.id === currentDeviceId;
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return (
              <div key={user.id} className={`leaderboard-row${isMe ? ' me' : ''}`}>
                <span className="lb-pos">{medal}</span>
                <span className="lb-name">{isMe ? 'Você' : `Pescador ${user.id.slice(-4)}`}</span>
                <span className="lb-stats">{user.count} · {user.speciesCount} sp.</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
