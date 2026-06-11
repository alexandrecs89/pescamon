/**
 * mlInsights.js — Análise de padrões sazonais e recomendação personalizada
 * Sem dependências externas. Funciona com os dados de ocorrências existentes.
 */

const MONTHS_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MONTHS_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SEASONS_PT = ['Verão','Outono','Inverno','Primavera'];
const SEASONS_ES = ['Verano','Otoño','Invierno','Primavera'];
const SEASONS_EN = ['Summer','Autumn','Winter','Spring'];

/** Hemisfério sul: Dez-Fev=Verão, Mar-Mai=Outono, Jun-Ago=Inverno, Set-Nov=Primavera */
function getSeason(month) {
  if (month >= 11 || month <= 1) return 0; // Verão
  if (month >= 2 && month <= 4)  return 1; // Outono
  if (month >= 5 && month <= 7)  return 2; // Inverno
  return 3;                                 // Primavera
}

/**
 * Calcula padrões sazonais por espécie a partir das ocorrências do usuário.
 * @param {Array} occurrences
 * @returns {Array} [{speciesId, speciesName, monthlyCounts, peakMonth, peakSeason, totalCatches}]
 */
export function analyzeSeasonalPatterns(occurrences) {
  if (!occurrences || occurrences.length === 0) return [];

  const bySpecies = {};

  for (const occ of occurrences) {
    const date = new Date(occ.date);
    if (isNaN(date)) continue;
    const month = date.getMonth();
    const id = occ.speciesId;
    if (!id) continue;

    if (!bySpecies[id]) {
      bySpecies[id] = {
        speciesId: id,
        speciesName: occ.speciesName || id,
        monthlyCounts: Array(12).fill(0),
        seasonCounts: Array(4).fill(0),
        totalCatches: 0,
        weights: [],
      };
    }

    bySpecies[id].monthlyCounts[month]++;
    bySpecies[id].seasonCounts[getSeason(month)]++;
    bySpecies[id].totalCatches++;
    if (occ.weightKg > 0) bySpecies[id].weights.push(occ.weightKg);
  }

  return Object.values(bySpecies)
    .filter(s => s.totalCatches >= 2)
    .map(s => {
      const peakMonth = s.monthlyCounts.indexOf(Math.max(...s.monthlyCounts));
      const peakSeason = s.seasonCounts.indexOf(Math.max(...s.seasonCounts));
      const avgWeight = s.weights.length > 0
        ? (s.weights.reduce((a, b) => a + b, 0) / s.weights.length).toFixed(2)
        : null;
      return { ...s, peakMonth, peakSeason, avgWeight: avgWeight ? parseFloat(avgWeight) : null };
    })
    .sort((a, b) => b.totalCatches - a.totalCatches);
}

/**
 * Gera recomendações personalizadas com base no histórico do usuário.
 * @param {Array} occurrences
 * @param {Array} speciesList — lista completa de espécies com preferences
 * @param {Object} currentWeather — { temperature, flow, ... }
 * @returns {Array} [{type, title, body, confidence, speciesId}]
 */
export function generateRecommendations(occurrences, speciesList, currentWeather, lang = 'pt') {
  const recommendations = [];
  if (!occurrences || occurrences.length === 0) return recommendations;

  const MONTHS = lang === 'en' ? MONTHS_EN : lang === 'es' ? MONTHS_ES : MONTHS_PT;

  const T = {
    peak_season: {
      pt: (n) => `Você capturou ${n}x — historicamente sua melhor estação para esta espécie.`,
      es: (n) => `Capturaste ${n}x — históricamente tu mejor estación para esta especie.`,
      en: (n) => `You caught it ${n}x — historically your best season for this species.`,
    },
    best_month: {
      pt: (n, m) => `${n} captura(s) registrada(s) em ${m} nos seus dados.`,
      es: (n, m) => `${n} captura(s) registrada(s) en ${m} en tus datos.`,
      en: (n, m) => `${n} catch(es) recorded in ${m} in your data.`,
    },
    trophy: {
      pt: (w) => `Seu peso médio: ${w} kg — melhor espécie para troféu no seu histórico.`,
      es: (w) => `Tu peso promedio: ${w} kg — mejor especie para trofeo en tu historial.`,
      en: (w) => `Your avg weight: ${w} kg — best trophy species in your history.`,
    },
    weather_match: {
      pt: (cur, ideal) => `Temperatura atual (${cur}°C) próxima da ideal para esta espécie (${ideal}°C).`,
      es: (cur, ideal) => `Temperatura actual (${cur}°C) cercana a la ideal para esta especie (${ideal}°C).`,
      en: (cur, ideal) => `Current temperature (${cur}°C) close to ideal for this species (${ideal}°C).`,
    },
  };
  const body = (type, ...args) => (T[type][lang] || T[type]['pt'])(...args);

  const patterns = analyzeSeasonalPatterns(occurrences);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentSeason = getSeason(currentMonth);

  // 1. Espécie em temporada de pico agora
  for (const p of patterns) {
    if (p.peakSeason === currentSeason && p.totalCatches >= 3) {
      recommendations.push({
        type: 'peak_season',
        icon: '📅',
        title: p.speciesName,
        body: body('peak_season', p.totalCatches),
        confidence: Math.min(95, 60 + p.totalCatches * 3),
        speciesId: p.speciesId,
      });
    }
  }

  // 2. Espécie com melhor taxa de captura no mês atual
  const thisMonthBest = patterns
    .filter(p => p.monthlyCounts[currentMonth] > 0)
    .sort((a, b) => b.monthlyCounts[currentMonth] - a.monthlyCounts[currentMonth])[0];

  if (thisMonthBest) {
    recommendations.push({
      type: 'best_month',
      icon: '🎯',
      title: thisMonthBest.speciesName,
      body: body('best_month', thisMonthBest.monthlyCounts[currentMonth], MONTHS[currentMonth]),
      confidence: Math.min(90, 50 + thisMonthBest.monthlyCounts[currentMonth] * 10),
      speciesId: thisMonthBest.speciesId,
    });
  }

  // 3. Espécie com maior peso médio (para quem busca troféu)
  const trophySpecies = patterns
    .filter(p => p.avgWeight !== null && p.avgWeight >= 1.0)
    .sort((a, b) => b.avgWeight - a.avgWeight)[0];

  if (trophySpecies) {
    recommendations.push({
      type: 'trophy',
      icon: '🏆',
      title: trophySpecies.speciesName,
      body: body('trophy', trophySpecies.avgWeight),
      confidence: Math.min(85, 55 + trophySpecies.totalCatches * 2),
      speciesId: trophySpecies.speciesId,
    });
  }

  // 4. Alerta de oportunidade climática (se weather disponível)
  if (currentWeather && speciesList) {
    for (const p of patterns.slice(0, 5)) {
      const sp = speciesList.find(s => s.id === p.speciesId);
      if (!sp?.preferences) continue;
      const tempDiff = Math.abs((currentWeather.temperature || 18) - sp.preferences.temperature);
      if (tempDiff <= 3) {
        recommendations.push({
          type: 'weather_match',
          icon: '🌡️',
          title: sp.name,
          body: body('weather_match', currentWeather.temperature, sp.preferences.temperature),
          confidence: Math.min(88, 65 + Math.round((3 - tempDiff) * 8)),
          speciesId: p.speciesId,
        });
        break;
      }
    }
  }

  // Remove duplicatas por speciesId (mantém maior confiança)
  const seen = new Set();
  return recommendations
    .filter(r => {
      if (seen.has(r.speciesId + r.type)) return false;
      seen.add(r.speciesId + r.type);
      return true;
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4);
}

/**
 * Detecta meses com anomalia positiva de capturas (melhor que a média histórica).
 * Útil para mostrar "meses quentes" no calendário.
 * @param {Array} occurrences
 * @returns {Array<number>} índices de meses (0-11) com capturas acima da média
 */
export function detectHotMonths(occurrences) {
  if (!occurrences || occurrences.length < 5) return [];
  const counts = Array(12).fill(0);
  for (const occ of occurrences) {
    const m = new Date(occ.date).getMonth();
    if (!isNaN(m)) counts[m]++;
  }
  const avg = counts.reduce((a, b) => a + b, 0) / 12;
  return counts.map((c, i) => (c > avg * 1.3 ? i : -1)).filter(i => i >= 0);
}

export { MONTHS_PT, MONTHS_ES, MONTHS_EN, SEASONS_PT, SEASONS_ES, SEASONS_EN, getSeason };
