# Marketplace Pescamon — Design & Plano de Implementação

> **Status (jun/2026):** desenho e plano **fechados e validados**; **nenhum código escrito ainda**.
> Recuperado de uma sessão de chat anterior (perdida num format do dispositivo) — agora
> versionado no repositório para ser permanente. O próximo passo era a **Fase 1 (SQL)**.

## Contexto / origem
Primeira parceria comercial fechada: **Taralinea** (marca uruguaia), que vende um produto
específico para pesca de **tarariras** — uma espécie de **chicote** que se prende à linha,
com isca artificial específica + leader. **Não substitui** vara e linha; é um **acessório**.
Esse é o produto-semente do marketplace.

## Princípios do dono (requisitos)
1. O produto do parceiro deve aparecer na **recomendação de equipamento** para a espécie
   correspondente (Tararira → chicote Taralinea), como **acessório** (não substitui vara/linha).
2. **Dashboard admin** para ativar/desativar produto como **destaque** e gerir (CRUD) produtos.
3. **O Pescamon NÃO toca no dinheiro do comprador.** Pagamento vai direto ao lojista; o
   Pescamon coleta **comissão**.
4. Precisa de **confirmação de compra confiável** (não depender de "o lojista me reporta").

## Decisão de pagamento (investigada e fechada)
- **Padrão único = Mercado Pago Split Payments (modo marketplace).** Disponível nos **3 países
  do Pescamon: UY, AR e BR**. Faz **split automático**: dinheiro vai à conta do lojista, a
  **comissão é descontada na hora** (`marketplace_fee`/`application_fee`), e há **webhook** de
  confirmação. O Pescamon nunca segura o dinheiro (lojista é o *collector* / *merchant of record*).
- **Cross-border é regra de negócio, não problema de pagamento.** Não existe rail self-serve de
  baixa responsabilidade para um lojista pequeno do UY receber de comprador BR. Logo: um lojista
  só vende (com checkout) num país onde tenha **conta de recebimento (MP) naquele país**.
  Taralinea → MP **UY** agora (vende a uruguaios); para vender a brasileiros, abre recebimento **BR**.
- **Fallback** cross-border no v1: cupom + link para a listagem ML internacional, ou simplesmente
  ocultar o produto a compradores de fora do país do lojista.
- **dLocal** anotado como opção cross-border "para quando houver volume" (enterprise/B2B) — não no v1.
- **Pix** é obrigatório no adaptador do Brasil (>40% das transações; instantâneo).
- Modelos alternativos descartados como primário: **cupom de atribuição** + **API de Pedidos ML**
  (read-only via OAuth `offline_access read`, sem `write`) — viável mas inferior ao Split, que
  resolve comissão e confirmação automaticamente. Mantidos como fallback/afiliados.

## Arquitetura — marketplace nativo + adaptador de checkout plugável
O **marketplace é nativo e único** (catálogo, carrinho, pedido, confirmação). O **checkout é um
adaptador escolhido pelo país do comprador**, atrás de uma interface padrão. Cada país/provider
novo = um adaptador novo; o núcleo não muda.

```
CheckoutAdapter:
  createCheckout(order, merchantAccount) -> { checkoutUrl, providerRef }
  handleWebhook(payload)                 -> { providerRef, status, paymentId, amounts }
```
MP (Checkout Pro): `createCheckout` cria `/checkout/preferences` **na conta do lojista**
(token do `merchant_account`), com `marketplace_fee` = comissão, `back_urls`, `notification_url`.
Webhook → `handleWebhook` atualiza o `order`.

## Modelo de dados (Supabase) — decisões finais incorporadas
- **`merchants`** — `id · name · slug · logo_url · description · home_country ·
  default_commission_pct · active · contact · created_at` (Taralinea = 1ª linha).
- **`merchant_accounts`** — conta de recebimento **por país** (habilita o checkout):
  `id · merchant_id→ · country (UY/AR/BR) · provider ('mercadopago') · mp_user_id ·
  oauth_status ('connected'/'revoked') · connected_at`. **Tokens OAuth só no servidor**
  (Edge Function), nunca no cliente.
- **`products`** — `id · merchant_id→ · name · description · images[] ·
  product_type ('rig'/'isca'/'vara'/'molinete'/'linha'/'acessorio') · target_species[] ·
  techniques[] · price · currency · featured (bool) · active (bool) · created_at`.
  Chicote Taralinea = `product_type:'rig'`, `target_species:['tararira']`.
  **Decisão: preço único** (`price`+`currency` no produto) — o `product_offers` por país foi **descartado** no v1.
- **`orders`** — cabeçalho: `id · merchant_id · buyer_user_id→ · country · status
  ('pending'|'paid'|'failed'|'refunded') · mp_preference_id · mp_payment_id · commission_pct ·
  commission_amount · total · currency · created_at · paid_at`.
- **`order_items`** — itens do pedido (**multi-itens** no carrinho; **1 pedido por lojista** no checkout,
  pois o MP faz split de 1 marketplace ↔ 1 lojista por pagamento): `id · order_id→ · product_id→ ·
  qty · unit_price`.
- **`marketplace_events`** — funil/analytics (**incluído no v1**): `id · product_id→ · user_id ·
  type ('view'|'click_buy') · country · created_at`.

### Regra de visibilidade
Um produto aparece para um pescador no país **C** **se e somente se**:
`product.active` **E** o lojista tem `merchant_accounts(country=C, status='connected')`.
País do comprador vem de `selectedCountry` (BR-RS/SC/PR → **BR**; UY → **UY**; AR → **AR**).
Sem conta do lojista no país do comprador → produto **não é mostrado** (ou fallback).

## Fluxo (mesma-nação, ex.: pescador UY × Taralinea)
1. **Descoberta** — em `GearRecommendation`, ao selecionar **Tararira**, mostra o chicote (se visível
   no país do comprador). Registra `view`.
2. **Comprar** — cria `order` (pending), registra `click_buy`, chama `adapter.createCheckout` → redireciona ao MP.
3. **Pagamento** — comprador paga no MP; dinheiro vai à conta da Taralinea; comissão descontada no split.
4. **Webhook** — Edge Function valida assinatura → marca `order: paid` → grava `commission_amount` + `mp_payment_id`.
5. **Confirmação** — tela de sucesso + pedido entra no relatório.

## Pontos de UI
- **Dashboard admin** (estende `StoreAdmin.jsx`): gestão de lojistas + botão **"Conectar conta MP por país"**
  (OAuth); CRUD de produtos (upload de foto no Storage, preço/moeda, `target_species`, `product_type`,
  toggles **destaque**/**ativo**); **relatórios** (pedidos pagos, comissão acumulada por lojista/período,
  funil views→cliques→pedidos→pagos).
- **Vitrine** (`GearRecommendation.jsx`): nova seção **"Acessório parceiro"**, filtra `products` pela espécie
  selecionada **e** visíveis no país do comprador, ordenados por `featured`. Card com foto, preço, badge do
  lojista e "Comprar". Texto deixa claro que o chicote **se soma** à vara+linha.

## Segurança / conformidade
- Tokens OAuth do MP **server-side** (Edge Function), criptografados; cliente nunca os vê.
- Webhook valida a assinatura do MP.
- Pescamon **não é o merchant of record** → disclaimer na UI: "o Pescamon recomenda; a venda e o
  pagamento são do lojista".
- **LGPD (BR) / Ley 18.331 (UY):** guardar o **mínimo** do comprador (sem PII desnecessária).

---

## Plano de implementação — MVP (UY · Mercado Pago Split)

**Fase 0 — De-risk + setup externo (antes de qualquer UI).** *Único desconhecido real.*
- Registrar o app **Pescamon no Mercado Pago DevCenter (site UY)** → `client_id`/`secret`, `redirect_uri`.
- **Taralinea conecta a conta MP UY** via OAuth (autorização de marketplace/split). *(ação do lojista)*
- **Sandbox** (test users): criar `preference` com `marketplace_fee`, pagar, confirmar **(a)** dinheiro ao
  lojista, **(b)** comissão descontada, **(c)** webhook com os valores. ✅ só seguir se passar.

**Fase 1 — Camada de dados (Supabase).** ← *próximo passo quando paramos*
- Tabelas + RLS: `merchants`, `merchant_accounts`, `products`, `orders`, `order_items`, `marketplace_events`.
- RLS: catálogo público p/ leitura; `orders` visíveis ao dono (comprador) + admin; tokens OAuth nunca
  expostos ao cliente (só Edge Function); escrita de admin via papel `moderator`.
- Seed: Taralinea + produto chicote (`rig`, `['tararira']`).
- Criar **branch própria** (feature independente; não misturar com o PR da hidrografia). Seguir as convenções
  dos SQLs existentes (RLS, papel `moderator`, grants).

**Fase 2 — Dashboard admin** (estende `StoreAdmin.jsx`): gestão de lojistas + "Conectar conta MP (UY)" (OAuth);
CRUD de produtos (foto no Storage, preço/moeda, `target_species`, `product_type`, toggles destaque/ativo).

**Fase 3 — Vitrine + carrinho + funil:** seção "Acessório parceiro" em `GearRecommendation.jsx` (Tararira →
chicote) com a regra de visibilidade; página/modal de produto; carrinho multi-itens (estado no cliente,
agrupado por lojista); log de `marketplace_events` (`view`, `click_buy`).

**Fase 4 — Checkout (Mercado Pago Split) — núcleo:**
- Edge Function **`create-checkout`**: recebe carrinho (1 lojista) → cria `order`+`order_items` (pending) →
  cria `preference` na conta do lojista com `marketplace_fee` → devolve `checkout_url`.
- Edge Function **`mp-webhook`**: valida assinatura → atualiza `order` (paid/failed) → grava
  `commission_amount` + `mp_payment_id`. Telas de sucesso/erro (`back_urls`).

**Fase 5 — Relatórios + funil:** painel admin com pedidos pagos, comissão acumulada por lojista/período e
funil (views→cliques→pedidos→pagos) a partir de `marketplace_events` + `orders`.

**Fase 6 — Polimento + conformidade:** disclaimer, LGPD/Ley 18.331 (dado mínimo), refresh de token, erros.

**Caminho crítico:** a **Fase 0** trava tudo — se o split do MP UY não se comportar no sandbox, revisitar o
rail antes de investir nas telas.

## Atualização — Fase 1 iniciada (jun/2026)

**Decisão de arquitetura:** ao iniciar a Fase 1, descobrimos que o app **já tem** um sistema de
lojas (`fishing_stores` — uma loja por `user_id`, com whatsapp/telefone/website) e produtos
(`store_products` — `gear_type`, `species_ids[]`, `price_uyu`, `in_stock`), e a vitrine em
`GearRecommendation` já consome `store_products` por espécie (`getProductsForSpecies`). Em vez de
criar `merchants`/`products` do zero (duplicando tudo), **estendemos o existente**:

- **`fishing_stores`** (= merchant) ganha: `slug`, `home_country`, `default_commission_pct`,
  `active`, `featured`.
- **`store_products`** ganha: `price`, `currency`, `product_type`, `featured`, `active`
  (mantém `price_uyu`/`in_stock` por compatibilidade; `price` é backfilled de `price_uyu`).
- **Tabelas novas (só o transacional):** `merchant_accounts` (conta MP por país; tokens OAuth
  **só service_role**, + view `merchant_connection_status` que mostra só o status da própria loja),
  `orders`, `order_items`, `marketplace_events`.

Tudo isso está em **`supabase-marketplace.sql`** (idempotente). RLS: catálogo público p/ leitura;
`orders`/`order_items` visíveis ao comprador e ao dono da loja; tokens nunca expostos ao cliente;
escrita transacional via `service_role` (Edge Functions). O **seed da Taralinea** está no arquivo
**comentado**, aguardando o `auth.users.id` do dono que administrará a marca.

> Nota: a curadoria de destaque é, no v1, **por dono da loja** (RLS por `user_id`). Se Alexandre
> criar a loja Taralinea sob a própria conta, ele controla `featured`/`active`. Um papel de
> **admin de plataforma** (curadoria cross-loja) fica como refinamento futuro.

**Status Fase 1:** ✅ SQL `supabase-marketplace.sql` **executado com sucesso no Supabase**. Falta só
**descomentar/rodar o seed** da Taralinea com o `user_id` real do dono.

**Status Fase 2 (dashboard admin):** ✅ feito em `src/StoreAdmin.jsx`. O CRUD de produtos ganhou
campos de marketplace: `product_type`, `price` + `currency` (UYU/ARS/BRL), toggles **destaque** e
**ativo** (mantém `price_uyu` em sincronia quando a moeda é UYU, p/ a vitrine atual). O formulário da
loja ganhou `slug`, `home_country`, `default_commission_pct`, `active`, `featured` e um painel
**Pagamentos (Mercado Pago)** que mostra o status de conexão por país (lê a view
`merchant_connection_status` via `getMerchantConnections`). O botão "Conectar conta MP" está
**desabilitado** de propósito — depende da Fase 0/4 (app no MP DevCenter + OAuth). i18n PT/ES/EN
adicionado.

**Status Fase 3 (vitrine):** ✅ feito em `src/GearRecommendation.jsx`. Nova seção **"Acessório
parceiro"** por espécie, que mostra os produtos `featured && active` de lojas ativas (ex.: Tararira →
chicote Taralinea), com preço+moeda e botão **Comprar**. O texto deixa claro que o acessório **se soma**
à vara+linha. Funil: loga `view` (uma vez por produto, dedupe via ref) e `click_buy` via
`logMarketplaceEvent` (nova função em `supabase.js`). Como o checkout (Fase 4) não existe, "Comprar"
loga a intenção e mostra "Checkout em breve" + atalho de WhatsApp da loja (fallback). O `buyerCountry`
é passado do `main.jsx` (estados `BR-*` → `BR`). Componente usa PT hardcoded (sem i18n, como o resto
do arquivo). Próximo: **Fase 0** (de-risk externo: app MP DevCenter UY + OAuth Taralinea + teste de
split no sandbox) e então **Fase 4** (Edge Functions `create-checkout` + `mp-webhook`).

## Componentes do app a tocar
- `src/StoreAdmin.jsx` (dashboard admin — estender)
- `src/GearRecommendation.jsx` (vitrine "Acessório parceiro")
- `supabase/functions/create-checkout/` e `supabase/functions/mp-webhook/` (novas Edge Functions)
- Novo SQL (ex.: `supabase-marketplace.sql`)
