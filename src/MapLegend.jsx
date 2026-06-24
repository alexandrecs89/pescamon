/**
 * src/MapLegend.jsx
 *
 * Legenda flutuante e arrastável sobre o mapa.
 * Colapsada por padrão. Abre/fecha com clique no cabeçalho.
 * Posição persistida em localStorage.
 *
 * Props:
 *   heatmapActive  {boolean}   se o heatmap de probabilidade está visível
 *   activeColor    {string}    cor hex da espécie selecionada
 *   showSnapAreas  {boolean}
 *   showWatercourses {boolean}
 *   showFishingSpots {boolean}
 *   iotSensors     {Array}     sensores IoT ativos
 *   occurrences    {Array}
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';

// ─── Ícones inline ────────────────────────────────────────────────────────────
const IconChevron = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const IconMap = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
    <line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>
  </svg>
);

// ─── Constantes visuais do mapa ───────────────────────────────────────────────
const SNAP_CATEGORIES = [
  { color: '#16a34a', icon: '🏞️', label: 'Parque Nacional'       },
  { color: '#0ea5e9', icon: '🌿', label: 'Paisagem Protegida'    },
  { color: '#a855f7', icon: '🪨', label: 'Monumento Natural'     },
  { color: '#f59e0b', icon: '🦜', label: 'Área de Manejo'        },
  { color: '#06b6d4', icon: '💧', label: 'Reserva de Recursos'   },
  { color: '#ef4444', icon: '🚱', label: 'Zona de Captação'      },
];

const BASINS = [
  { color: '#eab308', label: 'Bacia do Rio Negro'    },
  { color: '#f97316', label: 'Bacia do Rio Uruguai'  },
  { color: '#ef4444', label: 'Bacia Laguna Merín'    },
  { color: '#3b82f6', label: 'Bacia do Rio da Prata' },
  { color: '#a855f7', label: 'Vertente Atlântica'    },
];

// ─── Swatch helpers ───────────────────────────────────────────────────────────
function Swatch({ color, size = 10, radius = 3, border }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: radius, background: color, flexShrink: 0,
      border: border || `1.5px solid ${color}`,
    }} />
  );
}

function LineSwatch({ color, dashed }) {
  return (
    <svg width="22" height="10" viewBox="0 0 22 10" style={{ flexShrink: 0 }}>
      <line x1="1" y1="5" x2="21" y2="5" stroke={color} strokeWidth="3"
        strokeDasharray={dashed ? '5 3' : undefined} strokeLinecap="round" />
    </svg>
  );
}

function GradientBar({ color, gradient }) {
  return (
    <div style={{
      width: '100%', height: 8, borderRadius: 4,
      background: gradient || `linear-gradient(to right, ${color}22, ${color}99, ${color})`,
      marginBottom: 4,
    }} />
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        marginBottom: 5, paddingBottom: 3,
        borderBottom: '1px solid var(--border-faint)',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function LegendRow({ left, label, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
      <div style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {left}
      </div>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.2 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: '0.62rem', color: 'var(--text-dim)' }}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MapLegend({
  heatmapActive,
  activeColor,
  heatGradient,
  basins,
  showSnapAreas,
  showWatercourses,
  showFishingSpots,
  iotSensors = [],
  occurrences = [],
}) {
  const [open, setOpen] = useState(false);
  // Posição em pixels relativos ao parent (.map-resizable-inner)
  // Usamos left+top (não right) para evitar conversões
  const [pos, setPos] = useState(() => {
    try {
      const saved = localStorage.getItem('pescamon-legend-pos2');
      if (saved) return JSON.parse(saved);
    } catch { /* noop */ }
    return null; // null = posicionar via CSS padrão (canto sup dir)
  });

  const containerRef = useRef(null);
  const drag = useRef({
    active: false,
    pressing: false,
    // offset do ponteiro dentro do container no pointerdown
    grabX: 0,
    grabY: 0,
    // clientX/Y no pointerdown para threshold
    startCX: 0,
    startCY: 0,
  });

  // Handlers registados uma única vez — sem closures sobre state
  useEffect(() => {
    function onMove(e) {
      if (!drag.current.pressing) return;
      const dx = e.clientX - drag.current.startCX;
      const dy = e.clientY - drag.current.startCY;
      if (!drag.current.active && Math.sqrt(dx * dx + dy * dy) < 5) return;
      drag.current.active = true;

      const el     = containerRef.current;
      const parent = el?.parentElement;
      if (!el || !parent) return;

      const parentRect = parent.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const pw = parent.offsetWidth;
      const ph = parent.offsetHeight;

      // Posição do canto sup esq do container dentro do parent
      let newLeft = (e.clientX - parentRect.left) - drag.current.grabX;
      let newTop  = (e.clientY - parentRect.top)  - drag.current.grabY;

      newLeft = Math.max(0, Math.min(pw - w, newLeft));
      newTop  = Math.max(0, Math.min(ph - h, newTop));

      // Aplica directo no DOM (sem re-render) para máxima fluidez
      el.style.left  = newLeft + 'px';
      el.style.top   = newTop  + 'px';
      el.style.right = 'auto';
    }

    function onUp() {
      if (drag.current.active) {
        const el = containerRef.current;
        const p = {
          left: parseFloat(el?.style.left) || 0,
          top:  parseFloat(el?.style.top)  || 0,
        };
        localStorage.setItem('pescamon-legend-pos2', JSON.stringify(p));
        setPos(p);
      }
      drag.current.pressing = false;
      drag.current.active   = false;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, []);

  const onHeaderPointerDown = useCallback((e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    drag.current.pressing = true;
    drag.current.active   = false;
    drag.current.grabX    = e.clientX - rect.left;
    drag.current.grabY    = e.clientY - rect.top;
    drag.current.startCX  = e.clientX;
    drag.current.startCY  = e.clientY;
  }, []);

  const onHeaderClick = useCallback(() => {
    if (!drag.current.active) setOpen(v => !v);
  }, []);

  const hasIoT = iotSensors.length > 0;
  const hasOccurrences = occurrences.length > 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        // Se pos existe usa left/top (após drag); caso contrário ancora no canto sup dir por CSS
        ...(pos ? { left: pos.left, top: pos.top } : { top: 12, right: 12 }),
        zIndex: 900,
        minWidth: open ? 210 : 'auto',
        maxWidth: 240,
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        userSelect: 'none',
        touchAction: 'none',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* ── Cabeçalho / drag handle + toggle ── */}
      <div
        onClick={onHeaderClick}
        onPointerDown={onHeaderPointerDown}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: open ? '8px 12px 6px' : '7px 12px',
          cursor: 'grab',
          borderBottom: open ? '1px solid var(--border-faint)' : 'none',
        }}
      >
        <IconMap />
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-heading)', flex: 1 }}>
          Legenda
        </span>
        <span style={{ color: 'var(--text-dim)' }}>
          <IconChevron open={open} />
        </span>
      </div>

      {/* ── Corpo ── */}
      {open && (
        <div style={{ padding: '10px 12px 12px', overflowY: 'auto', maxHeight: '60vh' }}>

          {/* Heatmap de probabilidade */}
          {heatmapActive && (
            <Section title="Probabilidade de captura">
              <GradientBar color={activeColor} gradient={heatGradient} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: 'var(--text-dim)', marginBottom: 6 }}>
                <span>baixa</span><span>média</span><span>alta</span>
              </div>
              <LegendRow
                left={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                    {[0.5, 0.7, 0.9].map((o, i) => (
                      <div key={i} style={{ width: 18, height: 3, borderRadius: 2, background: activeColor, opacity: o }} />
                    ))}
                  </div>
                }
                label="Intensidade"
                sub="largura = perfil lateral"
              />
            </Section>
          )}

          {/* APAs / SNAP */}
          {showSnapAreas && (
            <Section title="Áreas Protegidas (SNAP)">
              {SNAP_CATEGORIES.map(c => (
                <LegendRow
                  key={c.label}
                  left={<LineSwatch color={c.color} dashed />}
                  label={c.label}
                />
              ))}
            </Section>
          )}

          {/* Cursos d'água — bacias da região ativa (fallback: UY) */}
          {showWatercourses && (
            <Section title="Bacias Hidrográficas">
              {(basins && basins.length ? basins : BASINS).map(b => (
                <LegendRow
                  key={b.id || b.label}
                  left={<LineSwatch color={b.color} />}
                  label={b.name || b.label}
                />
              ))}
            </Section>
          )}

          {/* Postos de pesca */}
          {showFishingSpots && (
            <Section title="Pontos">
              <LegendRow
                left={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="1">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                    <circle cx="12" cy="9" r="2.5" fill="#0f172a"/>
                  </svg>
                }
                label="Posto de pesca"
                sub="comunidade"
              />
            </Section>
          )}

          {/* Sensores IoT */}
          {hasIoT && (
            <Section title="Sensores">
              <LegendRow
                left={<Swatch color="#06b6d4" size={11} radius={50} border="2px solid #fff" />}
                label="Sensor IoT"
                sub="temperatura / nível"
              />
            </Section>
          )}

          {/* Ocorrências */}
          {hasOccurrences && (
            <Section title="Registros">
              <LegendRow
                left={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white" stroke="#1a6fd4" strokeWidth="2">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                  </svg>
                }
                label="Ocorrência registrada"
                sub="clique para detalhes"
              />
            </Section>
          )}

          {/* Sem camadas ativas */}
          {!heatmapActive && !showSnapAreas && !showWatercourses && !showFishingSpots && !hasIoT && !hasOccurrences && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-dimmer)', margin: 0, textAlign: 'center', padding: '4px 0' }}>
              Selecione uma espécie ou ative camadas para ver a legenda.
            </p>
          )}

          {/* Rodapé */}
          <div style={{
            fontSize: '0.6rem', color: 'var(--text-dimmer)', textAlign: 'center',
            marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-faint)',
          }}>
            Arraste para mover · Clique no cabeçalho para colapsar
          </div>
        </div>
      )}
    </div>
  );
}
