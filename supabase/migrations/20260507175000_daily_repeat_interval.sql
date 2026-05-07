ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS repeat_every INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS repeat_unit TEXT NOT NULL DEFAULT 'day' CHECK (repeat_unit IN ('day', 'week', 'month', 'year')),
  ADD COLUMN IF NOT EXISTS repeat_anchor_date DATE;

UPDATE public.tasks
SET repeat_anchor_date = COALESCE(repeat_anchor_date, created_at::date)
WHERE type = 'daily';

CREATE OR REPLACE FUNCTION public.is_daily_due_on(
  p_repeat_every INT,
  p_repeat_unit TEXT,
  p_anchor_date DATE,
  p_day DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_every INT := GREATEST(1, COALESCE(p_repeat_every, 1));
  v_unit TEXT := COALESCE(p_repeat_unit, 'day');
  v_anchor DATE := COALESCE(p_anchor_date, p_day);
  v_day_diff INT;
  v_month_diff INT;
BEGIN
  IF p_day < v_anchor THEN
    RETURN false;
  END IF;

  IF v_unit = 'day' THEN
    v_day_diff := (p_day - v_anchor);
    RETURN (v_day_diff % v_every) = 0;
  ELSIF v_unit = 'week' THEN
    v_day_diff := (p_day - v_anchor);
    RETURN (v_day_diff % (v_every * 7)) = 0;
  ELSIF v_unit = 'month' THEN
    v_month_diff := (EXTRACT(YEAR FROM p_day)::INT - EXTRACT(YEAR FROM v_anchor)::INT) * 12
      + (EXTRACT(MONTH FROM p_day)::INT - EXTRACT(MONTH FROM v_anchor)::INT);
    RETURN v_month_diff >= 0
      AND (v_month_diff % v_every) = 0
      AND EXTRACT(DAY FROM p_day)::INT = EXTRACT(DAY FROM v_anchor)::INT;
  ELSE
    RETURN EXTRACT(MONTH FROM p_day)::INT = EXTRACT(MONTH FROM v_anchor)::INT
      AND EXTRACT(DAY FROM p_day)::INT = EXTRACT(DAY FROM v_anchor)::INT
      AND ((EXTRACT(YEAR FROM p_day)::INT - EXTRACT(YEAR FROM v_anchor)::INT) % v_every) = 0;
  END IF;
END;
$$;

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
  v_reset_incomplete INT := 0;
  v_streak_broken INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'UTC') INTO v_tz FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today := (timezone(v_tz, now()))::date;
  v_yesterday := v_today - 1;

  UPDATE public.tasks t
  SET streak_current = 0
  WHERE t.user_id = v_uid
    AND t.type = 'daily'
    AND public.is_daily_due_on(t.repeat_every, t.repeat_unit, COALESCE(t.repeat_anchor_date, t.created_at::date), v_yesterday)
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
    'dailies_uncompleted', v_reset_incomplete,
    'streaks_reset', v_streak_broken
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_party_shadow_from_missed_dailies()
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
  v_missed INT := 0;
  r RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'UTC') INTO v_tz FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today := (timezone(v_tz, now()))::date;
  v_yesterday := v_today - 1;

  SELECT COUNT(*)::INT INTO v_missed
  FROM public.tasks t
  WHERE t.user_id = v_uid
    AND t.type = 'daily'
    AND public.is_daily_due_on(t.repeat_every, t.repeat_unit, COALESCE(t.repeat_anchor_date, t.created_at::date), v_yesterday)
    AND (t.last_completed_local_date IS NULL OR t.last_completed_local_date < v_yesterday);

  IF v_missed <= 0 THEN
    RETURN json_build_object('applied', false, 'missed_dailies', 0);
  END IF;

  FOR r IN SELECT party_id FROM public.party_members WHERE user_id = v_uid
  LOOP
    UPDATE public.parties
    SET boss_rage = LEAST(5000, COALESCE(boss_rage, 0) + (v_missed * 2))
    WHERE id = r.party_id;
  END LOOP;

  RETURN json_build_object('applied', true, 'missed_dailies', v_missed);
END;
$$;
