/**
 * build_uy_hydrography.mjs — Hidrografia do Uruguai (fonte oficial DINAGUA)
 *
 * Mesma LÓGICA do RS (fonte oficial → recorte/classificação por bacia → render por
 * bacia), adaptada à DINAGUA: a camada de cursos não tem ordem nem jusante, mas a
 * DINAGUA fornece os POLÍGONOS oficiais das cuencas (Nível 1). Então classifica-se
 * cada curso por PONTO-EM-POLÍGONO contra as 6 cuencas — mais simples e autoritativo
 * que o traçado de fluxo. Como a camada já é a rede do Uruguai, usa-se a rede inteira.
 *
 * Entradas (baixadas via WFS, em .uy_tmp/ — ver scripts/_dl_uy_cursos.mjs):
 *   .uy_tmp/cuencas_n1.geojson  (u19600217:c097 — 6 cuencas, props: codcuenca, nombrec1)
 *   .uy_tmp/cursos.geojson      (u19600217:c257 — ~44.574 cursos, props: id, nombre)
 *
 * Saídas: public/trib_uy_<bacia>.json (1 por bacia) + atualiza public/trib_manifest.json (UY)
 *
 * Uso: node scripts/build_uy_hydrography.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const TMP = join(ROOT, '.uy_tmp');

// codcuenca (DINAGUA Nível 1) → bacia do app
const COD_TO_BASIN = {
  1: 'bacia_uruguai',        // Río Uruguay
  2: 'bacia_plata',          // Río de la Plata
  3: 'vertente_atlantica',   // Océano Atlántico
  4: 'bacia_merin',          // Laguna Merín
  5: 'bacia_rio_negro',      // Río Negro
  6: 'bacia_santa_lucia',    // Río Santa Lucía (bacia própria, conforme DINAGUA)
};
const FILE_MAP = {
  bacia_uruguai: 'trib_uy_uruguai.json',
  bacia_plata: 'trib_uy_plata.json',
  vertente_atlantica: 'trib_uy_atlantica.json',
  bacia_merin: 'trib_uy_merin.json',
  bacia_rio_negro: 'trib_uy_negro.json',
  bacia_santa_lucia: 'trib_uy_santa_lucia.json',
};

// ── Ponto-em-polígono (ray casting) com furos e bbox ──────────────────────────
function ringContains(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
// Carrega as cuencas como lista de polígonos { outer, holes, bbox, cod }
function loadCuencas() {
  const geo = JSON.parse(readFileSync(join(TMP, 'cuencas_n1.geojson'), 'utf8'));
  const cuencas = [];
  for (const f of geo.features) {
    const cod = f.properties.codcuenca;
    const g = f.geometry;
    const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    for (const poly of polys) {
      // poly = [ outerRing, hole1, ... ]; cada anel = [ [lon,lat], ... ]
      const rings = poly.map(r => r.map(([lon, lat]) => [lat, lon]));
      const outer = rings[0], holes = rings.slice(1);
      let minLat = 99, maxLat = -99, minLon = 99, maxLon = -99;
      for (const [la, lo] of outer) { if (la < minLat) minLat = la; if (la > maxLat) maxLat = la; if (lo < minLon) minLon = lo; if (lo > maxLon) maxLon = lo; }
      cuencas.push({ cod, outer, holes, bbox: { minLat, maxLat, minLon, maxLon } });
    }
  }
  return cuencas;
}
function makeCuencaOf(cuencas) {
  return (lat, lon) => {
    for (const c of cuencas) {
      const b = c.bbox;
      if (lat < b.minLat || lat > b.maxLat || lon < b.minLon || lon > b.maxLon) continue;
      if (!ringContains(lat, lon, c.outer)) continue;
      let inHole = false;
      for (const h of c.holes) { if (ringContains(lat, lon, h)) { inHole = true; break; } }
      if (!inHole) return c.cod;
    }
    return null;
  };
}

function build() {
  if (!existsSync(join(TMP, 'cursos.geojson'))) {
    console.error('Falta .uy_tmp/cursos.geojson — rode antes: node scripts/_dl_uy_cursos.mjs');
    process.exit(1);
  }
  const cuencas = loadCuencas();
  const cuencaOf = makeCuencaOf(cuencas);
  console.log(`Cuencas carregadas: ${cuencas.length} polígono(s) de ${new Set(cuencas.map(c => c.cod)).size} cuencas`);

  const cursos = JSON.parse(readFileSync(join(TMP, 'cursos.geojson'), 'utf8')).features;
  console.log(`Cursos: ${cursos.length}`);

  const byBasin = {}; for (const b of Object.values(COD_TO_BASIN)) byBasin[b] = [];
  let kept = 0, unclassified = 0;

  for (let k = 0; k < cursos.length; k++) {
    if ((k % 10000) === 0 && k) console.log(`  ...${k}/${cursos.length} (mantidos ${kept})`);
    const f = cursos[k];
    const g = f.geometry;
    if (!g) continue;
    const lines = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
    // paths em [lat,lon]
    const paths = lines.map(line => line.map(([lon, lat]) => [lat, lon])).filter(p => p.length >= 2);
    if (!paths.length) continue;

    // Classificar por um ponto representativo (a camada já é território UY; sem
    // necessidade de recorte fino ponto-a-ponto). Tenta o meio do path mais longo,
    // com fallback para outros pontos se cair fora (sliver de borda).
    const longest = paths.reduce((a, b) => (b.length > a.length ? b : a), paths[0]);
    let cod = null;
    const probes = [longest[Math.floor(longest.length / 2)], longest[0], longest[longest.length - 1]];
    for (const pt of probes) { cod = cuencaOf(pt[0], pt[1]); if (cod) break; }
    if (!cod) {
      // último recurso: varrer todos os pontos
      outer: for (const p of paths) for (const pt of p) { cod = cuencaOf(pt[0], pt[1]); if (cod) break outer; }
    }
    const basin = COD_TO_BASIN[cod];
    if (!basin) { unclassified++; continue; }

    byBasin[basin].push({
      id: `uy-${f.properties.id}`,
      name: f.properties.nombre || 'Sem nombre',
      type: 'river',
      regionId: `${basin}_UY`,
      paths,
    });
    kept++;
  }

  console.log(`\nMantidos: ${kept} | sem classificação (fora das cuencas): ${unclassified}`);
  for (const [basin, rios] of Object.entries(byBasin)) {
    const f = join(PUBLIC, FILE_MAP[basin]);
    writeFileSync(f, JSON.stringify(rios));
    console.log(`  ${FILE_MAP[basin]}: ${rios.length} trechos`);
  }

  // Atualiza o manifest (chave UY)
  const manPath = join(PUBLIC, 'trib_manifest.json');
  const manifest = JSON.parse(readFileSync(manPath, 'utf8'));
  manifest.UY = Object.entries(COD_TO_BASIN).map(([, basin]) => ({
    file: FILE_MAP[basin], regionId: `${basin}_UY`, baseRegionId: basin,
  }));
  // dedup mantendo ordem (codcuenca pode repetir bacia? não, são 1:1)
  writeFileSync(manPath, JSON.stringify(manifest, null, 2));
  console.log('\nManifest UY atualizado para os 6 arquivos trib_uy_*.json');
}

build();
