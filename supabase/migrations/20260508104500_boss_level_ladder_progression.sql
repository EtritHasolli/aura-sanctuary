ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS boss_level INT NOT NULL DEFAULT 1 CHECK (boss_level >= 1),
  ADD COLUMN IF NOT EXISTS boss_loop_count INT NOT NULL DEFAULT 0 CHECK (boss_loop_count >= 0);

ALTER TABLE public.party_adventures
  DROP CONSTRAINT IF EXISTS party_adventures_difficulty_check;

ALTER TABLE public.party_adventures
  ADD CONSTRAINT party_adventures_difficulty_check
  CHECK (difficulty IN ('easy', 'medium', 'hard', 'mythic', 'party'));

UPDATE public.parties
SET boss_level = COALESCE(boss_level, 1),
    boss_loop_count = COALESCE(boss_loop_count, 0);

CREATE OR REPLACE FUNCTION public.party_boss_name_for_level(p_level INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE LEAST(GREATEST(COALESCE(p_level, 1), 1), 10)
    WHEN 1 THEN 'Moss Ogre'
    WHEN 2 THEN 'Grove Boar'
    WHEN 3 THEN 'Root Lurker'
    WHEN 4 THEN 'Dusk Drake'
    WHEN 5 THEN 'Ash Basilisk'
    WHEN 6 THEN 'Storm Harrier'
    WHEN 7 THEN 'Void Titan'
    WHEN 8 THEN 'Blight Golem'
    WHEN 9 THEN 'Night Colossus'
    ELSE 'Sunless Wyrm'
  END;
$$;

CREATE OR REPLACE FUNCTION public.party_boss_scaled_hp(
  p_party_id UUID,
  p_level INT,
  p_loop_count INT DEFAULT 0
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum INT;
  v_cnt INT;
  v_base INT;
  v_tier_growth NUMERIC;
  v_loop_growth NUMERIC;
  v_bonus INT;
BEGIN
  SELECT COALESCE(SUM(pr.level), 0)::INT, COUNT(*)::INT
  INTO v_sum, v_cnt
  FROM public.party_members pm
  INNER JOIN public.profiles pr ON pr.id = pm.user_id
  WHERE pm.party_id = p_party_id;

  IF COALESCE(v_cnt, 0) <= 0 THEN
    RETURN 1000;
  END IF;

  v_base := GREATEST(500, 750 + v_sum * 90 + v_cnt * 50);
  v_tier_growth := power(1.38::NUMERIC, GREATEST(0, COALESCE(p_level, 1) - 1)::NUMERIC);
  v_loop_growth := power(1.06::NUMERIC, GREATEST(0, COALESCE(p_loop_count, 0))::NUMERIC);
  v_bonus := ROUND(140 * v_tier_growth * v_loop_growth)::INT;

  RETURN v_base + GREATEST(0, v_bonus);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_party_boss_scaling(p_party_id UUID)
RETURNS TABLE (boss_hp INT, boss_max_hp INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_old_max INT;
  v_old_hp INT;
  v_new_max INT;
  v_new_hp INT;
  v_ratio NUMERIC;
  v_level INT;
  v_loop_count INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_party_member(p_party_id, v_uid) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;

  SELECT pt.boss_max_hp, pt.boss_hp, COALESCE(pt.boss_level, 1), COALESCE(pt.boss_loop_count, 0)
  INTO v_old_max, v_old_hp, v_level, v_loop_count
  FROM public.parties pt
  WHERE pt.id = p_party_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  v_new_max := public.party_boss_scaled_hp(p_party_id, v_level, v_loop_count);

  IF COALESCE(v_old_hp, 0) <= 0 OR COALESCE(v_old_max, 0) <= 0 THEN
    v_new_hp := v_new_max;
  ELSE
    v_ratio := LEAST(1::NUMERIC, GREATEST(0::NUMERIC, v_old_hp::NUMERIC / v_old_max::NUMERIC));
    v_new_hp := GREATEST(1, LEAST(v_new_max, ROUND(v_new_max * v_ratio)::INT));
  END IF;

  RETURN QUERY
    UPDATE public.parties p
    SET
      boss_name = public.party_boss_name_for_level(v_level),
      boss_max_hp = v_new_max,
      boss_hp = v_new_hp
    WHERE p.id = p_party_id
    RETURNING p.boss_hp, p.boss_max_hp;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_party_adventure(p_party_id UUID, p_difficulty TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_level INT;
  v_loop_count INT;
  v_boss_name TEXT;
  v_boss_hp INT;
  v_adv_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = p_party_id AND leader_id = v_uid) THEN
    RAISE EXCEPTION 'Only party leader can start adventures';
  END IF;

  UPDATE public.party_adventures SET active = false WHERE party_id = p_party_id AND active = true;

  SELECT COALESCE(boss_level, 1), COALESCE(boss_loop_count, 0)
  INTO v_level, v_loop_count
  FROM public.parties
  WHERE id = p_party_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  v_boss_name := public.party_boss_name_for_level(v_level);
  v_boss_hp := public.party_boss_scaled_hp(p_party_id, v_level, v_loop_count);

  INSERT INTO public.party_adventures (
    party_id, difficulty, boss_name, boss_hp, boss_max_hp, task_damage_only, active, next_tick_on, created_by
  )
  VALUES (p_party_id, 'party', v_boss_name, v_boss_hp, v_boss_hp, true, true, CURRENT_DATE + 1, v_uid)
  RETURNING id INTO v_adv_id;

  UPDATE public.parties
  SET boss_name = v_boss_name, boss_hp = v_boss_hp, boss_max_hp = v_boss_hp
  WHERE id = p_party_id;

  RETURN json_build_object(
    'ok', true,
    'adventure_id', v_adv_id,
    'boss_name', v_boss_name,
    'boss_hp', v_boss_hp,
    'boss_level', v_level
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_party_adventure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_party_adventure(UUID, TEXT) TO authenticated;

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
  v_next_level INT;
  v_next_loop_count INT;
  v_next_max_hp INT;
  v_next_name TEXT;
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
  END IF;

  v_next_level := GREATEST(1, COALESCE(v_party.boss_level, 1));
  v_next_loop_count := GREATEST(0, COALESCE(v_party.boss_loop_count, 0));

  IF v_killed THEN
    IF v_next_level < 10 THEN
      v_next_level := v_next_level + 1;
    ELSE
      v_next_loop_count := v_next_loop_count + 1;
    END IF;
    v_next_name := public.party_boss_name_for_level(v_next_level);
    v_next_max_hp := public.party_boss_scaled_hp(p_party_id, v_next_level, v_next_loop_count);
    v_new_hp := v_next_max_hp;
  END IF;

  UPDATE public.parties pt
  SET
    boss_hp = v_new_hp,
    boss_max_hp = CASE WHEN v_killed THEN v_next_max_hp ELSE pt.boss_max_hp END,
    boss_name = CASE WHEN v_killed THEN v_next_name ELSE pt.boss_name END,
    boss_level = CASE WHEN v_killed THEN v_next_level ELSE pt.boss_level END,
    boss_loop_count = CASE WHEN v_killed THEN v_next_loop_count ELSE pt.boss_loop_count END,
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
    'boss_max_hp', (SELECT boss_max_hp FROM public.parties WHERE id = p_party_id),
    'boss_level', (SELECT boss_level FROM public.parties WHERE id = p_party_id),
    'boss_name', (SELECT boss_name FROM public.parties WHERE id = p_party_id),
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
