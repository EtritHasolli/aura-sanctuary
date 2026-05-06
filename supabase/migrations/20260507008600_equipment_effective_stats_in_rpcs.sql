-- Use equipment-derived cached bonuses in combat, stamina regen/consumables, optional gold drop modifier.

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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_party_member(p_party_id, v_uid) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;

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
    'stamina_spent', v_stamina_cost
  );
END;
$$;

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
  v_eff_max INT;
  v_now TIMESTAMPTZ := now();
  v_today_utc DATE := (now() AT TIME ZONE 'utc')::date;
  v_before_stamina INT;
  v_ticks INT := 0;
  v_gain INT := 0;
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

  v_eff_max := v_profile.max_stamina + COALESCE(v_profile.equip_max_stamina_bonus, 0);
  v_before_stamina := v_profile.stamina;

  IF v_profile.last_stamina_reset_on < v_today_utc THEN
    v_profile.stamina := v_eff_max;
    v_profile.last_stamina_reset_on := v_today_utc;
    v_profile.last_stamina_regen_at := v_now;
    v_reset := true;
  END IF;

  v_ticks := FLOOR(EXTRACT(EPOCH FROM (v_now - v_profile.last_stamina_regen_at)) / (p_tick_minutes * 60));
  IF v_ticks > 0 AND v_profile.stamina < v_eff_max THEN
    v_gain := v_ticks * p_gain_per_tick;
    v_profile.stamina := LEAST(v_eff_max, v_profile.stamina + v_gain);
    v_profile.last_stamina_regen_at := v_profile.last_stamina_regen_at + (v_ticks * make_interval(mins => p_tick_minutes));
  ELSIF v_ticks > 0 THEN
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
    v_eff_max,
    v_reset,
    GREATEST(0, v_profile.stamina - v_before_stamina);
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_user_item(
  p_item_slug TEXT,
  p_quantity INT DEFAULT 1
)
RETURNS TABLE (
  item_slug TEXT,
  consumed_quantity INT,
  quantity_left INT,
  stamina_after INT,
  hp_after INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_item public.shop_items%ROWTYPE;
  v_user_item public.user_items%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_eff_max INT;
  v_stamina_gain INT := 0;
  v_hp_gain INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 99 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 99';
  END IF;

  SELECT *
  INTO v_item
  FROM public.shop_items
  WHERE slug = p_item_slug
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or inactive: %', p_item_slug;
  END IF;

  IF v_item.category <> 'consumable' THEN
    RAISE EXCEPTION 'Item is not consumable: %', p_item_slug;
  END IF;

  SELECT *
  INTO v_user_item
  FROM public.user_items
  WHERE user_id = v_uid
    AND item_id = v_item.id
  FOR UPDATE;

  IF NOT FOUND OR v_user_item.quantity < p_quantity THEN
    RAISE EXCEPTION 'Not enough quantity for item: %', p_item_slug;
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_eff_max := v_profile.max_stamina + COALESCE(v_profile.equip_max_stamina_bonus, 0);
  v_stamina_gain := COALESCE((v_item.metadata -> 'effect' ->> 'stamina')::INT, 0) * p_quantity;
  v_hp_gain := COALESCE((v_item.metadata -> 'effect' ->> 'hp')::INT, 0) * p_quantity;

  UPDATE public.user_items
  SET quantity = quantity - p_quantity
  WHERE id = v_user_item.id;

  UPDATE public.profiles
  SET
    stamina = LEAST(v_eff_max, GREATEST(0, stamina + v_stamina_gain)),
    hp = LEAST(max_hp, GREATEST(0, hp + v_hp_gain))
  WHERE id = v_uid
  RETURNING stamina, hp INTO stamina_after, hp_after;

  RETURN QUERY
  SELECT
    v_item.slug,
    p_quantity,
    (v_user_item.quantity - p_quantity),
    stamina_after,
    hp_after;
END;
$$;
