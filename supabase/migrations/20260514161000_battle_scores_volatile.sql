-- STABLE told Postgres it could cache the result within a transaction.
-- get_battle_scores reads a live log table so must be VOLATILE.
CREATE OR REPLACE FUNCTION public.get_battle_scores()
RETURNS TABLE (good_count BIGINT, evil_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
VOLATILE
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE p.aura_path::text IN ('swordsman', 'mage', 'tank', 'rogue')
    ) AS good_count,
    COUNT(*) FILTER (
      WHERE p.aura_path::text IN ('evilswordsman', 'evilmage', 'evilpaladin', 'evilrogue')
    ) AS evil_count
  FROM public.battle_completions bc
  INNER JOIN public.profiles p ON p.id = bc.user_id
  WHERE bc.completed_at >= date_trunc('month', now())
    AND bc.completed_at <  date_trunc('month', now()) + interval '1 month';
$$;

GRANT EXECUTE ON FUNCTION public.get_battle_scores() TO anon, authenticated;
