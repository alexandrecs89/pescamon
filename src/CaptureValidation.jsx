import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { fetchValidations, submitValidation, removeValidation, getDeviceId } from './supabase.js';

export default function CaptureValidation({ occurrenceId, isOwnCapture }) {
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const deviceId = getDeviceId();

  async function load() {
    try {
      const data = await fetchValidations(occurrenceId);
      setVotes(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [occurrenceId]);

  const confirms = votes.filter((v) => v.vote === 'confirm').length;
  const contests = votes.filter((v) => v.vote === 'contest').length;
  const myVote = votes.find((v) => v.device_id === deviceId)?.vote ?? null;

  async function handleVote(vote) {
    if (isOwnCapture || submitting) return;
    setSubmitting(true);
    try {
      if (myVote === vote) {
        await removeValidation(occurrenceId);
      } else {
        await submitValidation(occurrenceId, vote);
      }
      await load();
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  }

  const score = confirms - contests;
  const badge =
    votes.length === 0 ? null :
    score >= 3 ? { label: 'Verificada', cls: 'valid-badge--verified' } :
    score <= -2 ? { label: 'Contestada', cls: 'valid-badge--contested' } :
    { label: 'Em análise', cls: 'valid-badge--pending' };

  if (loading) return <div className="capture-valid-row"><span className="valid-loading">…</span></div>;

  return (
    <div className="capture-valid-wrap">
      {badge && <span className={`valid-badge ${badge.cls}`}>{badge.label}</span>}
      <div className="capture-valid-row">
        {isOwnCapture ? (
          <span className="valid-own-label">Sua captura · {votes.length} voto{votes.length !== 1 ? 's' : ''}</span>
        ) : (
          <>
            <button
              type="button"
              className={`valid-btn valid-btn--confirm${myVote === 'confirm' ? ' active' : ''}`}
              onClick={() => handleVote('confirm')}
              disabled={submitting}
              title="Confirmar captura"
            >
              <ThumbsUp size={11} />
              <span>{confirms}</span>
            </button>
            <button
              type="button"
              className={`valid-btn valid-btn--contest${myVote === 'contest' ? ' active' : ''}`}
              onClick={() => handleVote('contest')}
              disabled={submitting}
              title="Contestar captura"
            >
              <ThumbsDown size={11} />
              <span>{contests}</span>
            </button>
            {myVote && (
              <button
                type="button"
                className="valid-btn valid-btn--clear"
                onClick={() => handleVote(myVote)}
                disabled={submitting}
                title="Remover voto"
              >
                <Minus size={10} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
