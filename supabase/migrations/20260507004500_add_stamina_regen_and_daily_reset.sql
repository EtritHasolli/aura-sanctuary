-- Stamina regeneration + daily reset support

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_stamina_regen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_stamina_reset_on DATE NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date;

CREATE OR REPLACE FUNCTION public.apply_stamina_regen(
  p_tick_minutes INT DEFAULT 5,
  p_gain_per_tick INT DEFAULT 1
)
RETURNS TABLE (
  stamina INT,
  max_stamina INT,
  reset_applied BOOLEAN,
  regen_applied INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_profile public.profiles%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_today_utc DATE := (now() AT TIME ZONE 'utc')::date;
  v_before_stamina INT;
  v_ticks INT := 0;
  v_gain INT := 0;
  v_applied INT := 0;
  v_reset BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tick_minutes < 1 THEN
    RAISE EXCEPTION 'p_tick_minutes must be >= 1';
  END IF;

  IF p_gain_per_tick < 0 THEN
    RAISE EXCEPTION 'p_gain_per_tick must be >= 0';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  v_before_stamina := v_profile.stamina;

  -- Daily reset (UTC): full refill once per day.
  IF v_profile.last_stamina_reset_on < v_today_utc THEN
    v_profile.stamina := v_profile.max_stamina;
    v_profile.last_stamina_reset_on := v_today_utc;
    v_profile.last_stamina_regen_at := v_now;
    v_reset := true;
  END IF;

  -- Passive regen: +p_gain_per_tick every p_tick_minutes.
  v_ticks := FLOOR(EXTRACT(EPOCH FROM (v_now - v_profile.last_stamina_regen_at)) / (p_tick_minutes * 60));
  IF v_ticks > 0 AND v_profile.stamina < v_profile.max_stamina THEN
    v_gain := v_ticks * p_gain_per_tick;
    v_profile.stamina := LEAST(v_profile.max_stamina, v_profile.stamina + v_gain);
    v_profile.last_stamina_regen_at := v_profile.last_stamina_regen_at + (v_ticks * make_interval(mins => p_tick_minutes));
  ELSIF v_ticks > 0 THEN
    -- Keep regen cursor moving even at cap, so we do not bank infinite ticks.
    v_profile.last_stamina_regen_at := v_now;
  END IF;

  UPDATE public.profiles
  SET
    stamina = v_profile.stamina,
    last_stamina_regen_at = v_profile.last_stamina_regen_at,
    last_stamina_reset_on = v_profile.last_stamina_reset_on
  WHERE id = v_uid;

  RETURN QUERY
  SELECT
    v_profile.stamina,
    v_profile.max_stamina,
    v_reset,
    GREATEST(0, v_profile.stamina - v_before_stamina);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_stamina_regen(INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_stamina_regen(INT, INT) TO authenticated;
