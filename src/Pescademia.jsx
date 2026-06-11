import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';
import { usePremium, requirePremium } from './usePremium.js';
import {
  Play, BookOpen, FileText, GraduationCap, Heart, Eye, Clock,
  Search, X, ExternalLink, Download, Upload,
  Star, Lock, CheckCircle, Loader, Globe,
  Award, Zap, Fish, Layers, Video, Radio, Bookmark, Printer, Crown
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',         label: 'Tudo',          icon: <Layers size={14} /> },
  { id: 'tecnicas',    label: 'Técnicas',       icon: <Fish size={14} /> },
  { id: 'equipamentos',label: 'Equipamentos',   icon: <Zap size={14} /> },
  { id: 'especies',    label: 'Espécies',       icon: <Bookmark size={14} /> },
  { id: 'legislacao',  label: 'Legislação',     icon: <FileText size={14} /> },
  { id: 'geral',       label: 'Geral',          icon: <Globe size={14} /> },
];

const LEVELS = [
  { id: 'all',          label: 'Todos os níveis' },
  { id: 'iniciante',    label: 'Iniciante' },
  { id: 'intermediario',label: 'Intermediário' },
  { id: 'avancado',     label: 'Avançado' },
];

const TYPE_META = {
  video:   { label: 'Vídeo',   icon: <Play size={13} />,       color: '#ef4444' },
  ebook:   { label: 'E-book',  icon: <BookOpen size={13} />,   color: '#3b82f6' },
  article: { label: 'Artigo',  icon: <FileText size={13} />,   color: '#22c55e' },
  course:  { label: 'Curso',   icon: <GraduationCap size={13} />, color: '#a855f7' },
};

const PLATFORM_ICON = {
  youtube: <Video size={14} style={{ color: '#ef4444' }} />,
  twitch:  <Radio size={14} style={{ color: '#a855f7' }} />,
  vimeo:   <Globe size={14} style={{ color: '#1ab7ea' }} />,
  other:   <Globe size={14} />,
};

function getEmbedUrl(videoUrl, platform) {
  if (!videoUrl) return null;
  if (platform === 'youtube' || videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
    const match = videoUrl.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (match) return `https://www.youtube.com/embed/${match[1]}?rel=0&modestbranding=1`;
  }
  if (platform === 'twitch' || videoUrl.includes('twitch.tv')) {
    const match = videoUrl.match(/twitch\.tv\/videos\/(\d+)/);
    if (match) return `https://player.twitch.tv/?video=${match[1]}&parent=${window.location.hostname}`;
    const chanMatch = videoUrl.match(/twitch\.tv\/([^/]+)/);
    if (chanMatch) return `https://player.twitch.tv/?channel=${chanMatch[1]}&parent=${window.location.hostname}`;
  }
  if (platform === 'vimeo' || videoUrl.includes('vimeo.com')) {
    const match = videoUrl.match(/vimeo\.com\/(\d+)/);
    if (match) return `https://player.vimeo.com/video/${match[1]}?api=1&autopause=0`;
  }
  return videoUrl;
}

function formatDuration(min) {
  if (!min) return null;
  if (min < 60) return `${min}min`;
  return `${Math.floor(min / 60)}h${min % 60 > 0 ? ` ${min % 60}min` : ''}`;
}

function LevelBadge({ level }) {
  const colors = { iniciante: '#22c55e', intermediario: '#f59e0b', avancado: '#ef4444' };
  const labels = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
  return (
    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: colors[level] + '22', color: colors[level], border: `1px solid ${colors[level]}44` }}>
      {labels[level]}
    </span>
  );
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function fetchContent({ category = 'all', level = 'all', type = 'all', search = '', page = 0 } = {}) {
  let q = supabase.from('academy_content').select('*').order('is_featured', { ascending: false }).order('published_at', { ascending: false }).range(page * 12, page * 12 + 11);
  if (category !== 'all') q = q.eq('category', category);
  if (level !== 'all') q = q.eq('level', level);
  if (type !== 'all') q = q.eq('content_type', type);
  if (search.trim()) q = q.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchLikedIds(userId) {
  if (!userId) return new Set();
  const { data } = await supabase.from('academy_likes').select('content_id').eq('user_id', userId);
  return new Set((data || []).map(r => r.content_id));
}

async function toggleLike(contentId, userId) {
  const { data: existing } = await supabase.from('academy_likes').select('id').eq('content_id', contentId).eq('user_id', userId).single();
  if (existing) {
    await supabase.from('academy_likes').delete().eq('id', existing.id);
    await supabase.rpc('decrement_content_likes', { content_id: contentId });
    return false;
  } else {
    await supabase.from('academy_likes').insert({ content_id: contentId, user_id: userId });
    await supabase.rpc('increment_content_likes', { content_id: contentId });
    return true;
  }
}

async function fetchProgress(userId) {
  if (!userId) return {};
  const { data } = await supabase.from('academy_progress').select('content_id, completed, progress_pct').eq('user_id', userId);
  return Object.fromEntries((data || []).map(r => [r.content_id, r]));
}

async function fetchCourseChapters(courseId) {
  const { data, error } = await supabase
    .from('academy_chapters')
    .select('*')
    .eq('course_id', courseId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function fetchChapterProgress(userId, courseId) {
  if (!userId) return {};
  const { data } = await supabase
    .from('academy_chapter_progress')
    .select('chapter_id, progress_pct, completed')
    .eq('user_id', userId)
    .eq('course_id', courseId);
  return Object.fromEntries((data || []).map(r => [r.chapter_id, r]));
}

async function saveChapterProgress(userId, courseId, chapterId, progressPct) {
  if (!userId) return;
  const completed = progressPct >= 90;
  await supabase.from('academy_chapter_progress').upsert(
    { user_id: userId, course_id: courseId, chapter_id: chapterId, progress_pct: progressPct, completed, watched_at: new Date().toISOString() },
    { onConflict: 'user_id,chapter_id' }
  );
}

// ── CertificateModal ─────────────────────────────────────────────────────────
function CertificateModal({ item, onClose, userName }) {
  const date = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  return (
    <div className="pa-player-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pa-cert-modal">
        <div className="pa-cert-actions">
          <button className="pa-btn-secondary" style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => window.print()}>
            <Printer size={14} /> Imprimir / Salvar PDF
          </button>
          <button className="pa-close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div id="pa-cert-printable" className="pa-cert-printable">
          <div className="pa-cert-header">
            <div className="pa-cert-logo">🎣 Pescamon</div>
            <div className="pa-cert-subtitle">Certificado de Conclusão</div>
          </div>
          <div className="pa-cert-body">
            <p className="pa-cert-text">Certificamos que</p>
            <p className="pa-cert-name">{userName || 'Pescador'}</p>
            <p className="pa-cert-text">concluiu com êxito o curso</p>
            <p className="pa-cert-course">{item.title}</p>
            {item.author_name && <p className="pa-cert-author">ministrado por {item.author_name}</p>}
          </div>
          <div className="pa-cert-footer">
            <div className="pa-cert-seal"><Award size={32} /> 100%</div>
            <div className="pa-cert-date">{date}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CourseViewer ─────────────────────────────────────────────────────────────
function CourseViewer({ item, onClose, currentUserId, liked, onLikeToggle, userName }) {
  const [chapters, setChapters] = useState([]);
  const [chapterProgress, setChapterProgress] = useState({});
  const [activeChapter, setActiveChapter] = useState(null);
  const [loadingChapters, setLoadingChapters] = useState(true);
  const [localLiked, setLocalLiked] = useState(liked);
  const [localLikes, setLocalLikes] = useState(item.like_count || 0);
  const [showCert, setShowCert] = useState(false);
  const iframeRef = useRef(null);
  const progressSaveRef = useRef(null);

  useEffect(() => {
    supabase.rpc('increment_course_views', { course_id: item.id }).catch(() => {});
    fetchCourseChapters(item.id).then(chs => {
      setChapters(chs);
      if (chs.length > 0) setActiveChapter(chs[0]);
      setLoadingChapters(false);
    });
    fetchChapterProgress(currentUserId, item.id).then(setChapterProgress);
  }, [item.id, currentUserId]);

  // Rastreamento de progresso: YouTube (postMessage infoDelivery), Vimeo (postMessage timeupdate), Twitch (timer heurístico)
  const twitchTimerRef = useRef(null);
  const twitchSecondsRef = useRef(0);
  const twitchDurationRef = useRef(0);

  useEffect(() => {
    if (!activeChapter) return;
    // Reset Twitch timer ao trocar capítulo
    clearInterval(twitchTimerRef.current);
    twitchSecondsRef.current = 0;

    const platform = activeChapter.video_platform ||
      (activeChapter.video_url?.includes('youtu') ? 'youtube' :
       activeChapter.video_url?.includes('vimeo') ? 'vimeo' :
       activeChapter.video_url?.includes('twitch') ? 'twitch' : 'other');

    // ── YouTube + Vimeo: postMessage ──────────────────────────────────────────
    function handleMessage(e) {
      if (!e.data) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;

        // YouTube Player API: event=infoDelivery
        if (data.event === 'infoDelivery' && data.info) {
          const { currentTime, duration } = data.info;
          if (currentTime && duration && duration > 0) {
            const pct = Math.round((currentTime / duration) * 100);
            clearTimeout(progressSaveRef.current);
            progressSaveRef.current = setTimeout(() => {
              saveChapterProgress(currentUserId, item.id, activeChapter.id, pct);
              setChapterProgress(prev => ({ ...prev, [activeChapter.id]: { progress_pct: pct, completed: pct >= 90 } }));
            }, 2000);
          }
        }

        // Vimeo Player API: method=timeupdate ou event=timeupdate
        if (data.event === 'timeupdate' && data.data) {
          const { seconds, duration } = data.data;
          if (seconds != null && duration > 0) {
            const pct = Math.round((seconds / duration) * 100);
            clearTimeout(progressSaveRef.current);
            progressSaveRef.current = setTimeout(() => {
              saveChapterProgress(currentUserId, item.id, activeChapter.id, pct);
              setChapterProgress(prev => ({ ...prev, [activeChapter.id]: { progress_pct: pct, completed: pct >= 90 } }));
            }, 2000);
          }
        }
      } catch {}
    }

    // Solicitar eventos ao player Vimeo após montar
    if (platform === 'vimeo') {
      const trySubscribe = () => {
        try {
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'timeupdate' }), '*');
          iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ method: 'getDuration' }), '*');
        } catch {}
      };
      const subTimer = setTimeout(trySubscribe, 1500);
      window.addEventListener('message', handleMessage);
      return () => {
        clearTimeout(subTimer);
        window.removeEventListener('message', handleMessage);
        clearTimeout(progressSaveRef.current);
      };
    }

    // ── Twitch: timer heurístico (sem API postMessage para iframes externos) ──
    if (platform === 'twitch') {
      const durationMin = activeChapter.duration_min || 0;
      twitchDurationRef.current = durationMin * 60; // segundos estimados
      twitchTimerRef.current = setInterval(() => {
        twitchSecondsRef.current += 5;
        const total = twitchDurationRef.current || 1800; // fallback 30min
        const pct = Math.min(99, Math.round((twitchSecondsRef.current / total) * 100));
        clearTimeout(progressSaveRef.current);
        progressSaveRef.current = setTimeout(() => {
          saveChapterProgress(currentUserId, item.id, activeChapter.id, pct);
          setChapterProgress(prev => ({ ...prev, [activeChapter.id]: { progress_pct: pct, completed: pct >= 90 } }));
        }, 2000);
      }, 5000); // tick a cada 5s
      return () => { clearInterval(twitchTimerRef.current); clearTimeout(progressSaveRef.current); };
    }

    // ── YouTube (default) ─────────────────────────────────────────────────────
    window.addEventListener('message', handleMessage);
    return () => { window.removeEventListener('message', handleMessage); clearTimeout(progressSaveRef.current); };
  }, [activeChapter, currentUserId, item.id]);

  async function handleLike() {
    if (!currentUserId) return;
    const nowLiked = !localLiked;
    setLocalLiked(nowLiked);
    setLocalLikes(n => nowLiked ? n + 1 : n - 1);
    await onLikeToggle(item.id);
  }

  const completedCount = Object.values(chapterProgress).filter(p => p.completed).length;
  const totalPct = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;

  const embedUrl = activeChapter ? getEmbedUrl(activeChapter.video_url, activeChapter.video_platform) : null;

  return (
    <div className="pa-player-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pa-player-modal pa-course-modal">
        <div className="pa-player-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-player-title">{item.title}</div>
            <div className="pa-player-meta">
              {item.author_name && <span>{item.author_name}</span>}
              <span className="pa-sep">·</span>
              <span>{chapters.length} cap{chapters.length !== 1 ? 'ítulos' : 'ítulo'}</span>
              {totalPct > 0 && <><span className="pa-sep">·</span><span style={{ color: '#22c55e' }}>{totalPct}% concluído</span></>}
            </div>
          </div>
          <button className="pa-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pa-course-body">
          {/* Player */}
          <div className="pa-course-player">
            {embedUrl ? (
              <div className="pa-video-wrap">
                <iframe
                  ref={iframeRef}
                  src={embedUrl + (embedUrl.includes('youtube') ? '&enablejsapi=1' : '')}
                  title={activeChapter?.title}
                  className="pa-video-frame"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="pa-course-no-video">
                <GraduationCap size={40} style={{ opacity: 0.3 }} />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Selecione um capítulo</p>
              </div>
            )}
            {activeChapter && (
              <div className="pa-course-chapter-info">
                <strong>{activeChapter.title}</strong>
                {activeChapter.description && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '4px 0 0' }}>{activeChapter.description}</p>}
              </div>
            )}
          </div>

          {/* Chapters list */}
          <div className="pa-course-chapters">
            <div className="pa-course-progress-header">
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-heading)' }}>Capítulos</span>
              <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>{completedCount}/{chapters.length}</span>
            </div>
            {totalPct > 0 && (
              <div className="pa-progress-bar" style={{ marginBottom: 12 }}>
                <div className="pa-progress-fill" style={{ width: `${totalPct}%`, background: '#22c55e' }} />
              </div>
            )}
            {loadingChapters && <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Loader size={18} className="pa-spin" /></div>}
            {!loadingChapters && chapters.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '12px 0' }}>Nenhum capítulo ainda.</p>
            )}
            {chapters.map((ch, idx) => {
              const prog = chapterProgress[ch.id];
              const isActive = activeChapter?.id === ch.id;
              return (
                <button
                  key={ch.id}
                  className={`pa-chapter-row${isActive ? ' active' : ''}${prog?.completed ? ' done' : ''}`}
                  onClick={() => setActiveChapter(ch)}
                  type="button"
                >
                  <span className="pa-chapter-num">
                    {prog?.completed ? <CheckCircle size={14} style={{ color: '#22c55e' }} /> : <span>{idx + 1}</span>}
                  </span>
                  <div className="pa-chapter-info">
                    <span className="pa-chapter-title">{ch.title}</span>
                    {ch.duration_min && <span className="pa-chapter-dur"><Clock size={10} /> {formatDuration(ch.duration_min)}</span>}
                  </div>
                  {prog && !prog.completed && prog.progress_pct > 0 && (
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{prog.progress_pct}%</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pa-player-footer">
          {item.description && <p className="pa-player-desc">{item.description}</p>}
          <div className="pa-player-actions">
            <button className={`pa-like-btn${localLiked ? ' liked' : ''}`} onClick={handleLike} disabled={!currentUserId}>
              <Heart size={16} fill={localLiked ? 'currentColor' : 'none'} /> {localLikes > 0 ? localLikes : ''}
            </button>
            {totalPct === 100 && (
              <button className="pa-cert-btn" onClick={() => setShowCert(true)}>
                <Award size={15} /> Obter Certificado
              </button>
            )}
            {activeChapter && (
              <button
                className="pa-ext-btn"
                onClick={() => {
                  const idx = chapters.findIndex(c => c.id === activeChapter.id);
                  if (idx < chapters.length - 1) setActiveChapter(chapters[idx + 1]);
                }}
                disabled={chapters.findIndex(c => c.id === activeChapter?.id) >= chapters.length - 1}
              >
                Próximo capítulo →
              </button>
            )}
          </div>
        </div>
      </div>
      {showCert && <CertificateModal item={item} userName={userName} onClose={() => setShowCert(false)} />}
    </div>
  );
}

// ── VideoPlayer ───────────────────────────────────────────────────────────────
function VideoPlayer({ item, onClose, currentUserId, liked, onLikeToggle }) {
  const embedUrl = getEmbedUrl(item.video_url, item.video_platform);
  const [localLiked, setLocalLiked] = useState(liked);
  const [localLikes, setLocalLikes] = useState(item.like_count || 0);

  useEffect(() => {
    supabase.rpc('increment_content_views', { content_id: item.id }).catch(() => {});
  }, [item.id]);

  async function handleLike() {
    if (!currentUserId) return;
    const nowLiked = !localLiked;
    setLocalLiked(nowLiked);
    setLocalLikes(n => nowLiked ? n + 1 : n - 1);
    await onLikeToggle(item.id);
  }

  return (
    <div className="pa-player-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pa-player-modal">
        <div className="pa-player-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-player-title">{item.title}</div>
            <div className="pa-player-meta">
              {item.author_name && <span>{item.author_name}</span>}
              {item.duration_min && <><span className="pa-sep">·</span><Clock size={11} /><span>{formatDuration(item.duration_min)}</span></>}
              <span className="pa-sep">·</span><Eye size={11} /><span>{item.view_count} visualizações</span>
            </div>
          </div>
          <button className="pa-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {embedUrl ? (
          <div className="pa-video-wrap">
            <iframe
              src={embedUrl}
              title={item.title}
              className="pa-video-frame"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="pa-video-fallback">
            <a href={item.video_url} target="_blank" rel="noopener noreferrer" className="pa-ext-link">
              <ExternalLink size={16} /> Abrir vídeo externamente
            </a>
          </div>
        )}

        <div className="pa-player-footer">
          {item.description && <p className="pa-player-desc">{item.description}</p>}
          {item.tags?.length > 0 && (
            <div className="pa-tags">
              {item.tags.map(t => <span key={t} className="pa-tag">#{t}</span>)}
            </div>
          )}
          <div className="pa-player-actions">
            <button className={`pa-like-btn${localLiked ? ' liked' : ''}`} onClick={handleLike} disabled={!currentUserId}>
              <Heart size={16} fill={localLiked ? 'currentColor' : 'none'} /> {localLikes > 0 ? localLikes : ''}
            </button>
            <a href={item.video_url} target="_blank" rel="noopener noreferrer" className="pa-ext-btn">
              {PLATFORM_ICON[item.video_platform] || <Globe size={14} />} Ver no original
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── EbookViewer ───────────────────────────────────────────────────────────────
function EbookViewer({ item, onClose, currentUserId, liked, onLikeToggle }) {
  const [localLiked, setLocalLiked] = useState(liked);
  const [localLikes, setLocalLikes] = useState(item.like_count || 0);

  useEffect(() => {
    supabase.rpc('increment_content_views', { content_id: item.id }).catch(() => {});
  }, [item.id]);

  async function handleLike() {
    if (!currentUserId) return;
    const nowLiked = !localLiked;
    setLocalLiked(nowLiked);
    setLocalLikes(n => nowLiked ? n + 1 : n - 1);
    await onLikeToggle(item.id);
  }

  return (
    <div className="pa-player-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pa-player-modal pa-ebook-modal">
        <div className="pa-player-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="pa-player-title">{item.title}</div>
            <div className="pa-player-meta">
              {item.author_name && <span>{item.author_name}</span>}
              {item.page_count && <><span className="pa-sep">·</span><span>{item.page_count} páginas</span></>}
            </div>
          </div>
          <button className="pa-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="pa-ebook-body">
          <div className="pa-ebook-cover">
            {item.thumbnail_url
              ? <img src={item.thumbnail_url} alt={item.title} className="pa-ebook-cover-img" />
              : <div className="pa-ebook-cover-placeholder"><BookOpen size={48} /></div>
            }
          </div>
          <div className="pa-ebook-info">
            <LevelBadge level={item.level} />
            {item.description && <p className="pa-ebook-desc">{item.description}</p>}
            {item.tags?.length > 0 && (
              <div className="pa-tags">
                {item.tags.map(t => <span key={t} className="pa-tag">#{t}</span>)}
              </div>
            )}
            <div className="pa-ebook-actions">
              <button className={`pa-like-btn${localLiked ? ' liked' : ''}`} onClick={handleLike} disabled={!currentUserId}>
                <Heart size={16} fill={localLiked ? 'currentColor' : 'none'} /> {localLikes > 0 ? localLikes : 'Curtir'}
              </button>
              {item.file_url && (
                <a href={item.file_url} target="_blank" rel="noopener noreferrer" download className="pa-download-btn">
                  <Download size={15} /> Baixar
                  {item.file_size_kb && <span className="pa-file-size">({Math.round(item.file_size_kb / 1024 * 10) / 10} MB)</span>}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ContentCard ───────────────────────────────────────────────────────────────
function ContentCard({ item, liked, progress, onOpen }) {
  const typeMeta = TYPE_META[item.content_type] || TYPE_META.article;
  const isVideo = item.content_type === 'video';
  const thumb = item.thumbnail_url || (isVideo && item.video_url ? `https://img.youtube.com/vi/${item.video_url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1]}/mqdefault.jpg` : null);

  return (
    <article className="pa-card" onClick={() => onOpen(item)}>
      {/* Thumbnail */}
      <div className="pa-card-thumb">
        {thumb
          ? <img src={thumb} alt={item.title} className="pa-card-thumb-img" loading="lazy" />
          : <div className="pa-card-thumb-placeholder" style={{ background: typeMeta.color + '18' }}>
              <span style={{ fontSize: '2rem', color: typeMeta.color }}>{typeMeta.icon}</span>
            </div>
        }
        {isVideo && <div className="pa-play-overlay"><Play size={28} fill="white" /></div>}
        {item.is_featured && <span className="pa-featured-badge"><Star size={10} /> Destaque</span>}
        {item.is_premium && (
          <span className="pa-premium-badge" style={{ position: 'absolute', top: '8px', right: '8px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', fontSize: '0.65rem', padding: '4px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, zIndex: 2 }}>
            <Crown size={10} /> Premium
          </span>
        )}
        {!item.is_free && !item.is_premium && <span className="pa-lock-badge"><Lock size={10} /></span>}
        {progress?.completed && <span className="pa-done-badge"><CheckCircle size={12} /></span>}
        <span className="pa-type-badge" style={{ background: typeMeta.color }}>
          {typeMeta.icon} {typeMeta.label}
        </span>
      </div>

      {/* Info */}
      <div className="pa-card-body">
        <div className="pa-card-top">
          <LevelBadge level={item.level} />
          {item.duration_min && (
            <span className="pa-card-duration"><Clock size={11} /> {formatDuration(item.duration_min)}</span>
          )}
        </div>
        <h3 className="pa-card-title">{item.title}</h3>
        {item.description && <p className="pa-card-desc">{item.description}</p>}
        <div className="pa-card-footer">
          {item.author_name && <span className="pa-card-author">{item.author_name}</span>}
          <div className="pa-card-stats">
            <span><Eye size={11} /> {item.view_count}</span>
            <span><Heart size={11} fill={liked ? 'currentColor' : 'none'} style={{ color: liked ? '#ef4444' : 'inherit' }} /> {item.like_count}</span>
          </div>
        </div>
        {progress && !progress.completed && progress.progress_pct > 0 && (
          <div className="pa-progress-bar">
            <div className="pa-progress-fill" style={{ width: `${progress.progress_pct}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}

// ── PdfUploadField ───────────────────────────────────────────────────────────
const PDF_BUCKET = 'academy-pdfs';

function PdfUploadField({ fileUrl, fileSizeKb, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') { setError('Apenas arquivos PDF.'); return; }
    if (file.size > 50 * 1024 * 1024) { setError('Máximo 50 MB.'); return; }
    setError('');
    setUploading(true);
    try {
      const path = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from(PDF_BUCKET).upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from(PDF_BUCKET).getPublicUrl(path);
      onUploaded(urlData.publicUrl, Math.round(file.size / 1024));
    } catch (err) {
      setError('Erro no upload: ' + err.message);
    } finally { setUploading(false); }
  }

  return (
    <div className="pa-admin-field pa-admin-full">
      <label>Arquivo PDF</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" className="pa-btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', padding: '6px 14px' }}
          onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader size={14} className="pa-spin" /> : <Upload size={14} />}
          {uploading ? 'Enviando...' : 'Selecionar PDF'}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={handleFile} />
        {fileUrl && (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="pa-ext-btn" style={{ fontSize: '0.78rem' }}>
            <FileText size={13} /> {fileSizeKb ? `${Math.round(fileSizeKb / 1024 * 10) / 10} MB` : 'Ver PDF'}
          </a>
        )}
      </div>
      {error && <span style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 4 }}>{error}</span>}
    </div>
  );
}

// ── AdminPanel ─────────────────────────────────────────────────────────────────
function AdminPanel({ currentUserId, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: '', description: '', content_type: 'video', category: 'tecnicas',
    level: 'iniciante', video_url: '', video_platform: 'youtube',
    duration_min: '', file_url: '', file_size_kb: '', page_count: '',
    thumbnail_url: '', author_name: '', tags: '', is_free: true, is_featured: false,
  });
  const [saving, setSaving] = useState(false);

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_min: form.duration_min ? parseInt(form.duration_min) : null,
        file_size_kb: form.file_size_kb ? parseInt(form.file_size_kb) : null,
        page_count: form.page_count ? parseInt(form.page_count) : null,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        created_by: currentUserId,
      };
      const { error } = await supabase.from('academy_content').insert(payload);
      if (error) throw error;
      onSaved?.();
      onClose();
    } catch (err) {
      alert('Erro: ' + err.message);
    } finally { setSaving(false); }
  }

  const isVideo = form.content_type === 'video';
  const isEbook = form.content_type === 'ebook';

  return (
    <div className="pa-player-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pa-player-modal pa-admin-modal">
        <div className="pa-player-header">
          <span style={{ fontWeight: 700 }}>Adicionar conteúdo</span>
          <button className="pa-close-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="pa-admin-body">
          <div className="pa-admin-grid">
            <div className="pa-admin-field pa-admin-full">
              <label>Título *</label>
              <input className="pa-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Título do conteúdo" maxLength={120} />
            </div>
            <div className="pa-admin-field pa-admin-full">
              <label>Descrição</label>
              <textarea className="pa-input pa-textarea" value={form.description} onChange={e => set('description', e.target.value)} rows={3} placeholder="Descrição breve" maxLength={500} />
            </div>
            <div className="pa-admin-field">
              <label>Tipo</label>
              <select className="pa-input" value={form.content_type} onChange={e => set('content_type', e.target.value)}>
                <option value="video">Vídeo</option>
                <option value="ebook">E-book</option>
                <option value="article">Artigo</option>
                <option value="course">Curso</option>
              </select>
            </div>
            <div className="pa-admin-field">
              <label>Categoria</label>
              <select className="pa-input" value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div className="pa-admin-field">
              <label>Nível</label>
              <select className="pa-input" value={form.level} onChange={e => set('level', e.target.value)}>
                <option value="iniciante">Iniciante</option>
                <option value="intermediario">Intermediário</option>
                <option value="avancado">Avançado</option>
              </select>
            </div>
            <div className="pa-admin-field">
              <label>Autor</label>
              <input className="pa-input" value={form.author_name} onChange={e => set('author_name', e.target.value)} placeholder="Nome do autor" />
            </div>

            {isVideo && <>
              <div className="pa-admin-field pa-admin-full">
                <label>URL do vídeo (YouTube / Twitch / Vimeo)</label>
                <input className="pa-input" value={form.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
              </div>
              <div className="pa-admin-field">
                <label>Plataforma</label>
                <select className="pa-input" value={form.video_platform} onChange={e => set('video_platform', e.target.value)}>
                  <option value="youtube">YouTube</option>
                  <option value="twitch">Twitch</option>
                  <option value="vimeo">Vimeo</option>
                  <option value="other">Outra</option>
                </select>
              </div>
              <div className="pa-admin-field">
                <label>Duração (minutos)</label>
                <input className="pa-input" type="number" min="1" value={form.duration_min} onChange={e => set('duration_min', e.target.value)} placeholder="Ex: 22" />
              </div>
            </>}

            {isEbook && <>
              <PdfUploadField
                fileUrl={form.file_url}
                fileSizeKb={form.file_size_kb}
                onUploaded={(url, sizeKb) => { set('file_url', url); set('file_size_kb', sizeKb); }}
              />
              <div className="pa-admin-field">
                <label>Páginas</label>
                <input className="pa-input" type="number" value={form.page_count} onChange={e => set('page_count', e.target.value)} />
              </div>
            </>}

            <div className="pa-admin-field pa-admin-full">
              <label>Thumbnail (URL)</label>
              <input className="pa-input" value={form.thumbnail_url} onChange={e => set('thumbnail_url', e.target.value)} placeholder="https://..." />
            </div>
            <div className="pa-admin-field pa-admin-full">
              <label>Tags (separadas por vírgula)</label>
              <input className="pa-input" value={form.tags} onChange={e => set('tags', e.target.value)} placeholder="pesca, tecnicas, iniciante" />
            </div>
            <div className="pa-admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_free} onChange={e => set('is_free', e.target.checked)} /> Gratuito
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.is_featured} onChange={e => set('is_featured', e.target.checked)} /> Destaque
              </label>
            </div>
          </div>
        </div>
        <div className="pa-admin-footer">
          <button className="pa-btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="pa-btn-primary" onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? <Loader size={15} className="pa-spin" /> : 'Publicar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CourseAdminPanel ────────────────────────────────────────────────────────────
function CourseAdminPanel({ currentUserId, onClose, onSaved }) {
  const [tab, setTab] = useState('course'); // 'course' | 'chapters'
  const [courseForm, setCourseForm] = useState({
    title: '', description: '', thumbnail_url: '', category: 'tecnicas',
    level: 'iniciante', author_name: '', is_free: true, is_published: false,
  });
  const [courseId, setCourseId] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [chapterForm, setChapterForm] = useState({
    title: '', description: '', video_url: '', video_platform: 'youtube',
    duration_min: '', sort_order: '', is_free: true,
  });
  const [editingChapter, setEditingChapter] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setCF(key, val) { setCourseForm(f => ({ ...f, [key]: val })); }
  function setChF(key, val) { setChapterForm(f => ({ ...f, [key]: val })); }

  async function handleSaveCourse() {
    if (!courseForm.title.trim()) { setError('Informe o título do curso.'); return; }
    setSaving(true); setError('');
    try {
      const payload = { ...courseForm, created_by: currentUserId };
      if (courseId) {
        const { error: e } = await supabase.from('academy_courses').update(payload).eq('id', courseId);
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.from('academy_courses').insert(payload).select().single();
        if (e) throw e;
        setCourseId(data.id);
        setTab('chapters');
      }
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function loadChapters(cId) {
    const { data } = await supabase.from('academy_chapters').select('*').eq('course_id', cId).order('sort_order');
    setChapters(data || []);
  }

  useEffect(() => { if (courseId) loadChapters(courseId); }, [courseId]);

  function startEditChapter(ch) {
    setEditingChapter(ch.id);
    setChapterForm({
      title: ch.title, description: ch.description || '', video_url: ch.video_url || '',
      video_platform: ch.video_platform || 'youtube', duration_min: ch.duration_min || '',
      sort_order: ch.sort_order ?? '', is_free: ch.is_free,
    });
  }

  function cancelEditChapter() { setEditingChapter(null); setChapterForm({ title: '', description: '', video_url: '', video_platform: 'youtube', duration_min: '', sort_order: '', is_free: true }); }

  async function handleSaveChapter() {
    if (!chapterForm.title.trim()) { setError('Informe o título do capítulo.'); return; }
    if (!courseId) { setError('Salve o curso primeiro.'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...chapterForm,
        course_id: courseId,
        duration_min: chapterForm.duration_min ? parseInt(chapterForm.duration_min) : null,
        sort_order: chapterForm.sort_order !== '' ? parseInt(chapterForm.sort_order) : chapters.length,
      };
      if (editingChapter) {
        const { error: e } = await supabase.from('academy_chapters').update(payload).eq('id', editingChapter);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('academy_chapters').insert(payload);
        if (e) throw e;
      }
      await supabase.from('academy_courses').update({ total_chapters: chapters.length + (editingChapter ? 0 : 1) }).eq('id', courseId);
      cancelEditChapter();
      await loadChapters(courseId);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function handleDeleteChapter(chId) {
    if (!confirm('Excluir este capítulo?')) return;
    await supabase.from('academy_chapters').delete().eq('id', chId);
    await loadChapters(courseId);
    await supabase.from('academy_courses').update({ total_chapters: Math.max(0, chapters.length - 1) }).eq('id', courseId);
  }

  return (
    <div className="pa-player-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pa-player-modal pa-admin-modal" style={{ maxWidth: 640 }}>
        <div className="pa-player-header">
          <span style={{ fontWeight: 700 }}>🎓 {courseId ? 'Editar curso' : 'Novo curso'}</span>
          <button className="pa-close-btn" onClick={() => { onSaved?.(); onClose(); }}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-faint)', padding: '0 16px' }}>
          {[{ id: 'course', label: '📋 Dados do curso' }, { id: 'chapters', label: `📚 Capítulos (${chapters.length})` }].map(t => (
            <button key={t.id} type="button"
              onClick={() => { if (t.id === 'chapters' && !courseId) { setError('Salve o curso primeiro para adicionar capítulos.'); return; } setError(''); setTab(t.id); }}
              style={{ padding: '10px 16px', background: 'transparent', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', color: tab === t.id ? 'var(--accent-light)' : 'var(--text-muted)', fontWeight: tab === t.id ? 700 : 400, fontSize: '0.82rem', cursor: 'pointer', marginBottom: -1 }}
            >{t.label}</button>
          ))}
        </div>

        <div className="pa-admin-body">
          {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: 10 }}>{error}</p>}

          {/* Tab: dados do curso */}
          {tab === 'course' && (
            <div className="pa-admin-grid">
              <div className="pa-admin-field pa-admin-full">
                <label>Título *</label>
                <input className="pa-input" value={courseForm.title} onChange={e => setCF('title', e.target.value)} placeholder="Título do curso" maxLength={120} />
              </div>
              <div className="pa-admin-field pa-admin-full">
                <label>Descrição</label>
                <textarea className="pa-input pa-textarea" value={courseForm.description} onChange={e => setCF('description', e.target.value)} rows={3} placeholder="Descrição breve do curso" maxLength={500} />
              </div>
              <div className="pa-admin-field">
                <label>Categoria</label>
                <select className="pa-input" value={courseForm.category} onChange={e => setCF('category', e.target.value)}>
                  {CATEGORIES.filter(c => c.id !== 'all').map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="pa-admin-field">
                <label>Nível</label>
                <select className="pa-input" value={courseForm.level} onChange={e => setCF('level', e.target.value)}>
                  <option value="iniciante">Iniciante</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="avancado">Avançado</option>
                </select>
              </div>
              <div className="pa-admin-field">
                <label>Autor</label>
                <input className="pa-input" value={courseForm.author_name} onChange={e => setCF('author_name', e.target.value)} placeholder="Nome do autor" />
              </div>
              <div className="pa-admin-field pa-admin-full">
                <label>Thumbnail (URL)</label>
                <input className="pa-input" value={courseForm.thumbnail_url} onChange={e => setCF('thumbnail_url', e.target.value)} placeholder="https://..." />
              </div>
              <div className="pa-admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={courseForm.is_free} onChange={e => setCF('is_free', e.target.checked)} /> Gratuito
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={courseForm.is_published} onChange={e => setCF('is_published', e.target.checked)} /> Publicado
                </label>
              </div>
            </div>
          )}

          {/* Tab: capítulos */}
          {tab === 'chapters' && (
            <div>
              {/* Form de capítulo */}
              <div className="pa-admin-grid" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-faint)' }}>
                <div className="pa-admin-field pa-admin-full">
                  <label>{editingChapter ? '✏️ Editando capítulo' : '➕ Novo capítulo'}</label>
                  <input className="pa-input" value={chapterForm.title} onChange={e => setChF('title', e.target.value)} placeholder="Título do capítulo" maxLength={120} />
                </div>
                <div className="pa-admin-field pa-admin-full">
                  <label>Descrição</label>
                  <input className="pa-input" value={chapterForm.description} onChange={e => setChF('description', e.target.value)} placeholder="Descrição breve (opcional)" />
                </div>
                <div className="pa-admin-field pa-admin-full">
                  <label>URL do vídeo (YouTube / Vimeo / Twitch)</label>
                  <input className="pa-input" value={chapterForm.video_url} onChange={e => setChF('video_url', e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                </div>
                <div className="pa-admin-field">
                  <label>Plataforma</label>
                  <select className="pa-input" value={chapterForm.video_platform} onChange={e => setChF('video_platform', e.target.value)}>
                    <option value="youtube">YouTube</option>
                    <option value="vimeo">Vimeo</option>
                    <option value="twitch">Twitch</option>
                    <option value="other">Outra</option>
                  </select>
                </div>
                <div className="pa-admin-field">
                  <label>Duração (min)</label>
                  <input className="pa-input" type="number" min="1" value={chapterForm.duration_min} onChange={e => setChF('duration_min', e.target.value)} placeholder="Ex: 15" />
                </div>
                <div className="pa-admin-field">
                  <label>Ordem</label>
                  <input className="pa-input" type="number" min="0" value={chapterForm.sort_order} onChange={e => setChF('sort_order', e.target.value)} placeholder={String(chapters.length)} />
                </div>
                <div className="pa-admin-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={chapterForm.is_free} onChange={e => setChF('is_free', e.target.checked)} /> Gratuito
                  </label>
                </div>
                <div className="pa-admin-field pa-admin-full" style={{ flexDirection: 'row', gap: 8 }}>
                  <button className="pa-btn-primary" style={{ flex: 1 }} onClick={handleSaveChapter} disabled={saving || !chapterForm.title.trim()}>
                    {saving ? <Loader size={14} className="pa-spin" /> : editingChapter ? 'Salvar edição' : 'Adicionar capítulo'}
                  </button>
                  {editingChapter && <button className="pa-btn-secondary" onClick={cancelEditChapter}>Cancelar</button>}
                </div>
              </div>

              {/* Lista de capítulos */}
              {chapters.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Nenhum capítulo ainda. Adicione o primeiro acima.</p>}
              {chapters.map((ch, idx) => (
                <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-faint)' }}>
                  <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-heading)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.title}</div>
                    {ch.duration_min && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{formatDuration(ch.duration_min)}</div>}
                  </div>
                  <button type="button" onClick={() => startEditChapter(ch)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px 6px', fontSize: '0.75rem' }}>✏️</button>
                  <button type="button" onClick={() => handleDeleteChapter(ch.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 6px', fontSize: '0.75rem' }}>🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pa-admin-footer">
          <button className="pa-btn-secondary" onClick={() => { onSaved?.(); onClose(); }}>Fechar</button>
          {tab === 'course' && (
            <button className="pa-btn-primary" onClick={handleSaveCourse} disabled={saving || !courseForm.title.trim()}>
              {saving ? <Loader size={15} className="pa-spin" /> : courseId ? 'Salvar alterações' : 'Criar curso →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Pescademia ───────────────────────────────────────────────────────────
export default function Pescademia({ authSession, showPaywall }) {
  const currentUserId = authSession?.user?.id || null;
  const userName = authSession?.user?.user_metadata?.name || authSession?.user?.email?.split('@')[0] || 'Pescador';

  // Hook usePremium para guards
  const { isPremium, canAccessPremiumContent } = usePremium(currentUserId);

  const [items, setItems] = useState([]);
  const [likedIds, setLikedIds] = useState(new Set());
  const [progress, setProgress] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);

  const [category, setCategory] = useState('all');
  const [level, setLevel] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [activeItem, setActiveItem] = useState(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCourseAdmin, setShowCourseAdmin] = useState(false);

  // Guard para conteúdo premium
  const handleOpenItem = useCallback((item) => {
    // Se item é premium e usuário não é premium, mostra paywall
    if (item.is_premium && !isPremium) {
      if (showPaywall) {
        showPaywall('content');
      } else {
        alert('Conteúdo exclusivo para assinantes Premium.');
      }
      return;
    }
    setActiveItem(item);
  }, [isPremium, showPaywall]);

  const loaderRef = useRef(null);
  const debounceRef = useRef(null);

  const load = useCallback(async (pg = 0, filters = {}) => {
    try {
      const data = await fetchContent({ page: pg, ...filters });
      if (pg === 0) setItems(data);
      else setItems(prev => [...prev, ...data]);
      setHasMore(data.length === 12);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  const currentFilters = { category, level, type: typeFilter, search };

  useEffect(() => {
    setLoading(true);
    setPage(0);
    load(0, currentFilters);
    fetchLikedIds(currentUserId).then(setLikedIds);
    fetchProgress(currentUserId).then(setProgress);
  }, [category, level, typeFilter, search, currentUserId]);

  // Infinite scroll
  useEffect(() => {
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
        setLoadingMore(true);
        const next = page + 1;
        setPage(next);
        load(next, currentFilters);
      }
    }, { threshold: 0.1 });
    if (loaderRef.current) obs.observe(loaderRef.current);
    return () => obs.disconnect();
  }, [hasMore, loadingMore, loading, page, load, currentFilters]);

  function handleSearch(val) {
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(val), 400);
  }

  async function handleLikeToggle(contentId) {
    if (!currentUserId) return;
    await toggleLike(contentId, currentUserId);
    setLikedIds(prev => { const s = new Set(prev); s.has(contentId) ? s.delete(contentId) : s.add(contentId); return s; });
    setItems(prev => prev.map(it => it.id === contentId ? { ...it, like_count: likedIds.has(contentId) ? it.like_count - 1 : it.like_count + 1 } : it));
  }

  const featuredItems = items.filter(i => i.is_featured);
  const gridItems = items.filter(i => !i.is_featured || category !== 'all' || search || level !== 'all' || typeFilter !== 'all');

  return (
    <div className="pa-root">
      {/* Header */}
      <div className="pa-header">
        <div className="pa-header-inner">
          <div className="pa-brand">
            <GraduationCap size={22} />
            <div>
              <span className="pa-brand-name">Pescademia</span>
              <span className="pa-brand-sub">Academia de Pesca</span>
            </div>
          </div>
          {currentUserId && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pa-add-btn" onClick={() => setShowAdmin(true)} title="Adicionar conteúdo">
                + Conteúdo
              </button>
              <button className="pa-add-btn" onClick={() => setShowCourseAdmin(true)} title="Criar curso" style={{ background: 'var(--accent-bg)', color: 'var(--accent-light)', border: '1px solid var(--accent-border)' }}>
                🎓 Curso
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="pa-search-wrap">
          <Search size={15} className="pa-search-icon" />
          <input className="pa-search-input" placeholder="Buscar vídeos, e-books, artigos..." value={searchInput} onChange={e => handleSearch(e.target.value)} />
          {searchInput && <button className="pa-search-clear" onClick={() => { setSearchInput(''); setSearch(''); }}><X size={14} /></button>}
        </div>

        {/* Category pills */}
        <div className="pa-cats">
          {CATEGORIES.map(c => (
            <button key={c.id} className={`pa-cat-btn${category === c.id ? ' active' : ''}`} onClick={() => setCategory(c.id)}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* Filters row */}
        <div className="pa-filters">
          <select className="pa-filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">Todos os tipos</option>
            <option value="video">Vídeos</option>
            <option value="ebook">E-books</option>
            <option value="article">Artigos</option>
            <option value="course">Cursos</option>
          </select>
          <select className="pa-filter-select" value={level} onChange={e => setLevel(e.target.value)}>
            {LEVELS.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="pa-content">
        {loading && (
          <div className="pa-loading"><Loader size={28} className="pa-spin" /></div>
        )}

        {!loading && items.length === 0 && (
          <div className="pa-empty">
            <GraduationCap size={44} style={{ opacity: 0.25, marginBottom: 12 }} />
            <p>Nenhum conteúdo encontrado.</p>
            {currentUserId && <p style={{ fontSize: '0.82rem', opacity: 0.6 }}>Seja o primeiro a adicionar um conteúdo!</p>}
          </div>
        )}

        {/* Featured banner (only on default view) */}
        {!loading && featuredItems.length > 0 && category === 'all' && !search && level === 'all' && typeFilter === 'all' && (
          <div className="pa-featured-section">
            <h2 className="pa-section-title"><Star size={16} /> Em destaque</h2>
            <div className="pa-featured-grid">
              {featuredItems.slice(0, 3).map(item => (
                <ContentCard key={item.id} item={item} liked={likedIds.has(item.id)} progress={progress[item.id]} onOpen={handleOpenItem} />
              ))}
            </div>
          </div>
        )}

        {/* Main grid */}
        {!loading && gridItems.length > 0 && (
          <div className="pa-main-section">
            {(category !== 'all' || search || level !== 'all' || typeFilter !== 'all') ? null : (
              <h2 className="pa-section-title"><Layers size={16} /> Todos os conteúdos</h2>
            )}
            <div className="pa-grid">
              {gridItems.map(item => (
                <ContentCard key={item.id} item={item} liked={likedIds.has(item.id)} progress={progress[item.id]} onOpen={handleOpenItem} />
              ))}
            </div>
          </div>
        )}

        {hasMore && <div ref={loaderRef} className="pa-load-more">{loadingMore && <Loader size={18} className="pa-spin" />}</div>}
      </div>

      {/* Modals */}
      {activeItem && activeItem.content_type === 'course' && (
        <CourseViewer item={activeItem} currentUserId={currentUserId} liked={likedIds.has(activeItem.id)} onLikeToggle={handleLikeToggle} onClose={() => setActiveItem(null)} userName={userName} />
      )}
      {activeItem && activeItem.content_type === 'video' && (
        <VideoPlayer item={activeItem} currentUserId={currentUserId} liked={likedIds.has(activeItem.id)} onLikeToggle={handleLikeToggle} onClose={() => setActiveItem(null)} />
      )}
      {activeItem && activeItem.content_type !== 'video' && activeItem.content_type !== 'course' && (
        <EbookViewer item={activeItem} currentUserId={currentUserId} liked={likedIds.has(activeItem.id)} onLikeToggle={handleLikeToggle} onClose={() => setActiveItem(null)} />
      )}
      {showAdmin && (
        <AdminPanel currentUserId={currentUserId} onClose={() => setShowAdmin(false)} onSaved={() => { setPage(0); setLoading(true); load(0, currentFilters); }} />
      )}
      {showCourseAdmin && (
        <CourseAdminPanel currentUserId={currentUserId} onClose={() => setShowCourseAdmin(false)} onSaved={() => { setPage(0); setLoading(true); load(0, currentFilters); }} />
      )}
    </div>
  );
}
