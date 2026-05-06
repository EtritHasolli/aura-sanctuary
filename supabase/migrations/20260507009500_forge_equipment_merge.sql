-- Forge: sacrifice 3 same-rarity gear → 1 random higher-rarity equipment.
-- Forge-only catalog uses forge_exclusive so it never appears / cannot be purchased in the Zen Shop.

ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS forge_exclusive BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shop_items.forge_exclusive IS 'True = only obtainable via forge (hidden from shop + blocked on purchase_shop_item).';

CREATE OR REPLACE FUNCTION public.purchase_shop_item(
  p_item_slug TEXT,
  p_quantity INT DEFAULT 1
)
RETURNS TABLE (
  item_slug TEXT,
  quantity_purchased INT,
  new_quantity INT,
  gold_left INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_item public.shop_items%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_total_cost INT;
  v_new_qty INT;
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

  IF COALESCE(v_item.forge_exclusive, false) THEN
    RAISE EXCEPTION 'This item cannot be purchased from the shop';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_total_cost := v_item.price * p_quantity;
  IF v_profile.gold < v_total_cost THEN
    RAISE EXCEPTION 'Insufficient gold: need %, have %', v_total_cost, v_profile.gold;
  END IF;

  UPDATE public.profiles
  SET gold = gold - v_total_cost
  WHERE id = v_uid;

  INSERT INTO public.user_items (user_id, item_id, quantity, equipped)
  VALUES (v_uid, v_item.id, p_quantity, false)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = public.user_items.quantity + EXCLUDED.quantity
  RETURNING quantity INTO v_new_qty;

  INSERT INTO public.shop_purchases (user_id, item_id, quantity, total_cost)
  VALUES (v_uid, v_item.id, p_quantity, v_total_cost);

  RETURN QUERY
  SELECT
    v_item.slug,
    p_quantity,
    v_new_qty,
    (v_profile.gold - v_total_cost);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_shop_item(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.forge_three_equipment(
  p_user_item_id_a UUID,
  p_user_item_id_b UUID,
  p_user_item_id_c UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_pick UUID[];
  v_dist UUID[];
  v_need INT;
  v_id UUID;
  v_qty INT;
  v_cat TEXT;
  v_slug TEXT;
  v_r TEXT;
  v_ref_r TEXT;
  v_first BOOL := true;
  v_next_r TEXT;
  v_out_id UUID;
  v_out_slug TEXT;
  v_out_name TEXT;
  v_out_rarity TEXT;
  v_rarity_dcount INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_pick := ARRAY[p_user_item_id_a, p_user_item_id_b, p_user_item_id_c];

  IF v_pick[1] IS NULL OR v_pick[2] IS NULL OR v_pick[3] IS NULL THEN
    RAISE EXCEPTION 'Three gear rows are required';
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(v_pick) AS x ORDER BY 1)
  INTO v_dist;

  FOREACH v_id IN ARRAY v_dist
  LOOP
    SELECT COUNT(*)::INT FROM unnest(v_pick) AS p WHERE p = v_id INTO v_need;

    SELECT ui.quantity,
           COALESCE(trim(si.slug), ''),
           COALESCE(trim(si.category), ''),
           trim(si.rarity)::TEXT
      INTO v_qty, v_slug, v_cat, v_r
    FROM public.user_items ui
    INNER JOIN public.shop_items si ON si.id = ui.item_id
    WHERE ui.id = v_id
      AND ui.user_id = v_uid
    FOR UPDATE OF ui;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item row not found or not yours: %', v_id::TEXT;
    END IF;

    IF v_qty < v_need THEN
      RAISE EXCEPTION 'Not enough quantity for % (% needed, % have)', COALESCE(NULLIF(v_slug, ''), v_id::TEXT), v_need, v_qty;
    END IF;

    IF v_cat <> 'equipment' THEN
      RAISE EXCEPTION 'Only gear (equipment category) can be forged: %', COALESCE(NULLIF(v_slug, ''), v_id::TEXT);
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.user_items uix
      WHERE uix.id = v_id AND uix.user_id = v_uid AND uix.equipped IS TRUE
    ) THEN
      RAISE EXCEPTION 'Unequip items before forging: %', COALESCE(NULLIF(v_slug, ''), v_id::TEXT);
    END IF;

    IF v_first THEN
      v_ref_r := v_r;
      v_first := false;
    ELSIF v_r IS DISTINCT FROM v_ref_r THEN
      RAISE EXCEPTION 'All three items must share the same rarity';
    END IF;
  END LOOP;

  IF v_ref_r IS NULL THEN
    RAISE EXCEPTION 'Could not determine input rarity';
  END IF;

  SELECT COUNT(DISTINCT si.rarity)
  INTO v_rarity_dcount
  FROM unnest(v_pick) AS p(id)
  INNER JOIN public.user_items ui ON ui.id = p.id AND ui.user_id = v_uid
  INNER JOIN public.shop_items si ON si.id = ui.item_id;

  IF v_rarity_dcount <> 1 THEN
    RAISE EXCEPTION 'All three items must share the same rarity';
  END IF;

  v_next_r := CASE v_ref_r
    WHEN 'common' THEN 'uncommon'
    WHEN 'uncommon' THEN 'rare'
    WHEN 'rare' THEN 'epic'
    WHEN 'epic' THEN 'legendary'
    ELSE NULL
  END;

  IF v_next_r IS NULL THEN
    RAISE EXCEPTION 'Legendary gear cannot be forged higher';
  END IF;

  SELECT si.id, si.slug, si.name, si.rarity
  INTO v_out_id, v_out_slug, v_out_name, v_out_rarity
  FROM public.shop_items si
  WHERE si.category = 'equipment'
    AND si.is_active IS TRUE
    AND si.rarity = v_next_r
  ORDER BY random()
  LIMIT 1;

  IF v_out_id IS NULL THEN
    RAISE EXCEPTION 'No forge output exists for rarity % yet', v_next_r;
  END IF;

  -- Consume inputs
  FOREACH v_id IN ARRAY v_dist
  LOOP
    SELECT COUNT(*)::INT FROM unnest(v_pick) AS p WHERE p = v_id INTO v_need;

    UPDATE public.user_items ui
    SET
      quantity = ui.quantity - v_need,
      equipped = CASE WHEN ui.quantity - v_need <= 0 THEN false ELSE ui.equipped END
    WHERE ui.id = v_id
      AND ui.user_id = v_uid;
  END LOOP;

  INSERT INTO public.user_items (user_id, item_id, quantity, equipped)
  VALUES (v_uid, v_out_id, 1, false)
  ON CONFLICT (user_id, item_id)
  DO UPDATE SET quantity = public.user_items.quantity + 1;

  PERFORM public.recompute_profiles_equipment_bonus(v_uid);

  RETURN jsonb_build_object(
    'slug', v_out_slug,
    'name', v_out_name,
    'rarity', v_out_rarity,
    'from_rarity', v_ref_r
  );
END;
$$;

REVOKE ALL ON FUNCTION public.forge_three_equipment(UUID, UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.forge_three_equipment(UUID, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.forge_three_equipment(UUID, UUID, UUID) TO authenticated;

-- Forge-only rewards (not sold in shop)
INSERT INTO public.shop_items (slug, name, description, category, rarity, price, forge_exclusive, metadata)
VALUES
  (
    'eq-stormglass-mantle',
    'Stormglass Mantle',
    'Epic weave that catches static. (+3 CON, +8 max stamina)',
    'equipment',
    'epic',
    0,
    true,
    '{"slot":"chest","bonuses":{"constitution":3,"max_stamina":8}}'::jsonb
  ),
  (
    'eq-runic-batter-blade',
    'Runic Batter Blade',
    'Blunt runes hum along the flat. (+4 STR, +2% gold from tasks & focus)',
    'equipment',
    'epic',
    0,
    true,
    '{"slot":"weapon","bonuses":{"strength":4,"gold_bonus_pct":2}}'::jsonb
  ),
  (
    'eq-dawnsign-circlet',
    'Dawnsign Circlet',
    'Legendary crown of first light. (+4 INT, +4 CON, +6% task XP)',
    'equipment',
    'legendary',
    0,
    true,
    '{"slot":"head","bonuses":{"intelligence":4,"constitution":4,"xp_bonus_pct":6}}'::jsonb
  ),
  (
    'eq-eclip-core-charm',
    'Eclip Core Charm',
    'A tiny dark sun on a loop. (+6% XP, +6% gold from tasks & focus)',
    'equipment',
    'legendary',
    0,
    true,
    '{"slot":"charm","bonuses":{"xp_bonus_pct":6,"gold_bonus_pct":6}}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  price = EXCLUDED.price,
  forge_exclusive = EXCLUDED.forge_exclusive,
  metadata = EXCLUDED.metadata,
  is_active = true;
