-- Phase 7: Boss rage + shadow pressure; extend strike with buffs and quest arc strikes

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS boss_rage INT NOT NULL DEFAULT 0 CHECK (boss_rage >= 0 AND boss_rage <= 5000);

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
  v_delta INT;
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
    SELECT
      CASE shadow_pressure_mode
        WHEN 'hardcore' THEN v_missed * 8
        ELSE v_missed * 2
      END INTO v_delta
    FROM public.parties WHERE id = r.party_id;

    UPDATE public.parties
    SET boss_rage = LEAST(5000, COALESCE(boss_rage, 0) + COALESCE(v_delta, 0))
    WHERE id = r.party_id;
  END LOOP;

  RETURN json_build_object('applied', true, 'missed_dailies', v_missed);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_party_shadow_from_missed_dailies() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_party_shadow_from_missed_dailies() TO authenticated;

CREATE OR REPLACE FUNCTION public.strike_party_boss(p_party_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_stamina_cost INT := 10;
  v_str INT;
  v_stamina INT;
  v_gold_pct NUMERIC := 0;
  v_party public.parties%ROWTYPE;
  v_old_hp INT;
  v_new_hp INT;
  v_killed BOOLEAN := false;
  v_dmg INT;
  v_bonus_gold INT := 0;
  v_roll NUMERIC;
  v_slug TEXT;
  v_item_id UUID;
  v_item_name TEXT;
  v_boss_pct INT := 0;
  v_rage INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_party_member(p_party_id, v_uid) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;

  PERFORM public.prune_expired_buffs(v_uid);

  SELECT COALESCE((pb.meta ->> 'pct')::INT, 0)
  INTO v_boss_pct
  FROM public.profile_buffs pb
  WHERE pb.user_id = v_uid AND pb.buff_key = 'boss_dmg_bonus' AND pb.expires_at > now()
  LIMIT 1;

  SELECT pr.strength + COALESCE(pr.equip_str_bonus, 0),
         pr.stamina,
         LEAST(COALESCE(pr.equip_gold_bonus_pct, 0), 100)
  INTO v_str, v_stamina, v_gold_pct
  FROM public.profiles pr
  WHERE pr.id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_stamina < v_stamina_cost THEN
    RAISE EXCEPTION 'Insufficient stamina: need %, have %', v_stamina_cost, v_stamina;
  END IF;

  v_dmg := GREATEST(1, 5 + COALESCE(v_str, 1) * 2);

  IF v_boss_pct > 0 THEN
    v_dmg := GREATEST(1, floor(v_dmg * (100 + v_boss_pct) / 100.0)::INT);
  END IF;

  SELECT pt.*
  INTO v_party
  FROM public.parties pt
  WHERE pt.id = p_party_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  v_rage := COALESCE(v_party.boss_rage, 0);
  IF v_rage > 0 THEN
    v_dmg := GREATEST(1, floor(v_dmg * 100.0 / (100.0 + (v_rage::NUMERIC / 4.0)))::INT);
  END IF;

  v_old_hp := COALESCE(v_party.boss_hp, 0);

  IF v_old_hp <= 0 THEN
    v_new_hp := v_party.boss_max_hp;
  ELSE
    v_new_hp := GREATEST(0, v_old_hp - v_dmg);
    v_killed := v_old_hp > 0 AND v_new_hp <= 0;
    IF v_killed THEN
      v_new_hp := v_party.boss_max_hp;
    END IF;
  END IF;

  UPDATE public.parties pt
  SET
    boss_hp = v_new_hp,
    boss_rage = CASE
      WHEN v_killed THEN GREATEST(0, floor(COALESCE(pt.boss_rage, 0) * 0.55)::INT)
      ELSE pt.boss_rage
    END
  WHERE pt.id = p_party_id;

  UPDATE public.profiles pr
  SET stamina = pr.stamina - v_stamina_cost
  WHERE pr.id = v_uid;

  IF v_old_hp > 0 AND v_new_hp < v_old_hp THEN
    PERFORM public.record_quest_arc_event('strike_boss', 1);
  END IF;

  IF v_killed THEN
    v_bonus_gold := floor(((12 + floor(random() * 24)::INT) * (1 + v_gold_pct / 100)))::INT;

    UPDATE public.profiles pr
    SET gold = pr.gold + v_bonus_gold
    WHERE pr.id = v_uid;

    v_roll := random();
    v_slug := CASE
      WHEN v_roll < 0.34 THEN 'stamina-herbal-tea'
      WHEN v_roll < 0.60 THEN 'stamina-energy-bar'
      WHEN v_roll < 0.76 THEN 'loot-key'
      WHEN v_roll < 0.88 THEN 'hp-herb-tea'
      WHEN v_roll < 0.94 THEN 'focus-incense'
      ELSE 'stamina-crystal-vial'
    END;

    v_item_id := NULL;
    v_item_name := NULL;
    SELECT si.id, si.name INTO v_item_id, v_item_name
    FROM public.shop_items si
    WHERE si.slug = v_slug AND si.is_active = true
    LIMIT 1;

    IF v_item_id IS NOT NULL THEN
      INSERT INTO public.user_items (user_id, item_id, quantity, equipped)
      VALUES (v_uid, v_item_id, 1, false)
      ON CONFLICT (user_id, item_id)
      DO UPDATE SET quantity = public.user_items.quantity + 1;
    ELSE
      v_slug := NULL;
    END IF;
  END IF;

  RETURN json_build_object(
    'dmg', v_dmg,
    'killed', v_killed,
    'boss_hp', v_new_hp,
    'boss_max_hp', v_party.boss_max_hp,
    'bonus_gold', v_bonus_gold,
    'drop_slug', CASE WHEN v_killed THEN v_slug ELSE NULL END,
    'drop_name', CASE WHEN v_killed THEN v_item_name ELSE NULL END,
    'stamina_spent', v_stamina_cost,
    'boss_rage_after', (SELECT boss_rage FROM public.parties WHERE id = p_party_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.strike_party_boss(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.strike_party_boss(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.strike_party_boss(UUID) TO authenticated;
