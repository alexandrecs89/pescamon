/**
 * build_sc_boundary.mjs — Fronteira oficial de Santa Catarina (Fase 1)
 *
 * Baixa a malha estadual do IBGE (codarea 42, qualidade=maxima) e gera
 * public/sc_boundary.json no mesmo formato de rs_boundary.json:
 *   { rings: [ [ [lat,lon], ... ], ... ] }  (Leaflet [lat,lon])
 * Mantém o continente + ilhas costeiras relevantes; descarta artefatos minúsculos.
 *
 * Fonte: https://servicodados.ibge.gov.br/api/v3/malhas/estados/42?formato=application/vnd.geo+json&qualidade=maxima
 * Uso: node scripts/build_sc_boundary.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados/42?formato=application/vnd.geo+json&qualidade=maxima';

const res = await fetch(URL, { headers: { Accept: 'application/json' } });
if (!res.ok) { console.error(`HTTP ${res.status}`); process.exit(1); }
const geo = await res.json();
const feat = geo.features?.[0] || geo;
const g = feat.geometry;
const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];

// anel externo de cada polígono; [lon,lat] -> [lat,lon]; descarta < 8 vértices
const rings = polys
  .map((poly) => poly[0])
  .filter((ring) => ring.length >= 8)
  .map((ring) => ring.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)]))
  .sort((a, b) => b.length - a.length);

const vertexCount = rings.reduce((s, r) => s + r.length, 0);
const out = {
  type: 'sc-boundary',
  source: 'IBGE malhas v3 qualidade=maxima codarea=42',
  generatedAt: new Date().toISOString(),
  ringCount: rings.length,
  vertexCount,
  rings,
};
writeFileSync(join(PUBLIC, 'sc_boundary.json'), JSON.stringify(out));
console.log(`sc_boundary.json: ${rings.length} anel(is), ${vertexCount} vértices`);
console.log(`  maior anel: ${rings[0]?.length} vértices`);
