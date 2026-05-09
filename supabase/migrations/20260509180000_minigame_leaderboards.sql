-- ===========================================================================
-- Minigame leaderboards
--
-- Stores ONE row per (user, game_slug, category) — the player's PERSONAL
-- BEST. Higher `score` is always better; for time-based games (sudoku) the
-- caller is expected to convert duration -> derived score so the leaderboard
-- can be ordered uniformly.
--
-- For sudoku we use category = 'easy' | 'medium' | 'hard' so each difficulty
-- has its own leaderboard. For 2048 we use category = 'classic'.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.minigame_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_slug TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  score NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  achieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_slug, category)
);

CREATE INDEX IF NOT EXISTS idx_minigame_scores_game_score
  ON public.minigame_scores (game_slug, category, score DESC, achieved_at ASC);

ALTER TABLE public.minigame_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Minigame scores readable to authenticated" ON public.minigame_scores;
CREATE POLICY "Minigame scores readable to authenticated"
  ON public.minigame_scores
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Minigame scores writable by owner" ON public.minigame_scores;
CREATE POLICY "Minigame scores writable by owner"
  ON public.minigame_scores
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- submit_minigame_score
--   Upserts a personal best. If the player already has a row for this
--   (game_slug, category) and the new score is NOT better, we keep the old
--   row untouched and return is_new_high = false.
--   Returns: { is_new_high: bool, best_score: numeric }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_minigame_score(
  p_game_slug TEXT,
  p_category TEXT,
  p_score NUMERIC,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (is_new_high BOOLEAN, best_score NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_existing NUMERIC;
  v_is_new BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_game_slug IS NULL OR length(trim(p_game_slug)) = 0 THEN
    RAISE EXCEPTION 'game_slug required';
  END IF;
  IF p_score IS NULL OR p_score < 0 THEN
    RAISE EXCEPTION 'score must be >= 0';
  END IF;

  SELECT score INTO v_existing
  FROM public.minigame_scores
  WHERE user_id = v_uid
    AND game_slug = p_game_slug
    AND category = COALESCE(p_category, '');

  IF v_existing IS NULL THEN
    INSERT INTO public.minigame_scores
      (user_id, game_slug, category, score, metadata, achieved_at)
    VALUES
      (v_uid, p_game_slug, COALESCE(p_category, ''), p_score,
       COALESCE(p_metadata, '{}'::jsonb), now());
    v_is_new := true;
  ELSIF p_score > v_existing THEN
    UPDATE public.minigame_scores
    SET score = p_score,
        metadata = COALESCE(p_metadata, '{}'::jsonb),
        achieved_at = now(),
        updated_at = now()
    WHERE user_id = v_uid
      AND game_slug = p_game_slug
      AND category = COALESCE(p_category, '');
    v_is_new := true;
  END IF;

  RETURN QUERY
    SELECT v_is_new,
           COALESCE(GREATEST(v_existing, p_score), p_score)::NUMERIC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_minigame_score(TEXT, TEXT, NUMERIC, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_minigame_leaderboard
--   Returns the top N best-scoring rows for a given game/category, joined
--   with the public profile data (display_name, avatar_url, level).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_minigame_leaderboard(
  p_game_slug TEXT,
  p_category TEXT DEFAULT '',
  p_limit INT DEFAULT 25
)
RETURNS TABLE (
  rank INT,
  user_id UUID,
  display_name TEXT,
  avatar_url TEXT,
  level INT,
  score NUMERIC,
  metadata JSONB,
  achieved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
BEGIN
  RETURN QUERY
  WITH ranked AS (
    SELECT
      m.user_id,
      m.score,
      m.metadata,
      m.achieved_at,
      ROW_NUMBER() OVER (
        ORDER BY m.score DESC, m.achieved_at ASC
      )::INT AS rank
    FROM public.minigame_scores m
    WHERE m.game_slug = p_game_slug
      AND m.category = COALESCE(p_category, '')
  )
  SELECT
    r.rank,
    r.user_id,
    p.display_name,
    p.avatar_url,
    p.level,
    r.score,
    r.metadata,
    r.achieved_at
  FROM ranked r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.rank <= v_limit
  ORDER BY r.rank ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_minigame_leaderboard(TEXT, TEXT, INT) TO authenticated;

-- ---------------------------------------------------------------------------
-- get_minigame_personal_best
--   Returns the caller's current personal best for a game/category (or null).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_minigame_personal_best(
  p_game_slug TEXT,
  p_category TEXT DEFAULT ''
)
RETURNS TABLE (
  score NUMERIC,
  metadata JSONB,
  achieved_at TIMESTAMPTZ,
  rank INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  WITH ranked AS (
    SELECT
      m.user_id,
      m.score,
      m.metadata,
      m.achieved_at,
      ROW_NUMBER() OVER (
        ORDER BY m.score DESC, m.achieved_at ASC
      )::INT AS rank
    FROM public.minigame_scores m
    WHERE m.game_slug = p_game_slug
      AND m.category = COALESCE(p_category, '')
  )
  SELECT r.score, r.metadata, r.achieved_at, r.rank
  FROM ranked r
  WHERE r.user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_minigame_personal_best(TEXT, TEXT) TO authenticated;
