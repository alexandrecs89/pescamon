// @public
// Edge Function: Geração automática de relatórios preditivos de pesca
// Chamada por cron externo (cron-job.org):
//   - Mensal: dia 1 de cada mês às 06:00 UTC
//   - Semanal: toda segunda-feira às 06:00 UTC
// Também aceita chamada manual com ?type=monthly|weekly&user_id=<uuid>

const APP_SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const APP_SERVICE_ROLE_KEY = Deno.env.get('APP_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET = Deno.env.get('CRON_SECRET') || '';

// ── Preferências de temperatura por espécie ──────────────────────────────────
const TEMP_PREF: Record<string, number> = {
  tararira: 22, dourado: 20, boga: 19, bagre: 18, pejerrey: 15,
  mojarra: 20, sabalito: 20, 'patí': 19, 'surubí': 21, vieja_agua: 19,
  palometa: 23, armado: 20, corvina: 18, anguilas: 22,
};

// ── Locais conhecidos ─────────────────────────────────────────────────────────
const KNOWN_SPOTS = [
  { name: 'Rio Santa Lucía — Trecho médio', lat: -34.36, lng: -56.40, type: 'Rio' },
  { name: 'Río Negro — Confluência',        lat: -32.87, lng: -57.85, type: 'Rio' },
  { name: 'Laguna del Cisne',               lat: -34.62, lng: -55.87, type: 'Lagoa' },
  { name: 'Río Uruguay — Litoral norte',    lat: -32.42, lng: -58.05, type: 'Rio' },
  { name: 'Arroyo Solís Grande',            lat: -34.41, lng: -55.63, type: 'Arroio' },
  { name: 'Embalse de Salto Grande',        lat: -31.28, lng: -57.93, type: 'Represa' },
  { name: 'Lagoa Merín — Margem UY',        lat: -33.15, lng: -53.48, type: 'Lagoa' },
  { name: 'Río Cebollatí',                  lat: -33.28, lng: -53.93, type: 'Rio' },
];

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Busca previsão Open-Meteo e gera conteúdo do relatório ───────────────────
async function buildReportContent(favorites: any[], settings: any) {
  const lat = settings.home_lat ?? -32.9;
  const lng = settings.home_lng ?? -56.0;
  const radiusKm = settings.radius_km ?? 50;

  let forecast: any[] = [];
  try {
    const params = [
      `latitude=${lat}`, `longitude=${lng}`,
      'daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,surface_pressure_mean,shortwave_radiation_sum',
      'timezone=America/Montevideo', 'forecast_days=7',
    ].join('&');
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (res.ok) {
      const data = await res.json();
      const d = data.daily;
      forecast = d.time.map((date: string, i: number) => ({
        date,
        tempMax: Math.round(d.temperature_2m_max[i]),
        tempMin: Math.round(d.temperature_2m_min[i]),
        rain: Math.round(d.precipitation_sum[i] * 10) / 10,
        wind: Math.round(d.wind_speed_10m_max[i]),
        pressure: d.surface_pressure_mean?.[i] ? Math.round(d.surface_pressure_mean[i]) : null,
        radiation: d.shortwave_radiation_sum?.[i] || 0,
      }));
    }
  } catch (err) {
    console.error('Open-Meteo fetch failed:', err);
  }

  const speciesResults = favorites.map((fav: any) => {
    const optTemp = TEMP_PREF[fav.species_id] ?? 19;
    const dayScores = forecast.map((day: any) => {
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
    return { species_id: fav.species_id, species_name: fav.species_name, bestDays, allDays: dayScores };
  });

  const nearbySpots = KNOWN_SPOTS
    .map(s => ({ ...s, distKm: Math.round(haversineKm(lat, lng, s.lat, s.lng)) }))
    .filter(s => s.distKm <= radiusKm)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, 5);

  const now = new Date();
  const periodLabel = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  return { speciesResults, nearbySpots, forecast, periodLabel, generatedAt: now.toISOString(), radiusKm, homeLat: lat, homeLng: lng };
}

// ── Supabase helper ───────────────────────────────────────────────────────────
async function dbQuery(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${APP_SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: APP_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${APP_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`DB ${method} ${path} → ${res.status}: ${await res.text()}`);
  return method === 'GET' ? res.json() : res;
}

// ── Processa um usuário ───────────────────────────────────────────────────────
async function processUser(userId: string, reportType: 'monthly' | 'weekly') {
  // Busca configurações e favoritos
  const [settingsArr, favorites] = await Promise.all([
    dbQuery(`user_report_settings?user_id=eq.${userId}&select=*`),
    dbQuery(`favorite_species?user_id=eq.${userId}&select=*`),
  ]);

  if (!favorites || favorites.length === 0) {
    console.log(`User ${userId}: no favorites, skipping.`);
    return { skipped: true, reason: 'no_favorites' };
  }

  const settings = settingsArr?.[0] ?? {};

  // Verifica se já gerou hoje (evita duplicatas em re-runs)
  const lastKey = reportType === 'monthly' ? 'last_monthly_at' : 'last_weekly_at';
  if (settings[lastKey]) {
    const lastRun = new Date(settings[lastKey]);
    const diffDays = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24);
    if (reportType === 'monthly' && diffDays < 28) {
      console.log(`User ${userId}: monthly report already generated ${Math.round(diffDays)}d ago, skipping.`);
      return { skipped: true, reason: 'already_generated' };
    }
    if (reportType === 'weekly' && diffDays < 6) {
      console.log(`User ${userId}: weekly report already generated ${Math.round(diffDays)}d ago, skipping.`);
      return { skipped: true, reason: 'already_generated' };
    }
  }

  // Gera conteúdo
  const content = await buildReportContent(favorites, settings);
  const now = new Date();
  const periodLabel = reportType === 'weekly'
    ? `Semana de ${now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
    : content.periodLabel;

  // Insere relatório
  await dbQuery('fishing_reports', 'POST', { user_id: userId, report_type: reportType, period_label: periodLabel, content });

  // Atualiza timestamp
  await dbQuery(
    `user_report_settings?user_id=eq.${userId}`,
    'PATCH',
    { [lastKey]: now.toISOString(), updated_at: now.toISOString() }
  );

  console.log(`User ${userId}: ${reportType} report generated OK.`);
  return { ok: true, userId, reportType };
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Validação do secret para chamadas automáticas de cron
  const authHeader = req.headers.get('authorization') || '';
  const url = new URL(req.url);
  const cronSecret = url.searchParams.get('secret') || authHeader.replace('Bearer ', '');

  if (CRON_SECRET && cronSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // Determina tipo e modo de operação
  const typeParam = url.searchParams.get('type');   // 'monthly' | 'weekly' | null (auto)
  const userIdParam = url.searchParams.get('user_id'); // UUID específico (opcional)

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const dayOfWeek = now.getUTCDay(); // 0=Dom, 1=Seg

  // Decide o tipo se não especificado
  let reportType: 'monthly' | 'weekly' | null = null;
  if (typeParam === 'monthly' || typeParam === 'weekly') {
    reportType = typeParam;
  } else if (dayOfMonth === 1) {
    reportType = 'monthly';
  } else if (dayOfWeek === 1) {
    reportType = 'weekly';
  }

  if (!reportType) {
    return new Response(JSON.stringify({ message: 'No report type scheduled for today.', dayOfMonth, dayOfWeek }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let userIds: string[] = [];

    if (userIdParam) {
      // Modo manual: usuário específico
      userIds = [userIdParam];
    } else {
      // Modo automático: todos os Premium com o tipo habilitado
      const enabledCol = reportType === 'monthly' ? 'monthly_enabled' : 'weekly_enabled';
      const settingsRows = await dbQuery(
        `user_report_settings?${enabledCol}=eq.true&select=user_id`
      );

      // Filtra apenas Premium — busca user_subscriptions ativa
      const activeSubs = await dbQuery(
        `user_subscriptions?status=eq.active&select=user_id`
      );
      const premiumIds = new Set((activeSubs || []).map((s: any) => s.user_id));
      userIds = (settingsRows || [])
        .map((r: any) => r.user_id)
        .filter((id: string) => premiumIds.has(id));
    }

    console.log(`Generating ${reportType} reports for ${userIds.length} users…`);

    const results = await Promise.allSettled(
      userIds.map(uid => processUser(uid, reportType!))
    );

    const summary = {
      type: reportType,
      total: userIds.length,
      ok: results.filter(r => r.status === 'fulfilled' && (r.value as any)?.ok).length,
      skipped: results.filter(r => r.status === 'fulfilled' && (r.value as any)?.skipped).length,
      errors: results.filter(r => r.status === 'rejected').length,
    };

    console.log('Summary:', summary);
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Fatal error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
