-- Phase 1: Quest steps (checklists), sigils (tags), sacred days schedule, streak columns, profile timezone, daily refresh RPC

-- Profile: IANA timezone for streaks / daily rollover (default UTC)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

COMMENT ON COLUMN public.profiles.timezone IS 'IANA zone e.g. America/New_York; used for daily reset and streaks.';

-- Tasks: schedule (bitmask Sun=1<<0 .. Sat=1<<6), streaks for dailies
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sacred_days SMALLINT NOT NULL DEFAULT 127,
  ADD COLUMN IF NOT EXISTS streak_current INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak_best INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_completed_local_date DATE;

COMMENT ON COLUMN public.tasks.sacred_days IS 'Bit 0=Sun .. bit 6=Sat; 127 = every day.';
COMMENT ON COLUMN public.tasks.last_completed_local_date IS 'Local calendar date (user timezone) of last completion for dailies.';

-- Sigils (tags)
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tags_user_lower_name_idx ON public.tags (user_id, lower(name));

CREATE TABLE IF NOT EXISTS public.task_tags (
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

-- Quest steps (checklist rows)
CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_checklist_items_task_id_idx ON public.task_checklist_items(task_id);

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_owner_all" ON public.tags FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "task_tags_select" ON public.task_tags FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY "task_tags_insert" ON public.task_tags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.tags g WHERE g.id = tag_id AND g.user_id = auth.uid()));
CREATE POLICY "task_tags_delete" ON public.task_tags FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));

CREATE POLICY "checklist_select" ON public.task_checklist_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY "checklist_insert" ON public.task_checklist_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY "checklist_update" ON public.task_checklist_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));
CREATE POLICY "checklist_delete" ON public.task_checklist_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND t.user_id = auth.uid()));

-- Refresh dailies: uncomplete when new local day; reset streak if a sacred yesterday was missed
CREATE OR REPLACE FUNCTION public.refresh_user_dailies()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tz TEXT;
  v_today DATE;
  v_yesterday DATE;
  v_yest_dow INT;
  v_reset_incomplete INT := 0;
  v_streak_broken INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'UTC') INTO v_tz FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_today := (timezone(v_tz, now()))::date;
  v_yesterday := v_today - 1;

  v_yest_dow := EXTRACT(DOW FROM make_timestamptz(
    EXTRACT(YEAR FROM v_yesterday)::INT,
    EXTRACT(MONTH FROM v_yesterday)::INT,
    EXTRACT(DAY FROM v_yesterday)::INT,
    12, 0, 0,
    v_tz
  ))::INT;

  -- Missed streak: yesterday was scheduled and last completion before yesterday
  UPDATE public.tasks t
  SET streak_current = 0
  WHERE t.user_id = v_uid
    AND t.type = 'daily'
    AND (t.sacred_days::INT & (1 << v_yest_dow)) <> 0
    AND (t.last_completed_local_date IS NULL OR t.last_completed_local_date < v_yesterday);
  GET DIAGNOSTICS v_streak_broken = ROW_COUNT;

  UPDATE public.tasks t
  SET completed = false
  WHERE t.user_id = v_uid
    AND t.type = 'daily'
    AND t.completed = true
    AND t.last_completed_local_date IS NOT NULL
    AND t.last_completed_local_date < v_today;
  GET DIAGNOSTICS v_reset_incomplete = ROW_COUNT;

  RETURN json_build_object(
    'today', v_today,
    'timezone', v_tz,
    'dow_today', EXTRACT(DOW FROM timezone(v_tz, now()))::INT,
    'dailies_uncompleted', v_reset_incomplete,
    'streaks_reset', v_streak_broken
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_user_dailies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_user_dailies() TO authenticated;
