/**
 * ingest-dinama — Edge Function agendada
 *
 * Busca dados públicos de qualidade da água das estações automáticas
 * da DINAMA/Ministério do Ambiente do Uruguay e insere na tabela
 * water_quality com source_type = 'official'.
 *
 * Fonte: Observatorio Ambiental Nacional (OAN)
 * URL base: https://www.ambiente.gub.uy/oan/
 *
 * Como agendar (cron-job.org):
 *   URL: https://<project>.supabase.co/functions/v1/ingest-dinama
 *   Header: Authorization: Bearer <CRON_SECRET>
 *   Cron: 0 8 * * *  (diariamente às 08:00 UTC)
 *
 * Secrets necessários no Supabase:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CRON_SECRET  = Deno.env.get('CRON_SECRET') ?? '';

// ── Mapeamento estação DINAMA → curso d'água Pescamon ────────────────────────
// Estações automáticas de monitoramento contínuo disponíveis publicamente.
// Fonte: https://www.ambiente.gub.uy/oan/datos-abiertos/
const STATION_MAP: Record<string, { watercourseId: string; watercourseName: string; lat: number; lon: number }> = {
  // Bacia do Rio Santa Lucía
  'SL_PASO_PACHE':    { watercourseId: '__santa_lucia__',  watercourseName: 'Río Santa Lucía',          lat: -34.194, lon: -56.756 },
  'SL_AGUAS_CORRIENTES': { watercourseId: '__santa_lucia__', watercourseName: 'Río Santa Lucía',        lat: -34.480, lon: -56.523 },
  'SL_SANTA_LUCIA_CHICO': { watercourseId: 'arroyo_santa_lucia_chico', watercourseName: 'Arroyo Santa Lucía Chico', lat: -34.286, lon: -56.390 },
  // Río Negro
  'RN_PASO_DE_LOS_TOROS': { watercourseId: 'rio_negro',   watercourseName: 'Río Negro',                lat: -32.812, lon: -56.503 },
  'RN_RINCÓN_DEL_BONETE':  { watercourseId: 'rio_negro',  watercourseName: 'Río Negro',                lat: -32.621, lon: -56.900 },
  // Río Uruguay
  'RU_PAYSANDU':       { watercourseId: 'rio_uruguay',    watercourseName: 'Río Uruguay',               lat: -32.321, lon: -58.076 },
  'RU_SALTO_GRANDE':   { watercourseId: 'rio_uruguay',    watercourseName: 'Río Uruguay',               lat: -31.279, lon: -57.934 },
  // Laguna del Sauce
  'LS_LAGUNA_SAUCE':   { watercourseId: 'laguna_del_sauce', watercourseName: 'Laguna del Sauce',        lat: -34.743, lon: -55.217 },
  // Laguna de Rocha
  'LR_LAGUNA_ROCHA':   { watercourseId: 'laguna_de_rocha', watercourseName: 'Laguna de Rocha',          lat: -34.302, lon: -53.997 },
  // Lagoa Merín
  'LM_TREINTA_TRES':   { watercourseId: 'lagoa_merin',    watercourseName: 'Lagoa Merín',               lat: -33.234, lon: -54.386 },
};

// ── URLs de dados abertos DINAMA (arquivos TSV/CSV públicos) ─────────────────
// O OAN disponibiliza séries temporais por estação neste formato:
// https://www.ambiente.gub.uy/oan/datos-abiertos/descarga/?estacion=<ID>&variable=<VAR>
// Variáveis disponíveis: oxigenio_disuelto, turbidez, conductividad, temperatura, pH
const OAN_BASE = 'https://www.ambiente.gub.uy/oan/datos-abiertos/descarga/';

// ── Parâmetros de qualidade → score 0–100 ────────────────────────────────────
// Baseado em padrões UNIT/IMTA para uso recreativo e pesca
function scoreFromParameters(params: {
  oxigenio?: number;   // mg/L — ideal ≥7
  turbidez?: number;   // NTU  — ideal ≤10
  pH?: number;         // ideal 6.5–8.5
  conductividade?: number; // µS/cm — ideal ≤500
  temperatura?: number; // °C — informativo
}): { score: number; description: string; indicators: Record<string, number> } {
  let score = 100;
  const issues: string[] = [];
  const indicators: Record<string, number> = {};

  if (params.oxigenio != null) {
    indicators.oxigenio_mg_l = params.oxigenio;
    if (params.oxigenio < 3)       { score -= 40; issues.push('O₂ crítico'); }
    else if (params.oxigenio < 5)  { score -= 20; issues.push('O₂ baixo'); }
    else if (params.oxigenio < 7)  { score -= 8; }
  }

  if (params.turbidez != null) {
    indicators.turbidez_ntu = params.turbidez;
    if (params.turbidez > 100)     { score -= 35; issues.push('Turbidez alta'); }
    else if (params.turbidez > 50) { score -= 18; issues.push('Turbidez elevada'); }
    else if (params.turbidez > 25) { score -= 8; }
  }

  if (params.pH != null) {
    indicators.ph = params.pH;
    if (params.pH < 5.5 || params.pH > 9.5)  { score -= 30; issues.push('pH extremo'); }
    else if (params.pH < 6.5 || params.pH > 8.5) { score -= 10; issues.push('pH fora do ideal'); }
  }

  if (params.conductividade != null) {
    indicators.conductividade_us_cm = params.conductividade;
    if (params.conductividade > 1500) { score -= 25; issues.push('Salinidade alta'); }
    else if (params.conductividade > 800) { score -= 10; }
  }

  if (params.temperatura != null) {
    indicators.temperatura_c = params.temperatura;
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  const description = issues.length === 0
    ? 'Parâmetros dentro dos padrões de qualidade'
    : `Atenção: ${issues.join(', ')}`;

  return { score: finalScore, description, indicators };
}

// ── Fetch de uma estação via OAN ─────────────────────────────────────────────
async function fetchStationData(stationId: string): Promise<{
  oxigenio?: number; turbidez?: number; pH?: number;
  conductividade?: number; temperatura?: number;
  measuredAt?: string;
} | null> {
  const variables = ['oxigenio_disuelto', 'turbidez', 'pH', 'conductividad', 'temperatura'];
  const result: Record<string, number> = {};
  let measuredAt: string | undefined;

  for (const variable of variables) {
    try {
      const url = `${OAN_BASE}?estacion=${stationId}&variable=${variable}&formato=csv&dias=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Pescamon/1.0 (pescamon.com.br; dados@pescamon.com.br)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const text = await res.text();
      const lines = text.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
      if (lines.length < 2) continue;

      // Formato esperado: data;hora;valor ou data,hora,valor
      const sep = lines[0].includes(';') ? ';' : ',';
      const lastLine = lines[lines.length - 1].split(sep);
      if (lastLine.length < 3) continue;

      const val = parseFloat(lastLine[2].replace(',', '.'));
      if (isNaN(val)) continue;

      // Mapeia nome de variável da API → campo local
      const fieldMap: Record<string, string> = {
        oxigenio_disuelto: 'oxigenio',
        turbidez: 'turbidez',
        pH: 'pH',
        conductividad: 'conductividade',
        temperatura: 'temperatura',
      };
      const field = fieldMap[variable];
      if (field) result[field] = val;

      // Extrai timestamp da última linha
      if (!measuredAt && lastLine[0] && lastLine[1]) {
        const [datePart, timePart] = [lastLine[0].trim(), lastLine[1].trim()];
        measuredAt = new Date(`${datePart}T${timePart}:00-03:00`).toISOString();
      }
    } catch {
      // Variável não disponível para esta estação — continua
    }
  }

  if (Object.keys(result).length === 0) return null;
  return { ...result, measuredAt };
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Auth via CRON_SECRET ou Bearer token
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (CRON_SECRET && token !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const results: Record<string, string> = {};
  let upserted = 0;
  let failed = 0;

  for (const [stationId, info] of Object.entries(STATION_MAP)) {
    try {
      const rawData = await fetchStationData(stationId);
      if (!rawData) {
        results[stationId] = 'no_data';
        failed++;
        continue;
      }

      const { score, description, indicators } = scoreFromParameters(rawData);

      // Desativa registros oficiais anteriores para este curso+estação
      await supabase
        .from('water_quality_data')
        .update({ is_current: false })
        .eq('watercourse_id', info.watercourseId)
        .eq('source_type', 'official')
        .eq('source_name', `DINAMA:${stationId}`)
        .eq('is_current', true);

      // Insere novo registro
      const { error } = await supabase.from('water_quality_data').insert({
        watercourse_id:   info.watercourseId,
        watercourse_name: info.watercourseName,
        source_type:      'official',
        source_name:      `DINAMA:${stationId}`,
        quality_score:    score,
        description,
        indicators,
        sample_lat:       info.lat,
        sample_lon:       info.lon,
        measured_at:      rawData.measuredAt ?? new Date().toISOString(),
        is_current:       true,
      });

      if (error) {
        results[stationId] = `error: ${error.message}`;
        failed++;
      } else {
        results[stationId] = `ok (score=${score})`;
        upserted++;
      }
    } catch (e) {
      results[stationId] = `exception: ${(e as Error).message}`;
      failed++;
    }

    // Rate-limit suave entre estações
    await new Promise(r => setTimeout(r, 500));
  }

  const summary = { upserted, failed, stations: Object.keys(STATION_MAP).length, results };
  console.log('[ingest-dinama]', JSON.stringify(summary));

  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
