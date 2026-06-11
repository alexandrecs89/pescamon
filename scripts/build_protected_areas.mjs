/**
 * build_protected_areas.mjs — Áreas de preservação (Unidades de Conservação)
 *
 * Converte os GeoJSON oficiais baixados em .uc_tmp/ no formato do app
 * (public/protected_areas_<uf>.json), carregado por país/região — mesmo padrão
 * escalável da hidrografia. Para novas regiões: baixar o geojson oficial + rodar.
 *
 * Fonte RS (federais): ICMBio via INDE (WFS `ICMBio:limiteucsfederais_a`),
 *   filtrado por `ufabrang LIKE '%RS%'`. Estaduais: SEMA-RS (a acrescentar).
 *
 * Saída por área: { id, name, category(sigla), group(PI|US), esfera, authority,
 *   areaHa, center:[lat,lon], rings: [ [ [lat,lon], ... ], ... ] }
 *
 * Uso: node scripts/build_protected_areas.mjs
 */
import * as turf from '@turf/turf';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = join(ROOT, '.uc_tmp');

function slug(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 48);
}

// Converte uma feição UC (MultiPolygon, [lon,lat]) → objeto do app
function convertFeature(f) {
  const p = f.properties;
  let geom = f.geometry;
  // Simplificar geometrias densas (cânions etc.) — tolerância ~200 m
  try { geom = turf.simplify(turf.feature(geom), { tolerance: 0.002, highQuality: true }).geometry; } catch {}
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
  // anel externo de cada polígono, em [lat,lon]
  const rings = polys
    .map(poly => poly[0])
    .filter(r => r && r.length >= 4)
    .map(r => r.map(([lon, lat]) => [lat, lon]));
  if (!rings.length) return null;
  // centro = centroide do maior anel
  const big = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
  const c = big.reduce((s, [la, lo]) => [s[0] + la, s[1] + lo], [0, 0]).map(v => v / big.length);
  return {
    id: 'uc-fed-' + slug(p.nomeuc),
    name: p.nomeuc.replace(/\s+/g, ' ').trim(),
    category: p.siglacateg || 'UC',
    group: p.grupouc || null,            // PI = Proteção Integral, US = Uso Sustentável
    esfera: p.esferaadm || 'Federal',
    authority: p.criacaoato || null,
    areaHa: p.areahaalb ? Math.round(p.areahaalb) : null,
    ufabrang: p.ufabrang || null,
    center: [+c[0].toFixed(5), +c[1].toFixed(5)],
    rings,
  };
}

function build() {
  const out = [];
  const fedPath = join(TMP, 'uc_federais_rs.geojson');
  if (existsSync(fedPath)) {
    const fc = JSON.parse(readFileSync(fedPath, 'utf8'));
    for (const f of fc.features) { const o = convertFeature(f); if (o) out.push(o); }
    console.log(`Federais (ICMBio): ${fc.features.length} → ${out.length} áreas`);
  }
  // (estaduais SEMA-RS: acrescentar aqui quando disponíveis)

  const vert = out.reduce((s, a) => s + a.rings.reduce((t, r) => t + r.length, 0), 0);
  const f = join(ROOT, 'public', 'protected_areas_rs.json');
  writeFileSync(f, JSON.stringify(out));
  console.log(`OK -> public/protected_areas_rs.json | ${out.length} áreas, ${vert} vértices`);
  out.forEach(a => console.log(`   [${a.category}/${a.group}] ${a.name} — ${a.areaHa} ha`));
}

build();
