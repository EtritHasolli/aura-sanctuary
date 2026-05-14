-- Add alignment column to battle_completions so the score is locked at completion
-- time rather than re-derived from the user's current path (which may change).
ALTER TABLE public.battle_completions
  ADD COLUMN IF NOT EXISTS alignment TEXT CHECK (alignment IN ('good', 'evil'));

-- Rewrite get_battle_scores to use the stored alignment instead of the current path.
-- For rows without a stored alignment (written before this migration), fall back
-- to the user's current profile path so they are never silently dropped.
CREATE OR REPLACE FUNCTION public.get_battle_scores()
RETURNS TABLE (good_count BIGINT, evil_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE COALESCE(bc.alignment,
        CASE WHEN p.aura_path::text IN ('evilswordsman','evilmage','evilpaladin','evilrogue')
             THEN 'evil' ELSE 'good' END
      ) = 'good'
    ) AS good_count,
    COUNT(*) FILTER (
      WHERE COALESCE(bc.alignment,
        CASE WHEN p.aura_path::text IN ('evilswordsman','evilmage','evilpaladin','evilrogue')
             THEN 'evil' ELSE 'good' END
      ) = 'evil'
    ) AS evil_count
  FROM public.battle_completions bc
  INNER JOIN public.profiles p ON p.id = bc.user_id
  WHERE bc.completed_at >= date_trunc('month', now())
    AND bc.completed_at <  date_trunc('month', now()) + interval '1 month';
$$;

GRANT EXECUTE ON FUNCTION public.get_battle_scores() TO anon, authenticated;

-- Backfill alignment for rows written before this column existed.
-- Uses the user's current path as the best available signal.
UPDATE public.battle_completions bc
SET alignment = CASE
  WHEN p.aura_path::text IN ('evilswordsman', 'evilmage', 'evilpaladin', 'evilrogue') THEN 'evil'
  ELSE 'good'
END
FROM public.profiles p
WHERE bc.user_id = p.id
  AND bc.alignment IS NULL;
