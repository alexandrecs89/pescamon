import { useState, useEffect } from 'react';
import { useT, useLang } from './i18n.jsx';
import { analyzeSeasonalPatterns, MONTHS_PT, MONTHS_ES, MONTHS_EN, SEASONS_PT, SEASONS_ES, SEASONS_EN } from './mlInsights.js';
import {
  X, User, Calendar, Fish, MapPin, Clock, Trash2,
  ExternalLink, LogOut, Settings, ChevronDown, ChevronUp,
  AlertTriangle, Check, Eye, EyeOff, Lock, Trophy, Upload, Share2, Copy, CheckCheck,
  Crown, CreditCard, BarChart2
} from 'lucide-react';
import { signOut, updateUserProfile, uploadAvatar, fetchPlannedTrips, deletePlannedTrip, getFishingSessions, supabase } from './supabase.js';
import { exportOccurrencesJSON, exportOccurrencesCSV, exportOccurrencesGPX, exportSessionsCSV } from './storage.js';
import MonthlyRanking from './MonthlyRanking.jsx';
import FishingReports from './FishingReports.jsx';
import { usePremium, openStripeCheckout } from './usePremium.js';

// Preços e detecção de moeda
const PRICES = {
  monthly: { brl: 'R$ 10/mês', uyu: '$ 80/mes', usd: 'US$ 2/month' },
  yearly: { brl: 'R$ 50/ano', uyu: '$ 400/año', usd: 'US$ 10/year' },
};

function detectCountry() {
  try {
    const saved = localStorage.getItem('pescamon_country');
    if (saved) return saved;
  } catch {}
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz.includes('Montevideo') || tz.includes('Uruguay')) return 'UY';
  if (tz.includes('Sao_Paulo') || tz.includes('Buenos_Aires')) return 'BR';
  return 'US';
}

function getDefaultCurrency(country) {
  if (country === 'UY') return 'uyu';
  if (country === 'BR') return 'brl';
  return 'usd';
}

function buildGCalUrl(trip) {
  const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const start = new Date(trip.startDate + 'T' + (trip.startTime || '06:00'));
  const end = new Date((trip.endDate || trip.startDate) + 'T' + (trip.endTime || '18:00'));
  const title = encodeURIComponent(`🎣 Pescaria — ${(trip.speciesNames || []).join(', ')}`);
  const location = encodeURIComponent(trip.locationName || 'Rio Santa Lucía');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${fmt(start)}/${fmt(end)}&location=${location}`;
}

// Traduções para a seção de assinatura Premium
const SUBSCRIPTION_I18N = {
  pt: {
    freePlan: 'Plano Gratuito',
    premiumPlan: 'Você é Premium! 👑',
    upgradePrompt: 'Atualize para Premium para desbloquear recursos exclusivos',
    currency: 'Moeda',
    subscribe: 'Assinar',
    subscribeYearly: 'Assinar Anual',
    save: 'Economize 58%',
    yearlySavings: '58% de economia no plano anual!',
    includedInPremium: '✨ Incluído no Premium:',
    benefits: [
      'Heatmap histórico completo',
      'Alertas ilimitados personalizados',
      'Vídeos e cursos exclusivos',
      'Suporte prioritário',
      'API de acesso para pesquisadores'
    ],
    activeBenefits: '✅ Seus benefícios ativos:',
    premiumBenefits: [
      'Heatmap histórico (12 meses)',
      'Alertas ilimitados por espécie/trecho',
      'Conteúdo exclusivo na Pescademia',
      'Suporte prioritário'
    ],
    planLabel: 'Plano:',
    nextBilling: 'Próxima cobrança:'
  },
  es: {
    freePlan: 'Plan Gratuito',
    premiumPlan: '¡Eres Premium! 👑',
    upgradePrompt: 'Actualice a Premium para desbloquear recursos exclusivos',
    currency: 'Moneda',
    subscribe: 'Suscribirse',
    subscribeYearly: 'Suscribirse Anual',
    save: 'Ahorra 58%',
    yearlySavings: '¡58% de ahorro en el plano anual!',
    includedInPremium: '✨ Incluido en Premium:',
    benefits: [
      'Heatmap histórico completo',
      'Alertas ilimitados personalizados',
      'Videos y cursos exclusivos',
      'Soporte prioritario',
      'API de acceso para investigadores'
    ],
    activeBenefits: '✅ Tus beneficios activos:',
    premiumBenefits: [
      'Heatmap histórico (12 meses)',
      'Alertas ilimitados por especie/tramo',
      'Contenido exclusivo en Pescademia',
      'Soporte prioritario'
    ],
    planLabel: 'Plan:',
    nextBilling: 'Próxima cobranza:'
  },
  en: {
    freePlan: 'Free Plan',
    premiumPlan: 'You are Premium! 👑',
    upgradePrompt: 'Upgrade to Premium to unlock exclusive features',
    currency: 'Currency',
    subscribe: 'Subscribe',
    subscribeYearly: 'Subscribe Yearly',
    save: 'Save 58%',
    yearlySavings: '58% savings on yearly plan!',
    includedInPremium: '✨ Included in Premium:',
    benefits: [
      'Complete historical heatmap',
      'Unlimited custom alerts',
      'Exclusive videos and courses',
      'Priority support',
      'Researcher API access'
    ],
    activeBenefits: '✅ Your active benefits:',
    premiumBenefits: [
      'Historical heatmap (12 months)',
      'Unlimited alerts by species/stretch',
      'Exclusive Pescademia content',
      'Priority support'
    ],
    planLabel: 'Plan:',
    nextBilling: 'Next billing:'
  }
};

export default function UserDashboard({ isOpen, onClose, authSession, occurrences, speciesList, onShowReportSpots }) {
  const t = useT();
  const { lang } = useLang();
  const MONTHS = lang === 'en' ? MONTHS_EN : lang === 'es' ? MONTHS_ES : MONTHS_PT;
  const SEASONS = lang === 'en' ? SEASONS_EN : lang === 'es' ? SEASONS_ES : SEASONS_PT;
  const [tab, setTab] = useState('trips'); // 'trips' | 'history' | 'ranking' | 'subscription' | 'profile'
  const [currency, setCurrency] = useState(() => getDefaultCurrency(detectCountry()));
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionExpanded, setSessionExpanded] = useState(null);
  const [copiedSessionId, setCopiedSessionId] = useState(null);

  function shareSession(s) {
    const text = [
      `🎣 Pescaria em ${s.location_name || 'Rio Santa Lucía'}`,
      `📅 ${new Date(s.started_at).toLocaleDateString('pt-BR')}`,
      s.total_catches > 0 ? `🐟 ${s.total_catches} captura${s.total_catches !== 1 ? 's' : ''}${s.total_weight_kg ? ` · ${s.total_weight_kg} kg` : ''}` : null,
      s.biggest_fish_kg ? `🏆 Maior peixe: ${s.biggest_fish_kg} kg${s.biggest_fish_species ? ` (${s.biggest_fish_species})` : ''}` : null,
      `\n🗺️ Via Pescamon — ${window.location.origin}`,
    ].filter(Boolean).join('\n');
    if (navigator.share) {
      navigator.share({ title: 'Minha Pescaria', text });
    } else {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedSessionId(s.id);
        setTimeout(() => setCopiedSessionId(null), 2000);
      });
    }
  }

  const user = authSession?.user;
  const { isPremium, plan, subscription, loading: loadingPremium, refresh: refreshPremium } = usePremium(user?.id);
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Pescador';

  useEffect(() => {
    if (!isOpen) return;
    setProfileName(user?.user_metadata?.full_name || '');
    setAvatarUrl(user?.user_metadata?.avatar_url || '');
  }, [isOpen, user]);

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setProfileErr('Imagem muito grande (máx. 2 MB).'); return; }
    setUploadingAvatar(true);
    setProfileErr('');
    try {
      const url = await uploadAvatar(file);
      setAvatarUrl(url);
      setProfileMsg('Foto de perfil atualizada!');
    } catch (err) {
      setProfileErr(err?.message || 'Erro ao enviar foto.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  useEffect(() => {
    if (!isOpen || tab !== 'trips') return;
    setLoadingTrips(true);
    fetchPlannedTrips()
      .then(setTrips)
      .catch(() => setTrips([]))
      .finally(() => setLoadingTrips(false));
  }, [isOpen, tab]);

  useEffect(() => {
    if (!isOpen || tab !== 'history') return;
    setLoadingSessions(true);
    getFishingSessions(30)
      .then(setSessions)
      .catch(() => setSessions([]))
      .finally(() => setLoadingSessions(false));
  }, [isOpen, tab]);

  async function handleDeleteTrip(id) {
    try {
      await deletePlannedTrip(id);
      setTrips((prev) => prev.filter((t) => t.id !== id));
    } catch { /* silently fail */ }
  }

  async function handleSaveProfile(e) {
    e.preventDefault();
    setProfileMsg(''); setProfileErr('');
    setSavingProfile(true);
    try {
      const updates = {};
      if (profileName.trim()) updates.full_name = profileName.trim();
      if (profilePassword) {
        if (profilePassword.length < 6) { setProfileErr('Senha deve ter ao menos 6 caracteres.'); return; }
        await supabase.auth.updateUser({ password: profilePassword });
      }
      if (Object.keys(updates).length > 0) await updateUserProfile(updates);
      setProfileMsg('Perfil atualizado com sucesso!');
      setProfilePassword('');
    } catch (err) {
      setProfileErr(err?.message || 'Erro ao salvar perfil.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    onClose();
  }

  const myOccurrences = occurrences.filter(
    (o) => o.userId === user?.id || (!o.userId && !authSession)
  );

  const speciesCount = {};
  for (const o of myOccurrences) {
    speciesCount[o.speciesId] = (speciesCount[o.speciesId] || 0) + 1;
  }
  const topSpecies = Object.entries(speciesCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ sp: speciesList.find((s) => s.id === id), count }))
    .filter((x) => x.sp);

  if (!isOpen) return null;

  return (
    <div className="dashboard-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dashboard-modal">

        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-user">
            <label title="Alterar foto de perfil" style={{ cursor: 'pointer', position: 'relative' }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="avatar" className="dashboard-avatar" style={{ objectFit: 'cover' }} />
              : <div className="dashboard-avatar">{displayName[0]?.toUpperCase()}</div>}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
            {uploadingAvatar && <div style={{ position:'absolute',inset:0,borderRadius:'50%',background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.6rem',color:'#fff' }}>…</div>}
          </label>
            <div>
              <strong>{displayName}</strong>
              <span>{user?.email}</span>
            </div>
          </div>
          <div className="dashboard-header-actions">
            <button type="button" className="dashboard-signout" onClick={handleSignOut} title="Sair">
              <LogOut size={15} /> Sair
            </button>
            <button type="button" className="dashboard-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Tabs */}
        <div className="dashboard-tabs">
          <button type="button" className={tab === 'trips' ? 'active' : ''} onClick={() => setTab('trips')}>
            <Calendar size={14} /> {t('plannedTrips')}
          </button>
          <button type="button" className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            <Fish size={14} /> {t('history')}
          </button>
          <button type="button" className={tab === 'ranking' ? 'active' : ''} onClick={() => setTab('ranking')}>
            <Trophy size={14} /> {t('ranking')}
          </button>
          <button type="button" className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')} title="Relatórios preditivos">
            <BarChart2 size={14} /> {isPremium ? '📊' : '📊🔒'}
          </button>
          <button type="button" className={tab === 'subscription' ? 'active' : ''} onClick={() => setTab('subscription')}>
            <Crown size={14} /> {isPremium ? 'Premium' : 'Premium'}
          </button>
          <button type="button" className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>
            <Settings size={14} /> {t('myProfile')}
          </button>
        </div>

        {/* Body */}
        <div className="dashboard-body">

          {/* FISHING REPORTS TAB */}
          {tab === 'reports' && (
            <div className="dashboard-section">
              <FishingReports userId={user?.id} isPremium={isPremium} onShowSpots={onShowReportSpots} />
            </div>
          )}

          {/* RANKING TAB */}
          {tab === 'ranking' && (
            <div className="dashboard-section">
              <MonthlyRanking />
            </div>
          )}

          {/* TRIPS TAB */}
          {tab === 'trips' && (
            <div className="dashboard-section">
              {loadingTrips && <p className="dash-hint">{t('loading')}</p>}
              {!loadingTrips && trips.length === 0 && (
                <div className="dash-empty">
                  <Calendar size={32} />
                  <p>{t('noTripsYet')}</p>
                  <span>Use o botão "Planejar" para criar sua primeira saída.</span>
                </div>
              )}
              {trips.map((trip) => (
                <div key={trip.id} className="dash-trip-card">
                  <div className="dash-trip-header" onClick={() => setExpanded(expanded === trip.id ? null : trip.id)}>
                    <div className="dash-trip-title">
                      <Fish size={13} />
                      <strong>{(trip.speciesNames || []).join(', ') || 'Pescaria'}</strong>
                      <span className={`dash-trip-type ${trip.tripType}`}>{trip.tripType === 'day' ? '1 dia' : 'Viagem'}</span>
                    </div>
                    <div className="dash-trip-meta">
                      <span><Calendar size={11} /> {trip.startDate}</span>
                      {expanded === trip.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </div>

                  {expanded === trip.id && (
                    <div className="dash-trip-detail">
                      <div className="dash-trip-row"><MapPin size={12} /> {trip.locationName}</div>
                      <div className="dash-trip-row"><Clock size={12} /> {trip.startTime} – {trip.endTime}</div>
                      {trip.gear && <div className="dash-trip-row">🎣 {trip.gear}</div>}
                      {trip.notes && <div className="dash-trip-row">📝 {trip.notes}</div>}
                      <div className="dash-trip-actions">
                        <a href={buildGCalUrl(trip)} target="_blank" rel="noopener noreferrer" className="dash-btn dash-btn-cal">
                          <ExternalLink size={12} /> Google Calendar
                        </a>
                        <button type="button" className="dash-btn dash-btn-del" onClick={() => handleDeleteTrip(trip.id)}>
                          <Trash2 size={12} /> Excluir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === 'history' && (
            <div className="dashboard-section">
              <div className="dash-stats-row">
                <div className="dash-stat"><strong>{myOccurrences.length}</strong><span>Capturas</span></div>
                <div className="dash-stat"><strong>{Object.keys(speciesCount).length}</strong><span>Espécies</span></div>
                <div className="dash-stat">
                  <strong>{myOccurrences.filter((o) => {
                    const d = new Date(o.date); const n = new Date();
                    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
                  }).length}</strong>
                  <span>Este mês</span>
                </div>
              </div>

              {topSpecies.length > 0 && (
                <>
                  <h4 className="dash-section-title">Espécies mais pescadas</h4>
                  {topSpecies.map(({ sp, count }) => (
                    <div key={sp.id} className="dash-species-row">
                      <span className="dash-swatch" style={{ background: sp.color }} />
                      <span>{sp.name}</span>
                      <div className="dash-bar-track">
                        <div className="dash-bar-fill" style={{ width: `${(count / myOccurrences.length) * 100}%`, background: sp.color }} />
                      </div>
                      <strong>{count}x</strong>
                    </div>
                  ))}
                </>
              )}

              {myOccurrences.length === 0 && (
                <div className="dash-empty">
                  <Fish size={32} />
                  <p>{t('noCapturesYet')}</p>
                  <span>Clique no mapa para registrar sua primeira pesca.</span>
                </div>
              )}

              {/* Padrões sazonais */}
              {(() => {
                const patterns = analyzeSeasonalPatterns(myOccurrences);
                if (patterns.length === 0) return null;
                return (
                  <>
                    <h4 className="dash-section-title" style={{ marginTop: 16 }}>📅 Padrões sazonais</h4>
                    {patterns.slice(0, 4).map(p => (
                      <div key={p.speciesId} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e5f6ff' }}>{p.speciesName}</span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{p.totalCatches} capturas · pico: {SEASONS[p.peakSeason]}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {p.monthlyCounts.map((count, m) => {
                            const max = Math.max(...p.monthlyCounts, 1);
                            const height = Math.round((count / max) * 28);
                            const isPeak = m === p.peakMonth;
                            return (
                              <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <div style={{ width: '100%', height: 30, display: 'flex', alignItems: 'flex-end' }}>
                                  <div style={{
                                    width: '100%', height: height || 2,
                                    background: isPeak ? '#22d3ee' : 'rgba(255,255,255,0.15)',
                                    borderRadius: 2,
                                    transition: '0.3s ease',
                                  }} />
                                </div>
                                <span style={{ fontSize: '0.55rem', color: isPeak ? '#22d3ee' : '#475569' }}>{MONTHS[m]}</span>
                              </div>
                            );
                          })}
                        </div>
                        {p.avgWeight && (
                          <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '3px 0 0' }}>Peso médio: {p.avgWeight} kg</p>
                        )}
                      </div>
                    ))}
                  </>
                );
              })()}

              {/* Exportar dados */}
              <h4 className="dash-section-title" style={{ marginTop: 16 }}>Exportar dados</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 4 }}>
                <button
                  type="button"
                  onClick={() => exportOccurrencesCSV(myOccurrences)}
                  disabled={myOccurrences.length === 0}
                  style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(26,111,212,0.12)', border: '1px solid rgba(26,111,212,0.3)', color: '#7ab8f5', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  📊 Capturas CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportOccurrencesGPX(myOccurrences)}
                  disabled={myOccurrences.length === 0}
                  style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#86efac', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  🗺️ Capturas GPX
                </button>
                <button
                  type="button"
                  onClick={() => exportSessionsCSV(sessions)}
                  disabled={sessions.length === 0}
                  style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(245,200,0,0.1)', border: '1px solid rgba(245,200,0,0.3)', color: '#fde68a', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  🎣 Sessões CSV
                </button>
                <button
                  type="button"
                  onClick={() => exportOccurrencesJSON(myOccurrences)}
                  disabled={myOccurrences.length === 0}
                  style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  💾 Backup JSON
                </button>
              </div>

              {/* Sessões de pescaria */}
              <h4 className="dash-section-title" style={{ marginTop: 16 }}>Sessões de pescaria</h4>
              {loadingSessions && <p className="dash-hint">Carregando sessões…</p>}
              {!loadingSessions && sessions.length === 0 && (
                <div className="dash-empty" style={{ padding: '1rem 0' }}>
                  <Clock size={24} />
                  <p>Nenhuma sessão registrada ainda.</p>
                </div>
              )}
              {sessions.map((s) => {
                const started = new Date(s.started_at);
                const ended = s.ended_at ? new Date(s.ended_at) : null;
                const durMin = ended ? Math.round((ended - started) / 60000) : null;
                const durStr = durMin ? (durMin >= 60 ? `${Math.floor(durMin/60)}h${durMin%60 > 0 ? ` ${durMin%60}m` : ''}` : `${durMin}m`) : 'Em andamento';
                const isExp = sessionExpanded === s.id;
                return (
                  <div key={s.id} style={{ marginBottom: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setSessionExpanded(isExp ? null : s.id)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'transparent', border: 'none', color: '#c8e6ff', cursor: 'pointer', gap: 8 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '1.1rem' }}>{s.status === 'active' ? '🟢' : '🎣'}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {s.location_name || 'Pescaria'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {started.toLocaleDateString('pt-BR')} · {durStr}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        {s.total_catches > 0 && (
                          <span style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 700 }}>{s.total_catches} 🐟</span>
                        )}
                        {isExp ? <ChevronUp size={14} color="#64748b" /> : <ChevronDown size={14} color="#64748b" />}
                      </div>
                    </button>
                    {isExp && (
                      <div style={{ padding: '8px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 5, fontSize: '0.82rem', color: '#94a3b8' }}>
                        {s.location_name && <div><MapPin size={12} style={{ marginRight: 5 }} />{s.location_name}</div>}
                        <div><Clock size={12} style={{ marginRight: 5 }} />{started.toLocaleString('pt-BR')} {ended ? `→ ${ended.toLocaleString('pt-BR')} · ${durStr}` : '(em andamento)'}</div>
                        {s.total_catches > 0 && <div><Fish size={12} style={{ marginRight: 5 }} />{s.total_catches} captura{s.total_catches !== 1 ? 's' : ''}{s.total_weight_kg ? ` · ${s.total_weight_kg} kg total` : ''}</div>}
                        {s.biggest_fish_kg && <div>🏆 Maior peixe: {s.biggest_fish_kg} kg{s.biggest_fish_species ? ` (${s.biggest_fish_species})` : ''}</div>}
                        {s.notes && <div style={{ fontStyle: 'italic', color: '#64748b' }}>📝 {s.notes}</div>}
                        <button
                          type="button"
                          onClick={() => shareSession(s)}
                          style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: '#7ab8f5', cursor: 'pointer', fontSize: '0.78rem', width: 'fit-content' }}
                        >
                          {copiedSessionId === s.id ? <><CheckCheck size={12} /> Copiado!</> : <><Share2 size={12} /> Compartilhar</>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {myOccurrences.length > 0 && (
                <>
                  <h4 className="dash-section-title" style={{ marginTop: 16 }}>Últimas capturas avulsas</h4>
                  <div className="dash-occurrence-list">
                    {[...myOccurrences].reverse().slice(0, 20).map((o) => {
                      const sp = speciesList.find((s) => s.id === o.speciesId);
                      return (
                        <div key={o.id} className="dash-occurrence-row">
                          <span className="dash-swatch" style={{ background: sp?.color || '#64748b' }} />
                          <div>
                            <strong>{o.speciesName}</strong>
                            <span>{new Date(o.date).toLocaleDateString('pt-BR')}</span>
                            {o.weightKg > 0 && <span> · {o.weightKg} kg</span>}
                            {o.baitUsed && <span> · {o.baitUsed}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* SUBSCRIPTION TAB */}
          {tab === 'subscription' && (
            <div className="dashboard-section">
              {loadingPremium ? (
                <p className="dash-hint">Carregando assinatura…</p>
              ) : isPremium ? (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 1rem',
                    }}
                  >
                    <Crown size={40} color="white" />
                  </div>
                  <h3 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#fbbf24' }}>
                    {SUBSCRIPTION_I18N[lang]?.premiumPlan || SUBSCRIPTION_I18N.pt.premiumPlan}
                  </h3>
                  <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
                    {SUBSCRIPTION_I18N[lang]?.planLabel || SUBSCRIPTION_I18N.pt.planLabel} <strong>{plan?.[`title_${lang}`] || plan?.title_pt || 'Premium'}</strong>
                  </p>
                  {subscription?.current_period_end && (
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
                      {SUBSCRIPTION_I18N[lang]?.nextBilling || SUBSCRIPTION_I18N.pt.nextBilling} {new Date(subscription.current_period_end).toLocaleDateString(lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR')}
                    </p>
                  )}
                  <div
                    style={{
                      background: 'rgba(34,197,94,0.1)',
                      border: '1px solid rgba(34,197,94,0.3)',
                      borderRadius: '10px',
                      padding: '1rem',
                      textAlign: 'left',
                    }}
                  >
                    <h4 style={{ fontSize: '0.9rem', color: '#34d399', marginBottom: '0.75rem' }}>
                      {SUBSCRIPTION_I18N[lang]?.activeBenefits || SUBSCRIPTION_I18N.pt.activeBenefits}
                    </h4>
                    <ul style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.6, margin: 0, paddingLeft: '1.2rem' }}>
                      {(SUBSCRIPTION_I18N[lang]?.premiumBenefits || SUBSCRIPTION_I18N.pt.premiumBenefits).map((benefit, i) => (
                        <li key={i}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <div
                    style={{
                      width: '80px',
                      height: '80px',
                      borderRadius: '50%',
                      background: 'var(--bg-card2)',
                      border: '2px dashed var(--border-faint)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 1rem',
                    }}
                  >
                    <Crown size={40} color="#64748b" />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                    {SUBSCRIPTION_I18N[lang]?.freePlan || SUBSCRIPTION_I18N.pt.freePlan}
                  </h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    {SUBSCRIPTION_I18N[lang]?.upgradePrompt || SUBSCRIPTION_I18N.pt.upgradePrompt}
                  </p>

                  {/* Currency Selector */}
                  <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                      {SUBSCRIPTION_I18N[lang]?.currency || SUBSCRIPTION_I18N.pt.currency}
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        background: '#1e293b',
                        color: '#e2e8f0',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="brl">🇧🇷 Real (R$)</option>
                      <option value="uyu">🇺🇾 Peso Uruguaio ($)</option>
                      <option value="usd">🇺🇸 Dólar (US$)</option>
                    </select>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.75rem',
                      marginBottom: '1.5rem',
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--bg-card2)',
                        borderRadius: '10px',
                        padding: '1rem',
                        border: '2px solid transparent',
                      }}
                    >
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {PRICES.monthly[currency]}
                      </div>
                      <button
                        onClick={() => openStripeCheckout('premium', 'monthly')}
                        style={{
                          width: '100%',
                          marginTop: '0.75rem',
                          padding: '0.6rem',
                          background: 'var(--accent)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <CreditCard size={14} style={{ marginRight: '4px' }} />
                        {SUBSCRIPTION_I18N[lang]?.subscribe || SUBSCRIPTION_I18N.pt.subscribe}
                      </button>
                    </div>

                    <div
                      style={{
                        background: 'var(--bg-card2)',
                        borderRadius: '10px',
                        padding: '1rem',
                        border: '2px solid #22c55e',
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '-8px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: '#22c55e',
                          color: 'white',
                          fontSize: '0.65rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        🔥 {SUBSCRIPTION_I18N[lang]?.save || SUBSCRIPTION_I18N.pt.save}
                      </span>
                      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {PRICES.yearly[currency]}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '6px', fontWeight: 600 }}>
                        🔥 {SUBSCRIPTION_I18N[lang]?.yearlySavings || SUBSCRIPTION_I18N.pt.yearlySavings}
                      </div>
                      <button
                        onClick={() => openStripeCheckout('premium', 'yearly')}
                        style={{
                          width: '100%',
                          marginTop: '0.75rem',
                          padding: '0.6rem',
                          background: '#22c55e',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        <Crown size={14} style={{ marginRight: '4px' }} />
                        {SUBSCRIPTION_I18N[lang]?.subscribeYearly || SUBSCRIPTION_I18N.pt.subscribeYearly}
                      </button>
                    </div>
                  </div>

                  <div style={{ textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.5rem' }}>{SUBSCRIPTION_I18N[lang]?.includedInPremium || SUBSCRIPTION_I18N.pt.includedInPremium}</h4>
                    <ul style={{ lineHeight: 1.8, paddingLeft: '1.2rem', margin: 0 }}>
                      {(SUBSCRIPTION_I18N[lang]?.benefits || SUBSCRIPTION_I18N.pt.benefits).map((benefit, i) => (
                        <li key={i}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROFILE TAB */}
          {tab === 'profile' && (
            <div className="dashboard-section">
              <form className="dash-profile-form" onSubmit={handleSaveProfile}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <label style={{ cursor:'pointer', position:'relative', flexShrink:0 }}>
                    {avatarUrl
                      ? <img src={avatarUrl} alt="avatar" style={{ width:56,height:56,borderRadius:'50%',objectFit:'cover',border:'2px solid #334155' }} />
                      : <div style={{ width:56,height:56,borderRadius:'50%',background:'#1e3a5f',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',border:'2px solid #334155',color:'#7ab8f5' }}>{displayName[0]?.toUpperCase()}</div>}
                    <input type="file" accept="image/*" style={{ display:'none' }} onChange={handleAvatarUpload} />
                    <div style={{ position:'absolute',bottom:0,right:0,background:'#1e40af',borderRadius:'50%',padding:3,border:'2px solid #0f172a' }}>
                      <Upload size={10} color="#fff" />
                    </div>
                    {uploadingAvatar && <div style={{ position:'absolute',inset:0,borderRadius:'50%',background:'rgba(0,0,0,0.55)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',color:'#fff' }}>Enviando…</div>}
                  </label>
                  <span style={{ fontSize:'0.78rem',color:'#64748b' }}>Clique na foto para alterar<br/>(JPG/PNG · máx 2 MB)</span>
                </div>
                <div className="auth-field">
                  <User size={15} />
                  <input type="text" placeholder="Seu nome" value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                </div>
                <div className="auth-field dash-email-field">
                  <span className="dash-email-label">{user?.email}</span>
                </div>
                <div className="auth-field">
                  <Lock size={15} />
                  <input type={showPass ? 'text' : 'password'} placeholder="Nova senha (deixe em branco para manter)" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} />
                  <button type="button" className="auth-eye" onClick={() => setShowPass((v) => !v)}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {profileErr && <div className="auth-error"><AlertTriangle size={13} /> {profileErr}</div>}
                {profileMsg && <div className="auth-success"><Check size={13} /> {profileMsg}</div>}
                <button type="submit" className="auth-submit" disabled={savingProfile}>
                  {savingProfile ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </form>

              <div className="dash-danger-zone">
                <h4>Encerrar sessão</h4>
                <button type="button" className="dash-btn dash-btn-del" onClick={handleSignOut}>
                  <LogOut size={13} /> Sair da conta
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
