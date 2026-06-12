# Guia de expansão — adicionar estados/regiões ao mapa de hidrografia

> Como foi feito o Rio Grande do Sul (BR-RS) corretamente, e como repetir para
> outros estados **sem cair nos mesmos problemas**. Leia as seções 5 e 6 antes de
> começar — é onde estão as armadilhas que custaram caro.

Última atualização: 2026-06-09 (após RS = 43.522 trechos, 4 bacias).

---

## 1. Objetivo

Para cada nova área (ex.: Santa Catarina `BR-SC`), entregar:
- **Fronteira oficial** do estado (para recorte e contorno no mapa).
- **Hidrografia completa**, recortada à fronteira, classificada por bacia e
  com detalhe (densidade) controlado para caber e renderizar no navegador.
- **Integração no app** (manifest + configs) para o estado aparecer no seletor.

O resultado correto = **sem lacunas** dentro do estado, **sem transbordo** para
fora, **cores de bacia coerentes** e **render fluido** (sem travar nem vazar).

---

## 2. Arquitetura de dados (visão geral)

```
  Fonte oficial IBGE (malha estadual)        Fonte oficial ANA (BHO 2017)
            │                                          │
   scripts/build_<uf>_boundary.mjs        scripts/build_<uf>_hydrography.mjs
            │                                          │  (usa o boundary p/ recortar)
            ▼                                          ▼
  public/<uf>_boundary.json              public/trib_<uf>_<bacia>.json  (1 por bacia)
   { rings: [[ [lat,lon], ... ]] }        [ { id, name, regionId, paths:[[ [lat,lon] ]] } ]
            │                                          │
            └──────────────┬───────────────────────────┘
                           ▼
            public/trib_manifest.json   (mapeia countryId → arquivos)
                           ▼
                  src/main.jsx (front)
   - COUNTRIES[]              (bbox/centro/zoom/available)
   - BASINS_BY_COUNTRY{}      (lista de bacias + cor + emoji)
   - loadTribsForCountry()    (lê o manifest e carrega os arquivos)
   - getBasinRenderer()/BasinLayer (renderização canvas por bacia)
   - _TRIB_VERSION            (invalida o cache singleton)
   - contorno do estado desenhado a partir de <uf>_boundary.json
```

Formato de coordenadas em **todo o pipeline e no app: `[lat, lon]`** (Leaflet).
GeoJSON bruto vem em `[lon, lat]` — converter sempre na geração.

### Estrutura do objeto "trecho" (nos `trib_*.json`)
```json
{
  "id": "rs-1632620",            // único; prefixo do estado + cotrecho
  "name": "Rio Ibicuí",          // noriocomp do BHO (pode ser "Sem nome")
  "type": "river",
  "regionId": "bacia_uruguai_BR-RS",  // <baseRegionId>_<countryId>
  "order": 7,                     // nuordemcda (opcional)
  "paths": [ [ [lat,lon], [lat,lon], ... ] ]  // sub-trechos contíguos DENTRO do estado
}
```

### Entrada no manifest (`public/trib_manifest.json`)
```json
"BR-RS": [
  { "file": "trib_rs_uruguai.json", "regionId": "bacia_uruguai_BR-RS", "baseRegionId": "bacia_uruguai" },
  ...
]
```

---

## 3. Fontes de dados oficiais (use estas, não Overpass)

| O quê | Fonte | Detalhe |
|---|---|---|
| **Fronteira do estado** | IBGE Malhas v3/v4 | `https://servicodados.ibge.gov.br/api/v3/malhas/estados/<CODAREA>?formato=application/vnd.geo+json&qualidade=maxima` — `CODAREA` é o código IBGE da UF (RS=43, SC=42, PR=41, SP=35, …). Vem como `MultiPolygon` em `[lon,lat]`. |
| **Hidrografia** | ANA — BHO 2017 (Base Hidrográfica Ottocodificada) | Geopackage nacional `geoft_bho_2017_trecho_drenagem.gpkg` (~2.6 GB, 3.3M trechos). Cobre o Brasil inteiro → serve para **todos** os estados. Guardado em `.bho_tmp/` (gitignored; não versionar). |

**Política de fonte:** SEMPRE o dado oficial do governo local da região; HydroSHEDS
(HydroRIVERS/HydroBASINS, global) só como **fallback** quando não houver oficial.
O *método* é o mesmo (seção 5); muda só a *fonte*:

| Região | Fronteira | Hidrografia + bacias |
|---|---|---|
| **BR (estados)** | IBGE Malhas (CODAREA) | ANA BHO 2017 (`.bho_tmp/`) — classifica bacia por **traçado de fluxo** |
| **UY (Uruguai)** | união das cuencas (turf) → `uy_boundary.json` | **DINAGUA** via WFS (`ambiente.gub.uy/geoserver/wfs`): `u19600217:c257` cursos (44.574) + `u19600217:c097` cuencas N1 (6). Classifica bacia por **ponto-em-polígono** nas cuencas (a camada de cursos não tem ordem/jusante). Sem Strahler → usa a rede inteira. |
| sem dado oficial | — | HydroSHEDS (fallback) |

> **Por que não Overpass/OSM:** as primeiras versões (RS e UY) usaram OSM e geraram os
> dois problemas centrais — **cobertura incompleta** (lacunas) e **sem recorte** na
> fronteira (transbordo). As bases oficiais são consistentes e completas.

---

## 4. O pipeline em 2 fases (scripts de referência)

Os scripts atuais são **específicos do RS** (`build_rs_boundary.mjs`,
`build_rs_hydrography.mjs`). Para um novo estado, ou parametrize-os (ver seção 8)
ou copie/adapte. O parser de geometria `scripts/gpkg_geom.mjs` (`parseGpkgGeometry`,
WKB/GPB sem GDAL) é **genérico** — reutilize como está.

### Fase 1 — Fronteira (`build_rs_boundary.mjs`)
- Baixe o GeoJSON do IBGE (CODAREA da UF) → `public/<uf>_boundary_ibge.geojson`.
- O script converte o `MultiPolygon` para `{ rings: [[ [lat,lon] ]] }`, descarta
  anéis minúsculos (< 8 vértices) e ordena por tamanho (continente primeiro).
  Mantém ilhas costeiras reais.
- Saída: `public/<uf>_boundary.json`.

### Fase 2 — Hidrografia (`build_rs_hydrography.mjs`)
Requer Node ≥ 22.5 (usa `node:sqlite`; testado no Node 24). Passos internos:
1. **Bbox rápido** (R-tree do geopackage) para pegar candidatos da UF.
2. **Classificação por bacia via TRAÇADO DE FLUXO** (não por código COBACIA — ver
   armadilha 5.2): carrega a rede `Strahler >= 1`, segue `nutrjus` (trecho a
   jusante) até o **exutório** e herda a bacia dele. `classifyTerminal(nome, lat, lon)`
   mapeia cada exutório para uma das bacias do estado.
3. **Recorte ponto-a-ponto** pela fronteira oficial (ray casting sobre os `rings`),
   dividindo cada trecho em **sub-trechos contíguos dentro do estado**.
4. **Limiar de detalhe POR BACIA** (`BASIN_MIN_STRAHLER`) — controla densidade/tamanho.
5. Escreve um `trib_<uf>_<bacia>.json` por bacia.

Modos: `--inspect` (diagnóstico de COBACIA/Strahler), `--dry` (classifica e mostra
distribuição sem gerar geometria — **use sempre antes do build completo**).

---

## 5. Decisões-chave e armadilhas (LEIA — foi aqui que doeu)

### 5.1 — Use a fonte oficial e RECORTE na fronteira
- Lacunas e transbordo = sintomas de dado incompleto/não recortado. BHO + recorte
  ponto-a-ponto pela malha IBGE resolve os dois de uma vez.
- O recorte divide em **sub-trechos contíguos** (não apenas filtra pontos), senão
  o trecho "salta" reto por cima de uma área fora do estado.

### 5.2 — Classifique bacia por FLUXO, não por prefixo COBACIA
- O COBACIA (Pfafstetter) **mistura bacias** num mesmo prefixo: a região `8` do RS
  contém Uruguai **e** parte do Jacuí; o prefixo `827` tem tanto o Ijuí (Uruguai)
  quanto o Antas (Jacuí). Classificar por prefixo dá resultado errado.
- **Solução que funciona:** seguir `nutrjus` até o exutório e classificar pelo
  exutório (Rio Uruguai→uruguai, Rio Guaíba→jacui, Canal São Gonçalo→merin, costa/
  Patos direto→vertente_atlantica). Há poucas dezenas de exutórios — dá pra mapear
  todos com confiança (nome + posição).

### 5.3 — A topologia de LAGOS é lixo; restrinja a Strahler ≥ 1
- Seguir `nutrjus` através de uma lagoa (Patos, etc.) leva a saltos absurdos (o
  fluxo "derailou" do Jacuí até a costa do Paraná num teste). Lagos têm
  `nustrahler = null`.
- Trabalhar com o conjunto `Strahler >= 1` (exclui os `null` dos lagos) faz as
  cadeias **pararem na margem do lago** (vira exutório local), que é o comportamento
  correto. Strahler nunca decresce a jusante → o conjunto é fechado para jusante.

### 5.4 — Campos do BHO e nomes homônimos
- Nome do rio = **`noriocomp`** (NÃO existe `norio`). `cotrecho` é **único** (PK
  lógica); `nutrjus` referencia o `cotrecho` de jusante.
- **Há rios homônimos entre estados** ("Rio Negro", "Rio Taquari", "Rio das Antas"
  existem em vários lugares). NUNCA classifique por `WHERE noriocomp='X'` sem
  amarrar à geografia/bbox — pega o rio errado de outro estado.

### 5.5 — Densidade de drenagem VARIA por terreno → limiar por bacia
- Não é uniforme: a bacia do Uruguai (planalto basáltico dissecado) tem ~30-45×
  mais trechos por área que a Depressão Central / planície costeira (Jacuí baixo,
  Mirim, litoral). Isso é **real** no dado oficial, não um bug.
- Por isso o detalhe é controlado **por bacia** (`BASIN_MIN_STRAHLER`): no RS,
  Uruguai `>=3` (já fica denso) e as demais `>=1` (detalhe máximo disponível).
  Para um novo estado, rode `--dry` em vários limiares e calibre por bacia.

### 5.6 — Tamanho dos dados (caber no navegador)
- Strahler `>=1` no Brasil inteiro é gigante. Por estado, escolha limiares que
  mantenham o total na casa das **dezenas de milhares** de trechos (RS = 43.522,
  ~30 MB somando os arquivos). Veja a seção 6 para o teto de renderização.

---

## 6. Limites de RENDERIZAÇÃO do app (o gargalo que mais travou)

O `AllWatercourses`/`BasinLayer` renderiza **um componente React `<Polyline>` por
trecho**. Isso não escala de graça. Lições já aplicadas em `main.jsx` (mantenha-as):

1. **Um único canvas compartilhado satura ~40k linhas e não pinta NADA** (tela
   branca, não só lento). → Cada bacia usa seu **próprio canvas renderer**, via o
   pool `getBasinRenderer(regionId)`. Distribui a carga; nenhum canvas isolado
   passa do limite. **Ao adicionar um estado, cada bacia nova já ganha seu canvas
   automaticamente** (a chave é o `regionId`).

2. **Popups adiantados travam o navegador.** Renderizar `<Popup>` para os 43k
   trechos de uma vez congela a aba. → O popup é renderizado **só para o trecho sob
   hover** (`pi === 0 && isHovered`).

3. **Hitbox SVG por trecho explode o DOM** (~43k nós `<path>` → paint sufoca, até o
   screenshot trava). → Removida; hover/clique ficam na **linha visível (canvas)**
   com `tolerance: 8` px no renderer.

4. **Vazamento de `<canvas>`:** criar um renderer novo a cada montagem (e não
   removê-lo) acumula canvases ao trocar de país (4→13→19…). → O pool
   `getBasinRenderer` **reutiliza por `regionId`**, então o nº de canvases fica
   limitado (~10) e estável. (Tentar remover no `unmount` quebrou o redesenho ao
   remontar — não faça isso.)

5. **Cache:** após regenerar dados, **bump `_TRIB_VERSION`** em `main.jsx` para
   invalidar o singleton `globalThis.__pescamon_trib__`.

6. **Custo de hover conhecido (em aberto):** mudar o hover re-renderiza o
   `BasinLayer` inteiro (~38k elementos) → pode dar ~250 ms de lag em bacias muito
   densas. Conserto futuro: extrair um componente de linha `React.memo`. Decidido
   deixar como está por ora.

> Dica de verificação: o `getImageData` do canvas às vezes retorna 0 pixels mesmo
> com o mapa renderizado (off-screen/timing). **Confie no screenshot**, não na
> contagem de pixels, para validar render neste app.

---

## 7. Checklist — adicionar um estado novo (ex.: BR-SC)

**Dados**
- [ ] Fase 1: gerar `public/sc_boundary.json` (IBGE CODAREA=42) e o
      `sc_boundary_ibge.geojson` de referência.
- [ ] Definir as bacias do estado e o `classifyTerminal` correspondente (rode
      `--inspect` e estude os exutórios reais via `nutrjus`).
- [ ] Fase 2 `--dry`: conferir a distribuição por bacia e calibrar
      `BASIN_MIN_STRAHLER` (densidade × tamanho).
- [ ] Fase 2 completa: gerar `public/trib_sc_<bacia>.json` (recortados à fronteira).
- [ ] Validar (seção 9).

**Integração em `src/main.jsx`**
- [ ] `COUNTRIES`: marcar a entrada `BR-SC` como `available: true` (já existe com
      bbox/centro/zoom — conferir o bbox).
- [ ] `BASINS_BY_COUNTRY['BR-SC']`: listar as bacias (`id`, `name`, `emoji`, `color`).
- [ ] `REGION_COLORS` (dentro do `BasinLayer`): garantir cor para cada
      `regionId` novo (ex.: `'bacia_x_BR-SC'`), senão cai no azul padrão.
- [ ] Desenho do contorno: hoje o bloco de fronteira no `AllWatercourses` é do RS
      (`selectedCountry === 'BR-RS'` + `loadRSBoundary`). **Generalizar** para
      carregar `<uf>_boundary.json` conforme o país (ver seção 8).
- [ ] `_TRIB_VERSION`: bump.

**Manifest**
- [ ] `public/trib_manifest.json`: adicionar a chave `"BR-SC": [ { file, regionId,
      baseRegionId }, ... ]`.

**Seletor geográfico (mapa país→estado)**
- [ ] O seletor (`<GeoPicker>` em `src/main.jsx`) é alimentado por `public/br_states.json`
      (gerado por `scripts/build_br_geo.mjs` a partir da malha IBGE de UFs). Para tornar
      um estado **clicável/navegável**: em `build_br_geo.mjs`, adicionar o `codarea` ao
      mapa `AVAILABLE` (ex.: `'42': 'BR-SC'`) e rodar `node scripts/build_br_geo.mjs`
      (regenera `br_states.json` com `available:true` e `regionId` certo). Estados fora
      do `AVAILABLE` aparecem desenhados, esmaecidos, com aviso "Em breve" ao clicar.
- [ ] `COUNTRIES` ainda guarda bbox/centro/zoom por região (usado na navegação pós-seleção);
      manter a entrada do estado coerente. A silhueta nacional (`br_boundary.json`) e o
      contorno do estado vêm dos dados — não precisam de código novo.

---

## 8. Recomendação: GENERALIZAR antes de escalar

Hoje há acoplamento "RS" hardcoded em 3 lugares. Antes de adicionar o 2º/3º estado,
vale parametrizar para não duplicar nem repetir bugs:

1. **Scripts** → um único `build_boundary.mjs <uf>` e `build_hydrography.mjs <uf>`
   recebendo: `codarea` IBGE, prefixo de id, mapa de bacias + `classifyTerminal`,
   e `BASIN_MIN_STRAHLER`. Hoje isso está fixo para o RS.
2. **Contorno no app** → ✅ FEITO. Existe `loadBoundary(countryId)` genérico +
   tabela `_BOUNDARY_FILES = { 'BR-RS': 'rs_boundary.json', 'UY': 'uy_boundary.json' }`;
   o `AllWatercourses` desenha o contorno de qualquer país que tenha o arquivo. Para
   uma região nova: gerar `<uf>_boundary.json` + adicionar a entrada na tabela.
   (O `isPointInRS` segue RS-specific — o recorte fino vem da geração; no app o
   contorno é só visual.)
3. **Configs** → `COUNTRIES`, `BASINS_BY_COUNTRY`, `REGION_COLORS` e o manifest já
   são tabelas por país; manter esse padrão (nada hardcoded fora delas).
4. **Overlays "herói" legados** (MVP do Rio Santa Lucía): `EXTRA_RIVERS` e a geometria
   especial da Santa Lucía desenhavam rios em linhas azuis grossas por cima da rede.
   Desativados por `SHOW_LEGACY_HERO_RIVERS = false` (os dados seguem para heatmap/
   seleção). Mantenha desligado — a rede oficial por bacia já cobre esses rios.

---

## 9. Validação (como saber que ficou certo)

1. `--dry` mostra distribuição por bacia plausível (sem 97% numa só, salvo se a
   geografia justificar — ver 5.5).
2. App em `npx vite --host 0.0.0.0 --port 5203 --force`, selecionar o estado.
3. Console: `[TRIB] Total carregado: N` bate com a soma dos arquivos.
4. **Screenshot** (não pixels) com zoom no estado inteiro:
   - cobertura densa, **sem lacunas** dentro do contorno;
   - **nada** de rio fora da fronteira (recorte ok);
   - cada bacia na sua cor, geograficamente coerente;
   - app responsivo (sem congelar) e screenshot captura (sem explosão de SVG).
5. Trocar de país ida-e-volta e conferir que o nº de `<canvas>` **estabiliza**
   (não cresce indefinidamente).

---

## Referências rápidas
- Scripts: `scripts/build_rs_boundary.mjs`, `scripts/build_rs_hydrography.mjs`,
  `scripts/gpkg_geom.mjs` (parser WKB genérico).
- Config do front: `src/main.jsx` → `COUNTRIES` (~l.144), `BASINS_BY_COUNTRY`
  (~l.196), `_canvasRenderer`/`getBasinRenderer`/`BasinLayer` (~l.7470+),
  `_TRIB_VERSION` (~l.1328), bloco de contorno/`loadRSBoundary`.
- Commits da jornada do RS: `8e8642e` (fronteira IBGE), `fd5d266` (hidrografia
  densa BHO + render por bacia), `0c8ea5c` (pool anti-vazamento de canvas).
