-- Boss fight: one atomic strike (damage + stamina), optional kill drops, boss respawn.

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_party_member(p_party_id, v_uid) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;

  SELECT pr.strength, pr.stamina
  INTO v_str, v_stamina
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

  SELECT pt.*
  INTO v_party
  FROM public.parties pt
  WHERE pt.id = p_party_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party not found';
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
  SET boss_hp = v_new_hp
  WHERE pt.id = p_party_id;

  UPDATE public.profiles pr
  SET stamina = pr.stamina - v_stamina_cost
  WHERE pr.id = v_uid;

  IF v_killed THEN
    v_bonus_gold := 12 + floor(random() * 24)::INT; -- 12..35

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
    'stamina_spent', v_stamina_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.strike_party_boss(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.strike_party_boss(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.strike_party_boss(UUID) TO authenticated;
