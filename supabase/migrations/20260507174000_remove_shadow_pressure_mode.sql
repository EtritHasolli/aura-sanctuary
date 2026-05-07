ALTER TABLE public.parties
  DROP COLUMN IF EXISTS shadow_pressure_mode;

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
  v_yest_dow INT;
  v_missed INT := 0;
  r RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'UTC') INTO v_tz FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today := (timezone(v_tz, now()))::date;
  v_yesterday := v_today - 1;

  v_yest_dow := EXTRACT(DOW FROM make_timestamptz(
    EXTRACT(YEAR FROM v_yesterday)::INT,
    EXTRACT(MONTH FROM v_yesterday)::INT,
    EXTRACT(DAY FROM v_yesterday)::INT,
    12, 0, 0,
    v_tz
  ))::INT;

  SELECT COUNT(*)::INT INTO v_missed
  FROM public.tasks t
  WHERE t.user_id = v_uid
    AND t.type = 'daily'
    AND (t.sacred_days::INT & (1 << v_yest_dow)) <> 0
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
