/**
 * build_rs_boundary.mjs — Pipeline oficial (Fase 1)
 *
 * Converte a fronteira oficial do RS (IBGE malhas v3, qualidade=maxima, codarea=43)
 * em um arquivo pronto para o app:
 *   - rings em formato Leaflet [lat, lon]
 *   - mantém o polígono principal + ilhas relevantes
 *   - guarda o GeoJSON bruto para filtragem com @turf/turf
 *
 * Fonte: https://servicodados.ibge.gov.br/api/v3/malhas/estados/43?formato=application/vnd.geo+json&qualidade=maxima
 *
 * Uso: node scripts/build_rs_boundary.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '..', 'public');

const RAW = join(PUBLIC, 'rs_boundary_ibge.geojson');
const OUT = join(PUBLIC, 'rs_boundary.json');

const geo = JSON.parse(readFileSync(RAW, 'utf8'));
const feat = geo.features[0];
if (feat.geometry.type !== 'MultiPolygon') {
  throw new Error(`Esperado MultiPolygon, recebido ${feat.geometry.type}`);
}

// MultiPolygon: coordinates = [ [ outerRing, hole1, ... ], [ ... ] ]
// Cada anel é uma lista de [lon, lat]. O app/Leaflet usa [lat, lon].
const polygons = feat.geometry.coordinates;

// Descartar polígonos minúsculos (artefatos < 8 vértices), manter o resto (ilhas costeiras reais).
const rings = polygons
  .map((poly) => poly[0]) // anel externo de cada polígono
  .filter((ring) => ring.length >= 8)
  .map((ring) => ring.map(([lon, lat]) => [lat, lon]));

// Ordenar por nº de vértices (maior = continente primeiro)
rings.sort((a, b) => b.length - a.length);

const out = {
  type: 'rs-boundary',
  source: 'IBGE malhas v3 qualidade=maxima codarea=43',
  generatedAt: new Date().toISOString(),
  ringCount: rings.length,
  vertexCount: rings.reduce((s, r) => s + r.length, 0),
  rings,
};

writeFileSync(OUT, JSON.stringify(out));
console.log(`OK -> ${OUT}`);
console.log(`   ${out.ringCount} anel(is), ${out.vertexCount} vértices`);
rings.forEach((r, i) => console.log(`   anel ${i}: ${r.length} vértices`));
