/**
 * build_boundary.mjs <UF> — Fronteira oficial de um estado BR (Fase 1, parametrizado)
 *
 * Baixa a malha estadual do IBGE (qualidade=maxima) e gera public/<uf>_boundary.json:
 *   { rings: [ [ [lat,lon], ... ], ... ] }  (Leaflet [lat,lon])
 * Mantém o continente + ilhas costeiras relevantes; descarta artefatos minúsculos.
 *
 * Substitui os build_<uf>_boundary.mjs específicos (RS/SC). Uso:
 *   node scripts/build_boundary.mjs PR
 *
 * Fonte: https://servicodados.ibge.gov.br/api/v3/malhas/estados/<CODAREA>?formato=application/vnd.geo+json&qualidade=maxima
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Código IBGE (codarea) de cada UF
const UF_CODAREA = {
  RS: 43, SC: 42, PR: 41, SP: 35, RJ: 33, MG: 31, ES: 32, MS: 50, MT: 51, GO: 52,
  BA: 29, SE: 28, AL: 27, PE: 26, PB: 25, RN: 24, CE: 23, PI: 22, MA: 21, PA: 15,
  AP: 16, AM: 13, RR: 14, RO: 11, AC: 12, TO: 17, DF: 53,
};

const uf = (process.argv[2] || '').toUpperCase();
const codarea = UF_CODAREA[uf];
if (!codarea) { console.error(`UF inválida: "${process.argv[2]}". Use uma de: ${Object.keys(UF_CODAREA).join(', ')}`); process.exit(1); }

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const URL = `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${codarea}?formato=application/vnd.geo+json&qualidade=maxima`;

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
  type: `${uf.toLowerCase()}-boundary`,
  source: `IBGE malhas v3 qualidade=maxima codarea=${codarea}`,
  generatedAt: new Date().toISOString(),
  ringCount: rings.length,
  vertexCount,
  rings,
};
const file = `${uf.toLowerCase()}_boundary.json`;
writeFileSync(join(PUBLIC, file), JSON.stringify(out));
console.log(`${file}: ${rings.length} anel(is), ${vertexCount} vértices`);
console.log(`  maior anel: ${rings[0]?.length} vértices`);
