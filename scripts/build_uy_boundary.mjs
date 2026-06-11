/**
 * build_uy_boundary.mjs — Contorno nacional do Uruguai
 *
 * Une (dissolve) as 6 cuencas Nível 1 da DINAGUA num único polígono = território
 * nacional, e grava no formato do app (rings em [lat,lon]), igual ao rs_boundary.json.
 *
 * Entrada: .uy_tmp/cuencas_n1.geojson   Saída: public/uy_boundary.json
 * Uso: node scripts/build_uy_boundary.mjs
 */
import * as turf from '@turf/turf';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const geo = JSON.parse(readFileSync(join(ROOT, '.uy_tmp', 'cuencas_n1.geojson'), 'utf8'));
const polys = geo.features.map(f => turf.feature(f.geometry));

let merged;
try {
  merged = turf.union(turf.featureCollection(polys)); // turf v7
} catch {
  merged = polys.reduce((acc, p) => (acc ? turf.union(acc, p) : p)); // turf v6 (pairwise)
}

// Simplificar (o contorno bruto tem ~37k vértices; ~2-3k basta para o desenho)
try { merged = turf.simplify(merged, { tolerance: 0.004, highQuality: true, mutate: true }); } catch (e) { console.warn('simplify falhou:', e.message); }

const g = merged.geometry;
const polygons = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
// anel externo de cada polígono, descartando artefatos minúsculos, em [lat,lon]
const rings = polygons
  .map(poly => poly[0])
  .filter(r => r.length >= 8)
  .map(r => r.map(([lon, lat]) => [lat, lon]));
rings.sort((a, b) => b.length - a.length);

const out = {
  type: 'uy-boundary',
  source: 'DINAGUA — união das cuencas hidrográficas Nível 1 (c097)',
  generatedAt: new Date().toISOString(),
  ringCount: rings.length,
  vertexCount: rings.reduce((s, r) => s + r.length, 0),
  rings,
};
writeFileSync(join(ROOT, 'public', 'uy_boundary.json'), JSON.stringify(out));
console.log(`OK -> public/uy_boundary.json | ${out.ringCount} anel(is), ${out.vertexCount} vértices`);
rings.forEach((r, i) => console.log(`   anel ${i}: ${r.length} vértices`));
