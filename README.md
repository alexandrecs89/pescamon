# Pescamon

**Plataforma web de apoio à pesca esportiva no Cone Sul.** Cobre toda a hidrografia do Uruguai e do Rio Grande do Sul (BR) — rios interiores, bacia do Río Negro, Jacuí, Lagoa dos Patos, litoral norte do Río Uruguay, rios orientais da ecorregião Laguna dos Patos/Mirim, lagoas costeiras atlânticas — com expansão em curso para os demais estados brasileiros e Argentina.

A hidrografia de cada região vem de **dados oficiais do governo local** (ANA/IBGE no Brasil, DINAGUA no Uruguai), recortada à fronteira oficial e classificada por bacia. A escolha de região é feita por um **seletor geográfico no mapa** (mundo → país → estado).

**Estado atual (junho 2026):** aplicação em produção em [pescamon.com.br](https://pescamon.com.br) / [pescamon-app.netlify.app](https://pescamon-app.netlify.app). Última sessão de desenvolvimento: 15/06/2026.

Stack: **React 18 + Vite · react-leaflet · Supabase · Open-Meteo · IndexedDB · PWA**

## Páginas principais

A plataforma é dividida em três páginas acessíveis pela topbar (desktop) e bottom-nav (mobile):

| Página | Ícone | Descrição |
|---|---|---|
| **Mapa** | 🗺️ | Plataforma principal de análise preditiva, mapa, pescaria ativa e todos os módulos analíticos |
| **Comunidade** | 👥 | Feed social estilo Instagram — posts, likes, comentários, perfis, seguidores e grupos de pesca |
| **Pescademia** | 🎓 | Academia de pesca — vídeos (YouTube/Twitch/Vimeo), e-books, artigos e cursos com filtros e progresso |

## Visão geral

O Pescamon lê o traçado geográfico real dos cursos d'água (OpenStreetMap / Overpass API), divide-os em **segmentos morfológicos analíticos** e estima a probabilidade relativa de ocorrência de cada espécie por trecho, com base em:

- **Habitat do trecho**: curvatura (morfologia), comprimento, sinuosidade, largura, profundidade, fluxo, vegetação, sombra, turbidez, oxigenação e estrutura de fundo — calibrados por ecorregião e tipo de curso.
- **Perfil da espécie**: tamanho, dieta, horário de atividade (diurno / crepuscular / noturno), preferências de habitat e regulamentação de pesca.
- **Clima em tempo real**: temperatura ar/água, radiação solar, vento, pressão atmosférica e tendência barométrica (bônus/penalidade por espécie) — via [Open-Meteo](https://open-meteo.com/) (gratuito, sem API key).
- **Vazão hidrológica**: dados GloFAS/ECMWF (Open-Meteo Flood API) — 30 dias históricos + 7 dias de forecast. Ratio vazão/média gera bônus ou penalidade no modelo.
- **Fase lunar e marés**: ciclo sinódico (Julian Day), marés de sizígia/quadratura, previsão 7 dias.
- **Ocorrências registradas**: capturas reais calibram o modelo bayesiano automaticamente.

> **Heatmap por demanda**: o mapa de calor só aparece após selecionar ao menos um curso d'água **e** ao menos uma espécie. Sem seleção, o mapa exibe **todos** os cursos com popup informativo.

## Dados geográficos

### Política de fonte de dados

A regra do projeto é **sempre usar os dados oficiais do governo local**. Quando uma região não possui dado oficial acessível, recorre-se ao **HydroSHEDS** como fallback. Toda a hidrografia é gerada por scripts reproduzíveis (`scripts/build_*`), recortada à fronteira oficial da região e classificada por bacia (ver `docs/EXPANSAO-ESTADOS.md`).

| Região | Fonte oficial | Conteúdo gerado |
|---|---|---|
| **Rio Grande do Sul (BR-RS)** | ANA — BHO 2017 (geopackage) + fronteira IBGE (codarea 43) | `public/trib_rs_*.json` (43.522 trechos em 4 bacias: Uruguai, Jacuí, Mirim, Vertente Atlântica), `public/rs_boundary.json` |
| **Santa Catarina (BR-SC)** | ANA — BHO 2017 + fronteira IBGE (codarea 42) | `public/trib_sc_*.json` (168.433 trechos em 2 bacias: Uruguai interior, Vertente Atlântica; simplificados Douglas-Peucker), `public/sc_boundary.json` |
| **Uruguai (UY)** | DINAGUA (WFS — cursos `c257` + cuencas Nível 1 `c097`) | `public/trib_uy_*.json` (6 bacias), `public/uy_boundary.json` |
| **Brasil (silhueta + 27 estados)** | IBGE malhas v3 | `public/br_boundary.json`, `public/br_states.json` (seletor geográfico) |
| **Santa Lucía (legado MVP)** | OSM relation 2736318 / Overpass | `public/export.geojson`, `public/tributarios.geojson` (~614 afluentes) |

`public/trib_manifest.json` mapeia cada país/estado → seus arquivos de bacia (carregados sob demanda). Os overlays "herói" legados do Santa Lucía (`EXTRA_RIVERS`, geometria azul) estão desativados por `SHOW_LEGACY_HERO_RIVERS = false`.

**Segmentação morfológica** (`buildMorphologicalSegments`): cada linha é dividida individualmente — nunca concatenadas entre si — em segmentos respeitando comprimento mínimo/máximo e ângulo de curvatura, parametrizados por tipo de curso (rio, arroio, canal, cañada, quebrada, lagoon, estuário).

**Seletor geográfico (mapa país → estado)** (`<GeoPicker>` em `main.jsx`): a região é escolhida visualmente no mapa. Nível mundo desenha Brasil e Uruguai como polígonos clicáveis; clicar no Uruguai entra direto, clicar no Brasil abre os 27 estados (RS destacado/clicável; demais com aviso "Em breve"). O app **lembra a última região** (o seletor só abre quando não há região salva); o botão "Trocar região" na topbar reabre o mapa.

**Seletor de cursos**: dentro de cada região, um dropdown hierárquico lista as bacias/cursos ordenados por distância do usuário. Clicar em um curso faz o mapa voar (`flyToBounds`) para cobrir todo o traçado.

**Localização do usuário**: o mapa inicializa centrado na posição real do usuário (via `navigator.geolocation`); fallback para a coordenada central da região selecionada se negado.

## Modelo preditivo

O sistema opera em dois modos, selecionados automaticamente:

### Modo heurístico (sempre ativo)

Calcula proximidade ponderada entre atributos do trecho e preferências da espécie: profundidade, fluxo, vegetação, sombra, turbidez, oxigênio, estrutura, temperatura da água, radiação solar, horário de atividade e **pressão barométrica**. Score: 4–100.

### Modo bayesian-ensemble (≥ 3 ocorrências por espécie)

Ativado automaticamente via `src/model.js`:

1. **Regressão logística** — gradient descent (80 épocas, lr=0.15), 7 features normalizadas por z-score.
2. **Random forest** — 15 árvores com bagging, Gini impurity, √7 features por split.
3. **Validação cruzada k-fold** (até 5 folds).
4. **Prior espacial gaussiano adaptativo**: bandwidth por k-NN (k = min(3, n/2)), limitado 1.5–8 km. Kernel mais estreito em áreas densas, mais largo em esparsas.
5. **Likelihood Naive Bayes** em log-space para estabilidade numérica.
6. **Posterior bayesiano**: prior × likelihood normalizado.

Ponderação final: `55% heurístico + 45% (55% ML + 45% posterior bayesiano)`.

**Modificador de vazão** (GloFAS): ratio vazão/média 30d → bônus ou penalidade por perfil de fluxo da espécie (−8 a +3 pontos).

**Modificador barométrico** (`pressureBonus`): pressão absoluta (hPa) + tendência (subindo/caindo/estável) → bônus ou penalidade ponderado pela `pressureSensitivity` da espécie (−8 a +8 pontos). Faixa ideal: 1008–1022 hPa; pressão caindo = frente fria chegando → alimentação intensa; pressão muito alta (>1022) ou baixa (<1000) → letargia.

**Ensemble de afluentes** independente: ativa com ≥3 ocorrências em afluentes, prioridade 80% sobre ensemble principal.

**LSTM** (`src/lstm.js`): infraestrutura pronta, ativa automaticamente com ≥30 capturas/espécie (inativo por falta de dados).

## Espécies cadastradas (50 espécies)

As espécies são **cientes de país**: cada uma declara em quais regiões ocorre (`regions`; sem o campo = compartilhada UY+BR-RS), e o seletor de espécies (`availableSpecies`) filtra pela região ativa. As **vedas** (`getVedaStatus`/`getVedasAtivas`) também são cientes de região, e a nota legal do cabeçalho (`FISHING_LAW_NOTE`) muda conforme o país (ver "Conformidade legal").

### Rios interiores e bacia do Santa Lucía
- Tararira ⚠️ — *Hoplias malabaricus* · mín. 33 cm
- Dorado ⚠️ — *Salminus brasiliensis* · mín. 65 cm · veda 1/set–31/dez
- Boga ⚠️ — *Megaleporinus obtusidens* · mín. 34 cm
- Bagre amarillo ⚠️ — *Pimelodus maculatus* · mín. 20 cm
- Pejerrey ⚠️ — *Odontesthes spp.* · mín. 25 cm
- Mojarra — *Astyanax spp.*
- Sábalo ⚠️ — *Prochilodus lineatus* · mín. 34 cm
- Patí ⚠️ — *Luciopimelodus pati* · mín. 40 cm
- Surubí ⚠️ — *Pseudoplatystoma corruscans* · mín. 85 cm
- Vieja del agua — *Hypostomus commersoni*
- Palometa — *Serrasalmus spp.*
- Armado 🚫 — *Pterodoras granulosus* · **veda absoluta** (CARU 59/12)
- Corvina de río — *Plagioscion ternetzi*
- Anguila criolla — *Synbranchus marmoratus*
- Carpa 🌿 — *Cyprinus carpio* · exótica invasora
- Dientudo — *Oligosarcus jenynsii*
- Tachuela — *Callichthys callichthys*

### Afluentes da bacia do Santa Lucía
- Chanchita, Castañeta, Lucio de arroyo, Madrecita, Barrigudito, Limpiavidrios, Virolito, Bagre de arroyo, Doradito, Morena, Cuyaya

### Litoral norte (Río Uruguay e afluentes)
- Manguruyú 🚫, Pacú 🚫, Pira-pitá 🚫 · **vedas absolutas** (CARU 59/12)
- Chafalote ⚠️, Bagre negro ⚠️, Bagre branco ⚠️, Boga lisa ⚠️, Trompa roja ⚠️, Corvina de río ⚠️, Castañeta

### Ecorregião Laguna dos Patos
- Pez anual 🔵 — *Austrolebias spp.* · vulnerável, endêmico

### Costa atlântica e Río de la Plata
- Corvina negra ⚠️, Corvina ⚠️, Lenguado, Lisa, Lacha, Burriqueta, Pescadilla ⚠️

### Rio Grande do Sul (BR-RS)
- Bagre-marinho ⚠️ — *Genidens barbus* · estuarino, regulado (SEMA-RS Res. 001/2018) · ocorre também no estuário UY
- Tilápia-do-nilo 🌿 — *Oreochromis niloticus* · exótica invasora
- Black bass 🌿 — *Micropterus salmoides* · esportivo introduzido
- Tucunaré 🌿 — *Cichla kelberi* · ciclídeo predador introduzido
- Migratórias da Bacia do Rio Uruguai sob **piracema** (IBAMA IN 193/2008): Dourado, Surubim, Pacu, Pira-pitã, Jaú, Grumatã, Piapara/Boga
- Tainha (*Mugil liza*) e bagre-marinho: pesca **regulada** na Lagoa dos Patos (badge "Regulamentada")

**Legenda:** ⚠️ Regulamentada · 🚫 Veda absoluta (CARU Res. 59/12 / Decreto 149/997 DINARA) · 🔵 Vulnerável · 🌿 Invasora

## Registro e sincronização de ocorrências

- **Registro no mapa**: clique para marcar local, adicionar notas, peso e isca.
- **Persistência**: IndexedDB (`src/storage.js`) com migração automática de localStorage.
- **Sync bidirecional**: Supabase (`src/supabase.js`) — merge local + remoto no carregamento; operações add/delete espelhadas em tempo real.
- **Exportar / Importar**: arquivo `.json` com deduplicação automática por ID.
- **Notificações Realtime**: Supabase postgres_changes notifica INSERT/DELETE de outros dispositivos via toast.

## Autenticação

- **E-mail e senha** com confirmação por e-mail (SMTP via Resend.com)
- **Magic link** (OTP por e-mail)
- **OAuth Google** e **OAuth Facebook** — ativos e funcionais
- Detecção de e-mail já cadastrado (`identities[]` vazio) com mensagem clara ao usuário
- RLS: todos leem; dono edita/deleta.
- Avatar com inicial na topbar → abre área pessoal.
- Ocorrências anônimas migradas ao fazer login (`device_id` → `user_id`).

## Funcionalidades por módulo

### Mapa e visualização
- Heatmap de probabilidade por espécie em todos os cursos selecionados (polilíneas coloridas por score)
- Visualização de todos os cursos quando nada está selecionado (largura dinâmica por zoom + popup rico)
- `flyToBounds` ao selecionar qualquer curso — zoom automático para cobrir todo o traçado
- Mapa de calor IoT (círculos HSL por temperatura da água — só com sensores reais)
- Postos de pesca comunitários com upvote no mapa
- Localização inicial centrada no usuário via `navigator.geolocation`

### Seletor de curso d'água
- Dropdown hierárquico: 11 macro-regiões + busca textual
- Ordenação por distância Haversine do usuário
- Qualidade da água (heurística / crowdsourcing validado / oficial)
- Badges: ⚠️ poluído · ⚡ duvidoso · 📍 próximo · 🟡 peixe grande · 🟣 favorito
- Reporte de qualidade com moderação

### Pescaria Ativa (`src/FishingPlanner.jsx`)
- Botão flutuante "Iniciar Pescaria" (requer login)
- Registro de capturas: espécie, peso, tamanho, isca, fotos (até 5)
- Minimiza para FAB com contador; retoma sessão anterior automaticamente
- Persistência em `fishing_sessions` + `catches` no Supabase

### Planejador de pescaria (wizard)
- 6 etapas: tipo → espécies → local → data/clima → detalhes → itinerário
- Previsão 7 dias Open-Meteo integrada com score de pesca por dia
- Exporta para Google Calendar, PDF, GPX e compartilhamento social
- Pescarias salvas na área pessoal (requer login)

### Área pessoal (`src/UserDashboard.jsx`)
- Aba Pescarias: saídas planejadas com detalhes expandíveis
- Aba Histórico: estatísticas, ranking de espécies, últimas 20 capturas
- Aba Perfil: edição de nome/senha, logout

### Recomendações (`src/GearRecommendation.jsx`)
- Equipamentos por faixa de peso (vara, molinete, linha, anzol, líder)
- Hot baits: iscas mais usadas em capturas reais via RPC `get_hot_baits` (Supabase)

### Dados ambientais
- Clima: Open-Meteo (temperatura, radiação, vento, pressão, nascer/pôr do sol)
- Vazão: Open-Meteo Flood API / GloFAS v4 — 30d histórico + 7d forecast + alertas
- Temperatura da água: proxy `soil_temperature_0_to_7cm` + sensores IoT reais
- Fase lunar: ciclo sinódico 29.53 dias (Julian Day) — previsão 7 dias
- Dados marinhos: Open-Meteo Marine API (ondas, swell) no painel lunar

### Conformidade legal (áreas protegidas + legislação) — ciente de região

Um pilar do projeto é ajudar o pescador a pescar **dentro da lei**. As camadas legais são carregadas conforme a região ativa:

- **Áreas protegidas (polígonos no mapa + card lateral)**:
  - **Uruguai**: 21 áreas do SNAP (`SNAP_AREAS`, inline) com polígonos georreferenciados por categoria.
  - **Rio Grande do Sul**: **101 Unidades de Conservação** oficiais do **CNUC/MMA** (todas as esferas — 44 federais, 30 estaduais, 27 municipais), em `public/protected_areas_rs.json` (geradas por `scripts/build_protected_areas.mjs`). Cada UC traz a nota de pesca por grupo: Proteção Integral = pesca proibida; Uso Sustentável = sob regras. Modelo escalável: `protected_areas_<país>.json` carregado por região.
- **Legislação de pesca (vedas/defeso por espécie e nota legal)**: `VEDAS` é ciente de região (campo `region`). No RS: piracema da Bacia do Rio Uruguai (~out–jan, IBAMA IN 193/2008) por espécie migratória; defeso da Lagoa dos Patos/Guaíba (IBAMA IN 197/2008); tainha sobre-explotada (MMA IN 5/2004) e bagre (SEMA-RS Res. 001/2018) como "Regulamentada". No UY: vedas CARU/DINARA. **As datas exatas mudam por portaria anual** — o app sempre exibe a ressalva, sem inventar datas.

### Comunidade (`src/SocialFeed.jsx`)
- Feed social com posts de texto + até 4 fotos + espécie/peso/local — scroll infinito
- Upload de fotos com compressão automática (1200px, 85% JPEG) e validação de tamanho (5MB/foto)
- Grid de previews adaptativo (1 foto = largura total; 2–4 = grade 2 colunas)
- Likes com animação, comentários, compartilhamento via Web Share API
- Perfis de pescador: bio, localização, seguidores/seguindo, posts próprios
- Grupos de pesca: criar, buscar, entrar/sair (público ou privado)
- Busca de pescadores por nome ou @username
- Backend: tabelas `social_profiles`, `social_posts`, `social_likes`, `social_comments`, `social_follows`, `fishing_groups`, `group_members` com RLS
- Storage: bucket `social-images` (público, 5MB, imagens)

### Pescademia (`src/Pescademia.jsx`)
- Grid de conteúdos com cards: vídeo, e-book, artigo, curso
- Player embutido: YouTube, Twitch e Vimeo detectados automaticamente pelo URL
- Viewer de e-books/artigos com capa, descrição e download
- **Cursos com capítulos sequenciais**: `CourseViewer` com layout duas colunas — player à esquerda, lista de capítulos à direita
- **Rastreamento automático de progresso** via `postMessage` do iframe YouTube (salva a cada 2s; concluído ≥ 90%)
- **Interface admin de cursos**: modal com tabs — dados do curso + gestão de capítulos (adicionar, editar, excluir, reordenar)
- Filtros: categoria, nível (iniciante/intermediário/avançado), tipo, busca com debounce
- Scroll infinito (12 items/página) + progresso do usuário
- Painel de publicação para usuários logados (conteúdo avulso + cursos)
- Backend: tabelas `academy_content`, `academy_courses`, `academy_chapters`, `academy_chapter_progress`, `academy_progress`, `academy_likes` com RLS

### Gamificação e chat
- Chat em tempo real por segmento (`river_chat` Supabase Realtime + 8 badges de chat)
- Desafios semanais (3 por semana, rotação determinística ISO week) + leaderboard
- Badges de conquista: 🎣 Primeira captura · 🗺️ Explorador · 🐟 Colecionador · 🔥 Sequência · 📊 Prolífico
- Compartilhamento social via Web Share API

### Análise e relatórios
- Dashboard estatístico: KPIs, gráficos mensais Canvas 2D, top espécies, tendência (`src/StatsDashboard.jsx`)
- Gráfico de tendência temporal (acumulado / diário) — `src/TrendChart.jsx`
- Ranking de melhores horários (Canvas 2D 24 barras, janela deslizante) — `src/HourlyRanking.jsx`
- Ranking mensal de capturas — `src/MonthlyRanking.jsx`
- Previsão de pesca 7 dias com score diário localizado (Excelente/Bom/Regular/Ruim) — `src/WeekForecastWidget.jsx`
- **Recomendações preditivas personalizadas** baseadas no histórico do usuário — `src/PredictiveAlerts.jsx` + `src/mlInsights.js` (textos PT/ES/EN, nomes de meses e estações localizados)
- Correlação IoT × capturas por espécie — `src/CorrelationAnalysis.jsx`
- Melhor horário de pesca por espécie/trecho — `src/BestTimePrediction.jsx`
- Validação de capturas (peso/tamanho vs. regulamentação) — `src/CaptureValidation.jsx`
- Sazonalidade por trecho (baixo curso estuarino / meio curso / alto curso)
- Exportação PDF (HTML + `window.print()`) e GPX — `src/PdfExport.jsx`
- Filtros temporais por estação ou mês — `src/TemporalFilter.jsx`

### Interface e temas
- **Light mode / Dark mode** completo — toggle Sun/Moon na topbar, persistido em localStorage
- Todas as cores via CSS variables semânticas (`--bg-base`, `--text-primary`, `--accent`, etc.)
- Tile layer condicional: CartoDB Positron (light) / OSM (dark)
- Topbar com navegação entre 3 páginas + seletor de idioma + autenticação
- **Bottom-nav mobile totalmente i18n** (6 botões): Mapa · Capturas · FAB Pescaria · Feed · Chat · Menu — todos os labels e aria-labels localizados
- Drawer lateral mobile (hero-panel) com tagline, intro e banner de notificações localizados
- Tipos de curso d'água localizados no seletor (Rio/Río/River, Lagoa/Laguna/Lake, Arroio/Arroyo/Creek…)
- Dropdown de espécies com placeholder e contagem localizados

### Infraestrutura
- PWA com service worker (cache offline, manifest, modo standalone)
- IndexedDB + sync bidirecional Supabase (merge + deduplicação)
- Push notifications nativas para alertas hidrológicos (API `Notification`)
- **i18n completo PT/ES/EN** (`src/i18n.jsx`): toda a UI localizada, incluindo nomes de espécies (`spName(sp, lang)` com campos `namePt`/`nameEs`/`nameEn`), bottom nav, drawer, dropdowns, popups de mapa, recomendações preditivas e rótulos de score de pesca
- Tutorial de onboarding para novos usuários (`src/OnboardingTutorial.jsx`)
- Dashboard de lojistas afiliados e dashboard ambiental (modo moderador)
- FishID por foto (`src/FishIDModal.jsx`): TF.js local + iNaturalist Vision API + base interna
- Grid customizável de painéis (`src/DraggableGrid.jsx`) — arrastar e soltar, persistência de layout
- Filtros temporais por estação/mês (`src/TemporalFilter.jsx`)
- Qualidade da água com crowdsourcing e heurística (`src/waterQuality.js`)

## Limitações conhecidas

- Atributos de habitat (largura, profundidade, fluxo) são heurísticos — melhorariam com sensores IoT reais.
- Temperatura da água via proxy Open-Meteo; sensores físicos dariam maior precisão.
- Login social Apple ainda não configurado (Google e Facebook ativos).
- LSTM inativo por falta de volume de dados (threshold: ≥30 capturas/espécie).
- Hidrografia oficial disponível para **RS**, **SC** e **UY**; demais estados/regiões seguem o pipeline de expansão (ver `docs/EXPANSAO-ESTADOS.md`).
- Os scripts de hidrografia por estado (`build_rs_hydrography.mjs`, `build_sc_hydrography.mjs`) ainda repetem código — falta unificá-los num único script parametrizado por UF.
- Espécies de SC usam o catálogo compartilhado da Bacia do Uruguai; um refinamento por curso (litoral vs. interior) fica como melhoria futura.
- ~~Bug: troca muito rápida de país somava trechos de duas regiões~~ — **corrigido** (loads de hidrografia concorrentes agora abortam por token de geração).

## Deploy e execução

| Ambiente | URL |
|---|---|
| Produção | [pescamon.com.br](https://pescamon.com.br) |
| Netlify | [pescamon-app.netlify.app](https://pescamon-app.netlify.app) |
| Site ID Netlify | `4fe12015-bce1-489f-b2ab-adf914fb9f13` |

```bash
# Instalar dependências
pnpm install   # ou npm install

# Desenvolvimento
pnpm dev       # http://localhost:5173

# Build de produção
pnpm build
```

### Variáveis de ambiente

Crie `.env` na raiz (nunca commitar):

```
VITE_SUPABASE_URL=https://kjgqtvmoujrlhmxlehwz.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key do painel Supabase>
```

No Netlify: Site settings → Environment variables → adicionar as mesmas duas chaves.

## Status (junho 2026)

### ✅ Implementado e estável

- Deploy Netlify + domínio `pescamon.com.br` + SSL automático
- Build Vite com code splitting (~906 kB JS, ~120 kB CSS)
- PWA com service worker e cache offline
- **Hidrografia oficial RS** (ANA BHO 2017 — 43.522 trechos em 4 bacias, recortados à fronteira IBGE) com render estável (pool de canvas por bacia)
- **Hidrografia oficial SC** (ANA BHO 2017 — 168.433 trechos em 2 bacias: Uruguai interior + Vertente Atlântica, simplificados Douglas-Peucker)
- **Hidrografia oficial UY** (DINAGUA — cursos + cuencas Nível 1, 6 bacias) substituindo o MVP do Santa Lucía
- **Seletor geográfico no mapa** (mundo → país → estado): Brasil/Uruguai clicáveis; 27 estados do Brasil desenhados (RS e SC clicáveis); lembra a última região
- **Conformidade legal ciente de região**: 101 UCs CNUC (RS) + 179 UCs CNUC (SC) + 21 áreas SNAP (UY); vedas/defeso por região (piracema IBAMA na Bacia do Rio Uruguai = RS+SC; defeso Lagoa dos Patos e safra da tainha)
- **Catálogo de espécies ciente de país** (50 espécies; exóticos do RS só no Brasil; vedas granulares por espécie)
- **46 corpos d'água** + **~614 afluentes** + tributários por bacia/país (UY/AR/BR)
- **11 macro-regiões** do Uruguai com seletor hierárquico por distância
- **50 espécies** (cientes de país) com perfis ecológicos, conservação CARU/DINARA/IBAMA/SEMA-RS, vedas e tamanhos mínimos
- **Heatmap morfológico completo**: bandas laterais (`lateralProfile`) com **glow** em **todos** os cursos selecionados — Rio Santa Lucía, EXTRA_RIVERS (Rio Negro, Uruguay, etc.), afluentes UY e **rios do RS** (caminho de afluentes desacoplado do legado Santa Lucía). Linhas estáticas somem ao ativar heatmap. **Duas paletas alternáveis** na legenda: *Térmica* (azul→vermelho) e *Espécie* (tom da espécie); normalização relativa+absoluta; persistida em `localStorage`.
- Bayesian-ensemble (logístico + random forest + prior espacial gaussiano adaptativo)
- Pescaria Ativa com fotos, peso, isca e retomada automática de sessão
- Planejador wizard 6 etapas + exportação Calendar/PDF/GPX
- Chat em tempo real por trecho, gamificação (desafios/badges), leaderboard
- Dashboard de lojistas afiliados e dashboard ambiental (moderador)
- **i18n PT/ES/EN completo**: toda UI localizada — nomes de espécies (`namePt`/`nameEs`/`nameEn` via `spName()`), bottom-nav, drawer, dropdown de espécies, seletor de local (tipos de curso), **popups do mapa completamente localizados** (tipo de curso, país, qualidade, categorias de APAs/SNAP, relevância de pesca, lei de proteção), recomendações preditivas (`mlInsights.js`), score de pesca + pressão barométrica (`WeekForecastWidget`), formato de datas, meses e estações
- **Light mode / Dark mode** completo com CSS variables, tile layer condicional e toggle na topbar
- **FishID**: identificação de espécie por foto (TF.js + iNaturalist + base interna)
- **Comunidade**: feed social com posts, fotos (até 4, compressão automática), perfis, seguidores, grupos
- **Login OAuth**: Google e Facebook ativos; e-mail com confirmação via Resend.com
- **Pescademia**: vídeos YT/Twitch/Vimeo, e-books, artigos, cursos com capítulos e **progresso automático nas 3 plataformas** (YouTube via `infoDelivery`, Vimeo via `postMessage timeupdate`, Twitch via timer heurístico)
- **Busca de local** no iniciador de pescaria (case e accent-insensitive)
- **Mobile responsivo**: safe-area, bottom-nav com 6 botões i18n, drawer lateral, FAB, touch targets 44px, modais como bottom-sheets, botões admin ocultos no mobile
- **Recomendações preditivas** (`PredictiveAlerts` + `mlInsights`): análise sazonal, mês ideal, troféu, oportunidade climática — textos PT/ES/EN
- **Grid customizável** de painéis analíticos (`DraggableGrid`) com persistência de layout
- **Filtros temporais** por estação/mês (`TemporalFilter`)
- **Tributários por país**: dados pré-divididos por país (UY/AR/BR) carregados sob demanda via manifesto
- **Login prompt**: qualquer ação na Comunidade sem autenticação abre o `AuthModal`
- **Notificações in-app Comunidade**: toast em tempo real (Supabase Realtime) + painel para curtidas, comentários, seguidores e @menções
- **@Mention nos comentários**: autocomplete ao digitar `@`, highlight de menções, notificação para o mencionado
- **Triggers Supabase** (`supabase-triggers-all.sql`): contadores automáticos + notificações via trigger (deduplicadas)
- **Upload de PDFs** na Pescademia: file picker com upload direto ao bucket `academy-pdfs` (Supabase Storage)
- **Certificado de conclusão** de curso (PDF via `window.print()`): botão ao atingir 100% de progresso
- **Web Push completo**: hook `usePushNotifications`, botão Bell/BellOff na topbar, tabela `push_subscriptions`, Edge Function `send-push` deployada, secrets VAPID configurados — pronto para envio de notificações
- **Plano Premium (infraestrutura completa)**: tabelas `plans`, `user_subscriptions`, `invoices`, `stripe_events` — hook `usePremium` — componente `PaywallModal` — aba de assinatura no `UserDashboard` — badge Premium na topbar — preços: R$ 10/mês ou R$ 50/ano (58% economia) / $80 UYU mensal ou $400 UYU anual / US$ 2 mensal ou US$ 10 anual — **detecção automática de moeda** (BRL/UYU/USD) com dropdown para troca
- **Plano Premium (guards implementados)**: heatmap histórico por mês/estação (guard no TemporalFilter com badge Premium) — conteúdo exclusivo Pescademia (guard nos cards com badge Premium) — paywall funcional
- **Áreas protegidas cientes de região**: 21 áreas SNAP do Uruguai (polígonos georreferenciados) + **101 UCs oficiais do CNUC/MMA no RS** (federais, estaduais e municipais) via `protected_areas_<país>.json`, com nota de pesca por grupo (Proteção Integral / Uso Sustentável)
- **i18n popups do mapa completo**: todos os labels das APAs (Parque Nacional, Paisagem Protegida, Monumento Natural, Área de Manejo, Reserva de Recursos, Zona de Captação), país, relevância de pesca e lei de proteção — localizados PT/ES/EN
- **Modelo barométrico**: `pressureBonus()` integrado em `calculateProbability()` — `pressureSensitivity` por espécie (Pejerrey 0.9 · Dourado 0.85 · Boga 0.7 · Tararira 0.5 · Mojarra 0.4 · Bagre 0.3); previsão 7 dias inclui `surface_pressure_mean` com tendência diária; `WeekForecastWidget` exibe pressão + tendência colorida no painel de detalhes
- **Relatórios Preditivos Premium** (`src/FishingReports.jsx`): espécies favoritas, configuração de endereço residencial + raio (25/50/100/200 km), relatórios mensais (todo dia 1) e semanais (toda segunda-feira) com melhores dias por espécie (score = clima + pressão + temperatura) e locais sugeridos dentro do raio; geração sob demanda; guard Premium; tabelas `favorite_species`, `user_report_settings`, `fishing_reports` (SQL em `supabase-fishing-reports.sql`); **Edge Function `generate-fishing-report` deployada** com `--no-verify-jwt`; agendamento automático via **cron-job.org** (mensal `0 6 1 * *` · semanal `0 6 * * 1`); secret `CRON_SECRET=pesca_cron_2026_kjgq` configurado no Supabase
- **Calculadora de Nó e Linha** (`src/KnotCalculator.jsx`): 3 entradas (tipo de linha, diâmetro, nó); calcula resistência nominal da linha (kg) e resistência real do nó após perda; barra visual de retenção (%); dificuldade, uso indicado e passo-a-passo recolhível para 6 nós (Palomar, Clinch, Uni, Albright, FG Knot, Loop duplo); i18n PT/ES/EN; card na página principal
- **Calculadora de Bóia e Chumbada** (`src/BuoyCalculator.jsx`): 7 variáveis de entrada (espécie, peso estimado, correnteza, profundidade, ambiente, isca, técnica); recomenda tipo e gramatura de chumbada (torpedo/pêra/oval/redonda), tipo e capacidade da bóia (waggler/palito/corrediça/sem bóia), diâmetro e resistência da linha, número de anzol e comprimento do baixeiro; 2 dicas contextuais explicativas; i18n PT/ES/EN; card recolhível na página principal

### 🔄 Próximos passos (roadmap)

> **Foco atual:** RS e SC entregues com dados oficiais. O seletor geográfico comporta os 27 estados. Duas frentes em paralelo: **escalar territorialmente** e **fechar o gap visual com os concorrentes** (ver `docs/ANALISE-CONCORRENCIA.md`).

#### 🥇 Alta prioridade — diferencial visual (estilo Windy, sobre o nosso heatmap)

- [x] **Camadas ambientais no mapa** (estilo Windy): seletor "Ambiente" com **Temp. água · Vento · Pressão** — campo contínuo por gradiente radial (`EnvCanvasLayer`, config-driven em `ENV_LAYERS`), legenda kind-aware; o vento ainda desenha **setas de direção**. Grade Open-Meteo (1 chamada multi-coordenada) recortada à fronteira; não-interativas (rios seguem clicáveis por cima).
- [x] **Porte como coloração da rede**: modo `riverColorBy='order'` colore por **ordem de Strahler** (`nustrahler`) — cabeceiras finas/apagadas → troncos grossos/vivos. (Bug corrigido: o campo gravava `nuordemcda`, hierárquico invertido, que destacava cabeceiras como troncos; ver "campo order = Strahler" abaixo.)
- [x] **Legenda do heatmap país-ciente (bacias)**: a seção "Bacias Hidrográficas" do `MapLegend` agora vem de `BASINS_BY_COUNTRY[selectedCountry]` (RS mostra Uruguai/Jacuí/Mirim/Vertente). _Resta_ tornar país-ciente a seção de áreas protegidas (SNAP→CNUC).
- [x] **Slider de tempo (camadas ambientais)**: `fetchEnvGrid` busca a série horária 48h; slider na legenda varre o forecast recolorindo o campo (e as setas de vento). _Estendido também ao heatmap de espécie (ver abaixo)._
- [x] **Timeline de "bite time"** (`BiteTimeTimeline`): atividade horária 48h por local/espécie (crepúsculo + lua + pressão + vento + nuvens), com melhores janelas e marcador "agora".
- [x] **Vento animado (partículas, estilo Windy)**: `WindParticlesLayer` adveca partículas pelo campo de vento (interpolado em pixels) com rastro que desvanece, por cima do campo de cor. Substitui as setas estáticas. (Animação só roda em navegador visível — o preview headless pausa o `requestAnimationFrame`.)
- [x] **Slider de tempo no heatmap de espécie** (re-score por hora): toggle "⏱ Hora" na legenda do heatmap busca a série climática 48h horária (`fetchHeatHourly`, centro da região) e re-scora a probabilidade hora a hora; `effectiveClimate` alimenta os três memos de scoring, com `useDeferredValue` para arraste fluido. Funciona em RS, UY e rios extras.
- [x] **Legenda do heatmap (cores)**: o `MapLegend` agora reflete o gradiente real da paleta (antes mostrava verde→vermelho fixo que não batia com o render). Toggle Térmica/Espécie na legenda do mapa.
- [x] **Vazão dinâmica (GloFAS)** nos troncos: modo `riverColorBy='discharge'` (menu "💧 Vazão (GloFAS)") colore os rios-tronco (Strahler ≥ 6) pela **anomalia atual÷média do mês** do GloFAS/Open-Meteo Flood (vermelho=seca, ciano=normal, azul=cheia), com a malha menor esmaecida. Snap à célula-canal de ~5 km por busca do ponto de maior vazão ao longo do rio (`fetchRiverDischarges`). Verificado: Uruguai 896, Jacuí 386, Pelotas 325 m³/s. _Cabeceiras/sangas (~80% dos trechos) não têm série GloFAS — por isso é só nos troncos._

#### 🥇 Alta prioridade — escalar territorialmente

- [ ] **Unificar os scripts de hidrografia num único `build_hydrography.mjs <uf>`** (`docs/EXPANSAO-ESTADOS.md` §8): hoje `build_rs_hydrography.mjs` e `build_sc_hydrography.mjs` repetem ~90% do código (mudam só bbox, bacias, `classifyTerminal` e `BASIN_MIN_STRAHLER`). Parametrizar evita duplicação no 3º estado. (Já feito: `build_protected_areas.mjs <uf>`, `build_sc_boundary.mjs`, e os branches do app passaram a usar `/^BR-/`.)
- [x] **Paraná (BR-PR, codarea 41)** — expansão completa: fronteira (IBGE) + hidrografia (BHO, 67.825 trechos em 2 bacias: Paraná + Vertente Atlântica) + 108 UCs (CNUC) + catálogo de espécies (regions += BR-PR) + legislação (piracema da Bacia do Paraná, ~nov–fev, IAT-PR/IBAMA) + clicável no seletor geográfico.
- [ ] **Áreas protegidas do Uruguai no modelo region-aware**: migrar o `SNAP_AREAS` inline para `protected_areas_uy.json` (mesmo formato do RS/SC), unificando a camada legal.

#### 🥈 Média prioridade — qualidade e produto

- [x] **Bug: acúmulo de rios ao trocar de país rapidamente** — loads de hidrografia concorrentes agora abortam por token de geração (`_trib.loadToken`), evitando somar trechos de UY+RS.
- [ ] **Expansão Argentina**: Río Paraná (Corrientes, Entre Ríos), baixo Río Uruguay, Delta — dados oficiais (IGN/INA) ou HydroSHEDS como fallback; espécies Dorado, Surubí, Pacú, Manguruyú.
- [ ] **Onboarding pelo seletor geográfico**: usar o mapa de seleção como tela de boas-vindas para novos usuários (primeira escolha de região guiada).
- [ ] **API pública para pesquisadores**: OpenAPI documentada via Supabase Edge Functions (rate-limit, auth por token).

#### 🥉 Baixa prioridade / Futuro

- [ ] **App nativo**: Capacitor (wrapper PWA) ou React Native — push nativo, câmera nativa, offline completo
- [ ] **Login social Apple**: requer Apple Developer Account ($99/ano)
- [ ] **Localizar UI admin**: StoreAdmin, EnvironmentalDashboard, IoTAdmin (baixo impacto — uso interno)
- LSTM (`src/lstm.js` pronto — ativa com ≥30 capturas/espécie; inativo por falta de dados)
- Sensores ESP32 físicos (infraestrutura IoT pronta no Supabase)
- Integração Strava/Komoot para GPX de rotas de acesso ao local de pesca

#### ✅ Concluído recentemente (jun/2026)

- [x] **Expansão Paraná (BR-PR)**: hidrografia oficial (67.825 trechos, 2 bacias: Paraná + Vertente Atlântica), 108 UCs CNUC, espécies (regions += BR-PR) e legislação (piracema da Bacia do Paraná); clicável no seletor. Novo `build_boundary.mjs <UF>` parametrizado.
- [x] **Campo `order` = Strahler (correção)**: `build_rs/sc_hydrography.mjs` passou a gravar `nustrahler` (tronco = ordem alta) em vez de `nuordemcda` (hierárquico invertido). Conserta o Porte (destacava cabeceiras como troncos) e destrava o GloFAS. **RS e SC regenerados** (só o campo `order`, geometria idêntica; Uruguai/Iguaçu maxOrder 9, Pelotas/Canoas 8)
- [x] **Vazão dinâmica GloFAS** nos troncos (anomalia atual÷média; snap à célula-canal) + **legenda país-ciente das bacias** + **slider de tempo no heatmap**
- [x] **Heatmap de espécies — upgrade visual + RS**: duas paletas alternáveis (Térmica/Espécie) com glow e normalização relativa+absoluta; legenda alinhada à paleta; **passou a renderizar nos rios do RS** (corrigido o memo preso por mutação in-place do `_trib.data` + match de ids compostos BR; teto de 2500 segmentos)
- [x] **Vento animado (partículas estilo Windy)**: `WindParticlesLayer` advecta partículas pelo campo de vento, substituindo as setas estáticas
- [x] **Porte/vazão (coloração por ordem)**: escala remapeada para a faixa 2–7 com rampa multi-matiz e largura/opacidade por ordem; seleção de bacias persistida (não reativa todas ao desligar)
- [x] **Expansão Santa Catarina (BR-SC)**: hidrografia oficial (168.433 trechos, 2 bacias), 179 UCs CNUC, legislação (piracema + tainha) e espécies; clicável no seletor geográfico
- [x] **Hidrografia oficial RS** (ANA BHO 2017, 43.522 trechos, 4 bacias, recorte IBGE) + render por bacia
- [x] **Hidrografia oficial UY** (DINAGUA, 6 bacias) substituindo o MVP do Santa Lucía
- [x] **Áreas protegidas RS** (101 UCs CNUC) + **legislação de pesca ciente de região**
- [x] **Catálogo de espécies ciente de país** (vedas granulares; exóticos do RS)
- [x] **Seletor geográfico no mapa** (mundo → país → estado; 27 estados do Brasil)
- [x] **Notificações push reais** (`check-fishing-conditions` via cron-job.org)
- [x] **Tabela `planned_trips`** (RLS + índices + trigger)
- [x] **Relatórios preditivos**: compartilhamento (Web Share), mapa de locais sugeridos, histórico climático 30d
- [x] **Dados oficiais DINAMA/MVOTMA** (`ingest-dinama`, score 0–100, `water_quality`)
- [x] **Calculadoras** de Nó/Linha e de Bóia/Chumbada (i18n PT/ES/EN)

## Estrutura de arquivos relevante (`src/`)

| Arquivo | Responsabilidade |
|---|---|
| `main.jsx` | Componente raiz, mapa, sidebar, heatmap, ocorrências, sessão, popups |
| `i18n.jsx` | Contexto de idioma, hook `useT()`, `useLang()`, traduções PT/ES/EN |
| `model.js` | Bayesian-ensemble: logístico + random forest + prior gaussiano |
| `mlInsights.js` | Recomendações preditivas sazonais (i18n PT/ES/EN) |
| `lstm.js` | Infraestrutura LSTM (inativo — threshold ≥30 capturas) |
| `storage.js` | IndexedDB + localStorage + export/import JSON |
| `supabase.js` | Cliente Supabase, CRUD, auth, Realtime |
| `fishid.js` | Pipeline FishID: TF.js + iNaturalist + base interna |
| `waterQuality.js` | Heurística + crowdsourcing de qualidade da água |
| `styles.css` | Estilos globais, CSS vars dark/light, mobile responsive |
| `FishingPlanner.jsx` | Wizard 6 etapas + pescaria ativa |
| `SocialFeed.jsx` | Feed social: posts, likes, comentários, perfis, grupos |
| `Pescademia.jsx` | Academia: vídeos, e-books, cursos com capítulos e progresso |
| `UserDashboard.jsx` | Área pessoal: pescarias, histórico, perfil |
| `FishIDModal.jsx` | Modal de identificação por foto (i18n) |
| `PredictiveAlerts.jsx` | Recomendações preditivas personalizadas (i18n) |
| `CustomAlerts.jsx` | Alertas personalizados por espécie/trecho com guard Premium |
| `FishingReports.jsx` | Relatórios preditivos Premium: favoritos, configuração de raio/endereço, relatórios mensais e semanais |
| `WeekForecastWidget.jsx` | Previsão 7 dias com score localizado |
| `DraggableGrid.jsx` | Grid de painéis com drag-and-drop |
| `GearRecommendation.jsx` | Equipamentos e iscas recomendadas |
| `BuoyCalculator.jsx` | Calculadora de bóia e chumbada — 7 variáveis, i18n PT/ES/EN |
| `KnotCalculator.jsx` | Calculadora de nó e linha — 6 nós, resistência, passo-a-passo, i18n PT/ES/EN |
| `MapLegend.jsx` | Legenda do mapa (CSS vars) |
| `OnboardingTutorial.jsx` | Tutorial de boas-vindas |
| `TemporalFilter.jsx` | Filtros por estação/mês |
| `StatsDashboard.jsx` | KPIs e gráficos de capturas |
| `HourlyRanking.jsx` · `MonthlyRanking.jsx` | Rankings por hora e por mês |
| `BestTimePrediction.jsx` | Melhor horário por espécie/trecho |
| `CaptureValidation.jsx` | Validação de peso/tamanho vs. regulamentação |
| `CorrelationAnalysis.jsx` | Correlação IoT × capturas |
| `LunarTides.jsx` | Fase lunar e marés |
| `RiverChat.jsx` | Chat em tempo real por trecho |
| `Challenges.jsx` | Desafios semanais + leaderboard |
| `TrendChart.jsx` | Gráfico de tendência temporal Canvas 2D |
| `PdfExport.jsx` | Exportação PDF e GPX |
| `SocialShare.jsx` | Compartilhamento via Web Share API |
| `AuthModal.jsx` | Modal de autenticação |
| `UserProfile.jsx` | Estatísticas e badges de conquista |
| `EnvironmentalDashboard.jsx` | Dashboard ambiental (moderador) |
| `StoreAdmin.jsx` | Dashboard de lojistas afiliados |
| `IoTSensors.jsx` · `IoTAdmin.jsx` | Sensores IoT e administração |
| `ChatBadges.jsx` | Badges do chat em tempo real |
| `FishIcon.jsx` | Ícones SVG de espécies |
| `PaywallModal.jsx` | Modal de assinatura Premium com 3 moedas (BRL/UYU/USD) |
| `usePremium.js` | Hook de status Premium + checkout Stripe + guard helper |
| `supabase-subscriptions.sql` | Schema SQL: tabelas `plans`, `user_subscriptions`, `invoices`, `stripe_events` |

### Pipeline de dados geográficos (`scripts/` + `public/` + `docs/`)

| Arquivo | Responsabilidade |
|---|---|
| `scripts/build_rs_boundary.mjs` · `build_sc_boundary.mjs` | Fronteira oficial do estado (IBGE malhas v3, codarea 43=RS / 42=SC) → `public/<uf>_boundary.json` |
| `scripts/build_rs_hydrography.mjs` · `build_sc_hydrography.mjs` | Hidrografia do estado (ANA BHO 2017): classifica por fluxo, recorta à fronteira, simplifica → `public/trib_<uf>_*.json` |
| `scripts/build_uy_boundary.mjs` · `build_uy_hydrography.mjs` | Fronteira e hidrografia do Uruguai (DINAGUA WFS) → `public/uy_boundary.json`, `trib_uy_*.json` |
| `scripts/build_protected_areas.mjs <uf>` | UCs do CNUC/MMA (shapefile) → `public/protected_areas_<uf>.json` (RS=101, SC=179) |
| `scripts/build_br_geo.mjs` | Silhueta nacional + 27 estados (IBGE) → `public/br_boundary.json`, `public/br_states.json` |
| `scripts/gpkg_geom.mjs` | Parser WKB/GPB do geopackage (genérico, usado pela hidrografia) |
| `public/trib_manifest.json` | Mapeia país/estado → arquivos de bacia (carregados sob demanda) |
| `docs/EXPANSAO-ESTADOS.md` | **Guia reproduzível para adicionar novos estados** (pipeline + armadilhas) |
| `CONTEXT.md` | Contexto enxuto para agentes de IA (como rodar, estado do RS, arquivos-chave) |

### 📝 Legenda
- ✅ Implementado · 🔄 Planejado · ⏸️ Adiado
- 🚫 Veda absoluta · ⚠️ Regulamentada · 🔵 Vulnerável · 🌿 Invasora

---

### 📊 Progresso Detalhado
Para histórico completo de desenvolvimento, status atual e próximos passos, consulte:  
📄 **`PROGRESS.md`** — Documento de progresso mantido atualizado a cada sessão.
