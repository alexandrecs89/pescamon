import { useState, useEffect } from 'react';
import { Trophy, Medal, RefreshCw } from 'lucide-react';
import { fetchMonthlyRanking, getDeviceId } from './supabase.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function monthName() {
  return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export default function MonthlyRanking() {
  const [ranking, setRanking] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const myDeviceId = getDeviceId();

  function load() {
    setStatus('loading');
    fetchMonthlyRanking()
      .then((data) => { setRanking(data); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }

  useEffect(() => { load(); }, []);

  const myPos = ranking.findIndex((r) => r.deviceId === myDeviceId);

  return (
    <div className="monthly-ranking">
      <div className="mr-header">
        <div className="mr-title">
          <Trophy size={15} />
          Ranking de {monthName()}
        </div>
        <button className="mr-refresh" onClick={load} title="Atualizar">
          <RefreshCw size={13} className={status === 'loading' ? 'mr-spin' : ''} />
        </button>
      </div>

      {status === 'loading' && (
        <p className="mr-hint">Carregando ranking…</p>
      )}

      {status === 'error' && (
        <p className="mr-hint mr-error">Erro ao carregar. Tente novamente.</p>
      )}

      {status === 'ready' && ranking.length === 0 && (
        <p className="mr-hint">Nenhuma captura registrada este mês ainda. Seja o primeiro!</p>
      )}

      {status === 'ready' && ranking.length > 0 && (
        <>
          <div className="mr-list">
            {ranking.map((entry, i) => {
              const isMe = entry.deviceId === myDeviceId;
              return (
                <div key={entry.deviceId} className={`mr-row${isMe ? ' mr-me' : ''}`}>
                  <span className="mr-pos">
                    {i < 3 ? MEDALS[i] : `#${i + 1}`}
                  </span>
                  <div className="mr-info">
                    <strong className="mr-name">
                      {isMe ? 'Você' : `Pescador #${i + 1}`}
                    </strong>
                    <span className="mr-detail">{entry.species} espécie{entry.species !== 1 ? 's' : ''}</span>
                  </div>
                  <span className="mr-count">{entry.count} <small>capt.</small></span>
                </div>
              );
            })}
          </div>

          {myPos === -1 && (
            <p className="mr-hint" style={{ marginTop: 10 }}>
              Você ainda não aparece no ranking deste mês. Registre uma captura!
            </p>
          )}
        </>
      )}

      <p className="mr-disclaimer">
        Identificação anônima por dispositivo · Dados do mês corrente · Atualizado em tempo real
      </p>
    </div>
  );
}
