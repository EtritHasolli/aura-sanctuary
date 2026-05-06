-- Scale tavern boss max HP from sum of party members' profile levels (SECURITY DEFINER reads all member profiles).

CREATE OR REPLACE FUNCTION public.sync_party_boss_scaling(p_party_id UUID)
RETURNS TABLE (boss_hp INT, boss_max_hp INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sum INT;
  v_cnt INT;
  v_old_max INT;
  v_old_hp INT;
  v_new_max INT;
  v_new_hp INT;
  v_ratio NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_party_member(p_party_id, v_uid) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;

  SELECT COALESCE(SUM(pr.level), 0)::INT, COUNT(*)::INT
  INTO v_sum, v_cnt
  FROM public.party_members pm
  INNER JOIN public.profiles pr ON pr.id = pm.user_id
  WHERE pm.party_id = p_party_id;

  IF COALESCE(v_cnt, 0) <= 0 THEN
    RAISE EXCEPTION 'Party has no members';
  END IF;

  -- Base + sum(level)×90 + bump per warm body (tunable feel)
  v_new_max := GREATEST(500, 750 + v_sum * 90 + v_cnt * 50);

  SELECT pt.boss_max_hp, pt.boss_hp
  INTO v_old_max, v_old_hp
  FROM public.parties pt
  WHERE pt.id = p_party_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  IF COALESCE(v_old_hp, 0) <= 0 OR COALESCE(v_old_max, 0) <= 0 THEN
    v_new_hp := v_new_max;
  ELSE
    v_ratio := LEAST(1::NUMERIC, GREATEST(0::NUMERIC, v_old_hp::NUMERIC / v_old_max::NUMERIC));
    v_new_hp := GREATEST(1, LEAST(v_new_max, ROUND(v_new_max * v_ratio)::INT));
  END IF;

  RETURN QUERY
    UPDATE public.parties p
    SET
      boss_max_hp = v_new_max,
      boss_hp = v_new_hp
    WHERE p.id = p_party_id
    RETURNING p.boss_hp, p.boss_max_hp;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_party_boss_scaling(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_party_boss_scaling(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_party_boss_scaling(UUID) TO authenticated;
