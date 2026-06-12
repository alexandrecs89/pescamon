# Pescamon - Progresso do Projeto

**Data da última sessão:** 12 de junho de 2026  
**Status:** Hidrografia oficial (RS + UY) + conformidade legal + seletor geográfico no mapa. Expansão para SC em andamento. 🗺️

> Para a descrição completa de funcionalidades, ver o **README.md** (mantido alinhado). Este arquivo foca no histórico de sessões e nos detalhes operacionais (Stripe, Edge Functions, como retomar).

---

## 🗺️ Sessões recentes (jun/2026) — dados oficiais e expansão

- **Hidrografia oficial RS** (ANA BHO 2017): 43.522 trechos classificados por fluxo em 4 bacias, recortados à fronteira IBGE; render estável por pool de canvas por bacia. Scripts `build_rs_boundary.mjs` + `build_rs_hydrography.mjs`.
- **Hidrografia oficial UY** (DINAGUA WFS): cursos `c257` + cuencas Nível 1 `c097` → 6 bacias; substitui o MVP do Rio Santa Lucía. Scripts `build_uy_boundary.mjs` + `build_uy_hydrography.mjs`.
- **Conformidade legal ciente de região**: 101 UCs do CNUC/MMA no RS (`build_protected_areas.mjs` → `protected_areas_rs.json`) + 21 áreas SNAP do UY; vedas/defeso por região (`VEDAS` com campo `region`; `FISHING_LAW_NOTE`).
- **Catálogo de espécies ciente de país** (50 espécies): exóticos do RS só no Brasil; vedas granulares por espécie (piracema IBAMA IN 193/2008; tainha/bagre regulados).
- **Seletor geográfico no mapa** (`<GeoPicker>`): mundo → país → estado; Brasil e Uruguai clicáveis; 27 estados do Brasil desenhados (RS clicável). Dados via `build_br_geo.mjs` (`br_boundary.json`, `br_states.json`). Lembra a última região.
- **Em andamento:** expansão para **Santa Catarina (BR-SC)** seguindo `docs/EXPANSAO-ESTADOS.md` (fronteira IBGE codarea 42 → hidrografia BHO → UCs CNUC → legislação → espécies → habilitar no seletor).

Branch de trabalho: `feat/hidrografia-oficial-areas-protegidas` (PR #1).

---

## ✅ Funcionalidades Implementadas

### Plano Premium (100% funcional)
- ✅ Infraestrutura completa: tabelas `plans`, `user_subscriptions`, `invoices`, `stripe_events`
- ✅ RLS policies configuradas
- ✅ Hook `usePremium` para verificação de status
- ✅ Componente `PaywallModal` com 3 moedas (BRL, UYU, USD)
- ✅ Guards implementados:
  - Heatmap histórico (TemporalFilter)
  - Conteúdo exclusivo Pescademia
  - Alertas personalizados por espécie/trecho (max 2 free / ilimitado Premium)
- ✅ Traduções i18n (PT/ES/EN) na seção de assinatura
- ✅ Edge Functions deployadas:
  - `create-checkout-session` (checkout Stripe)
  - `stripe-webhook` (processa eventos de pagamento)
- ✅ Integração Stripe completa funcionando

### Custom Alerts (Alertas Personalizados)
- ✅ Componente `CustomAlerts.jsx` criado
- ✅ Tabela `custom_alerts` no Supabase
- ✅ CRUD completo (criar, listar, ativar/desativar, deletar)
- ✅ Integração na sidebar do main.jsx
- ✅ Badge "Ativo!" quando probabilidade supera threshold
- ✅ Limite de 2 alertas para usuários free

### Mapa e APAs
- ✅ Polígonos precisos para todas as 21 APAs do Uruguai
- ✅ Categorias de áreas protegidas com cores e ícones
- ✅ MapLegend atualizado

### Internacionalização
- ✅ Sistema i18n completo (PT/ES/EN)
- ✅ Traduções na seção Premium do UserDashboard
- ✅ Suporte a múltiplas moedas com detecção automática de país

---

## 🔧 Configuração Stripe (Ativa)

### Produtos Criados
1. **Plano Brasil**
   - Mensal: R$ 10,00 → `price_1Tbue0JuvJb759txIgVSOxvd`
   - Anual: R$ 50,00 → `price_1Tbv3zJuvJb759txzPGYNHo4`

2. **Plan UY**
   - Mensal: $80 UYU → `price_1TbuhSJuvJb759txE4q7NHLc`
   - Anual: $400 UYU → `price_1Tbv5FJuvJb759txswdjI0xn`

### Secrets Configurados no Supabase
| Secret | Valor |
|--------|-------|
| `STRIPE_SECRET_KEY` | _(redigido — ver painel do Stripe/Netlify; não versionar segredos)_ |
| `STRIPE_WEBHOOK_SECRET` | Configurado no Stripe Dashboard |
| `APP_SUPABASE_URL` | `https://kjgqtvmoujrlhmxlehwz.supabase.co` |
| `APP_SERVICE_ROLE_KEY` | Service role key do projeto |

### Webhook Stripe
- **URL:** `https://kjgqtvmoujrlhmxlehwz.supabase.co/functions/v1/stripe-webhook`
- **Events:** `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## 📋 Próximos Passos (Pendentes)

> Roadmap detalhado no **README.md** (seção "Próximos passos").

### Alta Prioridade — escalar territorialmente
1. **Generalizar os scripts e o app** antes de fechar o 2º estado (remover hardcode "RS": `isPointInRS`, parâmetros de bacia/Strahler) → `build_boundary.mjs <uf>` / `build_hydrography.mjs <uf>` (ver `docs/EXPANSAO-ESTADOS.md` §8).
2. **Santa Catarina (BR-SC)** — estado-piloto da nova esteira (EM ANDAMENTO).
3. **Áreas do Uruguai no modelo region-aware** (`protected_areas_uy.json`).

### Média Prioridade
4. **Bug**: acúmulo de rios ao trocar de país rapidamente (cancelar fetches em voo).
5. **Argentina**: Río Paraná / baixo Uruguay (IGN/INA ou HydroSHEDS fallback).
6. **API pública** para pesquisadores (OpenAPI via Edge Functions).
7. **App nativo** (Capacitor / React Native).

### Baixa Prioridade
8. **Login social Apple**, localizar UI admin, LSTM, IoT ESP32, Strava/Komoot.

---

## 🔑 Arquivos Importantes

### Edge Functions (Supabase)
- `supabase/functions/create-checkout-session/index.ts` - Checkout Stripe
- `supabase/functions/stripe-webhook/index.ts` - Webhook (pública, --no-verify-jwt)
- `supabase/functions/send-push/index.ts` - Push notifications

### Componentes React
- `src/CustomAlerts.jsx` - Alertas personalizados
- `src/PaywallModal.jsx` - Modal de assinatura
- `src/UserDashboard.jsx` - Dashboard com aba Premium
- `src/usePremium.js` - Hook de verificação Premium

### Schema SQL
- `supabase-subscriptions.sql` - Tabelas de assinatura e alertas

### Config
- `.env.netlify` - Variáveis de ambiente

---

## 🚀 Como Retomar o Projeto

### 1. Clone o repositório
```bash
git clone <repo-url>
cd windsurf-project
```

### 2. Instale dependências
```bash
npm install
```

### 3. Configure variáveis de ambiente
Copie `.env.netlify` para `.env` e verifique as credenciais do Supabase.

### 4. Deploy Edge Functions (se necessário)
```bash
npx supabase functions deploy create-checkout-session --project-ref kjgqtvmoujrlhmxlehwz
npx supabase functions deploy stripe-webhook --project-ref kjgqtvmoujrlhmxlehwz --no-verify-jwt
```

### 5. Verifique Secrets no Supabase
Acesse Supabase Dashboard → Secrets e confirme:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `APP_SUPABASE_URL`
- `APP_SERVICE_ROLE_KEY`

### 6. Execute o app
```bash
npm run dev
```

---

## 📊 Estatísticas do Projeto
- **Total de commits:** [ver git log]
- **Funcionalidades Premium:** 3 guards ativos
- **Preço mensal BR:** R$ 10,00
- **Preço anual BR:** R$ 50,00 (58% economia)
- **Preço mensal UY:** $80
- **Preço anual UY:** $400

---

## 🎯 Meta de Receita
Com 100 assinantes Premium anuais:
- Brasil: 100 × R$ 50 = R$ 5.000/ano
- Uruguai: 100 × $400 = $40.000 UYU/ano

---

## 📞 Contatos e Links
- **Supabase Project:** `kjgqtvmoujrlhmxlehwz`
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Site:** https://pescamon-app.netlify.app
- **Domínio:** pescamon.com.br

---

## 📝 Notas para Futuras Sessões

**Sempre que concluir uma funcionalidade:**
1. ✅ Atualizar este arquivo PROGRESS.md
2. ✅ Atualizar README.md com status
3. ✅ Fazer commit das alterações
4. ✅ Testar em produção (se aplicável)

**Arquitetura de Preços:**
- Usuários são criados com plano `free` automaticamente (trigger)
- Upgrade para `premium` via Stripe Checkout
- Webhook atualiza `user_subscriptions` com `status=active`
- Guards verificam `isPremium` via hook `usePremium`

**Variáveis de ambiente obrigatórias:**
```
VITE_SUPABASE_URL=https://kjgqtvmoujrlhmxlehwz.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
```

---

**Última atualização:** 12/06/2026 por Alexandre  
**Status:** 🟢 Pagamento operacional · 🗺️ Dados oficiais RS+UY · 🚧 Expansão SC em andamento

🎣 **Pescamon - A inteligência artificial da pesca!**
