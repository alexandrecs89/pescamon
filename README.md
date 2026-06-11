# Pescamon

**Plataforma web de apoio à pesca esportiva no Cone Sul.** Cobre toda a hidrografia do Uruguai e do Rio Grande do Sul (BR) — rios interiores, bacia do Río Negro, Jacuí, Lagoa dos Patos, litoral norte do Río Uruguay, rios orientais da ecorregião Laguna dos Patos/Mirim, lagoas costeiras atlânticas — com expansão em curso para demais estados brasileiros e Argentina.

**Estado atual (maio 2026):** aplicação em produção em [pescamon.com.br](https://pescamon.com.br) / [pescamon-app.netlify.app](https://pescamon-app.netlify.app). Última sessão de desenvolvimento: 31/05/2026.

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

| Fonte | Conteúdo |
|---|---|
| `public/export.geojson` | Traçado do Rio Santa Lucía (OSM relation 2736318) |
| `public/tributarios.geojson` | ~614 afluentes da bacia do Santa Lucía |
| `public/trib_*_UY/AR/BR.json` | Tributários por bacia e país (carregados sob demanda) |
| `public/trib_manifest.json` | Manifesto bacia → arquivos por país |
| Overpass API | Geometria de EXTRA_RIVERS (46 corpos d'água adicionais) |

**Segmentação morfológica** (`buildMorphologicalSegments`): cada linha é dividida individualmente — nunca concatenadas entre si — em segmentos respeitando comprimento mínimo/máximo e ângulo de curvatura, parametrizados por tipo de curso (rio, arroio, canal, cañada, quebrada, lagoon, estuário).

**Seletor hierárquico de local**: dropdown com 11 macro-regiões do Uruguai, ordenadas por distância do usuário. Cada região expande sua lista de cursos. Clicar em um curso faz o mapa voar (`flyToBounds`) para cobrir todo o traçado.

**Localização do usuário**: o mapa inicializa centrado na posição real do usuário (via `navigator.geolocation`); fallback para coordenada central do Uruguai se negado.

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

## Espécies cadastradas (47 espécies)

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
- Tabela `planned_trips` precisa ser criada no Supabase para persistir pescarias planejadas em produção.
- LSTM inativo por falta de volume de dados (threshold: ≥30 capturas/espécie).

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

## Status (maio 2026)

### ✅ Implementado e estável

- Deploy Netlify + domínio `pescamon.com.br` + SSL automático
- Build Vite com code splitting (~906 kB JS, ~120 kB CSS)
- PWA com service worker e cache offline
- **46 corpos d'água** + **~614 afluentes** + tributários por bacia/país (UY/AR/BR)
- **11 macro-regiões** do Uruguai com seletor hierárquico por distância
- **47 espécies** com perfis ecológicos, conservação CARU/DINARA, vedas e tamanhos mínimos
- **Heatmap morfológico completo**: bandas laterais (`lateralProfile`) em **todos** os cursos selecionados — Rio Santa Lucía, EXTRA_RIVERS (Rio Negro, Uruguay, etc.) e afluentes. Linhas estáticas somem ao ativar heatmap. Cor sempre derivada da espécie selecionada.
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
- **APAs/SNAP (polígonos precisos)**: todas as 21 áreas protegidas do Uruguai com polígonos georreferenciados realistas (não mais hexágonos genéricos)
- **i18n popups do mapa completo**: todos os labels das APAs (Parque Nacional, Paisagem Protegida, Monumento Natural, Área de Manejo, Reserva de Recursos, Zona de Captação), país, relevância de pesca e lei de proteção — localizados PT/ES/EN
- **Modelo barométrico**: `pressureBonus()` integrado em `calculateProbability()` — `pressureSensitivity` por espécie (Pejerrey 0.9 · Dourado 0.85 · Boga 0.7 · Tararira 0.5 · Mojarra 0.4 · Bagre 0.3); previsão 7 dias inclui `surface_pressure_mean` com tendência diária; `WeekForecastWidget` exibe pressão + tendência colorida no painel de detalhes
- **Relatórios Preditivos Premium** (`src/FishingReports.jsx`): espécies favoritas, configuração de endereço residencial + raio (25/50/100/200 km), relatórios mensais (todo dia 1) e semanais (toda segunda-feira) com melhores dias por espécie (score = clima + pressão + temperatura) e locais sugeridos dentro do raio; geração sob demanda; guard Premium; tabelas `favorite_species`, `user_report_settings`, `fishing_reports` (SQL em `supabase-fishing-reports.sql`); **Edge Function `generate-fishing-report` deployada** com `--no-verify-jwt`; agendamento automático via **cron-job.org** (mensal `0 6 1 * *` · semanal `0 6 * * 1`); secret `CRON_SECRET=pesca_cron_2026_kjgq` configurado no Supabase
- **Calculadora de Nó e Linha** (`src/KnotCalculator.jsx`): 3 entradas (tipo de linha, diâmetro, nó); calcula resistência nominal da linha (kg) e resistência real do nó após perda; barra visual de retenção (%); dificuldade, uso indicado e passo-a-passo recolhível para 6 nós (Palomar, Clinch, Uni, Albright, FG Knot, Loop duplo); i18n PT/ES/EN; card na página principal
- **Calculadora de Bóia e Chumbada** (`src/BuoyCalculator.jsx`): 7 variáveis de entrada (espécie, peso estimado, correnteza, profundidade, ambiente, isca, técnica); recomenda tipo e gramatura de chumbada (torpedo/pêra/oval/redonda), tipo e capacidade da bóia (waggler/palito/corrediça/sem bóia), diâmetro e resistência da linha, número de anzol e comprimento do baixeiro; 2 dicas contextuais explicativas; i18n PT/ES/EN; card recolhível na página principal

### 🔄 Próximos passos

#### 🥇 Alta prioridade — engajamento e retenção

- [x] **Notificações push reais**: Edge Function `check-fishing-conditions` deployada e agendada via cron-job.org (07:00 UTC)
- [x] **Tabela `planned_trips`**: criada no Supabase com RLS, índices e trigger de `updated_at`
- [x] **Compartilhamento de relatórios**: botão Web Share API com fallback clipboard em cada card de relatório
- [x] **Mapa de locais no relatório preditivo**: ao expandir um relatório, pins roxos (`CircleMarker`) aparecem no mapa para os locais sugeridos; desaparecem ao colapsar

#### 🥈 Média prioridade — produto e monetização

- [ ] **Expansão Argentina**: Río Paraná (Corrientes, Entre Ríos), baixo Río Uruguay, Delta — espécies Dorado, Surubí, Pacú, Manguruyú
- [x] **Expansão Brasil — Rio Grande do Sul**: `BR-RS` ativo no seletor de país; bacias dinâmicas (Jacuí, Lagoa dos Patos, Mirim, Uruguai, Vertente Atlântica); 10 rios/lagoas principais (Lagoa dos Patos, Jacuí, Guaíba, Camaquã, Lagoa Mirim, Ibicuí, Quaraí, Pelotas, Jaguarão, Rio Uruguai RS); tributários reutilizados dos arquivos BR; novos tipos de habitat (`rio_jacui`, `lagoa_patos`, `rio_camaqua`, `arroio_rs`); espécies regionais (corvina, tainha, dourado, crenicichla, gymnogeophagus, austrolebias)
- [x] **Dados oficiais DINAMA/MVOTMA**: Edge Function `ingest-dinama` busca dados das estações automáticas do OAN (Observatório Ambiental Nacional) diariamente às 08:00 UTC; parseia parâmetros (O₂, turbidez, pH, condutividade, temperatura) → score 0–100; upsert em `water_quality` com `source_type=official`; view `water_quality_data` criada para compatibilidade com front-end; tabela `dinama_ingest_log` para auditoria; SQL em `supabase-dinama-ingest.sql`
- [x] **Calculadora de nó e linha**: implementada em `src/KnotCalculator.jsx`
- [x] **Histórico climático no relatório**: gráfico Canvas 30 dias (temperatura máx/mínima, pressão hPa, precipitação) dentro de cada card de relatório preditivo — carregado sob demanda via Open-Meteo
- [ ] **API pública para pesquisadores**: OpenAPI documentada via Supabase Edge Functions (rate-limit, auth por token)

#### 🥉 Baixa prioridade / Futuro

- [ ] **App nativo**: Capacitor (wrapper PWA) ou React Native — push nativo, câmera nativa, offline completo
- [ ] **Login social Apple**: requer Apple Developer Account ($99/ano)
- [ ] **Localizar UI admin**: StoreAdmin, EnvironmentalDashboard, IoTAdmin (baixo impacto — uso interno)
- LSTM (`src/lstm.js` pronto — ativa com ≥30 capturas/espécie; inativo por falta de dados)
- Sensores ESP32 físicos (infraestrutura IoT pronta no Supabase)
- Integração Strava/Komoot para GPX de rotas de acesso ao local de pesca

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

### 📝 Legenda
- ✅ Implementado · 🔄 Planejado · ⏸️ Adiado
- 🚫 Veda absoluta · ⚠️ Regulamentada · 🔵 Vulnerável · 🌿 Invasora

---

### 📊 Progresso Detalhado
Para histórico completo de desenvolvimento, status atual e próximos passos, consulte:  
📄 **`PROGRESS.md`** — Documento de progresso mantido atualizado a cada sessão.
