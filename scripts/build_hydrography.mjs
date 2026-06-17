/**
 * build_hydrography.mjs <UF> — Hidrografia de um estado BR a partir da BHO 2017 (ANA).
 *
 * Unifica os antigos build_<uf>_hydrography.mjs (RS/SC/PR), que compartilhavam ~90% do
 * código. A esteira (ver docs/EXPANSAO-ESTADOS.md): classifica bacia por TRAÇADO DE FLUXO
 * (segue nutrjus até o exutório), recorta à fronteira IBGE (<uf>_boundary.json) e grava
 * 1 trib_<uf>_<bacia>.json por bacia. `order` = nustrahler (tronco = ordem alta).
 *
 * Cada estado tem uma entrada em UF_CONFIG (bbox, bacias+limiar Strahler, classifyTerminal,
 * arquivos, prefixo de id e epsilon de simplificação Douglas-Peucker — 0 = sem simplificar).
 *
 * Modos:
 *   node scripts/build_hydrography.mjs PR --inspect    distribuição de Strahler no bbox
 *   node scripts/build_hydrography.mjs PR --terminals  lista os exutórios reais
 *   node scripts/build_hydrography.mjs PR --dry         classifica e mostra distribuição
 *   node scripts/build_hydrography.mjs PR               build completo
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
const SET_MIN_STRAHLER = 1; // rede de classificação (inclui capilares; null dos lagos fora)

// ── Configuração por estado ───────────────────────────────────────────────────
const UF_CONFIG = {
  RS: {
    country: 'BR-RS', prefix: 'rs', boundary: 'rs_boundary.json', dpEps: 0,
    bbox: { minLon: -57.8, minLat: -34.0, maxLon: -49.4, maxLat: -26.9 },
    basins: { bacia_uruguai: 3, bacia_jacui: 1, bacia_merin: 1, vertente_atlantica: 1 },
    classifyTerminal(name, lat, lon) {
      const n = (name || '').toLowerCase();
      if (/uruguai|paran[áa]|arapey|queguay|cuareim|quara[íi]|ibirapuit|negro/.test(n)) return 'bacia_uruguai';
      if (lon < -54.6) return 'bacia_uruguai';
      if (/gon[çc]alo|mirim|jaguar[ãa]o|chu[íi]|piratini|turussu|arroio grande/.test(n)) return 'bacia_merin';
      if (lat < -31.6 && lon > -54.6 && lon < -52.6) return 'bacia_merin';
      if (/gua[íi]ba|jacu[íi]|taquari|antas|ca[íi]\b|sinos|gravata|vacaca/.test(n)) return 'bacia_jacui';
      if (lon > -51.0 || (lat > -31.3 && lon > -52.3)) return 'vertente_atlantica';
      return lon < -52.0 ? 'bacia_uruguai' : 'vertente_atlantica';
    },
  },
  SC: {
    country: 'BR-SC', prefix: 'sc', boundary: 'sc_boundary.json', dpEps: +(process.env.SC_EPS || 0.00008), round5: true,
    bbox: { minLon: -53.9, minLat: -29.5, maxLon: -48.2, maxLat: -25.9 },
    basins: { bacia_uruguai: +(process.env.SC_URU || 2), vertente_atlantica: +(process.env.SC_ATL || 2) },
    classifyTerminal(name, lat, lon) {
      const n = (name || '').toLowerCase();
      if (/itaja[íi]|tijucas|tubar[ãa]o|arararangu|arangu|itapocu|cubat[ãa]o|mampituba|urussanga|d['´ ]?una|tavares|bigua[çc]u|capivari|imaru[íi]|massiambu|madre|s[ãa]o jo[ãa]o do itaperi/.test(n)) return 'vertente_atlantica';
      if (/uruguai|pelotas|canoas|peixe|chapec|irani|jacutinga|antas|ariranha|timb[óo]|jacut|marombas|cano[íi]nhas|negro|iguaçu|igua[çc]u|capet/.test(n)) return 'bacia_uruguai';
      return lon > -49.7 ? 'vertente_atlantica' : 'bacia_uruguai';
    },
  },
  PR: {
    country: 'BR-PR', prefix: 'pr', boundary: 'pr_boundary.json', dpEps: 0,
    bbox: { minLon: -54.7, minLat: -26.8, maxLon: -47.9, maxLat: -22.4 },
    basins: { bacia_parana: +(process.env.PR_PRN || 4), vertente_atlantica: +(process.env.PR_ATL || 1) },
    classifyTerminal(name, lat, lon) {
      const n = (name || '').toLowerCase();
      if (lon > -48.8) return 'vertente_atlantica';
      if (/ribeira|nhundiaquara|guaraguaçu|cubat[ãa]o|itiber[êe]|antonina|guaratuba|paranagu/.test(n)) return 'vertente_atlantica';
      return 'bacia_parana';
    },
  },
};

// ── CLI ───────────────────────────────────────────────────────────────────────
const UF = (process.argv[2] || '').toUpperCase();
const cfg = UF_CONFIG[UF];
if (!cfg) { console.error(`UF inválida: "${process.argv[2]}". Use uma de: ${Object.keys(UF_CONFIG).join(', ')}`); process.exit(1); }
const BBOX = cfg.bbox;
const INSPECT = process.argv.includes('--inspect');
const TERMINALS = process.argv.includes('--terminals');
const DRY = process.argv.includes('--dry');

// ── Simplificação Douglas-Peucker (epsilon em graus; preserva os extremos) ──────
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

// ── Fronteira / recorte ponto-a-ponto ──────────────────────────────────────────
function loadBoundaryRings() {
  return JSON.parse(readFileSync(join(PUBLIC, cfg.boundary), 'utf8')).rings; // [ [ [lat,lon],... ] ]
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
function makeIsInUF(rings) {
  return (lat, lon) => {
    if (lat < BBOX.minLat || lat > BBOX.maxLat || lon < BBOX.minLon || lon > BBOX.maxLon) return false;
    for (const ring of rings) if (rayCastInRing(lat, lon, ring)) return true;
    return false;
  };
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
  ).all(BBOX.maxLon, BBOX.minLon, BBOX.maxLat, BBOX.minLat);
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
      if (jus === undefined || !inSet.has(jus)) { const m = meta.get(ct); b = cfg.classifyTerminal(m.nm, m.lat, m.lon); break; }
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
    ).all(BBOX.maxLon, BBOX.minLon, BBOX.maxLat, BBOX.minLat);
    const st = {}; for (const r of rows) st[r.st] = (st[r.st] || 0) + 1;
    console.log(`Trechos no bbox ${UF}: ${rows.length}\nStrahler:`, JSON.stringify(st));
    return;
  }

  const net = loadNetwork(db);
  console.log(`Rede Strahler>=${SET_MIN_STRAHLER} no bbox ${UF}: ${net.rows.length} trechos`);

  if (TERMINALS) {
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
  const basins = Object.keys(cfg.basins);
  const fileMap = {}, byBasin = {}, dist = {};
  for (const b of basins) { fileMap[b] = `trib_${cfg.prefix}_${b.replace(/^bacia_/, '')}.json`; byBasin[b] = []; dist[b] = 0; }

  const corners = (r) => [[r.mny, r.mnx], [r.mny, r.mxx], [r.mxy, r.mnx], [r.mxy, r.mxx], [(r.mny + r.mxy) / 2, (r.mnx + r.mxx) / 2]];
  const rings = loadBoundaryRings();
  const isInUF = makeIsInUF(rings);
  const candidates = net.rows.filter(r =>
    r.st >= cfg.basins[basinByCt.get(r.ct)] &&
    corners(r).some(([la, lo]) => isInUF(la, lo))
  );
  for (const r of candidates) dist[basinByCt.get(r.ct)]++;
  console.log(`Candidatos (bbox no ${UF} + limiar por bacia): ${candidates.length}`);
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
    // Recorte: divide cada segmento em sub-trechos contíguos dentro do estado. Estados
    // densos (SC) arredondam a 5 casas (~1 m) e descartam pontos consecutivos idênticos
    // para reduzir o arquivo; RS/PR mantêm os pontos crus.
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    let insidePaths = [];
    for (const seg of segments) {
      let run = [];
      const pushRun = () => { if (run.length >= 2) insidePaths.push(run); run = []; };
      for (const pt of seg) {
        if (isInUF(pt[0], pt[1])) {
          if (cfg.round5) {
            const p = [r5(pt[0]), r5(pt[1])];
            const last = run[run.length - 1];
            if (!last || last[0] !== p[0] || last[1] !== p[1]) run.push(p);
          } else {
            run.push(pt);
          }
        } else { pushRun(); }
      }
      pushRun();
    }
    if (!insidePaths.length) { droppedOutside++; continue; }
    if (cfg.dpEps) insidePaths = insidePaths.map(p => simplifyDP(p, cfg.dpEps));
    const basin = basinByCt.get(r.ct);
    byBasin[basin].push({
      id: `${cfg.prefix}-${r.ct}`,
      name: r.nm || 'Sem nome',
      type: 'river',
      regionId: `${basin}_${cfg.country}`,
      order: r.st || null, // nustrahler (tronco = ordem alta)
      paths: insidePaths,
    });
    kept++;
  }
  console.log(`\nMantidos: ${kept} | totalmente fora do ${UF}: ${droppedOutside}`);
  for (const [basin, rios] of Object.entries(byBasin)) {
    writeFileSync(join(PUBLIC, fileMap[basin]), JSON.stringify(rios));
    console.log(`  ${fileMap[basin]}: ${rios.length} trechos`);
  }
}

const db = openDb();
build(db);
db.close();
