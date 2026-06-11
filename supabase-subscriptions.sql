-- ============================================================
-- Pescamon — Sistema de Assinaturas Premium (Stripe)
-- Execute no Supabase SQL Editor
-- ============================================================

-- Planos disponíveis (Free e Premium)
CREATE TABLE IF NOT EXISTS public.plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,        -- 'free', 'premium'
  title_pt    text NOT NULL,               -- 'Gratuito', 'Premium'
  title_es    text NOT NULL,               -- 'Gratis', 'Premium'
  title_en    text NOT NULL,               -- 'Free', 'Premium'
  price_monthly_cents  integer,            -- Preço em centavos (ex: 2990 = R$ 29,90)
  price_yearly_cents   integer,              -- Preço anual em centavos
  features    jsonb DEFAULT '[]'::jsonb,    -- Lista de features incluídas
  limits      jsonb DEFAULT '{}'::jsonb,  -- Limites do plano (heatmap_months, alerts_count, etc.)
  stripe_price_id_monthly text,              -- ID do preço no Stripe (mensal)
  stripe_price_id_yearly  text,              -- ID do preço no Stripe (anual)
  is_active   boolean DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Assinaturas dos usuários
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  plan_id             uuid REFERENCES public.plans(id) NOT NULL,
  status              text NOT NULL DEFAULT 'active', -- 'active', 'canceled', 'past_due', 'trialing'
  stripe_customer_id  text,                  -- ID do cliente no Stripe
  stripe_subscription_id text,               -- ID da assinatura no Stripe
  stripe_payment_method_id text,             -- ID do método de pagamento
  current_period_start timestamptz,          -- Início do período atual
  current_period_end   timestamptz,            -- Fim do período atual (renewal)
  cancel_at_period_end boolean DEFAULT false, -- Cancela no fim do período?
  trial_end           timestamptz,           -- Fim do trial (se houver)
  payment_provider    text DEFAULT 'stripe', -- 'stripe', 'mercadopago'
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Histórico de pagamentos/faturas
CREATE TABLE IF NOT EXISTS public.invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  subscription_id     uuid REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  stripe_invoice_id   text,                  -- ID da invoice no Stripe
  amount_cents        integer NOT NULL,     -- Valor em centavos
  currency            text DEFAULT 'brl',    -- Moeda
  status              text NOT NULL,         -- 'paid', 'open', 'void', 'uncollectible'
  invoice_url         text,                  -- URL da fatura no Stripe
  receipt_url         text,                  -- URL do recibo
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Eventos Stripe (webhook log para debug/replay)
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,      -- ID do evento no Stripe (evt_xxxxx)
  event_type      text NOT NULL,             -- 'checkout.session.completed', etc.
  payload         jsonb NOT NULL,            -- Payload completo
  processed       boolean DEFAULT false,     -- Foi processado?
  processed_at    timestamptz,
  error_message   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Plans: todos podem ler planos ativos
CREATE POLICY "Plans readable by all" ON public.plans
  FOR SELECT USING (is_active = true);

-- User Subscriptions: usuário só vê a própria assinatura
CREATE POLICY "Own subscription read" ON public.user_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role pode gerenciar assinaturas (via Edge Functions)
CREATE POLICY "Service manage subscriptions" ON public.user_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Invoices: usuário só vê as próprias faturas
CREATE POLICY "Own invoices read" ON public.invoices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service manage invoices" ON public.invoices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Stripe events: apenas service role
CREATE POLICY "Service manage events" ON public.stripe_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- Functions & Triggers
-- ============================================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para updated_at
DROP TRIGGER IF EXISTS update_subscription_timestamp ON public.user_subscriptions;
CREATE TRIGGER update_subscription_timestamp
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscription_timestamp();

-- Trigger para criar assinatura Free automaticamente no signup
CREATE OR REPLACE FUNCTION create_free_subscription_on_signup()
RETURNS TRIGGER AS $$
DECLARE
  free_plan_id uuid;
BEGIN
  -- Busca o plano Free
  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'free' LIMIT 1;
  
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, free_plan_id, 'active');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger no auth.users
DROP TRIGGER IF EXISTS create_free_subscription_trigger ON auth.users;
CREATE TRIGGER create_free_subscription_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION create_free_subscription_on_signup();

-- ============================================================
-- Seed: Inserir planos padrão
-- ============================================================

INSERT INTO public.plans (name, title_pt, title_es, title_en, price_monthly_cents, price_yearly_cents, features, limits)
VALUES 
  ('free', 'Gratuito', 'Gratis', 'Free', 0, 0, 
   '["heatmap_atual","alertas_basicos","pescademia_gratuito","comunidade","capturas_ilimitadas"]'::jsonb,
   '{"heatmap_months":0,"alerts_count":0,"historical_heatmap":false,"premium_content":false}'::jsonb),
  
  ('premium', 'Premium', 'Premium', 'Premium', 2990, 29900,
   '["heatmap_atual","heatmap_historico","alertas_ilimitados","alertas_personalizados","pescademia_completo","conteudo_premium","api_acesso","suporte_prioritario"]'::jsonb,
   '{"heatmap_months":12,"alerts_count":999,"historical_heatmap":true,"premium_content":true}'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  title_pt = EXCLUDED.title_pt,
  title_es = EXCLUDED.title_es,
  title_en = EXCLUDED.title_en,
  features = EXCLUDED.features,
  limits = EXCLUDED.limits;

-- ============================================================
-- Atualizar Stripe Price IDs (execute após criar produtos no Stripe)
-- Price IDs por país: BR (reais) e UY (pesos uruguaios)
-- ============================================================

-- Adicionar colunas para múltiplos preços por país (se não existirem)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='stripe_price_id_monthly_br') THEN
    ALTER TABLE public.plans ADD COLUMN stripe_price_id_monthly_br text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='stripe_price_id_yearly_br') THEN
    ALTER TABLE public.plans ADD COLUMN stripe_price_id_yearly_br text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='stripe_price_id_monthly_uy') THEN
    ALTER TABLE public.plans ADD COLUMN stripe_price_id_monthly_uy text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plans' AND column_name='stripe_price_id_yearly_uy') THEN
    ALTER TABLE public.plans ADD COLUMN stripe_price_id_yearly_uy text;
  END IF;
END $$;

-- Atualizar Price IDs do Stripe (2 produtos: Brasil e Uruguai)
-- Produto 1: Plano Brasil (10 reais mensal / 50 reais anual)
-- Produto 2: Plan UY (80 pesos mensal / 400 pesos anual)
UPDATE public.plans 
SET stripe_price_id_monthly_br = 'price_1Tbue0JuvJb759txIgVSOxvd',
    stripe_price_id_yearly_br = 'price_1Tbv3zJuvJb759txzPGYNHo4',
    stripe_price_id_monthly_uy = 'price_1TbuhSJuvJb759txE4q7NHLc',
    stripe_price_id_yearly_uy = 'price_1Tbv5FJuvJb759txswdjI0xn'
WHERE name = 'premium';

-- ============================================================
-- Tabela: Alertas Personalizados por Espécie/Trecho
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  species_id      text NOT NULL,              -- ID da espécie
  stretch_id      text NOT NULL,              -- ID do trecho/curso
  threshold       integer DEFAULT 70,         -- Limite de probabilidade (30-95%)
  alert_type      text DEFAULT 'probability', -- 'probability' | 'occurrence'
  is_active       boolean DEFAULT true,     -- Alerta ativo?
  last_triggered  timestamptz,              -- Última vez que disparou
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS: Usuário só vê/gerencia seus próprios alertas
ALTER TABLE public.custom_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own custom alerts" ON public.custom_alerts
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_custom_alerts_user ON public.custom_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_alerts_active ON public.custom_alerts(user_id, is_active) WHERE is_active = true;

-- Fim
