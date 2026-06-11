/**
 * src/FishIDModal.jsx
 *
 * Modal de identificação de espécie por foto.
 * Integra com fishid.js para o pipeline multi-fonte.
 *
 * Props:
 *   open         {boolean}   Exibe o modal
 *   onClose      {function}  Fecha sem resultado
 *   onConfirm    {function}  Confirma espécie identificada: (speciesId, imageDataUrl) => void
 *   location     {{lat, lon}|null}  Localização atual do usuário
 *   supabaseUrl  {string}
 *   supabaseKey  {string}
 *   lang         {string}    'pt' | 'es' | 'en'
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  identifyFish,
  saveTrainingSample,
  CONFIDENCE_HIGH,
  CONFIDENCE_MED,
  CONFIDENCE_LOW,
  FISH_META,
} from './fishid.js';

// ─── Ícones inline (sem dependência extra) ────────────────────────────────────
const IconCamera    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>;
const IconUpload    = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>;
const IconCheck     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>;
const IconX         = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IconRefresh   = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
const IconAlert     = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><triangle points="12 2 22 20 2 20" /><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/><polygon points="12 2 22 20 2 20"/></svg>;

// ─── Textos i18n ──────────────────────────────────────────────────────────────
const T = {
  pt: {
    title:           'Identificar espécie',
    subtitle:        'Tire ou envie uma foto do peixe para identificar a espécie.',
    takePhoto:       'Tirar foto',
    uploadPhoto:     'Carregar foto',
    analyzing:       'Analisando...',
    step_local:      'Modelo local...',
    step_inat:       'iNaturalist...',
    step_db:         'Base de dados...',
    result:          'Resultado',
    confidence_alta: 'Alta confiança',
    confidence_media:'Confiança média',
    confidence_baixa:'Baixa confiança',
    confidence_muito_baixa: 'Confiança muito baixa',
    confirm:         'Confirmar',
    reject:          'Não é esse',
    tryAgain:        'Nova foto',
    candidates:      'Outras possibilidades',
    noResult:        'Não foi possível identificar a espécie com confiança suficiente.',
    confirmCorrect:  'Identificado como',
    correctSpec:     'Selecione a espécie correta:',
    save:            'Salvar',
    cancel:          'Cancelar',
    alertLow:        'Resultado incerto — verifique manualmente.',
    sources:         'Fontes',
    src_local_model: 'Modelo local',
    src_inat:        'iNaturalist',
    src_internal_db: 'Base interna',
    src_combined:    'Combinado',
    trained:         'amostras de treino salvas',
  },
  es: {
    title:           'Identificar especie',
    subtitle:        'Saque o suba una foto del pez para identificar la especie.',
    takePhoto:       'Tomar foto',
    uploadPhoto:     'Subir foto',
    analyzing:       'Analizando...',
    step_local:      'Modelo local...',
    step_inat:       'iNaturalist...',
    step_db:         'Base de datos...',
    result:          'Resultado',
    confidence_alta: 'Alta confianza',
    confidence_media:'Confianza media',
    confidence_baixa:'Baja confianza',
    confidence_muito_baixa: 'Confianza muy baja',
    confirm:         'Confirmar',
    reject:          'No es este',
    tryAgain:        'Nueva foto',
    candidates:      'Otras posibilidades',
    noResult:        'No fue posible identificar la especie con suficiente confianza.',
    confirmCorrect:  'Identificado como',
    correctSpec:     'Seleccione la especie correcta:',
    save:            'Guardar',
    cancel:          'Cancelar',
    alertLow:        'Resultado incierto — verifique manualmente.',
    sources:         'Fuentes',
    src_local_model: 'Modelo local',
    src_inat:        'iNaturalist',
    src_internal_db: 'Base interna',
    src_combined:    'Combinado',
    trained:         'muestras de entrenamiento guardadas',
  },
  en: {
    title:           'Identify species',
    subtitle:        'Take or upload a photo of the fish to identify the species.',
    takePhoto:       'Take photo',
    uploadPhoto:     'Upload photo',
    analyzing:       'Analyzing...',
    step_local:      'Local model...',
    step_inat:       'iNaturalist...',
    step_db:         'Database...',
    result:          'Result',
    confidence_alta: 'High confidence',
    confidence_media:'Medium confidence',
    confidence_baixa:'Low confidence',
    confidence_muito_baixa: 'Very low confidence',
    confirm:         'Confirm',
    reject:          'Not this one',
    tryAgain:        'New photo',
    candidates:      'Other possibilities',
    noResult:        'Could not identify the species with sufficient confidence.',
    confirmCorrect:  'Identified as',
    correctSpec:     'Select the correct species:',
    save:            'Save',
    cancel:          'Cancel',
    alertLow:        'Uncertain result — please verify manually.',
    sources:         'Sources',
    src_local_model: 'Local model',
    src_inat:        'iNaturalist',
    src_internal_db: 'Internal DB',
    src_combined:    'Combined',
    trained:         'training samples saved',
  },
};

// ─── Utilitários ──────────────────────────────────────────────────────────────

const CONFIDENCE_COLORS = {
  alta:        { bg: 'rgba(34,197,94,0.15)',  text: '#4ade80', border: 'rgba(34,197,94,0.4)' },
  media:       { bg: 'rgba(234,179,8,0.15)',  text: '#facc15', border: 'rgba(234,179,8,0.4)' },
  baixa:       { bg: 'rgba(249,115,22,0.15)', text: '#fb923c', border: 'rgba(249,115,22,0.4)' },
  muito_baixa: { bg: 'rgba(239,68,68,0.15)',  text: '#f87171', border: 'rgba(239,68,68,0.4)' },
};

const SOURCE_COLORS = {
  local_model:  '#818cf8',
  inat:         '#34d399',
  internal_db:  '#f59e0b',
  combined:     '#22d3ee',
};

function resizeImage(file, maxSize = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('canvas toBlob failed')); return; }
        const resized = new File([blob], file.name, { type: 'image/jpeg' });
        resolve({ file: resized, dataUrl: canvas.toDataURL('image/jpeg', 0.85), canvas, img: canvas });
      }, 'image/jpeg', 0.85);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function FishIDModal({
  open,
  onClose,
  onConfirm,
  location = null,
  supabaseUrl = '',
  supabaseKey = '',
  lang = 'pt',
}) {
  const t = T[lang] || T.pt;

  const [phase, setPhase] = useState('idle'); // idle | preview | analyzing | result | correct
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analysisStep, setAnalysisStep] = useState('');
  const [result, setResult] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageCanvas, setImageCanvas] = useState(null);
  const [correctionSpecies, setCorrectionSpecies] = useState('');

  const fileInputRef = useRef();
  const cameraInputRef = useRef();

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setPhase('idle');
      setPreviewUrl(null);
      setResult(null);
      setImageFile(null);
      setImageCanvas(null);
      setAnalysisStep('');
    }
  }, [open]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    try {
      const { file: resized, dataUrl, canvas } = await resizeImage(file, 800);
      setPreviewUrl(dataUrl);
      setImageFile(resized);
      setImageCanvas(canvas);
      setPhase('preview');
    } catch {
      // fallback: usa original sem resize
      const dataUrl = URL.createObjectURL(file);
      setPreviewUrl(dataUrl);
      setImageFile(file);
      setImageCanvas(null);
      setPhase('preview');
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!imageFile) return;
    setPhase('analyzing');
    setAnalysisStep(t.step_local);

    const res = await identifyFish({
      imageFile,
      imageEl: imageCanvas,
      location,
      isOnline,
      supabaseUrl,
      supabaseKey,
      onProgress: (step) => {
        setAnalysisStep(t[`step_${step}`] || step);
      },
    });

    setResult(res);
    setPhase('result');
  }, [imageFile, imageCanvas, location, isOnline, supabaseUrl, supabaseKey, t]);

  const handleConfirm = useCallback(async () => {
    if (!result?.top) return;
    await saveTrainingSample(result.top.species, previewUrl, 'user_accept');
    onConfirm?.(result.top.species, previewUrl, result);
    onClose?.();
  }, [result, previewUrl, onConfirm, onClose]);

  const handleCorrect = useCallback(async () => {
    if (!correctionSpecies) return;
    await saveTrainingSample(correctionSpecies, previewUrl, 'user_correct');
    onConfirm?.(correctionSpecies, previewUrl, { ...result, corrected: true });
    onClose?.();
  }, [correctionSpecies, previewUrl, result, onConfirm, onClose]);

  if (!open) return null;

  // ─── Responsive helpers ────────────────────────────────────────────────────
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  // ─── Estilos base ─────────────────────────────────────────────────────────
  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: isMobile ? 'flex-end' : 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: isMobile ? 0 : '16px',
  };
  const modal = {
    background: 'var(--bg-surface)', border: '1px solid var(--border-faint2)',
    borderRadius: isMobile ? '20px 20px 0 0' : 16,
    width: '100%', maxWidth: isMobile ? '100%' : 440,
    maxHeight: isMobile ? '92dvh' : '90vh',
    overflowY: 'auto',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
    fontFamily: 'system-ui, sans-serif',
    paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0,
  };
  const header = {
    padding: isMobile ? '14px 18px' : '16px 20px',
    borderBottom: '1px solid var(--border-faint2)',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const body = { padding: isMobile ? '16px' : '20px' };
  const btnPrimary = {
    flex: 1, padding: isMobile ? '13px 16px' : '10px 16px',
    borderRadius: 8, border: 'none',
    background: '#0ea5e9', color: '#fff', fontWeight: 600,
    fontSize: isMobile ? '1rem' : '0.85rem', cursor: 'pointer',
    minHeight: 44,
  };
  const btnSecondary = {
    flex: 1, padding: isMobile ? '13px 16px' : '10px 16px',
    borderRadius: 8, border: '1px solid var(--border-faint2)',
    background: 'transparent', color: 'var(--text-muted)',
    fontWeight: 500, fontSize: isMobile ? '1rem' : '0.85rem',
    cursor: 'pointer', minHeight: 44,
  };

  // ─── Fases ────────────────────────────────────────────────────────────────

  // Fase: idle — escolha de câmera ou upload
  if (phase === 'idle') return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={modal}>
        <div style={header}>
          <span style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '1rem' }}>{t.title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}><IconX /></button>
        </div>
        <div style={body}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>{t.subtitle}</p>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <button style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
              onClick={() => cameraInputRef.current?.click()}>
              <IconCamera /> {t.takePhoto}
            </button>
            <button style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
              onClick={() => fileInputRef.current?.click()}>
              <IconUpload /> {t.uploadPhoto}
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          <input ref={fileInputRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
          {!isOnline && (
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#fbbf24' }}>
              ⚠ Offline — apenas modelo local disponível
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Fase: preview — confirma imagem antes de analisar
  if (phase === 'preview') return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <span style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '1rem' }}>{t.title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}><IconX /></button>
        </div>
        <div style={body}>
          <img src={previewUrl} alt="preview"
            style={{ width: '100%', borderRadius: 10, maxHeight: 280, objectFit: 'cover', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btnSecondary} onClick={() => setPhase('idle')}>{t.tryAgain}</button>
            <button style={btnPrimary} onClick={handleAnalyze}>{t.analyzing.replace('...', '')}</button>
          </div>
        </div>
      </div>
    </div>
  );

  // Fase: analyzing — spinner com progresso
  if (phase === 'analyzing') return (
    <div style={overlay}>
      <div style={modal}>
        <div style={{ ...body, textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: 48, height: 48, border: '3px solid rgba(14,165,233,0.2)', borderTop: '3px solid #0ea5e9', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 1s linear infinite' }} />
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          <p style={{ color: 'var(--text-heading)', fontWeight: 600, marginBottom: 8 }}>{t.analyzing}</p>
          <p style={{ color: 'var(--text-dim)', fontSize: '0.82rem' }}>{analysisStep}</p>
          {previewUrl && <img src={previewUrl} alt="" style={{ width: 120, height: 80, objectFit: 'cover', borderRadius: 8, marginTop: 16, opacity: 0.6 }} />}
        </div>
      </div>
    </div>
  );

  // Fase: result
  if (phase === 'result') {
    const top = result?.top;
    const cc = CONFIDENCE_COLORS[result?.confidenceLabel] || CONFIDENCE_COLORS.muito_baixa;
    const srcColor = SOURCE_COLORS[result?.source] || '#94a3b8';
    const meta = top?.meta;

    return (
      <div style={overlay}>
        <div style={modal}>
          <div style={header}>
            <span style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '1rem' }}>{t.result}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}><IconX /></button>
          </div>
          <div style={body}>
            {/* Preview miniatura */}
            {previewUrl && (
              <img src={previewUrl} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8, marginBottom: 14 }} />
            )}

            {/* Badge de confiança */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, background: cc.bg, border: `1px solid ${cc.border}`, marginBottom: 14 }}>
              <span style={{ color: cc.text, fontSize: '0.78rem', fontWeight: 600 }}>
                {t[`confidence_${result?.confidenceLabel}`] || result?.confidenceLabel}
              </span>
              <span style={{ color: cc.text, fontSize: '0.78rem' }}>
                {result?.confidence ? `${Math.round(result.confidence * 100)}%` : ''}
              </span>
            </div>

            {top ? (
              <>
                {/* Card do resultado principal */}
                <div style={{ background: 'var(--bg-card)', borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                  <div style={{ color: '#22d3ee', fontWeight: 700, fontSize: '1rem' }}>
                    {meta?.[lang] || meta?.pt || top.species.replace(/_/g, ' ')}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontStyle: 'italic', marginTop: 2 }}>
                    {meta?.sci || top.scientificName || ''}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {top.sources?.map(s => (
                      <span key={s} style={{ padding: '2px 8px', borderRadius: 12, background: 'var(--bg-card2)', color: SOURCE_COLORS[s] || 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {t[`src_${s}`] || s}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Alerta de baixa confiança */}
                {result.isLowConfidence && (
                  <div style={{ background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#fb923c', marginBottom: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <IconAlert /> {t.alertLow}
                  </div>
                )}

                {/* Outros candidatos */}
                {result.candidates?.length > 1 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginBottom: 6 }}>{t.candidates}</div>
                    {result.candidates.slice(1, 4).map(c => {
                      const cm = c.meta;
                      return (
                        <div key={c.species} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-faint)' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ color: 'var(--text-primary)', fontSize: '0.82rem' }}>{cm?.[lang] || cm?.pt || c.species.replace(/_/g, ' ')}</div>
                            {cm?.sci && <div style={{ color: 'var(--text-dimmer)', fontSize: '0.7rem', fontStyle: 'italic' }}>{cm.sci}</div>}
                          </div>
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: 'var(--bg-card2)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round(c.score * 100)}%`, background: '#0ea5e9', borderRadius: 3 }} />
                          </div>
                          <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem', minWidth: 30, textAlign: 'right' }}>{Math.round(c.score * 100)}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Ações */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <button style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                    onClick={() => setPhase('correct')}>
                    <IconX /> {t.reject}
                  </button>
                  <button style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                    onClick={handleConfirm}>
                    <IconCheck /> {t.confirm}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{t.noResult}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button style={btnSecondary} onClick={() => setPhase('correct')}>{t.correctSpec}</button>
                  <button style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                    onClick={() => setPhase('idle')}>
                    <IconRefresh /> {t.tryAgain}
                  </button>
                </div>
              </>
            )}

            {/* Botão nova foto */}
            <button style={{ ...btnSecondary, width: '100%', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
              onClick={() => setPhase('idle')}>
              <IconRefresh /> {t.tryAgain}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fase: correct — usuário corrige a espécie
  if (phase === 'correct') {
    const speciesList = Object.entries(FISH_META).sort((a, b) =>
      (a[1][lang] || a[1].pt).localeCompare(b[1][lang] || b[1].pt)
    );
    return (
      <div style={overlay}>
        <div style={modal}>
          <div style={header}>
            <span style={{ color: 'var(--text-heading)', fontWeight: 700, fontSize: '1rem' }}>{t.correctSpec}</span>
            <button onClick={() => setPhase('result')} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}><IconX /></button>
          </div>
          <div style={body}>
            {previewUrl && <img src={previewUrl} alt="" style={{ width: '100%', maxHeight: 120, objectFit: 'cover', borderRadius: 8, marginBottom: 14 }} />}
            <select
              value={correctionSpecies}
              onChange={e => setCorrectionSpecies(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg-input)', border: '1px solid var(--border-faint2)', color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: 14 }}
            >
              <option value="">— {lang === 'pt' ? 'Selecione' : lang === 'es' ? 'Seleccione' : 'Select'} —</option>
              {speciesList.map(([id, m]) => (
                <option key={id} value={id}>{m[lang] || m.pt} — {m.sci}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={btnSecondary} onClick={() => setPhase('result')}>{t.cancel}</button>
              <button style={{ ...btnPrimary, opacity: correctionSpecies ? 1 : 0.4 }}
                disabled={!correctionSpecies}
                onClick={handleCorrect}>
                {t.save}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
