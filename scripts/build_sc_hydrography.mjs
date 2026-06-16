/**
 * build_sc_hydrography.mjs — Pipeline oficial (Fase 2) para Santa Catarina
 *
 * Mesmo método do RS (ver build_rs_hydrography.mjs e docs/EXPANSAO-ESTADOS.md):
 * BHO 2017 da ANA → classifica bacia por TRAÇADO DE FLUXO (segue nutrjus até o
 * exutório) → recorta pela fronteira oficial do IBGE → trib_sc_*.json.
 *
 * SC drena em dois grandes sistemas separados pela Serra Geral:
 *   - bacia_uruguai      (interior/oeste): Pelotas, Canoas, Peixe, Chapecó, Irani… → Rio Uruguai
 *   - vertente_atlantica (leste): Itajaí, Tijucas, Tubarão, Araranguá, Itapocu… → Atlântico
 *
 * Uso:
 *   node scripts/build_sc_hydrography.mjs --inspect
 *   node scripts/build_sc_hydrography.mjs --dry
 *   node scripts/build_sc_hydrography.mjs
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

const SET_MIN_STRAHLER = 1; // rede de classificação (inclui capilares)
// Limiar de SAÍDA por bacia (calibrar com --dry; ajustável por env SC_URU/SC_ATL).
// SC é muito densa na vertente atlântica (Serra do Mar) → limiar mais alto que no RS
// para manter o total na casa das dezenas de milhares (teto de render).
// Render por multi-polyline (uma por bacia) suporta redes muito densas, então usamos
// Strahler>=2 nas duas bacias para incluir os rios menores (~168k trechos).
const BASIN_MIN_STRAHLER = {
  bacia_uruguai: +(process.env.SC_URU || 2),
  vertente_atlantica: +(process.env.SC_ATL || 2),
};

// Bbox generoso de SC (filtro rápido R-tree; recorte fino vem do polígono IBGE)
const SC_BBOX = { minLon: -53.9, minLat: -29.5, maxLon: -48.2, maxLat: -25.9 };

// Simplificação Douglas-Peucker (epsilon em graus ~ 0.00008 ≈ 9 m). Reduz vértices
// de rios longos sem perda visível no zoom do app; mantém os extremos.
const DP_EPS = +(process.env.SC_EPS || 0.00008);
function simplifyDP(pts, eps) {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    let d;
    if (len2 === 0) { d = Math.hypot(px - ax, py - ay); }
    else {
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const left = simplifyDP(pts.slice(0, idx + 1), eps);
    const right = simplifyDP(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
  }
  return [pts[0], pts[pts.length - 1]];
}

function loadBoundaryRings() {
  return JSON.parse(readFileSync(join(PUBLIC, 'sc_boundary.json'), 'utf8')).rings;
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
function makeIsInSC(rings) {
  return (lat, lon) => {
    if (lat < SC_BBOX.minLat || lat > SC_BBOX.maxLat || lon < SC_BBOX.minLon || lon > SC_BBOX.maxLon) return false;
    for (const ring of rings) if (rayCastInRing(lat, lon, ring)) return true;
    return false;
  };
}

// ── Classificação do EXUTÓRIO em bacia (nome + posição do terminal) ────────────
function classifyTerminal(name, lat, lon) {
  const n = (name || '').toLowerCase();
  // Vertente atlântica (leste): rios que desembocam direto no Atlântico
  if (/itaja[íi]|tijucas|tubar[ãa]o|arararangu|arangu|itapocu|cubat[ãa]o|mampituba|urussanga|d['´ ]?una|tavares|bigua[çc]u|capivari|imaru[íi]|massiambu|madre|s[ãa]o jo[ãa]o do itaperi/.test(n)) return 'vertente_atlantica';
  // Bacia do Uruguai (interior/oeste): Uruguai e seus formadores/afluentes
  if (/uruguai|pelotas|canoas|peixe|chapec|irani|jacutinga|antas|ariranha|timb[óo]|jacut|marombas|cano[íi]nhas|negro|iguaçu|igua[çc]u|capet/.test(n)) return 'bacia_uruguai';
  // Fallback por posição: a costa atlântica de SC fica a leste; terminais de rios
  // costeiros desembocam perto do mar. Oeste do divisor = Uruguai.
  return lon > -49.7 ? 'vertente_atlantica' : 'bacia_uruguai';
}

function openDb() {
  if (!existsSync(GPKG)) { console.error(`Geopackage não encontrado: ${GPKG}`); process.exit(1); }
  return new DatabaseSync(GPKG, { readOnly: true });
}

function inspect(db) {
  const rows = db.prepare(
    `SELECT t.nustrahler st FROM ${T} t JOIN rtree_${T}_${GEOM} r ON r.id=t.fid
     WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=?`
  ).all(SC_BBOX.maxLon, SC_BBOX.minLon, SC_BBOX.maxLat, SC_BBOX.minLat);
  console.log(`Trechos no bbox SC: ${rows.length}`);
  const st = {};
  for (const r of rows) st[r.st] = (st[r.st] || 0) + 1;
  console.log('Strahler:', JSON.stringify(st));
}

function classifyNetwork(db) {
  const rows = db.prepare(
    `SELECT t.fid fid, t.cotrecho ct, t.nutrjus jus, t.nustrahler st, t.noriocomp nm, t.nuordemcda ord,
            r.minx mnx, r.maxx mxx, r.miny mny, r.maxy mxy
     FROM ${T} t JOIN rtree_${T}_${GEOM} r ON r.id=t.fid
     WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=? AND t.nustrahler>=${SET_MIN_STRAHLER}`
  ).all(SC_BBOX.maxLon, SC_BBOX.minLon, SC_BBOX.maxLat, SC_BBOX.minLat);

  const link = new Map(), meta = new Map(), inSet = new Set();
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
      if (jus === undefined || !inSet.has(jus)) {
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
  const isInSC = makeIsInSC(rings);
  const { rows, basinByCt } = classifyNetwork(db);
  console.log(`Rede Strahler>=${SET_MIN_STRAHLER} no bbox: ${rows.length} trechos`);

  const fileMap = {
    bacia_uruguai: 'trib_sc_uruguai.json',
    vertente_atlantica: 'trib_sc_vertente_atlantica.json',
  };
  const byBasin = { bacia_uruguai: [], vertente_atlantica: [] };
  const dist = { bacia_uruguai: 0, vertente_atlantica: 0 };

  const corners = (r) => [[r.mny, r.mnx], [r.mny, r.mxx], [r.mxy, r.mnx], [r.mxy, r.mxx], [(r.mny + r.mxy) / 2, (r.mnx + r.mxx) / 2]];
  const candidates = rows.filter(r =>
    r.st >= BASIN_MIN_STRAHLER[basinByCt.get(r.ct)] &&
    corners(r).some(([la, lo]) => isInSC(la, lo))
  );
  console.log(`Candidatos (bbox no SC + limiar por bacia): ${candidates.length}`);
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

    // Recorte + arredondamento a 5 casas (~1 m) para reduzir o tamanho do arquivo
    // sem perda visual perceptível. Descarta pontos consecutivos idênticos pós-arredondamento.
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    const insidePaths = [];
    for (const seg of segments) {
      let run = [];
      const pushRun = () => { if (run.length >= 2) insidePaths.push(run); run = []; };
      for (const pt of seg) {
        if (isInSC(pt[0], pt[1])) {
          const p = [r5(pt[0]), r5(pt[1])];
          const last = run[run.length - 1];
          if (!last || last[0] !== p[0] || last[1] !== p[1]) run.push(p);
        } else { pushRun(); }
      }
      pushRun();
    }
    if (!insidePaths.length) { droppedOutside++; continue; }
    // Simplifica cada sub-trecho (Douglas-Peucker) preservando os extremos.
    for (let i = 0; i < insidePaths.length; i++) insidePaths[i] = simplifyDP(insidePaths[i], DP_EPS);

    const basin = basinByCt.get(r.ct);
    byBasin[basin].push({
      id: `sc-${r.ct}`,
      name: r.nm || 'Sem nome',
      type: 'river',
      regionId: `${basin}_BR-SC`,
      // Ordem de STRAHLER (tronco = ordem alta). Antes gravava nuordemcda (invertido).
      order: r.st || null,
      paths: insidePaths,
    });
    kept++;
  }

  console.log(`\nMantidos: ${kept} | totalmente fora do SC: ${droppedOutside}`);
  for (const [basin, rios] of Object.entries(byBasin)) {
    const f = join(PUBLIC, fileMap[basin]);
    writeFileSync(f, JSON.stringify(rios));
    console.log(`  ${fileMap[basin]}: ${rios.length} trechos`);
  }
}

const db = openDb();
try {
  if (INSPECT) inspect(db);
  else build(db);
} finally {
  db.close();
}
