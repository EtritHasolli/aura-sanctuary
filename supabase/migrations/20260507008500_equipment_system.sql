-- Equipment category, profile bonus columns, equip RPCs, and function updates.

-- Allow equipment listings
ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_category_check;
ALTER TABLE public.shop_items ADD CONSTRAINT shop_items_category_check
  CHECK (category IN ('cosmetic', 'consumable', 'furniture', 'pet', 'equipment'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS equip_str_bonus INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equip_int_bonus INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equip_con_bonus INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equip_max_stamina_bonus INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equip_xp_bonus_pct INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equip_gold_bonus_pct INT NOT NULL DEFAULT 0;

-- Sum equipped gear metadata.bonuses into profile.*
CREATE OR REPLACE FUNCTION public.recompute_profiles_equipment_bonus(p_uid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sb INT;
  v_ib INT;
  v_cb INT;
  v_msb INT;
  v_xpp INT;
  v_gbp INT;
BEGIN
  SELECT
    COALESCE(SUM(
      CASE WHEN (si.metadata::jsonb ? 'bonuses') AND ((si.metadata::jsonb)->'bonuses') ? 'strength'
           THEN ((((si.metadata::jsonb)->'bonuses')->>'strength'))::INT ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN (si.metadata::jsonb ? 'bonuses') AND ((si.metadata::jsonb)->'bonuses') ? 'intelligence'
           THEN ((((si.metadata::jsonb)->'bonuses')->>'intelligence'))::INT ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN (si.metadata::jsonb ? 'bonuses') AND ((si.metadata::jsonb)->'bonuses') ? 'constitution'
           THEN ((((si.metadata::jsonb)->'bonuses')->>'constitution'))::INT ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN (si.metadata::jsonb ? 'bonuses') AND ((si.metadata::jsonb)->'bonuses') ? 'max_stamina'
           THEN ((((si.metadata::jsonb)->'bonuses')->>'max_stamina'))::INT ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN (si.metadata::jsonb ? 'bonuses') AND ((si.metadata::jsonb)->'bonuses') ? 'xp_bonus_pct'
           THEN ((((si.metadata::jsonb)->'bonuses')->>'xp_bonus_pct'))::INT ELSE 0 END
    ), 0),
    COALESCE(SUM(
      CASE WHEN (si.metadata::jsonb ? 'bonuses') AND ((si.metadata::jsonb)->'bonuses') ? 'gold_bonus_pct'
           THEN ((((si.metadata::jsonb)->'bonuses')->>'gold_bonus_pct'))::INT ELSE 0 END
    ), 0)
  INTO v_sb, v_ib, v_cb, v_msb, v_xpp, v_gbp
  FROM public.user_items ui
  INNER JOIN public.shop_items si ON si.id = ui.item_id
  WHERE ui.user_id = p_uid
    AND ui.equipped IS TRUE
    AND ui.quantity > 0
    AND si.category = 'equipment';

  UPDATE public.profiles pr
  SET
    equip_str_bonus = COALESCE(v_sb, 0),
    equip_int_bonus = COALESCE(v_ib, 0),
    equip_con_bonus = COALESCE(v_cb, 0),
    equip_max_stamina_bonus = COALESCE(v_msb, 0),
    equip_xp_bonus_pct = LEAST(100, GREATEST(0, COALESCE(v_xpp, 0))),
    equip_gold_bonus_pct = LEAST(100, GREATEST(0, COALESCE(v_gbp, 0)))
  WHERE pr.id = p_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_profiles_equipment_bonus(UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.equip_user_item(p_user_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_slot TEXT;
  v_cat TEXT;
  v_owner UUID;
  v_slug TEXT;
  v_qty INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT ui.user_id, ui.quantity, si.category, COALESCE(NULLIF(trim(si.slug), ''), si.id::text),
         COALESCE(NULLIF(trim(si.metadata::jsonb->>'slot'), ''), '__unique__:' || si.id::text)
  INTO v_owner, v_qty, v_cat, v_slug, v_slot
  FROM public.user_items ui
  INNER JOIN public.shop_items si ON si.id = ui.item_id
  WHERE ui.id = p_user_item_id
  FOR UPDATE OF ui;

  IF NOT FOUND THEN RAISE EXCEPTION 'Item row not found'; END IF;

  IF v_owner <> v_uid THEN RAISE EXCEPTION 'Not yours'; END IF;

  IF v_cat <> 'equipment' THEN RAISE EXCEPTION 'Only equipment can be equipped'; END IF;

  IF v_qty < 1 THEN RAISE EXCEPTION 'You do not have this item'; END IF;

  UPDATE public.user_items oui
  SET equipped = false
  FROM public.shop_items osi
  WHERE oui.item_id = osi.id
    AND oui.user_id = v_uid
    AND oui.quantity > 0
    AND osi.category = 'equipment'
    AND COALESCE(NULLIF(trim(osi.metadata::jsonb->>'slot'), ''), '__unique__:' || osi.id::text) = v_slot;

  UPDATE public.user_items ui2
  SET equipped = true
  WHERE ui2.id = p_user_item_id AND ui2.user_id = v_uid;

  PERFORM public.recompute_profiles_equipment_bonus(v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.unequip_user_item(p_user_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_cnt INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.user_items ui
  SET equipped = false
  WHERE ui.id = p_user_item_id AND ui.user_id = v_uid;
  GET DIAGNOSTICS v_cnt = ROW_COUNT;
  IF v_cnt = 0 THEN RAISE EXCEPTION 'Item row not found'; END IF;

  PERFORM public.recompute_profiles_equipment_bonus(v_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.equip_user_item(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.equip_user_item(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.equip_user_item(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.unequip_user_item(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unequip_user_item(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.unequip_user_item(UUID) TO authenticated;

-- Starter equipment (sold in Zen Shop equipment tab)
INSERT INTO public.shop_items (slug, name, description, category, rarity, price, metadata)
VALUES
  (
    'eq-wooden-training-blade',
    'Training Blade',
    'Rough but solid. (+2 Strength)',
    'equipment',
    'common',
    110,
    '{"slot":"weapon","bonuses":{"strength":2}}'::jsonb
  ),
  (
    'eq-scholar-lens-band',
    'Scholar Lens Band',
    'Focus for the mind. (+2 Intelligence)',
    'equipment',
    'uncommon',
    155,
    '{"slot":"head","bonuses":{"intelligence":2}}'::jsonb
  ),
  (
    'eq-reinforced-tunic',
    'Reinforced Tunic',
    'Layers of stitched leather. (+2 Constitution, +5 max stamina)',
    'equipment',
    'uncommon',
    195,
    '{"slot":"chest","bonuses":{"constitution":2,"max_stamina":5}}'::jsonb
  ),
  (
    'eq-steadfast-wraps',
    'Steadfast Wraps',
    'Grip training for hands and wrists. (+1 Strength, +1 Intelligence)',
    'equipment',
    'common',
    125,
    '{"slot":"hands","bonuses":{"strength":1,"intelligence":1}}'::jsonb
  ),
  (
    'eq-lucky-loop-charm',
    'Lucky Loop Charm',
    'Whispers encouragement. (+5%% bonus XP & gold from tasks & focus)',
    'equipment',
    'rare',
    285,
    '{"slot":"charm","bonuses":{"xp_bonus_pct":5,"gold_bonus_pct":5}}'::jsonb
  )
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  price = EXCLUDED.price,
  metadata = EXCLUDED.metadata,
  is_active = true;

-- Back-fill equipment bonuses column for existing profiles
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.recompute_profiles_equipment_bonus(r.id);
  END LOOP;
END;
$$;
