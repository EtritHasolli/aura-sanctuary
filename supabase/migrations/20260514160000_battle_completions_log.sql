-- Replace the single last_completed_at approach with an append-only log.
-- Each time a task is marked complete, one row is inserted here.
-- get_battle_scores() sums this log for the current month.

CREATE TABLE IF NOT EXISTS public.battle_completions (
  id         UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id    UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT battle_completions_pkey PRIMARY KEY (id)
);

CREATE INDEX battle_completions_month_idx
  ON public.battle_completions (user_id, completed_at);

ALTER TABLE public.battle_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "battle_completions_insert_own"
  ON public.battle_completions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "battle_completions_read_all"
  ON public.battle_completions FOR SELECT TO authenticated
  USING (true);

-- Rewrite get_battle_scores to use the log table.
CREATE OR REPLACE FUNCTION public.get_battle_scores()
RETURNS TABLE (good_count BIGINT, evil_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
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
