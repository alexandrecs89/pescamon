# Pescamon — Contexto para Agente de IA

## Stack
- **React 18 + Vite** (porta dev: 5203)
- **react-leaflet** (mapa principal)
- **Supabase** (auth + banco de dados)
- **IndexedDB** (dados offline)
- Arquivo principal: `src/main.jsx` (~8500 linhas — monolito intencional)

## Como rodar localmente
```bash
npx vite --host 0.0.0.0 --port 5203 --force
```
Acesse: http://localhost:5203

## Produção
- URL: https://pescamon.com.br / https://pescamon-app.netlify.app
- Netlify site ID: `4fe12015-bce1-489f-b2ab-adf914fb9f13`
- **NÃO fazer deploy sem solicitação explícita do usuário**

---

## RS (BR-RS) — RESOLVIDO (jun/2026)

A plataforma cobre hidrografia do Uruguai (UY), Argentina (AR) e **Rio Grande do
Sul (BR-RS)**. O RS está **completo e correto**: 43.522 trechos da BHO 2017 da ANA,
recortados à fronteira oficial do IBGE, classificados em 4 bacias, renderizando de
forma estável no app.

> **Para EXPANDIR para outros estados, leia primeiro `docs/EXPANSAO-ESTADOS.md`** —
> é o guia com o pipeline reproduzível, as armadilhas (classificação por fluxo e não
> por COBACIA, topologia de lagos, densidade por terreno) e os limites de
> renderização (canvas por bacia, popup sob hover, anti-vazamento). Evita repetir
> tudo o que custou caro nesta jornada.

### Estado atual dos dados
- `public/trib_rs_{uruguai,jacui,merin,vertente_atlantica}.json` — 38.024 / 2.075 /
  1.884 / 1.539 trechos (total 43.522, ~30 MB), formato `[lat,lon]`, recortados.
- `public/rs_boundary.json` — fronteira oficial IBGE (codarea=43), 2.592 vértices.
- `public/trib_manifest.json` — mapeia `BR-RS` → os 4 arquivos.

### Pontos-chave em `src/main.jsx`
- `_TRIB_VERSION = 'v47-bho-ana'` (~l.1328) — invalida o cache singleton.
- `COUNTRIES` (~l.144) e `BASINS_BY_COUNTRY` (~l.196) — tabelas por país.
- Contorno do estado: `loadRSBoundary()` lê `/rs_boundary.json`; desenhado no
  `AllWatercourses`. `isPointInRS` usa esses anéis (o recorte fino já vem pronto da
  geração; no app o contorno é só visual).
- Render: `getBasinRenderer(regionId)` (pool de canvas por bacia, ~l.7470+) usado
  pelo `BasinLayer`; `REGION_COLORS` define a cor de cada `regionId`.

### Bacias do RS (`BASINS_BY_COUNTRY['BR-RS']`):
```js
{ id: 'bacia_uruguai', color: '#f97316' }       // laranja
{ id: 'bacia_jacui',   color: '#22d3ee' }       // ciano
{ id: 'bacia_merin',   color: '#ef4444' }       // vermelho
{ id: 'vertente_atlantica', color: '#a855f7' }  // roxo
```
(O `regionId` final é `<id>_BR-RS`.)

### Commits da jornada
`8e8642e` fronteira IBGE · `fd5d266` hidrografia densa BHO + render por bacia ·
`0c8ea5c` pool anti-vazamento de canvas.

---

## Arquivos-chave

| Arquivo | Descrição |
|---|---|
| `src/main.jsx` | Aplicação completa (React, mapa, lógica toda) |
| `public/trib_manifest.json` | Mapeia país → arquivos de rios |
| `public/trib_rs_*.json` | Rios do RS divididos por bacia |
| `public/rs_boundary.json` | Fronteira oficial IBGE do RS (recorte + contorno) |
| `scripts/build_boundary.mjs <UF>` | Fase 1: gera `<uf>_boundary.json` (malha IBGE) |
| `scripts/build_hydrography.mjs <UF>` | Fase 2: gera os `trib_<uf>_*.json` (BHO ANA) |
| `scripts/gpkg_geom.mjs` | Parser WKB/GPB do geopackage (genérico) |
| `docs/EXPANSAO-ESTADOS.md` | **Guia para adicionar novos estados** |
| `vite.config.js` | Config Vite (sem customizações de tamanho) |

## Scripts úteis
```bash
# Diagnóstico do BHO (Strahler) no bbox do estado · exutórios reais · distribuição
node scripts/build_hydrography.mjs RS --inspect
node scripts/build_hydrography.mjs RS --terminals
node scripts/build_hydrography.mjs RS --dry

# Gerar os trib_<uf>_*.json (recortados à fronteira). Requer Node >= 22.5 e o
# geopackage da ANA em .bho_tmp/trecho_drenagem.gpkg. UF = RS | SC | PR
node scripts/build_hydrography.mjs RS
```

## Estrutura do objeto rio (formato `trib_rs_*.json`)
```json
{
  "id": "rs-1632620",
  "name": "Rio Ibicuí",
  "type": "river",
  "regionId": "bacia_uruguai_BR-RS",
  "order": 7,
  "paths": [ [ [-30.168, -57.144], [-30.169, -57.144], ... ] ]
}
```
`paths` = array de sub-trechos contíguos dentro do estado; cada um = array de `[lat, lon]`.
