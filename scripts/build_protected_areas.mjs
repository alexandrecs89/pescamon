/**
 * build_protected_areas.mjs — Áreas de preservação (Unidades de Conservação)
 *
 * Converte o shapefile oficial do CNUC (MMA — todas as esferas: federal, estadual,
 * municipal) no formato do app (public/protected_areas_<uf>.json), carregado por
 * país/região. Mesmo padrão escalável da hidrografia. Para outras regiões: filtrar
 * por UF/esfera e gerar.
 *
 * Fonte: CNUC (dados.mma.gov.br) — shapefile `cnuc_<aaaa_mm>.shp` em .uc_tmp/cnuc/
 *   CRS SIRGAS 2000 (≈ WGS84). Filtra RS (uf contém "RIO GRANDE DO SUL") e Ativo.
 *
 * Saída por área: { id, name, category(código), categoryName, group(PI|US), esfera,
 *   authority, areaHa, center:[lat,lon], rings: [ [ [lat,lon], ... ], ... ] }
 *
 * Uso: node scripts/build_protected_areas.mjs
 */
import * as turf from '@turf/turf';
import * as shapefile from 'shapefile';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHP = join(ROOT, '.uc_tmp', 'cnuc', 'cnuc_2025_08.shp');
const DBF = join(ROOT, '.uc_tmp', 'cnuc', 'cnuc_2025_08.dbf');

// UF alvo via argumento: `node build_protected_areas.mjs SC` (default RS).
// O filtro casa o nome da UF como aparece no campo `uf` do CNUC.
const UF_MAP = {
  RS: { nome: 'RIO GRANDE DO SUL', out: 'protected_areas_rs.json' },
  SC: { nome: 'SANTA CATARINA',    out: 'protected_areas_sc.json' },
  PR: { nome: 'PARANÁ',            out: 'protected_areas_pr.json' },
};
const UF_ARG = (process.argv[2] || 'RS').toUpperCase();
const UF_CFG = UF_MAP[UF_ARG];
if (!UF_CFG) { console.error(`UF desconhecida: ${UF_ARG}. Use uma de: ${Object.keys(UF_MAP).join(', ')}`); process.exit(1); }
const UF_ALVO = UF_CFG.nome;
const OUT_FILE = UF_CFG.out;

// categoria (texto CNUC) → código normalizado do app
function categoryCode(categoria) {
  const c = (categoria || '').toLowerCase();
  if (c.includes('parque')) return 'PARQUE';
  if (c.includes('estação ecológica') || c.includes('estacao ecologica')) return 'ESEC';
  if (c.includes('reserva biológica') || c.includes('reserva biologica')) return 'REBIO';
  if (c.includes('refúgio') || c.includes('refugio')) return 'REVIS';
  if (c.includes('monumento')) return 'MONA';
  if (c.includes('proteção ambiental') || c.includes('protecao ambiental')) return 'APA';
  if (c.includes('relevante interesse')) return 'ARIE';
  if (c.includes('floresta')) return 'FLORESTA';
  if (c.includes('extrativista')) return 'RESEX';
  if (c.includes('desenvolvimento sustentável') || c.includes('desenvolvimento sustentavel')) return 'RDS';
  if (c.includes('particular')) return 'RPPN';
  return 'UC';
}

function slug(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 52);
}

function convert(f) {
  const p = f.properties;
  let geom = f.geometry;
  if (!geom) return null;
  try { geom = turf.simplify(turf.feature(geom), { tolerance: 0.0015, highQuality: true }).geometry; } catch {}
  const polys = geom.type === 'MultiPolygon' ? geom.coordinates : geom.type === 'Polygon' ? [geom.coordinates] : [];
  const rings = polys
    .map(poly => poly[0])
    .filter(r => r && r.length >= 4)
    .map(r => r.map(([lon, lat]) => [+lat.toFixed(5), +lon.toFixed(5)]));
  if (!rings.length) return null;
  const big = rings.reduce((a, b) => (b.length > a.length ? b : a), rings[0]);
  const ctr = big.reduce((s, [la, lo]) => [s[0] + la, s[1] + lo], [0, 0]).map(v => v / big.length);
  const group = /integral/i.test(p.grupo || '') ? 'PI' : 'US';
  const ha = parseFloat(p.ha_total);
  return {
    id: 'uc-' + slug(p.cd_cnuc || p.nome_uc),
    name: (p.nome_uc || 'Unidade de Conservação').replace(/\s+/g, ' ').trim(),
    category: categoryCode(p.categoria),
    categoryName: p.categoria || null,
    group,
    esfera: p.esfera || null,
    authority: p.cria_ato && p.cria_ato !== 'Sem informação' ? p.cria_ato : null,
    areaHa: Number.isFinite(ha) && ha > 0 ? Math.round(ha) : null,
    center: [+ctr[0].toFixed(5), +ctr[1].toFixed(5)],
    rings,
  };
}

async function build() {
  if (!existsSync(SHP)) { console.error(`Shapefile não encontrado: ${SHP}`); process.exit(1); }
  const src = await shapefile.open(SHP, DBF, { encoding: 'utf-8' });
  const out = [];
  let total = 0, rs = 0;
  let res = await src.read();
  while (!res.done) {
    total++;
    const p = res.value.properties;
    if ((p.uf || '').includes(UF_ALVO) && p.situacao === 'Ativo') {
      rs++;
      const o = convert(res.value);
      if (o) out.push(o);
    }
    res = await src.read();
  }
  // ordenar por esfera (Federal, Estadual, Municipal) e nome
  const ordEsf = { Federal: 0, Estadual: 1, Municipal: 2 };
  out.sort((a, b) => (ordEsf[a.esfera] - ordEsf[b.esfera]) || a.name.localeCompare(b.name));

  const vert = out.reduce((s, a) => s + a.rings.reduce((t, r) => t + r.length, 0), 0);
  writeFileSync(join(ROOT, 'public', OUT_FILE), JSON.stringify(out));
  const byEsf = out.reduce((a, x) => ((a[x.esfera] = (a[x.esfera] || 0) + 1), a), {});
  const byCat = out.reduce((a, x) => ((a[x.category] = (a[x.category] || 0) + 1), a), {});
  console.log(`CNUC: ${total} UCs no país | ${UF_ARG} ativas: ${rs} → ${out.length} áreas, ${vert} vértices`);
  console.log('  por esfera:', JSON.stringify(byEsf));
  console.log('  por categoria:', JSON.stringify(byCat));
  console.log(`OK -> public/${OUT_FILE}`);
}

build().catch(e => { console.error('ERRO', e.message); process.exit(1); });
