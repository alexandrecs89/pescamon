import { useState, useMemo } from 'react';
import { useLang } from './i18n.jsx';
import { Anchor, Fish, Waves, Layers, Target, RefreshCw, ChevronDown, Info } from 'lucide-react';

// ── Traduções ─────────────────────────────────────────────────────────────────
const I18N = {
  pt: {
    title: 'Calculadora de Bóia e Chumbada',
    species: 'Espécie alvo',
    weight: 'Peso estimado do peixe',
    current: 'Correnteza',
    depth: 'Profundidade',
    environment: 'Ambiente',
    bait: 'Tipo de isca',
    technique: 'Técnica de pesca',
    calculate: 'Calcular',
    reset: 'Limpar',
    result: 'Recomendação',
    buoy: 'Bóia',
    sinker: 'Chumbada',
    line: 'Linha',
    hook: 'Anzol',
    leader: 'Baixeiro',
    tip: 'Dica',
    noResult: 'Preencha os campos para obter a recomendação.',
    weightRanges: ['Até 0,5 kg', '0,5 – 2 kg', '2 – 5 kg', '5 – 15 kg', 'Acima de 15 kg'],
    currentOptions: ['Parada / lago', 'Fraca (até 0,5 m/s)', 'Média (0,5–1 m/s)', 'Forte (1–2 m/s)', 'Muito forte (>2 m/s)'],
    depthOptions: ['Raso (< 1 m)', 'Médio (1 – 3 m)', 'Fundo (3 – 8 m)', 'Profundo (> 8 m)'],
    envOptions: ['Rio aberto', 'Remanso / baía', 'Lagoa / represa', 'Costeiro / estuário'],
    baitOptions: ['Minhoca / isca natural', 'Isca viva (lambari, etc.)', 'Massa / bolonas', 'Artificial leve (<10g)', 'Artificial pesado (jig/pilker)'],
    techOptions: ['Fundo', 'Meia-água', 'Superfície', 'Long-cast (distância)'],
    speciesOptions: ['Tararira / Traíra', 'Dourado', 'Boga / Piapara', 'Bagre', 'Pejerrey / Peixe-rei', 'Mojarra / Lambari', 'Surubí / Pintado', 'Corvina', 'Robalo', 'Qualquer / Geral'],
  },
  es: {
    title: 'Calculadora de Boya y Plomada',
    species: 'Especie objetivo',
    weight: 'Peso estimado del pez',
    current: 'Corriente',
    depth: 'Profundidad',
    environment: 'Ambiente',
    bait: 'Tipo de carnada',
    technique: 'Técnica de pesca',
    calculate: 'Calcular',
    reset: 'Limpiar',
    result: 'Recomendación',
    buoy: 'Boya',
    sinker: 'Plomada',
    line: 'Línea',
    hook: 'Anzuelo',
    leader: 'Bajo de línea',
    tip: 'Consejo',
    noResult: 'Complete los campos para obtener la recomendación.',
    weightRanges: ['Hasta 0,5 kg', '0,5 – 2 kg', '2 – 5 kg', '5 – 15 kg', 'Más de 15 kg'],
    currentOptions: ['Sin corriente / lago', 'Suave (hasta 0,5 m/s)', 'Moderada (0,5–1 m/s)', 'Fuerte (1–2 m/s)', 'Muy fuerte (>2 m/s)'],
    depthOptions: ['Superficial (< 1 m)', 'Media (1 – 3 m)', 'Profunda (3 – 8 m)', 'Muy profunda (> 8 m)'],
    envOptions: ['Río abierto', 'Remanso / bahía', 'Laguna / embalse', 'Costero / estuario'],
    baitOptions: ['Lombriz / carnada natural', 'Carnada viva (mojarrita, etc.)', 'Masa / bolas', 'Artificial liviano (<10g)', 'Artificial pesado (jig/pilker)'],
    techOptions: ['Fondo', 'Media agua', 'Superficie', 'Long-cast (distancia)'],
    speciesOptions: ['Tararira', 'Dorado', 'Boga', 'Bagre', 'Pejerrey', 'Mojarra', 'Surubí / Pintado', 'Corvina', 'Robalo', 'Cualquier / General'],
  },
  en: {
    title: 'Bobber & Sinker Calculator',
    species: 'Target species',
    weight: 'Estimated fish weight',
    current: 'Current',
    depth: 'Depth',
    environment: 'Environment',
    bait: 'Bait type',
    technique: 'Fishing technique',
    calculate: 'Calculate',
    reset: 'Reset',
    result: 'Recommendation',
    buoy: 'Float / Bobber',
    sinker: 'Sinker',
    line: 'Line',
    hook: 'Hook',
    leader: 'Leader',
    tip: 'Tip',
    noResult: 'Fill in the fields to get the recommendation.',
    weightRanges: ['Up to 0.5 kg', '0.5 – 2 kg', '2 – 5 kg', '5 – 15 kg', 'Over 15 kg'],
    currentOptions: ['Still / lake', 'Slow (up to 0.5 m/s)', 'Moderate (0.5–1 m/s)', 'Fast (1–2 m/s)', 'Very fast (>2 m/s)'],
    depthOptions: ['Shallow (< 1 m)', 'Medium (1 – 3 m)', 'Deep (3 – 8 m)', 'Very deep (> 8 m)'],
    envOptions: ['Open river', 'Eddy / bay', 'Lake / reservoir', 'Coastal / estuary'],
    baitOptions: ['Worm / natural bait', 'Live bait (small fish, etc.)', 'Dough / paste', 'Light artificial (<10g)', 'Heavy artificial (jig/pilker)'],
    techOptions: ['Bottom', 'Mid-water', 'Surface', 'Long-cast (distance)'],
    speciesOptions: ['Wolf fish (Tararira)', 'Golden dorado', 'Boga', 'Catfish (Bagre)', 'Silverside (Pejerrey)', 'Tetra (Mojarra)', 'Spotted catfish (Surubí)', 'Croaker (Corvina)', 'Snook (Robalo)', 'Any / General'],
  },
};

// ── Motor de cálculo ──────────────────────────────────────────────────────────
// Índices: weight[0-4], current[0-4], depth[0-3], env[0-3], bait[0-4], tech[0-3], species[0-9]

function calculate({ weight, current, depth, env, bait, tech, species }) {
  // Peso base da chumbada (g) por correnteza × peso do peixe
  // current: 0=parada, 1=fraca, 2=média, 3=forte, 4=muito forte
  // weight: 0=<0.5kg, 1=0.5-2kg, 2=2-5kg, 3=5-15kg, 4=>15kg
  const sinkerBase = [
    [5,  8,  10, 15, 20 ],  // parada
    [10, 15, 20, 30, 40 ],  // fraca
    [20, 30, 40, 60, 80 ],  // média
    [40, 60, 80, 100, 120], // forte
    [60, 90, 120, 150, 200], // muito forte
  ];

  let sinkerGrams = sinkerBase[current][weight];

  // Ajuste por ambiente
  if (env === 2) sinkerGrams = Math.round(sinkerGrams * 0.75); // lago/represa — menos correnteza real
  if (env === 3) sinkerGrams = Math.round(sinkerGrams * 1.2);  // costeiro — maré/ondas

  // Ajuste por técnica
  if (tech === 0) sinkerGrams = Math.round(sinkerGrams * 1.15); // fundo — precisa de mais peso
  if (tech === 2) sinkerGrams = 0; // superfície — sem chumbada normalmente
  if (tech === 3) sinkerGrams = Math.max(sinkerGrams, 15);      // long-cast — mínimo para alcance

  // Ajuste por isca pesada
  if (bait === 4) sinkerGrams = 0; // artificial pesado (jig) — o próprio jig é o peso

  // Formato da chumbada
  let sinkerType = '';
  let sinkerNote = '';
  if (bait === 4) {
    sinkerType = tech === 0
      ? (lang => lang === 'es' ? 'Jig de fondo' : lang === 'en' ? 'Bottom jig' : 'Jig de fundo')(null)
      : (lang => lang === 'es' ? 'Jig / Pilker' : lang === 'en' ? 'Jig / Pilker' : 'Jig / Pilker')(null);
    sinkerNote = 'jig';
  } else if (current >= 3) {
    sinkerType = 'SINKER_TORPEDO';
  } else if (tech === 0 && current >= 2) {
    sinkerType = 'SINKER_PERA';
  } else if (current <= 1) {
    sinkerType = 'SINKER_REDONDA';
  } else {
    sinkerType = 'SINKER_OVAL';
  }

  // Bóia
  // Tipo base pelo ambiente e técnica
  let buoyType = '';
  let buoySize = '';

  if (tech === 2 || tech === 1) {
    // Superfície / meia-água
    if (current <= 1 && env !== 0) {
      buoyType = 'BUOY_WAGGLER';
    } else if (current >= 3) {
      buoyType = 'BUOY_CORREDICA';
    } else {
      buoyType = 'BUOY_PALITO';
    }
  } else if (tech === 0) {
    // Fundo — bóia não é essencial, mas pode usar chumbada corrediça
    buoyType = 'BUOY_NONE';
  } else {
    // Long-cast
    buoyType = current >= 2 ? 'BUOY_CORREDICA' : 'BUOY_WAGGLER';
  }

  // Capacidade de sustentação da bóia ≈ peso da chumbada + isca
  const baitWeight = [2, 5, 3, 8, 0][bait]; // g estimados da isca
  const totalLoad = sinkerGrams + baitWeight;

  if (totalLoad <= 5) buoySize = 'XS (2–5g)';
  else if (totalLoad <= 15) buoySize = 'P (5–15g)';
  else if (totalLoad <= 35) buoySize = 'M (15–35g)';
  else if (totalLoad <= 70) buoySize = 'G (35–70g)';
  else buoySize = 'XG (70g+)';

  // Linha (lb)
  // species influencia a resistência mínima
  const speciesLineLb = [20, 30, 15, 15, 6, 4, 40, 20, 30, 12];
  const weightLineLb  = [6, 12, 20, 30, 50];
  const lineLb = Math.max(speciesLineLb[species], weightLineLb[weight]);

  let lineType = '';
  if (lineLb <= 8)  lineType = `0.20–0.25mm · ${lineLb}lb`;
  else if (lineLb <= 15) lineType = `0.28–0.35mm · ${lineLb}lb`;
  else if (lineLb <= 25) lineType = `0.35–0.45mm · ${lineLb}lb`;
  else if (lineLb <= 40) lineType = `0.50–0.60mm · ${lineLb}lb`;
  else lineType = `0.70mm+ · ${lineLb}lb`;

  // Anzol (tamanho)
  const hookBySpeciesWeight = [
    [8, 6, 4, 2, 1],   // tararira
    [6, 4, 2, 1, '1/0'], // dourado
    [10, 8, 6, 4, 2],  // boga
    [8, 6, 4, 2, 1],   // bagre
    [14, 12, 10, 8, 6],// pejerrey
    [16, 14, 12, 10, 8],// mojarra
    [4, 2, 1, '1/0', '2/0'], // surubí
    [8, 6, 4, 2, 1],   // corvina
    [6, 4, 2, 1, '1/0'], // robalo
    [10, 8, 6, 4, 2],  // geral
  ];
  const hookSize = hookBySpeciesWeight[species][weight];

  // Baixeiro (leader)
  const leaderLb = Math.round(lineLb * 1.3);
  const leaderLength = current >= 3 ? '30–50cm' : depth >= 2 ? '40–80cm' : '20–40cm';

  return { sinkerGrams, sinkerType, sinkerNote, buoyType, buoySize, lineType, hookSize, leaderLb, leaderLength, totalLoad };
}

// ── Label helpers ─────────────────────────────────────────────────────────────
function sinkerLabel(type, grams, lang) {
  if (type === 'jig') return null; // tratado separado
  const g = `${grams}g`;
  const types = {
    SINKER_TORPEDO: { pt: `Torpedo ${g}`, es: `Torpedo ${g}`, en: `Torpedo ${g}` },
    SINKER_PERA:    { pt: `Pêra ${g}`,    es: `Pera ${g}`,    en: `Pear ${g}` },
    SINKER_REDONDA: { pt: `Redonda ${g}`, es: `Redonda ${g}`, en: `Round ${g}` },
    SINKER_OVAL:    { pt: `Oval ${g}`,    es: `Oval ${g}`,    en: `Oval ${g}` },
  };
  return types[type]?.[lang] || `${grams}g`;
}

function buoyLabel(type, size, lang) {
  if (type === 'BUOY_NONE') return { pt: 'Sem bóia — chumbada corrediça', es: 'Sin boya — plomada corrediza', en: 'No float — sliding sinker' }[lang];
  const types = {
    BUOY_WAGGLER:   { pt: `Waggler ${size}`, es: `Waggler ${size}`, en: `Waggler ${size}` },
    BUOY_PALITO:    { pt: `Palito ${size}`,  es: `Palito ${size}`,  en: `Stick float ${size}` },
    BUOY_CORREDICA: { pt: `Bóia corrediça ${size}`, es: `Boya corrediza ${size}`, en: `Sliding float ${size}` },
  };
  return types[type]?.[lang] || size;
}

function sinkerTip(type, current, tech, lang) {
  if (tech === 2) return { pt: 'Na superfície, dispense a chumbada ou use apenas microchumbinho (1–2g) para estabilizar a isca viva.', es: 'En superficie, prescinda de la plomada o use micro-plomo (1–2g) para estabilizar la carnada viva.', en: 'For surface fishing, skip the sinker or use a micro-split-shot (1–2g) to stabilize live bait.' }[lang];
  if (type === 'SINKER_TORPEDO') return { pt: 'A chumbada torpedo é ideal para correnteza forte — sua forma aerodinâmica reduz o arraste lateral e mantém o fundo.', es: 'La plomada torpedo es ideal para corriente fuerte — su forma aerodinámica reduce el arrastre lateral.', en: 'The torpedo sinker is ideal for strong currents — its aerodynamic shape reduces lateral drag.' }[lang];
  if (type === 'SINKER_PERA') return { pt: 'A chumbada pêra com girador reduz torsão na linha em correnteza moderada a forte.', es: 'La plomada pera con girador reduce la torsión en corriente moderada a fuerte.', en: 'A pear sinker with swivel reduces line twist in moderate to strong current.' }[lang];
  if (type === 'SINKER_REDONDA') return { pt: 'Em águas paradas ou correnteza fraca, a chumbada redonda é suficiente e mais barata.', es: 'En aguas quietas o corriente suave, la plomada redonda es suficiente y más económica.', en: 'In still or slow water, a round sinker is sufficient and more economical.' }[lang];
  return { pt: 'Ajuste o peso conforme a profundidade real — mais fundo exige mais chumbo.', es: 'Ajuste el peso según la profundidad real — más profundidad requiere más plomo.', en: 'Adjust weight according to actual depth — deeper water requires more weight.' }[lang];
}

function buoyTip(type, depth, current, lang) {
  if (type === 'BUOY_NONE') return { pt: 'Montagem de fundo corrediça: o peixe puxa a linha sem sentir resistência da bóia, aumentando as picadas.', es: 'Montaje de fondo corredizo: el pez jala sin sentir resistencia, aumentando las picadas.', en: 'Sliding bottom rig: the fish pulls without feeling float resistance, increasing bites.' }[lang];
  if (type === 'BUOY_CORREDICA') return { pt: 'A bóia corrediça permite regular a profundidade exata com uma âncora — ideal para pescar fundo em rios com corrente.', es: 'La boya corrediza permite regular la profundidad exacta con un tope — ideal para pescar fondo en ríos con corriente.', en: 'A sliding float lets you set the exact depth with a stop-knot — ideal for bottom fishing in flowing water.' }[lang];
  if (type === 'BUOY_WAGGLER') return { pt: 'O waggler é fixado apenas pela base — reduz o arrasto lateral e é ótimo para lançamentos mais longos em águas abertas.', es: 'El waggler se fija solo por la base — reduce el arrastre lateral y es ideal para lanzamientos largos en aguas abiertas.', en: 'The waggler is attached at the base only — reduces lateral drag and is great for longer casts in open water.' }[lang];
  return { pt: 'O palito (ou crayon) é sensível a pequenas mordidas — ideal para espécies com toque leve como pejerrey e mojarra.', es: 'El palito es sensible a toques suaves — ideal para pejerrey y mojarra.', en: 'The stick float is sensitive to light bites — ideal for delicate species like silverside and tetra.' }[lang];
}

// ── Componente ────────────────────────────────────────────────────────────────
const FIELDS = ['species', 'weight', 'current', 'depth', 'env', 'bait', 'tech'];

export default function BuoyCalculator() {
  const { lang } = useLang();
  const l = I18N[lang] || I18N.pt;

  const [values, setValues] = useState({ species: '', weight: '', current: '', depth: '', env: '', bait: '', tech: '' });
  const [showResult, setShowResult] = useState(false);

  const set = (k, v) => { setValues(prev => ({ ...prev, [k]: v })); setShowResult(false); };

  const allFilled = FIELDS.every(f => values[f] !== '');

  const result = useMemo(() => {
    if (!allFilled) return null;
    return calculate({
      species: +values.species, weight: +values.weight, current: +values.current,
      depth: +values.depth, env: +values.env, bait: +values.bait, tech: +values.tech,
    });
  }, [values, allFilled]);

  function reset() { setValues({ species: '', weight: '', current: '', depth: '', env: '', bait: '', tech: '' }); setShowResult(false); }

  const fieldDefs = [
    { key: 'species', icon: <Fish size={13} />, label: l.species,    options: l.speciesOptions },
    { key: 'weight',  icon: <Target size={13} />, label: l.weight,   options: l.weightRanges },
    { key: 'current', icon: <Waves size={13} />, label: l.current,   options: l.currentOptions },
    { key: 'depth',   icon: <Layers size={13} />, label: l.depth,    options: l.depthOptions },
    { key: 'env',     icon: <Anchor size={13} />, label: l.environment, options: l.envOptions },
    { key: 'bait',    icon: <span style={{ fontSize: 13 }}>🪱</span>, label: l.bait, options: l.baitOptions },
    { key: 'tech',    icon: <span style={{ fontSize: 13 }}>🎣</span>, label: l.technique, options: l.techOptions },
  ];

  const isJig = result && values.bait === '4';
  const isSurface = result && values.tech === '2';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* Formulário */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
        {fieldDefs.map(({ key, icon, label, options }) => (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              {icon} {label}
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={values[key]}
                onChange={e => set(key, e.target.value)}
                style={{ width: '100%', padding: '6px 28px 6px 8px', borderRadius: 8, border: `1px solid ${values[key] !== '' ? '#38bdf855' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', color: 'var(--text-primary)', colorScheme: 'dark light', fontSize: '0.78rem', appearance: 'none', cursor: 'pointer' }}
              >
                <option value="">—</option>
                {options.map((opt, i) => <option key={i} value={i}>{opt}</option>)}
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Botões */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setShowResult(true)}
          disabled={!allFilled}
          style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: allFilled ? '#1d4ed8' : 'var(--bg-surface)', color: allFilled ? '#fff' : 'var(--text-muted)', fontWeight: 700, fontSize: '0.83rem', cursor: allFilled ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Anchor size={14} /> {l.calculate}
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
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-heading)', borderBottom: '1px solid var(--border-faint)', paddingBottom: 8, marginBottom: 2 }}>
            {l.result}
          </div>

          {/* Grid de recomendações */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

            {/* Bóia */}
            <ResultItem
              icon="🎈"
              label={l.buoy}
              value={buoyLabel(result.buoyType, result.buoySize, lang)}
              color="#38bdf8"
            />

            {/* Chumbada */}
            <ResultItem
              icon="⚓"
              label={l.sinker}
              value={isJig
                ? (lang === 'es' ? 'Jig / Pilker (peso próprio)' : lang === 'en' ? 'Jig / Pilker (self-weighted)' : 'Jig / Pilker (peso próprio)')
                : isSurface
                  ? (lang === 'es' ? 'Sin plomada (superficie)' : lang === 'en' ? 'No sinker (surface)' : 'Sem chumbada (superfície)')
                  : sinkerLabel(result.sinkerType, result.sinkerGrams, lang)}
              color="#f97316"
            />

            {/* Linha */}
            <ResultItem
              icon="🧵"
              label={l.line}
              value={result.lineType}
              color="#a78bfa"
            />

            {/* Anzol */}
            <ResultItem
              icon="🪝"
              label={l.hook}
              value={`Nº ${result.hookSize}`}
              color="#22c55e"
            />

            {/* Baixeiro */}
            <ResultItem
              icon="📏"
              label={l.leader}
              value={`${result.leaderLb}lb · ${result.leaderLength}`}
              color="#eab308"
            />

          </div>

          {/* Dicas */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
            <TipBox icon="⚓" text={sinkerTip(result.sinkerType, +values.current, +values.tech, lang)} />
            <TipBox icon="🎈" text={buoyTip(result.buoyType, +values.depth, +values.current, lang)} />
          </div>
        </div>
      ) : showResult === false && !allFilled ? (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
          {l.noResult}
        </div>
      ) : null}
    </div>
  );
}

function ResultItem({ icon, label, value, color }) {
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 3 }}>{icon} {label}</div>
      <div style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

function TipBox({ icon, text }) {
  return (
    <div style={{ display: 'flex', gap: 8, background: 'var(--bg-card)', borderRadius: 8, padding: '8px 10px', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      <Info size={13} style={{ flexShrink: 0, marginTop: 2, color: '#38bdf8' }} />
      <span>{text}</span>
    </div>
  );
}
