// @public
// Edge Function: check-fishing-conditions
// Verifica diariamente as condições climáticas e envia push notification
// aos usuários Premium com notificações ativas quando o dia é favorável.
//
// Chamada via cron-job.org: todos os dias às 07:00 UTC
// URL: https://kjgqtvmoujrlhmxlehwz.supabase.co/functions/v1/check-fishing-conditions?secret=CRON_SECRET

const SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('APP_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET  = Deno.env.get('CRON_SECRET') || '';

// ── Avalia condições Open-Meteo ───────────────────────────────────────────────
async function fetchConditions(lat: number, lng: number) {
  const params = [
    `latitude=${lat}`,
    `longitude=${lng}`,
    'current=surface_pressure,wind_speed_10m,precipitation,shortwave_radiation',
    'hourly=surface_pressure',
    'daily=precipitation_sum,wind_speed_10m_max,temperature_2m_max,temperature_2m_min,sunrise,sunset',
    'timezone=America/Montevideo',
    'forecast_days=1',
  ].join('&');

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo error: ${res.status}`);
  const data = await res.json();

  const current = data.current;
  const daily   = data.daily;
  const hourlyP = data.hourly?.surface_pressure || [];
  const curHour = new Date(current.time).getHours();
  const prevP   = hourlyP[Math.max(0, curHour - 1)] || current.surface_pressure;
  const pressureDelta = current.surface_pressure - prevP;

  // Score de condição: 0–100
  let score = 50;

  // Pressão barométrica (faixa ideal 1008–1022 hPa)
  const p = current.surface_pressure;
  if (p >= 1008 && p <= 1022) score += 15;
  else if (p < 1000 || p > 1025) score -= 15;

  // Tendência de pressão (caindo ligeiramente = alimentação intensa)
  if (pressureDelta < -1) score += 10;
  else if (pressureDelta > 2) score -= 8;

  // Chuva (sem chuva = melhor)
  const rain = daily.precipitation_sum?.[0] || 0;
  if (rain === 0) score += 10;
  else if (rain > 8) score -= 20;
  else if (rain > 3) score -= 8;

  // Vento (fraco = melhor)
  const wind = daily.wind_speed_10m_max?.[0] || 0;
  if (wind < 15) score += 8;
  else if (wind > 30) score -= 12;

  // Temperatura (faixa 16–24°C ideal)
  const tMax = daily.temperature_2m_max?.[0] || 20;
  const tMin = daily.temperature_2m_min?.[0] || 14;
  const tAvg = (tMax + tMin) / 2;
  if (tAvg >= 16 && tAvg <= 24) score += 10;
  else if (tAvg < 8 || tAvg > 32) score -= 12;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    pressure: Math.round(p),
    pressureTrend: pressureDelta > 1 ? 'subindo' : pressureDelta < -1 ? 'caindo' : 'estável',
    rain,
    wind: Math.round(wind),
    tMax: Math.round(tMax),
    tMin: Math.round(tMin),
    sunrise: daily.sunrise?.[0]?.slice(11) || '06:00',
    sunset:  daily.sunset?.[0]?.slice(11)  || '18:00',
  };
}

// ── Label de qualidade ────────────────────────────────────────────────────────
function qualityLabel(score: number, lang: string): { title: string; body: string } {
  if (score >= 75) {
    return {
      pt: { title: '🎣 Dia excelente para pescar!', body: `Condições ideais hoje — pressão estável, vento fraco, sem chuva. Aproveite!` },
      es: { title: '🎣 ¡Día excelente para pescar!', body: `Condiciones ideales hoy — presión estable, viento suave, sin lluvia. ¡Aprovecha!` },
      en: { title: '🎣 Excellent day to fish!', body: `Ideal conditions today — stable pressure, light wind, no rain. Go for it!` },
    }[lang] || { title: '🎣 Dia excelente para pescar!', body: 'Condições ideais hoje.' };
  }
  if (score >= 55) {
    return {
      pt: { title: '🐟 Bom dia para pescar', body: `Condições favoráveis. Vale uma saída!` },
      es: { title: '🐟 Buen día para pescar', body: `Condiciones favorables. ¡Vale la pena salir!` },
      en: { title: '🐟 Good day for fishing', body: `Favorable conditions today. Worth a trip!` },
    }[lang] || { title: '🐟 Bom dia para pescar', body: 'Condições favoráveis.' };
  }
  return {
    pt: { title: '🌤️ Condições moderadas', body: `Pescaria possível, mas não é o melhor dia. Verifique a previsão.` },
    es: { title: '🌤️ Condiciones moderadas', body: `Pesca posible, pero no es el mejor día.` },
    en: { title: '🌤️ Moderate conditions', body: `Fishing possible but not ideal today.` },
  }[lang] || { title: '🌤️ Condições moderadas', body: 'Dia moderado para pescar.' };
}

// ── Supabase helper ───────────────────────────────────────────────────────────
async function db(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 404) throw new Error(`DB ${method} ${path} → ${res.status}`);
  return method === 'GET' ? res.json() : res;
}

// ── Enviar push via send-push ─────────────────────────────────────────────────
async function sendPush(userId: string, title: string, message: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_id: userId, title, message, url: '/', tag: 'fishing-conditions' }),
    });
    const json = await res.json().catch(() => ({}));
    return (json as any).sent || 0;
  } catch (e) {
    console.error(`Push to ${userId} failed:`, e);
    return 0;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // Buscar todos os usuários Premium com push ativo
    const [activeSubs, pushSubs, reportSettings] = await Promise.all([
      db('user_subscriptions?status=eq.active&select=user_id'),
      db('push_subscriptions?select=user_id,endpoint'),
      db('user_report_settings?select=user_id,home_lat,home_lng'),
    ]);

    const premiumIds = new Set((activeSubs || []).map((s: any) => s.user_id));
    const pushUserIds = [...new Set((pushSubs || []).map((s: any) => s.user_id))].filter(id => premiumIds.has(id));

    if (pushUserIds.length === 0) {
      return new Response(JSON.stringify({ message: 'No eligible users', sent: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Mapa user_id → coordenadas (usa configurações do relatório ou padrão Uruguai)
    const coordMap = new Map<string, { lat: number; lng: number }>();
    for (const s of (reportSettings || [])) {
      if (s.home_lat && s.home_lng) coordMap.set(s.user_id, { lat: s.home_lat, lng: s.home_lng });
    }

    // Cache de condições por coordenada (evita chamadas duplicadas para mesma região)
    const conditionCache = new Map<string, any>();
    async function getConditions(lat: number, lng: number) {
      const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (!conditionCache.has(key)) conditionCache.set(key, await fetchConditions(lat, lng));
      return conditionCache.get(key);
    }

    let totalSent = 0;
    const threshold = Number(url.searchParams.get('threshold') || 55);

    const results = await Promise.allSettled(pushUserIds.map(async (userId) => {
      const coord = coordMap.get(userId) || { lat: -32.9, lng: -56.0 };
      const cond = await getConditions(coord.lat, coord.lng);

      if (cond.score < threshold) {
        console.log(`User ${userId}: score ${cond.score} below threshold ${threshold}, skip.`);
        return { skipped: true };
      }

      // Lang: tenta buscar preferência (fallback pt)
      const lang = 'pt';
      const label = qualityLabel(cond.score, lang);
      const body = `${label.body} (${cond.tMin}–${cond.tMax}°C · ${cond.pressure}hPa · vento ${cond.wind}km/h)`;

      const sent = await sendPush(userId, label.title, body);
      totalSent += sent;
      return { sent };
    }));

    const summary = {
      eligible: pushUserIds.length,
      sent: totalSent,
      skipped: results.filter(r => r.status === 'fulfilled' && (r.value as any)?.skipped).length,
      errors: results.filter(r => r.status === 'rejected').length,
    };

    console.log('check-fishing-conditions summary:', summary);
    return new Response(JSON.stringify(summary), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('Fatal:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
