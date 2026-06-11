/**
 * build_rs_hydrography.mjs — Pipeline oficial (Fase 2)
 *
 * Extrai a hidrografia do RS a partir da BHO 2017 da ANA (geopackage nacional),
 * filtra por ordem de Strahler (>=3), classifica por bacia via TRAÇADO DE FLUXO
 * (segue nutrjus até o exutório e herda a bacia do exutório) e recorta cada
 * trecho pela fronteira oficial do RS (IBGE). Gera trib_rs_*.json.
 *
 * Por que traçado de fluxo e não prefixo COBACIA: a região Pfafstetter 8 cobre
 * Uruguai E Patos/Jacuí/Mirim juntos; o divisor está em profundidade variável do
 * código. Seguir o fluxo até o mar/exutório é exato.
 *
 * Fonte: geoft_bho_2017_trecho_drenagem.gpkg (ANA/SNIRH) em .bho_tmp/
 * Sem GDAL: usa node:sqlite + parser GPB/WKB próprio (gpkg_geom.mjs).
 *
 * Uso:
 *   node scripts/build_rs_hydrography.mjs --inspect   # diagnóstico (schema + COBACIA)
 *   node scripts/build_rs_hydrography.mjs --dry        # classifica e mostra distribuição (sem geometria)
 *   node scripts/build_rs_hydrography.mjs              # gera os arquivos
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGpkgGeometry } from './gpkg_geom.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const GPKG = join(ROOT, '.bho_tmp', 'trecho_drenagem.gpkg');
const T = 'geoft_bho_2017_trecho_drenagem';
const GEOM = 'geom';

const INSPECT = process.argv.includes('--inspect');
const DRY = process.argv.includes('--dry');

// Rede usada para CLASSIFICAR por bacia (traçado de fluxo). Inclui córregos pequenos
// (Strahler>=1) para que a classificação seja completa e o detalhamento por bacia seja rico.
const SET_MIN_STRAHLER = 1;

// Limiar de SAÍDA por bacia. A bacia do Uruguai já fica densa em >=3 (planalto basáltico,
// muitíssimos trechos); as demais bacias têm a capilaridade em trechos menores e por isso
// são detalhadas a partir de >=1, ficando tão ricas quanto a do Uruguai.
const BASIN_MIN_STRAHLER = {
  bacia_uruguai: 3,
  bacia_jacui: 1,
  bacia_merin: 1,
  vertente_atlantica: 1,
};

// Bbox generoso do RS (filtro rápido via R-tree; recorte fino vem do polígono IBGE)
const RS_BBOX = { minLon: -57.8, minLat: -34.0, maxLon: -49.4, maxLat: -26.9 };

// ── Fronteira oficial IBGE (recorte fino ponto-a-ponto) ───────────────────────
function loadBoundaryRings() {
  return JSON.parse(readFileSync(join(PUBLIC, 'rs_boundary.json'), 'utf8')).rings; // [ [ [lat,lon],... ] ]
}
function rayCastInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i][0], xi = ring[i][1];
    const yj = ring[j][0], xj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}
function makeIsInRS(rings) {
  return (lat, lon) => {
    if (lat < RS_BBOX.minLat || lat > RS_BBOX.maxLat || lon < RS_BBOX.minLon || lon > RS_BBOX.maxLon) return false;
    for (const ring of rings) if (rayCastInRing(lat, lon, ring)) return true;
    return false;
  };
}

// ── Classificação do EXUTÓRIO em bacia (nome + posição do terminal) ────────────
function classifyTerminal(name, lat, lon) {
  const n = (name || '').toLowerCase();
  // Bacia do Uruguai (sistema do Prata, vertente oeste)
  if (/uruguai|paran[áa]|arapey|queguay|cuareim|quara[íi]|ibirapuit|negro/.test(n)) return 'bacia_uruguai';
  if (lon < -54.6) return 'bacia_uruguai';
  // Bacia Mirim–São Gonçalo (sudeste)
  if (/gon[çc]alo|mirim|jaguar[ãa]o|chu[íi]|piratini|turussu|arroio grande/.test(n)) return 'bacia_merin';
  if (lat < -31.6 && lon > -54.6 && lon < -52.6) return 'bacia_merin';
  // Bacia do Guaíba / Jacuí (centro)
  if (/gua[íi]ba|jacu[íi]|taquari|antas|ca[íi]\b|sinos|gravata|vacaca/.test(n)) return 'bacia_jacui';
  // Vertente atlântica direta (Patos/lagoas costeiras): faixa leste
  if (lon > -51.0 || (lat > -31.3 && lon > -52.3)) return 'vertente_atlantica';
  // Borda norte/SC e indefinidos: por longitude (oeste=Uruguai, leste=atlântica)
  return lon < -52.0 ? 'bacia_uruguai' : 'vertente_atlantica';
}

function openDb() {
  if (!existsSync(GPKG)) { console.error(`Geopackage não encontrado: ${GPKG}`); process.exit(1); }
  return new DatabaseSync(GPKG, { readOnly: true });
}

function inspect(db) {
  const total = db.prepare(`SELECT COUNT(*) n FROM ${T}`).get().n;
  console.log(`Total de trechos (nacional): ${total}`);
  const rows = db.prepare(
    `SELECT t.cobacia cb, t.nustrahler st FROM ${T} t JOIN rtree_${T}_${GEOM} r ON r.id=t.fid
     WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=?`
  ).all(RS_BBOX.maxLon, RS_BBOX.minLon, RS_BBOX.maxLat, RS_BBOX.minLat);
  console.log(`Trechos no bbox RS: ${rows.length}`);
  const st = {};
  for (const r of rows) st[r.st] = (st[r.st] || 0) + 1;
  console.log('Strahler:', JSON.stringify(st));
}

// Carrega rede strahler>=3 no bbox e classifica cada trecho por bacia (traçado de fluxo)
function classifyNetwork(db) {
  const rows = db.prepare(
    `SELECT t.fid fid, t.cotrecho ct, t.nutrjus jus, t.nustrahler st, t.noriocomp nm, t.nuordemcda ord,
            r.minx mnx, r.maxx mxx, r.miny mny, r.maxy mxy
     FROM ${T} t JOIN rtree_${T}_${GEOM} r ON r.id=t.fid
     WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=? AND t.nustrahler>=${SET_MIN_STRAHLER}`
  ).all(RS_BBOX.maxLon, RS_BBOX.minLon, RS_BBOX.maxLat, RS_BBOX.minLat);

  const link = new Map();   // ct -> jus
  const meta = new Map();   // ct -> {nm, lat, lon}
  const inSet = new Set();
  for (const r of rows) {
    inSet.add(r.ct);
    link.set(r.ct, r.jus);
    meta.set(r.ct, { nm: r.nm, lat: (r.mny + r.mxy) / 2, lon: (r.mnx + r.mxx) / 2 });
  }

  const memo = new Map();
  function basinOf(start) {
    const path = [];
    let ct = start, b;
    while (true) {
      if (memo.has(ct)) { b = memo.get(ct); break; }
      path.push(ct);
      const jus = link.get(ct);
      if (jus === undefined || !inSet.has(jus)) {       // ct é terminal
        const m = meta.get(ct);
        b = classifyTerminal(m.nm, m.lat, m.lon);
        break;
      }
      ct = jus;
    }
    for (const p of path) memo.set(p, b);
    return b;
  }
  for (const r of rows) basinOf(r.ct);
  return { rows, basinByCt: memo };
}

function build(db) {
  const rings = loadBoundaryRings();
  const isInRS = makeIsInRS(rings);
  const { rows, basinByCt } = classifyNetwork(db);
  console.log(`Rede Strahler>=${SET_MIN_STRAHLER} no bbox: ${rows.length} trechos`);

  const fileMap = {
    bacia_uruguai: 'trib_rs_uruguai.json',
    bacia_jacui: 'trib_rs_jacui.json',
    bacia_merin: 'trib_rs_merin.json',
    vertente_atlantica: 'trib_rs_vertente_atlantica.json',
  };
  const byBasin = { bacia_uruguai: [], bacia_jacui: [], bacia_merin: [], vertente_atlantica: [] };
  const dist = { bacia_uruguai: 0, bacia_jacui: 0, bacia_merin: 0, vertente_atlantica: 0 };

  // Pré-seleção: bbox toca o RS E o trecho atinge o limiar Strahler da SUA bacia
  // (Uruguai denso em >=3; demais bacias detalhadas em >=1).
  const corners = (r) => [[r.mny, r.mnx], [r.mny, r.mxx], [r.mxy, r.mnx], [r.mxy, r.mxx], [(r.mny + r.mxy) / 2, (r.mnx + r.mxx) / 2]];
  const candidates = rows.filter(r =>
    r.st >= BASIN_MIN_STRAHLER[basinByCt.get(r.ct)] &&
    corners(r).some(([la, lo]) => isInRS(la, lo))
  );
  console.log(`Candidatos (bbox no RS + limiar por bacia): ${candidates.length}`);

  // Distribuição por bacia (entre candidatos) — útil no --dry
  for (const r of candidates) dist[basinByCt.get(r.ct)]++;
  console.log('Distribuição por bacia (candidatos):', JSON.stringify(dist));

  if (DRY) { console.log('[--dry] sem geometria. Encerrando.'); return; }

  const stmt = db.prepare(`SELECT ${GEOM} AS g FROM ${T} WHERE fid=?`);
  let kept = 0, droppedOutside = 0, processed = 0;
  for (const r of candidates) {
    if ((++processed % 5000) === 0) console.log(`  ...processados ${processed}/${candidates.length} (mantidos ${kept})`);
    const row = stmt.get(r.fid);
    if (!row?.g) continue;
    const segments = parseGpkgGeometry(Buffer.from(row.g));
    if (!segments?.length) continue;

    // Recorte: dividir cada segmento em sub-trechos contíguos dentro do RS
    const insidePaths = [];
    for (const seg of segments) {
      let run = [];
      for (const pt of seg) {
        if (isInRS(pt[0], pt[1])) { run.push(pt); }
        else { if (run.length >= 2) insidePaths.push(run); run = []; }
      }
      if (run.length >= 2) insidePaths.push(run);
    }
    if (!insidePaths.length) { droppedOutside++; continue; }

    const basin = basinByCt.get(r.ct);
    byBasin[basin].push({
      id: `rs-${r.ct}`,
      name: r.nm || 'Sem nome',
      type: 'river',
      regionId: `${basin}_BR-RS`,
      order: r.ord || null,
      paths: insidePaths,
    });
    kept++;
  }

  console.log(`\nMantidos: ${kept} | totalmente fora do RS: ${droppedOutside}`);
  for (const [basin, rios] of Object.entries(byBasin)) {
    const f = join(PUBLIC, fileMap[basin]);
    writeFileSync(f, JSON.stringify(rios));
    console.log(`  ${fileMap[basin]}: ${rios.length} trechos`);
  }
}

const db = openDb();
try {
  if (INSPECT) inspect(db);
  else build(db); // --dry é tratado dentro de build()
} finally {
  db.close();
}
