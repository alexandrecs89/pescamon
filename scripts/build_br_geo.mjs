/**
 * build_br_geo.mjs — Fronteiras do Brasil (silhueta nacional + 27 estados)
 *
 * Gera os dados do seletor geográfico hierárquico do app:
 *   - public/br_boundary.json  → silhueta nacional do Brasil (mesmo formato de uy_boundary.json)
 *   - public/br_states.json    → 27 estados como polígonos clicáveis
 *
 * Fonte oficial: IBGE malhas v3 (mesma usada na fronteira do RS).
 *   estados: /api/v3/malhas/paises/BR?intrarregiao=UF&qualidade=intermediaria
 *   país:    /api/v3/malhas/paises/BR?qualidade=intermediaria
 * É um overview (não precisa da precisão fina da hidrografia) → qualidade intermediária + simplify.
 *
 * Uso: node scripts/build_br_geo.mjs
 */
import * as turf from '@turf/turf';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const API = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR';
const FMT = 'formato=application/vnd.geo+json&qualidade=intermediaria';

// código IBGE (codarea) → { uf, name }. RS (43) é o único disponível hoje.
const UF = {
  '11': ['RO', 'Rondônia'], '12': ['AC', 'Acre'], '13': ['AM', 'Amazonas'],
  '14': ['RR', 'Roraima'], '15': ['PA', 'Pará'], '16': ['AP', 'Amapá'],
  '17': ['TO', 'Tocantins'], '21': ['MA', 'Maranhão'], '22': ['PI', 'Piauí'],
  '23': ['CE', 'Ceará'], '24': ['RN', 'Rio Grande do Norte'], '25': ['PB', 'Paraíba'],
  '26': ['PE', 'Pernambuco'], '27': ['AL', 'Alagoas'], '28': ['SE', 'Sergipe'],
  '29': ['BA', 'Bahia'], '31': ['MG', 'Minas Gerais'], '32': ['ES', 'Espírito Santo'],
  '33': ['RJ', 'Rio de Janeiro'], '35': ['SP', 'São Paulo'], '41': ['PR', 'Paraná'],
  '42': ['SC', 'Santa Catarina'], '43': ['RS', 'Rio Grande do Sul'],
  '50': ['MS', 'Mato Grosso do Sul'], '51': ['MT', 'Mato Grosso'],
  '52': ['GO', 'Goiás'], '53': ['DF', 'Distrito Federal'],
};
const AVAILABLE = { '43': 'BR-RS', '42': 'BR-SC', '41': 'BR-PR' }; // codarea → regionId navegável

async function getGeo(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

// MultiPolygon/Polygon → anéis externos em [lat,lon], descartando artefatos minúsculos
function toRings(geometry, { tolerance = 0.01 } = {}) {
  let geom = geometry;
  try { geom = turf.simplify(turf.feature(geometry), { tolerance, highQuality: true }).geometry; } catch {}
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  return polys
    .map((poly) => poly[0])
    .filter((ring) => ring && ring.length >= 6)
    .map((ring) => ring.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)]))
    .sort((a, b) => b.length - a.length);
}

function centroidOf(rings) {
  const big = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
  const c = big.reduce((s, [la, lo]) => [s[0] + la, s[1] + lo], [0, 0]).map((v) => v / big.length);
  return [+c[0].toFixed(5), +c[1].toFixed(5)];
}

function vertexCount(rings) { return rings.reduce((s, r) => s + r.length, 0); }

async function build() {
  // 1) Silhueta nacional
  console.log('Baixando silhueta nacional do Brasil…');
  const nation = await getGeo(`${API}?${FMT}`);
  const natFeat = nation.features?.[0] || nation;
  const natRings = toRings(natFeat.geometry, { tolerance: 0.02 });
  const boundary = {
    type: 'br-boundary',
    source: 'IBGE malhas v3 qualidade=intermediaria paises/BR',
    generatedAt: new Date().toISOString(),
    ringCount: natRings.length,
    vertexCount: vertexCount(natRings),
    rings: natRings,
  };
  writeFileSync(join(PUBLIC, 'br_boundary.json'), JSON.stringify(boundary));
  console.log(`  br_boundary.json: ${boundary.ringCount} anel(is), ${boundary.vertexCount} vértices`);

  // 2) Estados (intrarregiao=UF)
  console.log('Baixando malha dos estados (UF)…');
  const ufGeo = await getGeo(`${API}?${FMT}&intrarregiao=UF`);
  const states = [];
  for (const f of ufGeo.features || []) {
    const code = String(f.properties?.codarea || '').slice(0, 2);
    const meta = UF[code];
    if (!meta) { console.warn(`  ! codarea desconhecida: ${f.properties?.codarea}`); continue; }
    const rings = toRings(f.geometry, { tolerance: 0.01 });
    if (!rings.length) { console.warn(`  ! sem anéis para ${meta[0]}`); continue; }
    states.push({
      uf: meta[0],
      name: meta[1],
      codarea: code,
      regionId: AVAILABLE[code] || `BR-${meta[0]}`,
      available: !!AVAILABLE[code],
      center: centroidOf(rings),
      rings,
    });
  }
  states.sort((a, b) => a.name.localeCompare(b.name, 'pt'));

  const out = { generatedAt: new Date().toISOString(), source: 'IBGE malhas v3 (UF)', count: states.length, states };
  writeFileSync(join(PUBLIC, 'br_states.json'), JSON.stringify(out));
  const totalV = states.reduce((s, st) => s + vertexCount(st.rings), 0);
  const avail = states.filter((s) => s.available).map((s) => `${s.uf}→${s.regionId}`);
  console.log(`  br_states.json: ${states.length} estados, ${totalV} vértices`);
  console.log(`  disponíveis: ${avail.join(', ') || '(nenhum)'}`);
  if (states.length !== 27) console.warn(`  ATENÇÃO: esperados 27 estados, obtidos ${states.length}`);
  console.log('OK');
}

build().catch((e) => { console.error('ERRO', e.message); process.exit(1); });
