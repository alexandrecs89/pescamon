import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './supabase.js';
import { useLang } from './i18n.jsx';
import {
  Fish, MapPin, Gauge, Calendar, RefreshCw, Star, StarOff,
  ChevronDown, ChevronUp, Loader, CheckCircle, AlertTriangle,
  Clock, Zap, BarChart2, Search, Share2, Copy, CheckCheck
} from 'lucide-react';

// ── Lista de espécies disponíveis (sync com main.jsx) ─────────────────────────
const ALL_SPECIES = [
  { id: 'tararira',    namePt: 'Traíra',         nameEs: 'Tararira',        nameEn: 'Wolf fish',              color: '#f97316' },
  { id: 'dourado',     namePt: 'Dourado',         nameEs: 'Dorado',          nameEn: 'Golden dorado',          color: '#eab308' },
  { id: 'boga',        namePt: 'Piapara',         nameEs: 'Boga',            nameEn: 'Boga',                   color: '#22c55e' },
  { id: 'bagre',       namePt: 'Bagre-amarelo',   nameEs: 'Bagre amarillo',  nameEn: 'Spotted catfish',        color: '#38bdf8' },
  { id: 'pejerrey',    namePt: 'Peixe-rei',       nameEs: 'Pejerrey',        nameEn: 'Silverside',             color: '#a78bfa' },
  { id: 'mojarra',     namePt: 'Lambari',         nameEs: 'Mojarra',         nameEn: 'Tetra',                  color: '#fb7185' },
  { id: 'sabalito',    namePt: 'Curimbatá',       nameEs: 'Sábalo',          nameEn: 'Streaked prochilod',     color: '#84cc16' },
  { id: 'patí',        namePt: 'Pati',            nameEs: 'Patí',            nameEn: 'Pati catfish',           color: '#0ea5e9' },
  { id: 'surubí',      namePt: 'Pintado',         nameEs: 'Surubí pintado',  nameEn: 'Spotted shovelnose',     color: '#6366f1' },
  { id: 'vieja_agua',  namePt: 'Cascudo',         nameEs: 'Vieja del agua',  nameEn: 'Suckermouth catfish',    color: '#78716c' },
  { id: 'palometa',    namePt: 'Pirambeba',       nameEs: 'Palometa',        nameEn: 'Piranha',                color: '#ef4444' },
  { id: 'armado',      namePt: 'Abotoado',        nameEs: 'Armado común',    nameEn: 'Thorny catfish',         color: '#d97706' },
  { id: 'corvina',     namePt: 'Corvina-do-rio',  nameEs: 'Corvina de río',  nameEn: 'River croaker',          color: '#c084fc' },
  { id: 'anguilas',    namePt: 'Mussum',          nameEs: 'Anguila criolla', nameEn: 'Marbled swamp eel',      color: '#854d0e' },
  { id: 'pejerrey_costero', namePt: 'Peixe-rei costeiro', nameEs: 'Pejerrey costero', nameEn: 'Coastal silverside', color: '#67e8f9' },
  { id: 'corvina_negra',    namePt: 'Corvina-negra',      nameEs: 'Corvina negra',    nameEn: 'Black drum',         color: '#475569' },
];

function spName(sp, lang) {
  if (lang === 'es') return sp.nameEs;
  if (lang === 'en') return sp.nameEn;
  return sp.namePt;
}

// ── Traduções internas ─────────────────────────────────────────────────────────
const I18N = {
  pt: {
    share: 'Compartilhar',
    shareCopied: 'Copiado!',
    title: 'Relatórios Preditivos',
    subtitle: 'Relatórios mensais e semanais das melhores janelas de pesca para seus peixes favoritos.',
    tabFavorites: 'Favoritos',
    tabSettings: 'Configurações',
    tabReports: 'Relatórios',
    noFavorites: 'Nenhuma espécie favorita selecionada.',
    searchSpecies: 'Buscar espécie…',
    favoritesSaved: 'Favoritos salvos!',
    settingsTitle: 'Configurações do relatório',
    homeAddress: 'Endereço residencial (referência para distância)',
    addressPlaceholder: 'Ex: Av. Brasil 1500, Montevidéu',
    locateMe: 'Usar minha localização atual',
    radiusLabel: 'Raio de busca',
    monthlyReport: 'Relatório mensal (todo dia 1)',
    weeklyReport: 'Relatório semanal (toda segunda-feira)',
    saveSettings: 'Salvar configurações',
    settingsSaved: 'Configurações salvas!',
    generateNow: 'Gerar relatório agora',
    generating: 'Gerando…',
    reportGenerated: 'Relatório gerado!',
    noReports: 'Nenhum relatório gerado ainda. Configure seus favoritos e clique em "Gerar relatório agora".',
    reportType_monthly: 'Mensal',
    reportType_weekly: 'Semanal',
    bestDays: 'Melhores dias',
    bestSpots: 'Melhores locais',
    species: 'Espécie',
    score: 'Probabilidade',
    km: 'km',
    expand: 'Ver detalhes',
    collapse: 'Recolher',
    errorSave: 'Erro ao salvar.',
    errorGenerate: 'Erro ao gerar relatório.',
    premiumOnly: 'Recurso exclusivo Premium',
    premiumDesc: 'Assine o Premium para acessar relatórios preditivos personalizados.',
    radiusOptions: ['25 km', '50 km', '100 km', '200 km'],
  },
  es: {
    share: 'Compartir',
    shareCopied: '¡Copiado!',
    title: 'Informes Predictivos',
    subtitle: 'Informes mensuales y semanales de las mejores ventanas de pesca para tus peces favoritos.',
    tabFavorites: 'Favoritos',
    tabSettings: 'Configuración',
    tabReports: 'Informes',
    noFavorites: 'Ninguna especie favorita seleccionada.',
    searchSpecies: 'Buscar especie…',
    favoritesSaved: '¡Favoritos guardados!',
    settingsTitle: 'Configuración del informe',
    homeAddress: 'Dirección de residencia (referencia de distancia)',
    addressPlaceholder: 'Ej: Av. Brasil 1500, Montevideo',
    locateMe: 'Usar mi ubicación actual',
    radiusLabel: 'Radio de búsqueda',
    monthlyReport: 'Informe mensual (cada día 1)',
    weeklyReport: 'Informe semanal (cada lunes)',
    saveSettings: 'Guardar configuración',
    settingsSaved: '¡Configuración guardada!',
    generateNow: 'Generar informe ahora',
    generating: 'Generando…',
    reportGenerated: '¡Informe generado!',
    noReports: 'Ningún informe generado aún. Configure sus favoritos y haga clic en "Generar informe ahora".',
    reportType_monthly: 'Mensual',
    reportType_weekly: 'Semanal',
    bestDays: 'Mejores días',
    bestSpots: 'Mejores lugares',
    species: 'Especie',
    score: 'Probabilidad',
    km: 'km',
    expand: 'Ver detalles',
    collapse: 'Colapsar',
    errorSave: 'Error al guardar.',
    errorGenerate: 'Error al generar informe.',
    premiumOnly: 'Recurso exclusivo Premium',
    premiumDesc: 'Suscríbase a Premium para acceder a informes predictivos personalizados.',
    radiusOptions: ['25 km', '50 km', '100 km', '200 km'],
  },
  en: {
    share: 'Share',
    shareCopied: 'Copied!',
    title: 'Predictive Reports',
    subtitle: 'Monthly and weekly reports of the best fishing windows for your favorite species.',
    tabFavorites: 'Favorites',
    tabSettings: 'Settings',
    tabReports: 'Reports',
    noFavorites: 'No favorite species selected.',
    searchSpecies: 'Search species…',
    favoritesSaved: 'Favorites saved!',
    settingsTitle: 'Report settings',
    homeAddress: 'Home address (distance reference)',
    addressPlaceholder: 'e.g. 1500 Brazil Ave, Montevideo',
    locateMe: 'Use my current location',
    radiusLabel: 'Search radius',
    monthlyReport: 'Monthly report (every 1st)',
    weeklyReport: 'Weekly report (every Monday)',
    saveSettings: 'Save settings',
    settingsSaved: 'Settings saved!',
    generateNow: 'Generate report now',
    generating: 'Generating…',
    reportGenerated: 'Report generated!',
    noReports: 'No reports generated yet. Set up your favorites and click "Generate report now".',
    reportType_monthly: 'Monthly',
    reportType_weekly: 'Weekly',
    bestDays: 'Best days',
    bestSpots: 'Best spots',
    species: 'Species',
    score: 'Probability',
    km: 'km',
    expand: 'View details',
    collapse: 'Collapse',
    errorSave: 'Error saving.',
    errorGenerate: 'Error generating report.',
    premiumOnly: 'Premium exclusive feature',
    premiumDesc: 'Subscribe to Premium to access personalized predictive reports.',
    radiusOptions: ['25 km', '50 km', '100 km', '200 km'],
  },
};

const RADIUS_VALUES = [25, 50, 100, 200];

// ── Gerador de relatório (client-side) ────────────────────────────────────────
// Gera um relatório baseado nas espécies favoritas + clima atual Open-Meteo
async function generateReportContent(favoriteSpecies, settings) {
  // Coordenadas base: residência do usuário ou centro do Uruguai
  const lat = settings.home_lat || -32.9;
  const lng = settings.home_lng || -56.0;
  const radiusKm = settings.radius_km || 50;

  // Busca previsão 7 dias Open-Meteo
  let forecast = [];
  try {
    const params = [
      `latitude=${lat}`,
      `longitude=${lng}`,
      'daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,surface_pressure_mean,shortwave_radiation_sum',
      'timezone=America/Montevideo',
      'forecast_days=7',
    ].join('&');
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (res.ok) {
      const data = await res.json();
      const d = data.daily;
      forecast = d.time.map((date, i) => ({
        date,
        tempMax: Math.round(d.temperature_2m_max[i]),
        tempMin: Math.round(d.temperature_2m_min[i]),
        rain: Math.round(d.precipitation_sum[i] * 10) / 10,
        wind: Math.round(d.wind_speed_10m_max[i]),
        pressure: d.surface_pressure_mean?.[i] ? Math.round(d.surface_pressure_mean[i]) : null,
        radiation: d.shortwave_radiation_sum?.[i] || 0,
      }));
    }
  } catch {}

  // Calcula score diário por espécie
  const speciesResults = favoriteSpecies.map(sp => {
    const TEMP_PREF = { tararira: 22, dourado: 20, boga: 19, bagre: 18, pejerrey: 15, mojarra: 20, sabalito: 20, patí: 19, surubí: 21, vieja_agua: 19, palometa: 23, armado: 20, corvina: 18, anguilas: 22 };
    const optTemp = TEMP_PREF[sp.species_id] || 19;

    const dayScores = forecast.map(day => {
      let score = 50;
      const avgTemp = (day.tempMax + day.tempMin) / 2;
      const diff = Math.abs(avgTemp - optTemp);
      if (diff <= 2) score += 18; else if (diff <= 5) score += 8; else if (diff > 10) score -= 12;
      if (day.rain > 10) score -= 18; else if (day.rain > 3) score -= 6; else if (day.rain === 0) score += 5;
      if (day.wind > 35) score -= 12; else if (day.wind > 20) score -= 4;
      if (day.radiation > 15) score += 6;
      if (day.pressure) {
        if (day.pressure >= 1008 && day.pressure <= 1022) score += 4;
        else if (day.pressure < 1000) score -= 8;
        else if (day.pressure > 1022) score -= 5;
      }
      return { date: day.date, score: Math.max(0, Math.min(100, Math.round(score))), rain: day.rain, tempMax: day.tempMax, tempMin: day.tempMin, pressure: day.pressure, wind: day.wind };
    });

    const bestDays = [...dayScores].sort((a, b) => b.score - a.score).slice(0, 3);
    return { species_id: sp.species_id, species_name: sp.species_name, color: sp.color || '#38bdf8', bestDays, allDays: dayScores };
  });

  // Locais sugeridos (próximos ao centro, dentro do raio)
  const KNOWN_SPOTS = [
    { name: 'Rio Santa Lucía — Trecho médio', lat: -34.36, lng: -56.40, type: 'Rio' },
    { name: 'Río Negro — Confluência', lat: -32.87, lng: -57.85, type: 'Rio' },
    { name: 'Laguna del Cisne', lat: -34.62, lng: -55.87, type: 'Lagoa' },
    { name: 'Río Uruguay — Litoral norte', lat: -32.42, lng: -58.05, type: 'Rio' },
    { name: 'Arroyo Solís Grande', lat: -34.41, lng: -55.63, type: 'Arroio' },
    { name: 'Embalse de Salto Grande', lat: -31.28, lng: -57.93, type: 'Represa' },
    { name: 'Lagoa Merín — Margem UY', lat: -33.15, lng: -53.48, type: 'Lagoa' },
    { name: 'Río Cebollatí', lat: -33.28, lng: -53.93, type: 'Rio' },
  ];

  function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const nearbySpots = KNOWN_SPOTS
    .map(s => ({ ...s, distKm: Math.round(haversineKm(lat, lng, s.lat, s.lng)) }))
    .filter(s => s.distKm <= radiusKm)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 5);

  const now = new Date();
  const periodLabel = `${now.toLocaleString('pt-BR', { month: 'long' })} ${now.getFullYear()}`;

  return { speciesResults, nearbySpots, forecast, periodLabel, generatedAt: now.toISOString(), radiusKm, homeLat: lat, homeLng: lng };
}

// ── Busca histórico climático Open-Meteo (30 dias passados) ───────────────────────────
async function fetchClimateHistory(lat, lng) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const fmt = d => d.toISOString().slice(0, 10);
  const params = [
    `latitude=${lat}`,
    `longitude=${lng}`,
    `start_date=${fmt(start)}`,
    `end_date=${fmt(end)}`,
    'daily=temperature_2m_max,temperature_2m_min,surface_pressure_mean,precipitation_sum',
    'timezone=America/Montevideo',
  ].join('&');
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error('Open-Meteo history error');
  const data = await res.json();
  const d = data.daily;
  return (d.time || []).map((date, i) => ({
    date,
    tMax:     Math.round(d.temperature_2m_max?.[i] ?? 0),
    tMin:     Math.round(d.temperature_2m_min?.[i] ?? 0),
    pressure: Math.round(d.surface_pressure_mean?.[i] ?? 1013),
    rain:     +(d.precipitation_sum?.[i] ?? 0).toFixed(1),
  }));
}

// ── Gráfico Canvas: pressão + temperatura ───────────────────────────────────
function ClimateHistoryChart({ data, lang }) {
  const canvasRef = useRef(null);

  const draw = useCallback(() => {
    if (!canvasRef.current || !data || data.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.offsetWidth || 500;
    const H = 140;
    canvas.width  = W * window.devicePixelRatio;
    canvas.height = H * window.devicePixelRatio;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const PAD = { top: 12, right: 48, bottom: 28, left: 36 };
    const gW = W - PAD.left - PAD.right;
    const gH = H - PAD.top - PAD.bottom;
    const n  = data.length;

    // Ranges
    const tAll    = data.flatMap(d => [d.tMin, d.tMax]);
    const tMin    = Math.min(...tAll) - 2;
    const tMax    = Math.max(...tAll) + 2;
    const pAll    = data.map(d => d.pressure);
    const pMin    = Math.min(...pAll) - 3;
    const pMax    = Math.max(...pAll) + 3;

    const xOf = i => PAD.left + (i / (n - 1)) * gW;
    const yT  = v => PAD.top + gH - ((v - tMin) / (tMax - tMin)) * gH;
    const yP  = v => PAD.top + gH - ((v - pMin) / (pMax - pMin)) * gH;

    // Fundo
    ctx.clearRect(0, 0, W, H);

    // Grid linhas horizontais
    ctx.strokeStyle = 'rgba(148,163,184,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (i / 4) * gH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(W - PAD.right, y); ctx.stroke();
    }

    // Área temperatura máx/mín
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yT(d.tMax)) : ctx.lineTo(xOf(i), yT(d.tMax)); });
    [...data].reverse().forEach((d, i) => ctx.lineTo(xOf(n - 1 - i), yT(d.tMin)));
    ctx.closePath();
    ctx.fillStyle = 'rgba(251,146,60,0.13)';
    ctx.fill();

    // Linha temperatura máx
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yT(d.tMax)) : ctx.lineTo(xOf(i), yT(d.tMax)); });
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.5; ctx.stroke();

    // Linha temperatura mínima
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yT(d.tMin)) : ctx.lineTo(xOf(i), yT(d.tMin)); });
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.stroke();

    // Linha pressão (eixo direito)
    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(xOf(i), yP(d.pressure)) : ctx.lineTo(xOf(i), yP(d.pressure)); });
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.stroke();
    ctx.setLineDash([]);

    // Barras de chuva (finas, base)
    const maxRain = Math.max(...data.map(d => d.rain), 1);
    data.forEach((d, i) => {
      if (d.rain <= 0) return;
      const bH = Math.max(2, (d.rain / maxRain) * (gH * 0.25));
      const bW = Math.max(2, gW / n - 2);
      ctx.fillStyle = 'rgba(56,189,248,0.35)';
      ctx.fillRect(xOf(i) - bW / 2, PAD.top + gH - bH, bW, bH);
    });

    // Eixo esquerdo (°C)
    ctx.fillStyle = 'rgba(148,163,184,0.8)';
    ctx.font = `${10 * window.devicePixelRatio / window.devicePixelRatio}px sans-serif`;
    ctx.textAlign = 'right';
    ctx.font = '9px sans-serif';
    for (let i = 0; i <= 4; i++) {
      const v = tMin + ((tMax - tMin) * (4 - i) / 4);
      const y = PAD.top + (i / 4) * gH;
      ctx.fillText(Math.round(v) + '°', PAD.left - 4, y + 3);
    }

    // Eixo direito (hPa)
    ctx.textAlign = 'left';
    for (let i = 0; i <= 4; i++) {
      const v = pMax - ((pMax - pMin) * i / 4);
      const y = PAD.top + (i / 4) * gH;
      ctx.fillStyle = 'rgba(167,139,250,0.8)';
      ctx.fillText(Math.round(v), W - PAD.right + 4, y + 3);
    }

    // Eixo X: datas (a cada 5 dias)
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.textAlign = 'center';
    data.forEach((d, i) => {
      if (i % 5 !== 0) return;
      const label = new Date(d.date + 'T12:00:00').toLocaleDateString(
        lang === 'en' ? 'en-GB' : 'pt-BR', { day: '2-digit', month: 'short' }
      );
      ctx.fillText(label, xOf(i), H - 4);
    });

  }, [data, lang]);

  useEffect(() => {
    draw();
    const obs = new ResizeObserver(draw);
    if (canvasRef.current) obs.observe(canvasRef.current);
    return () => obs.disconnect();
  }, [draw]);

  return <canvas ref={canvasRef} style={{ width: '100%', display: 'block', borderRadius: 8 }} />;
}

// ── Compartilhar relatório ────────────────────────────────────────────────────
function buildShareText(report, lang) {
  const l = I18N[lang] || I18N.pt;
  const content = report.content || {};
  const type = l[`reportType_${report.report_type}`];
  const lines = [
    `📊 Pescamon — Relatório ${type}: ${report.period_label}`,
    '',
  ];
  for (const sp of (content.speciesResults || []).slice(0, 3)) {
    lines.push(`🐟 ${sp.species_name}`);
    for (const d of (sp.bestDays || []).slice(0, 2)) {
      const dt = new Date(d.date + 'T12:00:00').toLocaleDateString(
        lang === 'en' ? 'en-GB' : 'pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }
      );
      lines.push(`  • ${dt}: ${d.score}%`);
    }
  }
  if ((content.nearbySpots || []).length > 0) {
    lines.push('');
    lines.push(`📍 Locais: ${content.nearbySpots.slice(0, 3).map(s => s.name).join(', ')}`);
  }
  lines.push('');
  lines.push('🎣 Via Pescamon — https://pescamon.com.br');
  return lines.join('\n');
}

// ── Subcomponente: card de relatório ──────────────────────────────────────────
function ReportCard({ report, lang, onShowSpots }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const l = I18N[lang] || I18N.pt;
  const content = report.content || {};
  const date = new Date(report.generated_at).toLocaleDateString(
    lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-UY' : 'pt-BR',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  );

  function scoreColor(s) {
    if (s >= 75) return '#22c55e';
    if (s >= 55) return '#eab308';
    if (s >= 35) return '#f97316';
    return '#ef4444';
  }

  async function handleToggleHistory() {
    setShowHistory(s => !s);
    if (!history && !loadingHistory) {
      setLoadingHistory(true);
      try {
        const lat = report.content?.homeLat || -32.9;
        const lng = report.content?.homeLng || -56.0;
        const h = await fetchClimateHistory(lat, lng);
        setHistory(h);
      } catch { setHistory([]); }
      setLoadingHistory(false);
    }
  }

  async function handleShare() {
    const text = buildShareText(report, lang);
    if (navigator.share) {
      try { await navigator.share({ title: 'Pescamon — Relatório Preditivo', text }); return; } catch {}
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0.75rem 1rem', gap: 6 }}>
        <button
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            const spots = report.content?.nearbySpots || [];
            onShowSpots?.(next && spots.length > 0 ? spots : null);
          }}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', padding: 0 }}
        >
          <BarChart2 size={15} color="#38bdf8" />
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
            {l[`reportType_${report.report_type}`]} — {report.period_label}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{date}</span>
        </button>
        <button
          onClick={handleShare}
          title={l.share}
          style={{ padding: '4px 8px', borderRadius: 7, border: '1px solid var(--border-faint)', background: 'transparent', color: copied ? '#22c55e' : '#38bdf8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', flexShrink: 0 }}
        >
          {copied ? <><CheckCheck size={12} /> {l.shareCopied}</> : <><Share2 size={12} /> {l.share}</>}
        </button>
        <button onClick={() => {
            const next = !expanded;
            setExpanded(next);
            const spots = report.content?.nearbySpots || [];
            onShowSpots?.(next && spots.length > 0 ? spots : null);
          }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 4px' }}>
          {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </button>
      </div>

      {expanded && (
        <div style={{ padding: '0 1rem 1rem' }}>
          {/* Por espécie */}
          {(content.speciesResults || []).map(sp => (
            <div key={sp.species_id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: sp.color, display: 'inline-block' }} />
                <strong style={{ fontSize: '0.83rem', color: 'var(--text-heading)' }}>{sp.species_name}</strong>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{l.bestDays}:</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(sp.bestDays || []).map((d, i) => (
                  <div key={i} style={{ background: `${scoreColor(d.score)}18`, border: `1px solid ${scoreColor(d.score)}44`, borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem' }}>
                    <div style={{ fontWeight: 700, color: scoreColor(d.score) }}>{d.score}%</div>
                    <div style={{ color: 'var(--text-muted)' }}>{new Date(d.date + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-GB' : 'pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}</div>
                    <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>{d.tempMin}–{d.tempMax}°C · {d.rain}mm</div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Locais sugeridos */}
          {(content.nearbySpots || []).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>{l.bestSpots} (≤ {content.radiusKm} {l.km}):</div>
              {content.nearbySpots.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  <MapPin size={12} color="#38bdf8" />
                  <span>{s.name}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>{s.distKm} {l.km}</span>
                </div>
              ))}
            </div>
          )}

          {/* Histórico climático */}
          <div style={{ marginTop: 12, background: 'var(--bg-card)', borderRadius: 10, overflow: 'hidden' }}>
            <button
              onClick={handleToggleHistory}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
            >
              <span>📈 {{ pt: 'Histórico climático — 30 dias', es: 'Historial climático — 30 días', en: 'Climate history — 30 days' }[lang]}</span>
              {loadingHistory
                ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} />
                : <ChevronDown size={13} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}
            </button>
            {showHistory && (
              <div style={{ padding: '0 12px 12px' }}>
                {/* Legenda */}
                <div style={{ display: 'flex', gap: 14, fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8, flexWrap: 'wrap' }}>
                  <span><span style={{ display: 'inline-block', width: 20, height: 3, background: '#f97316', verticalAlign: 'middle', marginRight: 4, borderRadius: 2 }} />{{ pt: 'T. máx (°C)', es: 'T. máx (°C)', en: 'T. max (°C)' }[lang]}</span>
                  <span><span style={{ display: 'inline-block', width: 20, height: 3, background: '#38bdf8', verticalAlign: 'middle', marginRight: 4, borderRadius: 2 }} />{{ pt: 'T. mín (°C)', es: 'T. mín (°C)', en: 'T. min (°C)' }[lang]}</span>
                  <span><span style={{ display: 'inline-block', width: 20, height: 3, background: '#a78bfa', borderStyle: 'dashed', borderTop: '2px dashed #a78bfa', verticalAlign: 'middle', marginRight: 4 }} />{{ pt: 'Pressão (hPa)', es: 'Presión (hPa)', en: 'Pressure (hPa)' }[lang]}</span>
                  <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'rgba(56,189,248,0.4)', verticalAlign: 'middle', marginRight: 4, borderRadius: 2 }} />{{ pt: 'Chuva (mm)', es: 'Lluvia (mm)', en: 'Rain (mm)' }[lang]}</span>
                </div>
                {history && history.length > 0
                  ? <ClimateHistoryChart data={history} lang={lang} />
                  : history && history.length === 0
                    ? <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>Sem dados disponíveis.</div>
                    : null}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function FishingReports({ userId, isPremium, onShowSpots }) {
  const { lang } = useLang();
  const l = I18N[lang] || I18N.pt;

  const [activeTab, setActiveTab] = useState('favorites');
  const [favorites, setFavorites] = useState([]);
  const [settings, setSettings] = useState({ home_lat: null, home_lng: null, home_address: '', radius_km: 50, monthly_enabled: true, weekly_enabled: false });
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [msg, setMsg] = useState(null);
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [locating, setLocating] = useState(false);
  const flashTimerRef = useRef(null);

  const flash = useCallback((text, isError = false) => {
    clearTimeout(flashTimerRef.current);
    setMsg({ text, isError });
    flashTimerRef.current = setTimeout(() => setMsg(null), 3000);
  }, []);

  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [{ data: favs }, { data: sett }, { data: reps }] = await Promise.all([
        supabase.from('favorite_species').select('*').eq('user_id', userId).order('created_at'),
        supabase.from('user_report_settings').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('fishing_reports').select('*').eq('user_id', userId).order('generated_at', { ascending: false }).limit(20),
      ]);
      setFavorites(favs || []);
      if (sett) setSettings(s => ({ ...s, ...sett }));
      setReports(reps || []);
    } catch {}
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function toggleFavorite(sp) {
    const exists = favorites.find(f => f.species_id === sp.id);
    if (exists) {
      await supabase.from('favorite_species').delete().eq('id', exists.id);
      setFavorites(prev => prev.filter(f => f.species_id !== sp.id));
    } else {
      const { data } = await supabase.from('favorite_species').insert({ user_id: userId, species_id: sp.id, species_name: spName(sp, lang) }).select().single();
      if (data) setFavorites(prev => [...prev, data]);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      await supabase.from('user_report_settings').upsert(
        { user_id: userId, ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      flash(l.settingsSaved);
    } catch { flash(l.errorSave, true); }
    setSaving(false);
  }

  function locateUser() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setSettings(s => ({ ...s, home_lat: pos.coords.latitude, home_lng: pos.coords.longitude }));
        setLocating(false);
      },
      () => setLocating(false),
      { timeout: 8000 }
    );
  }

  async function handleGenerate(type = 'monthly') {
    if (favorites.length === 0) { flash(l.noFavorites, true); return; }
    setGenerating(true);
    try {
      const spList = favorites.map(f => {
        const sp = ALL_SPECIES.find(s => s.id === f.species_id);
        return { species_id: f.species_id, species_name: spName(sp || { namePt: f.species_name, nameEs: f.species_name, nameEn: f.species_name }, lang), color: sp?.color };
      });
      const content = await generateReportContent(spList, settings);
      const now = new Date();
      const periodLabel = type === 'weekly'
        ? `Semana de ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
        : content.periodLabel;
      const { data } = await supabase.from('fishing_reports').insert({ user_id: userId, report_type: type, period_label: periodLabel, content }).select().single();
      if (data) setReports(prev => [data, ...prev]);
      flash(l.reportGenerated);
      setActiveTab('reports');
    } catch { flash(l.errorGenerate, true); }
    setGenerating(false);
  }

  if (!isPremium) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-heading)', marginBottom: 8 }}>{l.premiumOnly}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{l.premiumDesc}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
        <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} color="#38bdf8" />
      </div>
    );
  }

  const filteredSpecies = ALL_SPECIES.filter(sp =>
    spName(sp, lang).toLowerCase().includes(speciesSearch.toLowerCase()) ||
    sp.id.includes(speciesSearch.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <BarChart2 size={16} color="#38bdf8" /> {l.title}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 3 }}>{l.subtitle}</div>
      </div>

      {/* Flash message */}
      {msg && (
        <div style={{ padding: '6px 12px', borderRadius: 8, marginBottom: 10, fontSize: '0.8rem', background: msg.isError ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)', color: msg.isError ? '#fca5a5' : '#86efac', display: 'flex', alignItems: 'center', gap: 6 }}>
          {msg.isError ? <AlertTriangle size={13} /> : <CheckCircle size={13} />} {msg.text}
        </div>
      )}

      {/* Inner tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border-faint)', paddingBottom: 8 }}>
        {['favorites', 'settings', 'reports'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: '0.78rem', fontWeight: activeTab === tab ? 700 : 400, background: activeTab === tab ? 'rgba(56,189,248,0.15)' : 'transparent', color: activeTab === tab ? '#38bdf8' : 'var(--text-muted)', cursor: 'pointer' }}
          >
            {tab === 'favorites' && <><Star size={12} style={{ marginRight: 4 }} />{l.tabFavorites} ({favorites.length})</>}
            {tab === 'settings' && <><Gauge size={12} style={{ marginRight: 4 }} />{l.tabSettings}</>}
            {tab === 'reports' && <><BarChart2 size={12} style={{ marginRight: 4 }} />{l.tabReports} ({reports.length})</>}
          </button>
        ))}
      </div>

      {/* TAB: FAVORITES */}
      {activeTab === 'favorites' && (
        <div>
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={speciesSearch}
              onChange={e => setSpeciesSearch(e.target.value)}
              placeholder={l.searchSpecies}
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px 6px 30px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredSpecies.map(sp => {
              const isFav = !!favorites.find(f => f.species_id === sp.id);
              return (
                <button
                  key={sp.id}
                  onClick={() => toggleFavorite(sp)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: `1px solid ${isFav ? sp.color + '55' : 'var(--border-faint)'}`, background: isFav ? sp.color + '15' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: sp.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: '0.83rem', color: 'var(--text-primary)', fontWeight: isFav ? 600 : 400 }}>{spName(sp, lang)}</span>
                  {isFav
                    ? <Star size={14} color={sp.color} fill={sp.color} />
                    : <StarOff size={14} color="var(--text-muted)" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: SETTINGS */}
      {activeTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{l.homeAddress}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={settings.home_address || ''}
                onChange={e => setSettings(s => ({ ...s, home_address: e.target.value }))}
                placeholder={l.addressPlaceholder}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
              />
              <button
                onClick={locateUser}
                disabled={locating}
                title={l.locateMe}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', cursor: 'pointer', color: '#38bdf8', flexShrink: 0 }}
              >
                {locating ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MapPin size={14} />}
              </button>
            </div>
            {settings.home_lat && (
              <div style={{ fontSize: '0.72rem', color: '#22c55e', marginTop: 4 }}>
                <CheckCircle size={11} style={{ marginRight: 3 }} />
                {settings.home_lat.toFixed(4)}, {settings.home_lng?.toFixed(4)}
              </div>
            )}
          </div>

          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{l.radiusLabel}</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {RADIUS_VALUES.map((r, i) => (
                <button
                  key={r}
                  onClick={() => setSettings(s => ({ ...s, radius_km: r }))}
                  style={{ flex: 1, padding: '6px 4px', borderRadius: 8, border: `1px solid ${settings.radius_km === r ? '#38bdf8' : 'var(--border-faint)'}`, background: settings.radius_km === r ? 'rgba(56,189,248,0.15)' : 'transparent', color: settings.radius_km === r ? '#38bdf8' : 'var(--text-muted)', fontSize: '0.75rem', fontWeight: settings.radius_km === r ? 700 : 400, cursor: 'pointer' }}
                >
                  {l.radiusOptions[i]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: 'monthly_enabled', label: l.monthlyReport, icon: <Calendar size={13} /> },
              { key: 'weekly_enabled', label: l.weeklyReport, icon: <Clock size={13} /> },
            ].map(({ key, label, icon }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-faint)', background: 'var(--bg-surface)' }}>
                <input
                  type="checkbox"
                  checked={!!settings[key]}
                  onChange={e => setSettings(s => ({ ...s, [key]: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: '#38bdf8' }}
                />
                {icon}
                <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{label}</span>
              </label>
            ))}
          </div>

          <button
            onClick={saveSettings}
            disabled={saving}
            style={{ padding: '8px', borderRadius: 8, border: 'none', background: '#1d4ed8', color: '#fff', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            {saving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle size={14} />}
            {saving ? '…' : l.saveSettings}
          </button>
        </div>
      )}

      {/* TAB: REPORTS */}
      {activeTab === 'reports' && (
        <div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {['monthly', 'weekly'].map(type => (
              <button
                key={type}
                onClick={() => handleGenerate(type)}
                disabled={generating}
                style={{ flex: 1, padding: '7px', borderRadius: 8, border: `1px solid ${type === 'monthly' ? '#38bdf8' : '#a78bfa'}55`, background: type === 'monthly' ? 'rgba(56,189,248,0.1)' : 'rgba(167,139,250,0.1)', color: type === 'monthly' ? '#38bdf8' : '#a78bfa', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
              >
                {generating ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={12} />}
                {generating ? l.generating : `${l.generateNow} (${l[`reportType_${type}`]})`}
              </button>
            ))}
          </div>

          {reports.length === 0
            ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem', padding: '1.5rem 0' }}>{l.noReports}</div>
            : reports.map(r => <ReportCard key={r.id} report={r} lang={lang} onShowSpots={onShowSpots} />)
          }
        </div>
      )}
    </div>
  );
}
