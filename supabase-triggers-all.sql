-- ============================================================
-- Pescamon — Triggers completos para contadores e notificações
-- Execute no Supabase SQL Editor (idempotente — safe to re-run)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PARTE 1: social_notifications (tabela + triggers)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.social_notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL,
  actor_id   uuid        NOT NULL,
  type       text        NOT NULL CHECK (type IN ('like', 'follow', 'comment', 'mention')),
  post_id    uuid        REFERENCES public.social_posts(id) ON DELETE CASCADE,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sn_user   ON public.social_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sn_unread ON public.social_notifications(user_id, is_read) WHERE is_read = false;

ALTER TABLE public.social_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_notifications' AND policyname = 'Users read own notifications') THEN
    CREATE POLICY "Users read own notifications"   ON public.social_notifications FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_notifications' AND policyname = 'Users update own notifications') THEN
    CREATE POLICY "Users update own notifications" ON public.social_notifications FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'social_notifications' AND policyname = 'Service insert notifications') THEN
    CREATE POLICY "Service insert notifications"   ON public.social_notifications FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Trigger: like → notificação (deduplicado)
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  post_owner uuid;
BEGIN
  SELECT user_id INTO post_owner FROM public.social_posts WHERE id = NEW.post_id;
  IF post_owner IS NULL OR post_owner = NEW.user_id THEN RETURN NEW; END IF;
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

-- Trigger: follow → notificação (deduplicado)
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

-- Trigger: comment → notificação
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

-- ─────────────────────────────────────────────────────────────
-- PARTE 2: Contadores automáticos — followers / following / posts
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.social_profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.social_profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_counts ON public.social_follows;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON public.social_follows
  FOR EACH ROW EXECUTE FUNCTION public.update_follow_counts();

CREATE OR REPLACE FUNCTION public.update_posts_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_profiles SET posts_count = posts_count + 1 WHERE id = NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_profiles SET posts_count = GREATEST(posts_count - 1, 0) WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_posts_count ON public.social_posts;
CREATE TRIGGER trg_posts_count
  AFTER INSERT OR DELETE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_posts_count();

-- ─────────────────────────────────────────────────────────────
-- PARTE 3: likes_count e comments_count via trigger
--          (substitui as RPCs increment_likes/decrement_likes)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_likes_count ON public.social_likes;
CREATE TRIGGER trg_likes_count
  AFTER INSERT OR DELETE ON public.social_likes
  FOR EACH ROW EXECUTE FUNCTION public.update_likes_count();

CREATE OR REPLACE FUNCTION public.update_comments_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.social_posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.social_posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_count ON public.social_comments;
CREATE TRIGGER trg_comments_count
  AFTER INSERT OR DELETE ON public.social_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_comments_count();

-- ─────────────────────────────────────────────────────────────
-- PARTE 4: Recalcular contadores históricos (sincronização)
-- ─────────────────────────────────────────────────────────────

UPDATE public.social_profiles sp SET
  followers_count = (SELECT COUNT(*) FROM public.social_follows WHERE following_id = sp.id),
  following_count = (SELECT COUNT(*) FROM public.social_follows WHERE follower_id  = sp.id),
  posts_count     = (SELECT COUNT(*) FROM public.social_posts   WHERE user_id      = sp.id);

UPDATE public.social_posts sp SET
  likes_count    = (SELECT COUNT(*) FROM public.social_likes    WHERE post_id = sp.id),
  comments_count = (SELECT COUNT(*) FROM public.social_comments WHERE post_id = sp.id);

-- Fim
