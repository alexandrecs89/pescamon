-- ============================================================
-- Notificações in-app para a Comunidade
-- Execute no Supabase SQL Editor
-- ============================================================

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.social_notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,           -- destinatário
  actor_id    uuid NOT NULL,           -- quem gerou a notificação
  type        text NOT NULL CHECK (type IN ('like', 'follow', 'comment')),
  post_id     uuid REFERENCES public.social_posts(id) ON DELETE CASCADE,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sn_user    ON public.social_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sn_unread  ON public.social_notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE public.social_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications"   ON public.social_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.social_notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service insert notifications"   ON public.social_notifications FOR INSERT WITH CHECK (true);

-- ── Trigger: like → notificação ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.social_posts WHERE id = NEW.post_id;
  -- Não notifica o próprio usuário
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN RETURN NEW; END IF;
  -- Evita duplicata (like já existente)
  IF NOT EXISTS (
    SELECT 1 FROM public.social_notifications
    WHERE user_id = post_owner AND actor_id = NEW.user_id
      AND type = 'like' AND post_id = NEW.post_id
  ) THEN
    INSERT INTO public.social_notifications(user_id, actor_id, type, post_id)
    VALUES (post_owner, NEW.user_id, 'like', NEW.post_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_like ON public.social_likes;
CREATE TRIGGER trg_notify_like
  AFTER INSERT ON public.social_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

-- ── Trigger: follow → notificação ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.following_id = NEW.follower_id THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.social_notifications
    WHERE user_id = NEW.following_id AND actor_id = NEW.follower_id AND type = 'follow'
  ) THEN
    INSERT INTO public.social_notifications(user_id, actor_id, type)
    VALUES (NEW.following_id, NEW.follower_id, 'follow');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_follow ON public.social_follows;
CREATE TRIGGER trg_notify_follow
  AFTER INSERT ON public.social_follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- ── Trigger: comment → notificação ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.social_posts WHERE id = NEW.post_id;
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN RETURN NEW; END IF;
  INSERT INTO public.social_notifications(user_id, actor_id, type, post_id)
  VALUES (post_owner, NEW.user_id, 'comment', NEW.post_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_comment ON public.social_comments;
CREATE TRIGGER trg_notify_comment
  AFTER INSERT ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- Fim
