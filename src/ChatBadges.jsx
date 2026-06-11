import React, { useMemo } from 'react';
import { Award } from 'lucide-react';

const BADGES = [
  { id: 'first-msg', name: 'Primeira mensagem', icon: '💬', desc: 'Enviou a primeira mensagem no chat', threshold: 1 },
  { id: 'chatterbox', name: 'Tagarela', icon: '🗣️', desc: '10 mensagens enviadas', threshold: 10 },
  { id: 'regular', name: 'Frequentador', icon: '🏠', desc: '25 mensagens enviadas', threshold: 25 },
  { id: 'influencer', name: 'Influencer', icon: '⭐', desc: '50 mensagens enviadas', threshold: 50 },
  { id: 'legend', name: 'Lenda do rio', icon: '🏆', desc: '100 mensagens enviadas', threshold: 100 },
  { id: 'multi-segment', name: 'Explorador', icon: '🗺️', desc: 'Conversou em 3+ segmentos', thresholdSegments: 3 },
  { id: 'night-owl', name: 'Coruja noturna', icon: '🦉', desc: 'Mensagem após meia-noite', special: 'night' },
  { id: 'early-bird', name: 'Madrugador', icon: '🐦', desc: 'Mensagem antes das 6h', special: 'early' },
];

export default function ChatBadges({ messages, deviceId }) {
  const earned = useMemo(() => {
    const myMsgs = messages.filter((m) => m.device_id === deviceId);
    const count = myMsgs.length;
    const segments = new Set(myMsgs.map((m) => m.segment)).size;
    const hasNight = myMsgs.some((m) => {
      const h = new Date(m.created_at).getHours();
      return h >= 0 && h < 3;
    });
    const hasEarly = myMsgs.some((m) => {
      const h = new Date(m.created_at).getHours();
      return h >= 3 && h < 6;
    });

    return BADGES.map((b) => {
      let unlocked = false;
      if (b.threshold) unlocked = count >= b.threshold;
      if (b.thresholdSegments) unlocked = segments >= b.thresholdSegments;
      if (b.special === 'night') unlocked = hasNight;
      if (b.special === 'early') unlocked = hasEarly;

      return { ...b, unlocked, progress: b.threshold ? Math.min(100, Math.round((count / b.threshold) * 100)) : unlocked ? 100 : 0 };
    });
  }, [messages, deviceId]);

  const unlockedCount = earned.filter((b) => b.unlocked).length;

  return (
    <div className="chat-badges">
      <div className="cb-header">
        <Award size={13} />
        <span>{unlockedCount}/{BADGES.length} conquistas</span>
      </div>
      <div className="cb-grid">
        {earned.map((b) => (
          <div key={b.id} className={`cb-badge${b.unlocked ? ' unlocked' : ''}`} title={b.desc}>
            <span className="cb-icon">{b.icon}</span>
            <span className="cb-name">{b.name}</span>
            {!b.unlocked && b.threshold && (
              <div className="cb-progress">
                <div className="cb-progress-fill" style={{ width: `${b.progress}%` }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
