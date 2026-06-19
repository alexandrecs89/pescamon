# Marketplace — Fase 0: De-risk do Mercado Pago (roteiro externo)

> **Objetivo:** validar, em **sandbox**, que o **Mercado Pago Split (modo marketplace)** faz o que o
> Pescamon precisa **antes** de construir o checkout (Fase 4): o dinheiro vai ao lojista, a **comissão
> do Pescamon é descontada automaticamente** e chega um **webhook** confiável de confirmação.
>
> Esta fase é **externa** (painéis do Mercado Pago + ação da Taralinea). Quando os 3 critérios de
> aceite no fim passarem, seguimos para a **Fase 4** (Edge Functions `create-checkout` + `mp-webhook`).
>
> **Decisão tomada:** o app é registrado sob a **conta do Pescamon** (o Pescamon é o *marketplace*;
> a Taralinea só autoriza, via OAuth, a conta dela a receber). Ver `docs/MARKETPLACE.md`.

---

## Conceito em 1 parágrafo
No modelo marketplace do Mercado Pago, **a Taralinea é a vendedora (collector)** e o **Pescamon é a
aplicação** que cria o pagamento *em nome dela* e cobra uma taxa (`marketplace_fee`). A Taralinea
**autoriza o app do Pescamon via OAuth** (sem dar senha; revogável). O Pescamon nunca segura o dinheiro
do comprador — o split manda o valor à Taralinea e desconta a comissão na hora.

---

## Passo 1 — Criar o app do Pescamon no Mercado Pago DevCenter (conta Pescamon, site UY)
1. Entrar com a conta **Pescamon** em **https://www.mercadopago.com.uy/developers** → **Suas integrações** → **Criar aplicação**.
2. Tipo de solução: **Pagamentos online**; modelo: **Marketplace** (split/`marketplace_fee`).
3. Anotar as credenciais da aplicação:
   - **Client ID** (= `APP_ID`)
   - **Client Secret**
   - **Access Token de teste** e **Public Key de teste** (aba *Credenciais de teste*).
4. Configurar a **Redirect URI** do OAuth (usada na Fase 4). Por ora aponte para o endpoint que será a
   Edge Function de callback, p.ex.:
   `https://kjgqtvmoujrlhmxlehwz.supabase.co/functions/v1/mp-oauth-callback`
   (a função em si é construída na Fase 4; aqui só registramos a URL).
5. Configurar a **URL de notificações (webhook)** para o evento **payment**, p.ex.:
   `https://kjgqtvmoujrlhmxlehwz.supabase.co/functions/v1/mp-webhook`

**Escopos OAuth necessários:** `offline_access read write`
- `write` é necessário para o app **criar a preferência de pagamento na conta da Taralinea**.
- `offline_access` dá o **refresh token** (mantém o acesso sem novo login).
- `read` para ler pagamentos/pedidos.

---

## Passo 2 — Criar usuários de teste (sandbox)
No DevCenter (ou via API `/users/test_user` com o access token de teste), criar **dois** test users do site **UY**:
- **TEST_VENDEDOR** → simula a **Taralinea** (será o *collector*).
- **TEST_COMPRADOR** → simula o **pescador**.

> Test users têm e-mail/senha próprios e cartões de teste do MP. Nunca usar conta/cartão real no sandbox.

---

## Passo 3 — Conectar o vendedor de teste via OAuth (obter o token da Taralinea-teste)
Simular o que a Taralinea fará em produção:
1. Montar a **URL de autorização**:
   `https://auth.mercadopago.com.uy/authorization?client_id=APP_ID&response_type=code&platform_id=mp&scope=offline_access+read+write&redirect_uri=REDIRECT_URI`
2. Logar como **TEST_VENDEDOR**, autorizar → o MP redireciona para a `redirect_uri` com `?code=...`.
3. Trocar o `code` por tokens (server-side):
   `POST https://api.mercadopago.com/oauth/token`
   body: `client_id`, `client_secret`, `grant_type=authorization_code`, `code`, `redirect_uri`.
   → resposta traz `access_token`, `refresh_token`, `user_id` (o `mp_user_id` do vendedor).
   Esses vão para `merchant_accounts` (country=`UY`, `oauth_status='connected'`), **só no servidor**.

> No sandbox dá para fazer os passos 3.1–3.3 manualmente (navegador + um `curl`/Postman) sem precisar
> da Edge Function pronta — é exatamente o que valida o fluxo antes da Fase 4.

---

## Passo 4 — Teste do split (o coração da Fase 0)
1. Com o **access_token do TEST_VENDEDOR**, criar uma **preference** (Checkout Pro):
   `POST https://api.mercadopago.com/checkout/preferences`
   incluindo:
   - `items` (1 produto de teste, ex.: "Chicote Taralinea", preço X)
   - **`marketplace_fee`** = a comissão do Pescamon (ex.: 10% de X)
   - `back_urls` e `notification_url` (= a URL do webhook do Passo 1.5)
2. Abrir o `init_point` retornado e **pagar como TEST_COMPRADOR** (cartão de teste aprovado).
3. **Verificar os 3 critérios de aceite** ⬇️

### ✅ Critérios de aceite (só seguir para a Fase 4 se TODOS passarem)
- [ ] **(a)** O valor (menos a taxa) foi creditado na conta do **TEST_VENDEDOR** (Taralinea).
- [ ] **(b)** A **`marketplace_fee`** foi descontada/atribuída ao Pescamon (aparece como `application_fee`/`marketplace_fee` no detalhe do pagamento).
- [ ] **(c)** Chegou um **webhook** de `payment` na `notification_url`, e ao consultar
      `GET https://api.mercadopago.com/v1/payments/{id}` o status é `approved` com os valores corretos.

---

## Segredos a guardar (no Supabase, server-side — nunca no cliente)
| Secret | Origem |
|---|---|
| `MP_CLIENT_ID` | App do Pescamon (Passo 1.3) |
| `MP_CLIENT_SECRET` | App do Pescamon (Passo 1.3) |
| `MP_REDIRECT_URI` | URL do callback (Passo 1.4) |
| `MP_WEBHOOK_SECRET` | Assinatura do webhook (config do app) |

(Mesmo padrão dos secrets do Stripe já usados — ver `PROGRESS.md`.)

---

## Checklist do que pedir à Taralinea (produção, depois do sandbox)
1. Ter (ou criar) uma **conta Mercado Pago Uruguai** de vendedor.
2. Clicar no botão **"Conectar conta MP"** que ficará no painel da loja (Fase 4) e **autorizar** o app
   do Pescamon (OAuth) — sem compartilhar senha; pode revogar quando quiser.
3. Confirmar os **dados de recebimento** (a conta MP onde o dinheiro cai).
4. Acordar a **% de comissão** do Pescamon (vai em `fishing_stores.default_commission_pct`).

> Nada disso dá ao Pescamon poder de alterar a loja/estoque/preços da Taralinea — o app só **cria
> cobranças** e **lê pagamentos**. A Taralinea controla e revoga o acesso.

---

## Referências
- Mercado Pago — Split de Pagamentos (visão geral): https://www.mercadopago.com.uy/developers/pt/docs/split-payments/landing
- OAuth (conectar contas de vendedores): https://www.mercadopago.com.uy/developers/pt/docs/security/oauth/introduction
- Checkout Pro — criar preferência: https://www.mercadopago.com.uy/developers/pt/docs/checkout-pro/integrate-preferences
- Webhooks (notificações de payment): https://www.mercadopago.com.uy/developers/pt/docs/your-integrations/notifications/webhooks
- Usuários de teste (sandbox): https://www.mercadopago.com.uy/developers/pt/docs/your-integrations/test/accounts

> ⚠️ Confirme os caminhos exatos das URLs no painel — o Mercado Pago reorganiza a documentação com
> frequência. O fluxo (OAuth do vendedor → preference com `marketplace_fee` → webhook) é estável.
