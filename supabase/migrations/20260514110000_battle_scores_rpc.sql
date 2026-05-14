-- RPC: get_battle_scores
-- Returns this month's completed task counts split by alignment (good vs evil).
-- Counts todos and dailies via last_completed_at (habits excluded — no per-month repeat count).
-- No auth required; aggregate only, no PII exposed.

CREATE OR REPLACE FUNCTION public.get_battle_scores()
RETURNS TABLE (good_count BIGINT, evil_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE p.aura_path::text IN ('swordsman', 'mage', 'tank', 'rogue')
    ) AS good_count,
    COUNT(*) FILTER (
      WHERE p.aura_path::text IN ('evilswordsman', 'evilmage', 'evilpaladin', 'evilrogue')
    ) AS evil_count
  FROM public.tasks t
  INNER JOIN public.profiles p ON p.id = t.user_id
  WHERE
    t.type IN ('daily', 'todo')
    AND t.last_completed_at >= date_trunc('month', now())
    AND t.last_completed_at < date_trunc('month', now()) + interval '1 month';
$$;

GRANT EXECUTE ON FUNCTION public.get_battle_scores() TO anon, authenticated;
