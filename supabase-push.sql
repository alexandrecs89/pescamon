-- ============================================================
-- Pescamon — Tabela de Push Subscriptions (Web Push API)
-- Execute no Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own read"   ON public.push_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own insert" ON public.push_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete" ON public.push_subscriptions FOR DELETE USING (auth.uid() = user_id);
-- Service role pode ler para enviar notificações
CREATE POLICY "Service read" ON public.push_subscriptions FOR SELECT TO service_role USING (true);

-- Fim
