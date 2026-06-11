-- ============================================================
-- Triggers: contagem real de seguidores/seguindo/posts
-- Execute no Supabase SQL Editor
-- ============================================================

-- ── 1. followers_count + following_count via social_follows ─────────────────

CREATE OR REPLACE FUNCTION public.update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- quem seguiu: following_count + 1
    UPDATE public.social_profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    -- quem foi seguido: followers_count + 1
    UPDATE public.social_profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    -- quem deixou de seguir: following_count - 1
    UPDATE public.social_profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    -- quem perdeu seguidor: followers_count - 1
    UPDATE public.social_profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_counts ON public.social_follows;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON public.social_follows
  FOR EACH ROW EXECUTE FUNCTION public.update_follow_counts();

-- ── 2. posts_count via social_posts ─────────────────────────────────────────

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

-- ── 3. Recalcular contagens existentes (sincronizar dados históricos) ────────

UPDATE public.social_profiles sp SET
  followers_count = (SELECT COUNT(*) FROM public.social_follows WHERE following_id = sp.id),
  following_count = (SELECT COUNT(*) FROM public.social_follows WHERE follower_id  = sp.id),
  posts_count     = (SELECT COUNT(*) FROM public.social_posts   WHERE user_id      = sp.id);

-- Fim
