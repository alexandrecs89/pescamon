import { useState, useMemo } from 'react';
import { useLang } from './i18n.jsx';
import { Link, RefreshCw, ChevronDown, Info, CheckCircle } from 'lucide-react';

// ── Traduções ──────────────────────────────────────────────────────────────────
const I18N = {
  pt: {
    lineType:      'Tipo de linha',
    diameter:      'Diâmetro (mm)',
    knotType:      'Nó',
    calculate:     'Calcular',
    reset:         'Limpar',
    result:        'Resultado',
    noResult:      'Selecione os campos para calcular.',
    breakStr:      'Resistência da linha',
    knotStr:       'Resistência do nó',
    retention:     'Retenção do nó',
    retentionTip:  '% da resistência nominal que o nó preserva',
    difficulty:    'Dificuldade',
    bestFor:       'Indicado para',
    steps:         'Como fazer',
    lineTypes: ['Monofilamento', 'Fluorocarbono', 'Multifilamento (PE)'],
    diameters: ['0,12 mm', '0,16 mm', '0,20 mm', '0,25 mm', '0,30 mm', '0,35 mm', '0,40 mm', '0,50 mm', '0,60 mm', '0,70 mm'],
    knots: ['Palomar', 'Clinch melhorado', 'Uni (Grinner)', 'Albright', 'FG Knot', 'Loop duplo'],
    diffLevels: ['Fácil', 'Fácil', 'Médio', 'Difícil', 'Muito difícil', 'Fácil'],
  },
  es: {
    lineType:      'Tipo de línea',
    diameter:      'Diámetro (mm)',
    knotType:      'Nudo',
    calculate:     'Calcular',
    reset:         'Limpiar',
    result:        'Resultado',
    noResult:      'Seleccione los campos para calcular.',
    breakStr:      'Resistencia de la línea',
    knotStr:       'Resistencia del nudo',
    retention:     'Retención del nudo',
    retentionTip:  '% de la resistencia nominal que conserva el nudo',
    difficulty:    'Dificultad',
    bestFor:       'Indicado para',
    steps:         'Cómo hacerlo',
    lineTypes: ['Monofilamento', 'Fluorocarbono', 'Multifilamento (PE)'],
    diameters: ['0,12 mm', '0,16 mm', '0,20 mm', '0,25 mm', '0,30 mm', '0,35 mm', '0,40 mm', '0,50 mm', '0,60 mm', '0,70 mm'],
    knots: ['Palomar', 'Clinch mejorado', 'Uni (Grinner)', 'Albright', 'FG Knot', 'Lazo doble'],
    diffLevels: ['Fácil', 'Fácil', 'Medio', 'Difícil', 'Muy difícil', 'Fácil'],
  },
  en: {
    lineType:      'Line type',
    diameter:      'Diameter (mm)',
    knotType:      'Knot',
    calculate:     'Calculate',
    reset:         'Reset',
    result:        'Result',
    noResult:      'Select fields to calculate.',
    breakStr:      'Line breaking strength',
    knotStr:       'Knot strength',
    retention:     'Knot retention',
    retentionTip:  '% of nominal strength preserved by the knot',
    difficulty:    'Difficulty',
    bestFor:       'Best for',
    steps:         'How to tie',
    lineTypes: ['Monofilament', 'Fluorocarbon', 'Braided (PE)'],
    diameters: ['0.12 mm', '0.16 mm', '0.20 mm', '0.25 mm', '0.30 mm', '0.35 mm', '0.40 mm', '0.50 mm', '0.60 mm', '0.70 mm'],
    knots: ['Palomar', 'Improved Clinch', 'Uni (Grinner)', 'Albright', 'FG Knot', 'Double Loop'],
    diffLevels: ['Easy', 'Easy', 'Medium', 'Hard', 'Very hard', 'Easy'],
  },
};

// ── Dados de resistência por tipo × diâmetro (kg) ─────────────────────────────
// [mono, fluoro, PE]  ×  [0.12, 0.16, 0.20, 0.25, 0.30, 0.35, 0.40, 0.50, 0.60, 0.70]
const BREAK_STRENGTH = [
  // mono
  [1.5,  2.5,  3.5,  5.0,  7.0,  9.0, 11.0, 15.0, 20.0, 27.0],
  // fluoro (ligeiramente maior que mono)
  [1.8,  2.8,  4.0,  5.5,  7.5, 10.0, 13.0, 17.0, 23.0, 30.0],
  // PE/multifilamento (muito maior para o mesmo diâmetro)
  [4.0,  7.0, 10.0, 15.0, 20.0, 27.0, 35.0, 50.0, 65.0, 80.0],
];

// ── Retenção de cada nó por tipo de linha (%) ─────────────────────────────────
// Knots: [palomar, clinch, uni, albright, fg, loop]
// Lines: [mono, fluoro, PE]
const KNOT_RETENTION = {
  //           mono   fluoro  PE
  palomar:   [  95,    90,    85 ],
  clinch:    [  90,    85,    60 ],  // clinch não é ideal para PE
  uni:       [  85,    83,    90 ],
  albright:  [  80,    78,    85 ],  // emenda de linhas diferentes
  fg:        [  95,    93,    98 ],  // melhor nó mono/fluoro → PE
  loop:      [  75,    72,    70 ],
};

const KNOT_KEYS = ['palomar', 'clinch', 'uni', 'albright', 'fg', 'loop'];

// ── Dados descritivos dos nós ─────────────────────────────────────────────────
const KNOT_INFO = {
  palomar: {
    bestFor: {
      pt: 'Anzóis, giradores, artificiais — universal para mono e fluoro',
      es: 'Anzuelos, giradores, artificiales — universal para mono y fluoro',
      en: 'Hooks, swivels, lures — universal for mono and fluoro',
    },
    steps: {
      pt: ['Dobre 15 cm de linha formando um laço duplo', 'Passe o laço duplo pela argola do anzol', 'Faça uma sobremão com o laço duplo', 'Passe o anzol inteiro pelo laço duplo', 'Molhe e aperte firmemente'],
      es: ['Doble 15 cm de línea formando un lazo doble', 'Pase el lazo doble por el ojal del anzuelo', 'Haga un nudo con el lazo doble', 'Pase el anzuelo entero por el lazo doble', 'Moje y apriete firmemente'],
      en: ['Double 15 cm of line into a loop', 'Pass the doubled loop through the hook eye', 'Tie an overhand knot with the doubled loop', 'Pass the entire hook through the double loop', 'Wet and tighten firmly'],
    },
  },
  clinch: {
    bestFor: {
      pt: 'Anzóis, girador e destorcedor — rápido, bom para mono',
      es: 'Anzuelos, giradores — rápido, bueno para mono',
      en: 'Hooks, swivels — quick, good for mono',
    },
    steps: {
      pt: ['Passe a linha pela argola (15 cm)', 'Dê 5–7 voltas ao redor da linha principal', 'Passe a ponta pelo laço próximo à argola', 'Passe a ponta pelo grande laço formado', 'Molhe e aperte'],
      es: ['Pase la línea por el ojal (15 cm)', 'Dé 5–7 vueltas alrededor de la línea principal', 'Pase la punta por el lazo cerca del ojal', 'Pase la punta por el gran lazo formado', 'Moje y apriete'],
      en: ['Thread 15 cm through the eye', 'Wrap 5–7 times around the main line', 'Pass the tag through the near loop', 'Pass the tag through the big loop', 'Wet and pull tight'],
    },
  },
  uni: {
    bestFor: {
      pt: 'Versátil — anzóis, giradores, emendas linha-linha, funciona em PE',
      es: 'Versátil — anzuelos, giradores, empalmes, funciona en PE',
      en: 'Versatile — hooks, swivels, line-to-line joins, works on braid',
    },
    steps: {
      pt: ['Passe a linha pela argola e dobre 20 cm paralelo', 'Forme um laço com o excesso', 'Dê 6 voltas pela linha dupla dentro do laço', 'Puxe a ponta para fechar o laço', 'Deslize o nó até a argola e aperte'],
      es: ['Pase la línea por el ojal y doble 20 cm en paralelo', 'Forme un lazo con el exceso', 'Dé 6 vueltas por la línea doble dentro del lazo', 'Jale la punta para cerrar el lazo', 'Deslice el nudo hasta el ojal y apriete'],
      en: ['Thread line through eye and double 20 cm back', 'Form a loop with the tag end', 'Make 6 wraps through the doubled line inside the loop', 'Pull tag to close loop', 'Slide knot to eye and tighten'],
    },
  },
  albright: {
    bestFor: {
      pt: 'Emenda de linhas de diâmetros diferentes — mono/fluoro com PE',
      es: 'Empalme de líneas de distinto grosor — mono/fluoro con PE',
      en: 'Joining lines of different diameters — mono/fluoro to braid',
    },
    steps: {
      pt: ['Dobre 8 cm da linha mais grossa formando um laço', 'Passe a linha mais fina pelo laço', 'Dê 10 voltas apertadas ao redor do laço', 'Passe a ponta de volta pelo laço pelo mesmo lado que entrou', 'Molhe e aperte; corte o excesso'],
      es: ['Doble 8 cm de la línea más gruesa formando un lazo', 'Pase la línea más fina por el lazo', 'Dé 10 vueltas apretadas alrededor del lazo', 'Pase la punta de vuelta por el lazo por el mismo lado', 'Moje y apriete; corte el exceso'],
      en: ['Fold 8 cm of the heavier line into a loop', 'Insert the lighter line through the loop', 'Make 10 tight wraps around the loop', 'Pass the tag back through the loop on the same side', 'Wet, tighten, trim'],
    },
  },
  fg: {
    bestFor: {
      pt: 'Melhor emenda PE → leader mono/fluoro — mínima resistência ao cast, máxima retenção',
      es: 'Mejor empalme PE → líder mono/fluoro — mínima resistencia al lance',
      en: 'Best braid-to-leader connection — lowest profile, highest retention',
    },
    steps: {
      pt: ['Estique o leader e enrole o PE em "X" ao redor dele (15–20 passadas)', 'Faça 2 meio-nós com o PE ao redor do leader', 'Faça um nó de cravat (half-hitch) com o leader ao redor do PE', 'Finalize com 5 half-hitches adicionais', 'Molhe, aperte e corte as pontas rentes'],
      es: ['Estire el líder y enrolle el PE en "X" alrededor (15–20 pasadas)', 'Haga 2 medios nudos con el PE alrededor del líder', 'Haga un half-hitch con el líder alrededor del PE', 'Finalice con 5 half-hitches adicionales', 'Moje, apriete y corte las puntas'],
      en: ['Stretch leader and cross-wrap PE around it (15–20 passes)', 'Make 2 half-hitches with PE around leader', 'Make a half-hitch with leader around PE', 'Add 5 more half-hitches to finish', 'Wet, tighten, trim tags'],
    },
  },
  loop: {
    bestFor: {
      pt: 'Troca rápida de líderes e baixeiros — loop-to-loop connection',
      es: 'Cambio rápido de líderes — conexión lazo a lazo',
      en: 'Quick leader changes — loop-to-loop connection',
    },
    steps: {
      pt: ['Dobre 10 cm da linha', 'Faça um sobremão com o laço duplo (2 voltas)', 'Passe o laço pela argola do sobremão', 'Ajuste o tamanho do laço e aperte', 'Use para conexão loop-a-loop com o baixeiro'],
      es: ['Doble 10 cm de la línea', 'Haga un nudo en el lazo doble (2 vueltas)', 'Pase el lazo por la argolla del nudo', 'Ajuste el tamaño del lazo y apriete', 'Use para conexión lazo a lazo con el líder'],
      en: ['Double 10 cm of line', 'Tie an overhand knot with the doubled line (2 turns)', 'Pass the loop through the overhand loop', 'Adjust loop size and tighten', 'Use for loop-to-loop connection with leader'],
    },
  },
};

// ── Cor da retenção ───────────────────────────────────────────────────────────
function retentionColor(pct) {
  if (pct >= 90) return '#22c55e';
  if (pct >= 80) return '#eab308';
  if (pct >= 70) return '#f97316';
  return '#ef4444';
}

// ── Componente ────────────────────────────────────────────────────────────────
export default function KnotCalculator() {
  const { lang } = useLang();
  const l = I18N[lang] || I18N.pt;

  const [lineType, setLineType] = useState('');
  const [diameter, setDiameter] = useState('');
  const [knotIdx, setKnotIdx]   = useState('');
  const [showResult, setShowResult] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState(false);

  const allFilled = lineType !== '' && diameter !== '' && knotIdx !== '';

  function reset() {
    setLineType(''); setDiameter(''); setKnotIdx('');
    setShowResult(false); setExpandedSteps(false);
  }

  const result = useMemo(() => {
    if (lineType === '' || diameter === '' || knotIdx === '') return null;
    const lt = +lineType;
    const di = +diameter;
    const ki = +knotIdx;
    const breakKg  = BREAK_STRENGTH[lt][di];
    const knotKey  = KNOT_KEYS[ki];
    const retention = KNOT_RETENTION[knotKey][lt];
    const knotKg   = +(breakKg * retention / 100).toFixed(1);
    const info     = KNOT_INFO[knotKey];
    return { breakKg, knotKg, retention, knotKey, info, lt, di, ki };
  }, [lineType, diameter, knotIdx]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Formulário */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>

        {/* Tipo de linha */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link size={13} /> {l.lineType}
          </label>
          <div style={{ position: 'relative' }}>
            <select value={lineType} onChange={e => { setLineType(e.target.value); setShowResult(false); }}
              style={{ width: '100%', padding: '6px 28px 6px 8px', borderRadius: 8, border: `1px solid ${lineType !== '' ? '#38bdf855' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', color: 'var(--text-primary)', colorScheme: 'dark light', fontSize: '0.78rem', appearance: 'none', cursor: 'pointer' }}>
              <option value="">—</option>
              {l.lineTypes.map((t, i) => <option key={i} value={i}>{t}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Diâmetro */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13 }}>⌀</span> {l.diameter}
          </label>
          <div style={{ position: 'relative' }}>
            <select value={diameter} onChange={e => { setDiameter(e.target.value); setShowResult(false); }}
              style={{ width: '100%', padding: '6px 28px 6px 8px', borderRadius: 8, border: `1px solid ${diameter !== '' ? '#38bdf855' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', color: 'var(--text-primary)', colorScheme: 'dark light', fontSize: '0.78rem', appearance: 'none', cursor: 'pointer' }}>
              <option value="">—</option>
              {l.diameters.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Nó */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 13 }}>🪢</span> {l.knotType}
          </label>
          <div style={{ position: 'relative' }}>
            <select value={knotIdx} onChange={e => { setKnotIdx(e.target.value); setShowResult(false); setExpandedSteps(false); }}
              style={{ width: '100%', padding: '6px 28px 6px 8px', borderRadius: 8, border: `1px solid ${knotIdx !== '' ? '#38bdf855' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', color: 'var(--text-primary)', colorScheme: 'dark light', fontSize: '0.78rem', appearance: 'none', cursor: 'pointer' }}>
              <option value="">—</option>
              {l.knots.map((k, i) => <option key={i} value={i}>{k} — {l.diffLevels[i]}</option>)}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>
        </div>
      </div>

      {/* Botões */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setShowResult(true)}
          disabled={!allFilled}
          style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: allFilled ? '#1d4ed8' : 'var(--bg-surface)', color: allFilled ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.83rem', cursor: allFilled ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Link size={14} /> {l.calculate}
        </button>
        <button
          onClick={reset}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <RefreshCw size={13} /> {l.reset}
        </button>
      </div>

      {/* Resultado */}
      {showResult && result ? (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Cards de resistência */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: '#38bdf810', border: '1px solid #38bdf830', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 3 }}>🧵 {l.breakStr}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#38bdf8' }}>{result.breakKg} kg</div>
            </div>
            <div style={{ background: `${retentionColor(result.retention)}15`, border: `1px solid ${retentionColor(result.retention)}40`, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 3 }}>🪢 {l.knotStr}</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: retentionColor(result.retention) }}>{result.knotKg} kg</div>
            </div>
          </div>

          {/* Barra de retenção */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span title={l.retentionTip}>{l.retention} <Info size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /></span>
              <span style={{ color: retentionColor(result.retention), fontWeight: 700 }}>{result.retention}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-card)', overflow: 'hidden' }}>
              <div style={{ width: `${result.retention}%`, height: '100%', background: retentionColor(result.retention), borderRadius: 4, transition: 'width 0.4s ease' }} />
            </div>
          </div>

          {/* Dificuldade e uso */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>{l.difficulty}</div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{l.diffLevels[result.ki]}</div>
            </div>
            <div style={{ background: 'var(--bg-card)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 2 }}>{l.bestFor}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{result.info.bestFor[lang] || result.info.bestFor.pt}</div>
            </div>
          </div>

          {/* Passo a passo */}
          <div style={{ background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={() => setExpandedSteps(s => !s)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
            >
              <span>🪢 {l.steps}</span>
              <ChevronDown size={13} style={{ transform: expandedSteps ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            {expandedSteps && (
              <ol style={{ margin: 0, padding: '0 12px 12px 28px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(result.info.steps[lang] || result.info.steps.pt).map((step, i) => (
                  <li key={i} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <CheckCircle size={11} style={{ color: '#22c55e', marginRight: 4, verticalAlign: 'middle' }} />
                    {step}
                  </li>
                ))}
              </ol>
            )}
          </div>

        </div>
      ) : !showResult && !allFilled ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
          {l.noResult}
        </div>
      ) : null}
    </div>
  );
}
