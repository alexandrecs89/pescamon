/**
 * build_pr_hydrography.mjs — Hidrografia do Paraná (BR-PR) a partir da BHO 2017 (ANA).
 *
 * Mesma esteira do RS/SC (ver docs/EXPANSAO-ESTADOS.md): classifica bacia por
 * TRAÇADO DE FLUXO (segue nutrjus até o exutório), recorta à fronteira IBGE
 * (pr_boundary.json) e grava 1 trib_pr_<bacia>.json por bacia. `order` = nustrahler.
 *
 * Modos:
 *   node scripts/build_pr_hydrography.mjs --inspect    distribuição de Strahler no bbox
 *   node scripts/build_pr_hydrography.mjs --terminals  lista os exutórios reais (p/ classifyTerminal)
 *   node scripts/build_pr_hydrography.mjs --dry         classifica e mostra distribuição (sem geometria)
 *   node scripts/build_pr_hydrography.mjs               build completo
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGpkgGeometry } from './gpkg_geom.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const GPKG = join(ROOT, '.bho_tmp', 'trecho_drenagem.gpkg');
const T = 'geoft_bho_2017_trecho_drenagem';
const GEOM = 'geom';

const INSPECT = process.argv.includes('--inspect');
const TERMINALS = process.argv.includes('--terminals');
const DRY = process.argv.includes('--dry');

const SET_MIN_STRAHLER = 1;
// Limiar de SAÍDA por bacia (densidade × tamanho). Calibrar com --dry.
const BASIN_MIN_STRAHLER = {
  bacia_parana: +(process.env.PR_PRN || 4),     // planalto denso → ≥4 (~67k trechos)
  vertente_atlantica: +(process.env.PR_ATL || 1), // litoral estreito → detalhe máximo
};

const PR_BBOX = { minLon: -54.7, minLat: -26.8, maxLon: -47.9, maxLat: -22.4 };

function loadBoundaryRings() {
  return JSON.parse(readFileSync(join(PUBLIC, 'pr_boundary.json'), 'utf8')).rings;
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
function makeIsInPR(rings) {
  return (lat, lon) => {
    if (lat < PR_BBOX.minLat || lat > PR_BBOX.maxLat || lon < PR_BBOX.minLon || lon > PR_BBOX.maxLon) return false;
    for (const ring of rings) if (rayCastInRing(lat, lon, ring)) return true;
    return false;
  };
}

// ── Classificação do EXUTÓRIO em bacia ────────────────────────────────────────
// 2 bacias (decisão de produto): no PR ~90% drena para um único exutório "Rio Paraná"
// (Iguaçu/Paranapanema/Ivaí/Piquiri todos deságuam nele) → não dá pra sub-dividir por
// fluxo. Split limpo: leste da Serra do Mar (litoral + Ribeira de Iguape) = atlântica;
// todo o resto (drenagem ao Rio Paraná) = bacia_parana.
function classifyTerminal(name, lat, lon) {
  const n = (name || '').toLowerCase();
  if (lon > -48.8) return 'vertente_atlantica'; // leste da Serra do Mar (litoral + Ribeira)
  if (/ribeira|nhundiaquara|guaraguaçu|cubat[ãa]o|itiber[êe]|antonina|guaratuba|paranagu/.test(n)) return 'vertente_atlantica';
  return 'bacia_parana';
}

function openDb() {
  if (!existsSync(GPKG)) { console.error(`Geopackage não encontrado: ${GPKG}`); process.exit(1); }
  return new DatabaseSync(GPKG, { readOnly: true });
}

function loadNetwork(db) {
  const rows = db.prepare(
    `SELECT t.fid fid, t.cotrecho ct, t.nutrjus jus, t.nustrahler st, t.noriocomp nm, t.nuordemcda ord,
            r.minx mnx, r.maxx mxx, r.miny mny, r.maxy mxy
     FROM ${T} t JOIN rtree_${T}_${GEOM} r ON r.id=t.fid
     WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=? AND t.nustrahler>=${SET_MIN_STRAHLER}`
  ).all(PR_BBOX.maxLon, PR_BBOX.minLon, PR_BBOX.maxLat, PR_BBOX.minLat);
  const link = new Map(), meta = new Map(), inSet = new Set();
  for (const r of rows) {
    inSet.add(r.ct); link.set(r.ct, r.jus);
    meta.set(r.ct, { nm: r.nm, lat: (r.mny + r.mxy) / 2, lon: (r.mnx + r.mxx) / 2 });
  }
  return { rows, link, meta, inSet };
}

function terminalOf(ct, link, meta, inSet) {
  let cur = ct, guard = 0;
  while (guard++ < 100000) {
    const jus = link.get(cur);
    if (jus === undefined || !inSet.has(jus)) return cur;
    cur = jus;
  }
  return cur;
}

function classifyNetwork(net) {
  const { rows, link, meta, inSet } = net;
  const memo = new Map();
  function basinOf(start) {
    const path = []; let ct = start, b;
    while (true) {
      if (memo.has(ct)) { b = memo.get(ct); break; }
      path.push(ct);
      const jus = link.get(ct);
      if (jus === undefined || !inSet.has(jus)) { const m = meta.get(ct); b = classifyTerminal(m.nm, m.lat, m.lon); break; }
      ct = jus;
    }
    for (const p of path) memo.set(p, b);
    return b;
  }
  for (const r of rows) basinOf(r.ct);
  return memo;
}

function build(db) {
  if (INSPECT) {
    const rows = db.prepare(
      `SELECT t.nustrahler st FROM ${T} t JOIN rtree_${T}_${GEOM} r ON r.id=t.fid
       WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=?`
    ).all(PR_BBOX.maxLon, PR_BBOX.minLon, PR_BBOX.maxLat, PR_BBOX.minLat);
    const st = {}; for (const r of rows) st[r.st] = (st[r.st] || 0) + 1;
    console.log(`Trechos no bbox PR: ${rows.length}\nStrahler:`, JSON.stringify(st));
    return;
  }

  const net = loadNetwork(db);
  console.log(`Rede Strahler>=${SET_MIN_STRAHLER} no bbox PR: ${net.rows.length} trechos`);

  if (TERMINALS) {
    // agrega trechos por exutório (terminal), p/ desenhar classifyTerminal a partir do dado
    const byTerm = new Map();
    for (const r of net.rows) {
      const tc = terminalOf(r.ct, net.link, net.meta, net.inSet);
      let g = byTerm.get(tc);
      if (!g) { const m = net.meta.get(tc); g = { nm: m.nm, lat: m.lat, lon: m.lon, count: 0, maxSt: 0 }; byTerm.set(tc, g); }
      g.count++; g.maxSt = Math.max(g.maxSt, r.st || 0);
    }
    const top = [...byTerm.values()].sort((a, b) => b.count - a.count).slice(0, 35);
    console.log(`\nExutórios (terminais) — top 35 por nº de trechos que drenam até ele:`);
    for (const t of top) console.log(`  ${String(t.count).padStart(6)}  st=${String(t.maxSt).padStart(2)}  [${t.lat.toFixed(2)},${t.lon.toFixed(2)}]  ${t.nm || '(sem nome)'}`);
    return;
  }

  const basinByCt = classifyNetwork(net);

  const fileMap = {
    bacia_parana: 'trib_pr_parana.json',
    vertente_atlantica: 'trib_pr_vertente_atlantica.json',
  };
  const byBasin = {}, dist = {};
  for (const b of Object.keys(fileMap)) { byBasin[b] = []; dist[b] = 0; }

  const corners = (r) => [[r.mny, r.mnx], [r.mny, r.mxx], [r.mxy, r.mnx], [r.mxy, r.mxx], [(r.mny + r.mxy) / 2, (r.mnx + r.mxx) / 2]];
  const rings = loadBoundaryRings();
  const isInPR = makeIsInPR(rings);
  const candidates = net.rows.filter(r =>
    r.st >= BASIN_MIN_STRAHLER[basinByCt.get(r.ct)] &&
    corners(r).some(([la, lo]) => isInPR(la, lo))
  );
  for (const r of candidates) dist[basinByCt.get(r.ct)]++;
  console.log(`Candidatos (bbox no PR + limiar por bacia): ${candidates.length}`);
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
    const insidePaths = [];
    for (const seg of segments) {
      let run = [];
      for (const pt of seg) {
        if (isInPR(pt[0], pt[1])) run.push(pt);
        else { if (run.length >= 2) insidePaths.push(run); run = []; }
      }
      if (run.length >= 2) insidePaths.push(run);
    }
    if (!insidePaths.length) { droppedOutside++; continue; }
    const basin = basinByCt.get(r.ct);
    byBasin[basin].push({
      id: `pr-${r.ct}`,
      name: r.nm || 'Sem nome',
      type: 'river',
      regionId: `${basin}_BR-PR`,
      order: r.st || null, // nustrahler (tronco = ordem alta)
      paths: insidePaths,
    });
    kept++;
  }
  console.log(`\nMantidos: ${kept} | totalmente fora do PR: ${droppedOutside}`);
  for (const [basin, rios] of Object.entries(byBasin)) {
    writeFileSync(join(PUBLIC, fileMap[basin]), JSON.stringify(rios));
    console.log(`  ${fileMap[basin]}: ${rios.length} trechos`);
  }
}

const db = openDb();
build(db);
db.close();
