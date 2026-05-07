-- RPG paths overhaul: swordsman/mage/tank/rogue, dexterity, immutable path,
-- and path-restricted equipment purchasing/equipping/forging.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'aura_path_v2'
  ) THEN
    CREATE TYPE public.aura_path_v2 AS ENUM ('swordsman', 'mage', 'tank', 'rogue');
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dexterity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS equip_dex_bonus INT NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_dexterity_nonnegative CHECK (dexterity >= 0);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_path_new public.aura_path_v2;

UPDATE public.profiles
SET aura_path_new = CASE
  WHEN aura_path::text = 'warden' THEN 'swordsman'::public.aura_path_v2
  WHEN aura_path::text = 'scholar' THEN 'mage'::public.aura_path_v2
  WHEN aura_path::text = 'keeper' THEN 'tank'::public.aura_path_v2
  WHEN aura_path::text = 'strider' THEN 'rogue'::public.aura_path_v2
  ELSE NULL
END
WHERE aura_path_new IS NULL;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS aura_path;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'aura_path'
  ) THEN
    ALTER TYPE public.aura_path RENAME TO aura_path_legacy;
  END IF;
END;
$$;

ALTER TYPE public.aura_path_v2 RENAME TO aura_path;
ALTER TABLE public.profiles RENAME COLUMN aura_path_new TO aura_path;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path_text TEXT;
  v_path public.aura_path;
BEGIN
  v_path_text := lower(COALESCE(NEW.raw_user_meta_data->>'aura_path', ''));
  v_path := CASE
    WHEN v_path_text IN ('swordsman', 'mage', 'tank', 'rogue') THEN v_path_text::public.aura_path
    ELSE NULL
  END;

  INSERT INTO public.profiles (id, display_name, aura_path)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Adventurer'),
    v_path
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_immutable_aura_path()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.aura_path IS NOT NULL AND NEW.aura_path IS DISTINCT FROM OLD.aura_path THEN
    RAISE EXCEPTION 'Aura path is locked after first selection';
  END IF;
  IF OLD.aura_path IS NOT NULL AND NEW.aura_path IS NULL THEN
    RAISE EXCEPTION 'Aura path cannot be cleared once selected';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_immutable_aura_path ON public.profiles;
CREATE TRIGGER trg_guard_immutable_aura_path
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_immutable_aura_path();

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
  v_db INT;
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
      CASE WHEN (si.metadata::jsonb ? 'bonuses') AND ((si.metadata::jsonb)->'bonuses') ? 'dexterity'
           THEN ((((si.metadata::jsonb)->'bonuses')->>'dexterity'))::INT ELSE 0 END
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
  INTO v_sb, v_ib, v_cb, v_db, v_msb, v_xpp, v_gbp
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
    equip_dex_bonus = COALESCE(v_db, 0),
    equip_max_stamina_bonus = COALESCE(v_msb, 0),
    equip_xp_bonus_pct = LEAST(100, GREATEST(0, COALESCE(v_xpp, 0))),
    equip_gold_bonus_pct = LEAST(100, GREATEST(0, COALESCE(v_gbp, 0)))
  WHERE pr.id = p_uid;
END;
$$;

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
  v_qty INT;
  v_allowed_paths JSONB;
  v_path public.aura_path;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT ui.user_id, ui.quantity, si.category,
         COALESCE(NULLIF(trim(si.metadata::jsonb->>'slot'), ''), '__unique__:' || si.id::text),
         si.metadata::jsonb->'allowed_paths'
  INTO v_owner, v_qty, v_cat, v_slot, v_allowed_paths
  FROM public.user_items ui
  INNER JOIN public.shop_items si ON si.id = ui.item_id
  WHERE ui.id = p_user_item_id
  FOR UPDATE OF ui;

  IF NOT FOUND THEN RAISE EXCEPTION 'Item row not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'Not yours'; END IF;
  IF v_cat <> 'equipment' THEN RAISE EXCEPTION 'Only equipment can be equipped'; END IF;
  IF v_qty < 1 THEN RAISE EXCEPTION 'You do not have this item'; END IF;

  IF jsonb_typeof(v_allowed_paths) = 'array' AND jsonb_array_length(v_allowed_paths) > 0 THEN
    SELECT aura_path INTO v_path FROM public.profiles WHERE id = v_uid;
    IF v_path IS NULL THEN
      RAISE EXCEPTION 'Choose a path before equipping class gear';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_allowed_paths) AS p(path_name)
      WHERE p.path_name = v_path::text
    ) THEN
      RAISE EXCEPTION 'This gear does not fit your path';
    END IF;
  END IF;

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

CREATE OR REPLACE FUNCTION public.purchase_shop_item(
  p_item_slug TEXT,
  p_quantity INT DEFAULT 1
)
RETURNS TABLE (
  item_slug TEXT,
  quantity_purchased INT,
  new_quantity INT,
  gold_left INT,
  moonshards_left INT
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
  v_allowed_paths JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 99 THEN
    RAISE EXCEPTION 'Quantity must be between 1 and 99';
  END IF;

  SELECT * INTO v_item
  FROM public.shop_items
  WHERE slug = p_item_slug AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found or inactive: %', p_item_slug; END IF;
  IF COALESCE(v_item.forge_exclusive, false) THEN
    RAISE EXCEPTION 'This item cannot be purchased from the shop';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_allowed_paths := v_item.metadata::jsonb->'allowed_paths';
  IF jsonb_typeof(v_allowed_paths) = 'array' AND jsonb_array_length(v_allowed_paths) > 0 THEN
    IF v_profile.aura_path IS NULL THEN
      RAISE EXCEPTION 'Choose a path before buying class gear';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(v_allowed_paths) AS p(path_name)
      WHERE p.path_name = v_profile.aura_path::text
    ) THEN
      RAISE EXCEPTION 'This gear is locked to a different path';
    END IF;
  END IF;

  v_total_cost := v_item.price * p_quantity;
  IF COALESCE(v_item.currency_type, 'gold') = 'moonshard' THEN
    IF v_profile.moonshards < v_total_cost THEN
      RAISE EXCEPTION 'Insufficient moonshards: need %, have %', v_total_cost, v_profile.moonshards;
    END IF;
    UPDATE public.profiles SET moonshards = moonshards - v_total_cost WHERE id = v_uid;
  ELSE
    IF v_profile.gold < v_total_cost THEN
      RAISE EXCEPTION 'Insufficient gold: need %, have %', v_total_cost, v_profile.gold;
    END IF;
    UPDATE public.profiles SET gold = gold - v_total_cost WHERE id = v_uid;
  END IF;

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
    (SELECT gold FROM public.profiles WHERE id = v_uid),
    (SELECT moonshards FROM public.profiles WHERE id = v_uid);
END;
$$;

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
  v_path public.aura_path;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path INTO v_path FROM public.profiles WHERE id = v_uid;

  v_pick := ARRAY[p_user_item_id_a, p_user_item_id_b, p_user_item_id_c];
  IF v_pick[1] IS NULL OR v_pick[2] IS NULL OR v_pick[3] IS NULL THEN
    RAISE EXCEPTION 'Three gear rows are required';
  END IF;

  SELECT ARRAY(SELECT DISTINCT x FROM unnest(v_pick) AS x ORDER BY 1) INTO v_dist;
  FOREACH v_id IN ARRAY v_dist LOOP
    SELECT COUNT(*)::INT FROM unnest(v_pick) AS p WHERE p = v_id INTO v_need;
    SELECT ui.quantity, COALESCE(trim(si.slug), ''), COALESCE(trim(si.category), ''), trim(si.rarity)::TEXT
    INTO v_qty, v_slug, v_cat, v_r
    FROM public.user_items ui
    INNER JOIN public.shop_items si ON si.id = ui.item_id
    WHERE ui.id = v_id AND ui.user_id = v_uid
    FOR UPDATE OF ui;

    IF NOT FOUND THEN RAISE EXCEPTION 'Item row not found or not yours: %', v_id::TEXT; END IF;
    IF v_qty < v_need THEN
      RAISE EXCEPTION 'Not enough quantity for % (% needed, % have)', COALESCE(NULLIF(v_slug, ''), v_id::TEXT), v_need, v_qty;
    END IF;
    IF v_cat <> 'equipment' THEN
      RAISE EXCEPTION 'Only gear (equipment category) can be forged: %', COALESCE(NULLIF(v_slug, ''), v_id::TEXT);
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_items uix WHERE uix.id = v_id AND uix.user_id = v_uid AND uix.equipped IS TRUE) THEN
      RAISE EXCEPTION 'Unequip items before forging: %', COALESCE(NULLIF(v_slug, ''), v_id::TEXT);
    END IF;
    IF v_first THEN
      v_ref_r := v_r;
      v_first := false;
    ELSIF v_r IS DISTINCT FROM v_ref_r THEN
      RAISE EXCEPTION 'All three items must share the same rarity';
    END IF;
  END LOOP;

  IF v_ref_r IS NULL THEN RAISE EXCEPTION 'Could not determine input rarity'; END IF;

  SELECT COUNT(DISTINCT si.rarity) INTO v_rarity_dcount
  FROM unnest(v_pick) AS p(id)
  INNER JOIN public.user_items ui ON ui.id = p.id AND ui.user_id = v_uid
  INNER JOIN public.shop_items si ON si.id = ui.item_id;
  IF v_rarity_dcount <> 1 THEN RAISE EXCEPTION 'All three items must share the same rarity'; END IF;

  v_next_r := CASE v_ref_r
    WHEN 'common' THEN 'uncommon'
    WHEN 'uncommon' THEN 'rare'
    WHEN 'rare' THEN 'epic'
    WHEN 'epic' THEN 'legendary'
    ELSE NULL
  END;
  IF v_next_r IS NULL THEN RAISE EXCEPTION 'Legendary gear cannot be forged higher'; END IF;

  SELECT si.id, si.slug, si.name, si.rarity
  INTO v_out_id, v_out_slug, v_out_name, v_out_rarity
  FROM public.shop_items si
  WHERE si.category = 'equipment'
    AND si.is_active IS TRUE
    AND si.rarity = v_next_r
    AND (
      v_path IS NULL
      OR NOT ((si.metadata::jsonb) ? 'allowed_paths')
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(si.metadata::jsonb->'allowed_paths') AS p(path_name)
        WHERE p.path_name = v_path::text
      )
    )
  ORDER BY random()
  LIMIT 1;

  IF v_out_id IS NULL THEN RAISE EXCEPTION 'No forge output exists for rarity % yet', v_next_r; END IF;

  FOREACH v_id IN ARRAY v_dist LOOP
    SELECT COUNT(*)::INT FROM unnest(v_pick) AS p WHERE p = v_id INTO v_need;
    UPDATE public.user_items ui
    SET quantity = ui.quantity - v_need,
        equipped = CASE WHEN ui.quantity - v_need <= 0 THEN false ELSE ui.equipped END
    WHERE ui.id = v_id AND ui.user_id = v_uid;
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

CREATE OR REPLACE FUNCTION public.use_skill_focus_ward()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'focus_ward';
  v_eff_int INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 30;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, intelligence + COALESCE(equip_int_bonus, 0)
  INTO v_path, v_cd, v_eff_int FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'swordsman' THEN RAISE EXCEPTION 'Only Swordsman may use Battle Focus'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_int / 2)));
  v_cd_minutes := GREATEST(10, FLOOR(30 * (100 - v_reduction_pct) / 100.0));
  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (v_uid, 'xp_focus_bonus', now() + interval '2 hours', '{"pct":25}'::jsonb)
  ON CONFLICT (user_id, buff_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;
  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;
  RETURN json_build_object('ok', true, 'buff', 'xp_focus_bonus', 'cooldown_minutes', v_cd_minutes);
END;
$$;

CREATE OR REPLACE FUNCTION public.use_skill_party_mend(p_party_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'party_mend';
  v_heal INT := 18;
  v_new_hp INT;
  v_max INT;
  v_eff_int INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 45;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_party_member(p_party_id, v_uid) THEN RAISE EXCEPTION 'Not a party member'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, intelligence + COALESCE(equip_int_bonus, 0)
  INTO v_path, v_cd, v_eff_int FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'mage' THEN RAISE EXCEPTION 'Only Mage may use Arcane Mend'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  SELECT boss_hp, boss_max_hp INTO v_new_hp, v_max FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;
  v_new_hp := LEAST(v_max, v_new_hp + v_heal);
  UPDATE public.parties SET boss_hp = v_new_hp WHERE id = p_party_id;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_int / 2)));
  v_cd_minutes := GREATEST(15, FLOOR(45 * (100 - v_reduction_pct) / 100.0));
  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;
  RETURN json_build_object('ok', true, 'boss_hp', v_new_hp, 'heal', v_heal, 'cooldown_minutes', v_cd_minutes);
END;
$$;

CREATE OR REPLACE FUNCTION public.use_skill_shadow_strike()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'shadow_strike';
  v_eff_dex INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 40;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, dexterity + COALESCE(equip_dex_bonus, 0)
  INTO v_path, v_cd, v_eff_dex FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'rogue' THEN RAISE EXCEPTION 'Only Rogue may use Shadow Strike'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (v_uid, 'boss_dmg_bonus', now() + interval '20 minutes', '{"pct":35}'::jsonb)
  ON CONFLICT (user_id, buff_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_dex / 2)));
  v_cd_minutes := GREATEST(15, FLOOR(40 * (100 - v_reduction_pct) / 100.0));
  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;
  RETURN json_build_object('ok', true, 'buff', 'boss_dmg_bonus', 'cooldown_minutes', v_cd_minutes);
END;
$$;

CREATE OR REPLACE FUNCTION public.use_skill_second_wind()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'second_wind';
  v_gain INT := 28;
  v_sta INT;
  v_max INT;
  v_eff_max INT;
  v_eff_con INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 60;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, max_stamina, max_stamina + COALESCE(equip_max_stamina_bonus, 0), constitution + COALESCE(equip_con_bonus, 0)
  INTO v_path, v_cd, v_max, v_eff_max, v_eff_con FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'tank' THEN RAISE EXCEPTION 'Only Tank may use Iron Guard'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_con / 2)));
  v_cd_minutes := GREATEST(20, FLOOR(60 * (100 - v_reduction_pct) / 100.0));
  UPDATE public.profiles
  SET stamina = LEAST(v_eff_max, stamina + v_gain),
      skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid
  RETURNING stamina, v_eff_max INTO v_sta, v_max;
  RETURN json_build_object('ok', true, 'stamina', v_sta, 'gained', v_gain, 'max_stamina', v_max, 'cooldown_minutes', v_cd_minutes);
END;
$$;

-- Create path-scoped starter pools (30 entries per path) using procedural inserts.
DO $$
DECLARE
  path_name TEXT;
  idx INT;
  slot_name TEXT;
  rarity_name TEXT;
  bonus_key TEXT;
  bonus_val INT;
  slug_text TEXT;
  item_name TEXT;
BEGIN
  FOR path_name IN SELECT unnest(ARRAY['swordsman','mage','tank','rogue']) LOOP
    FOR idx IN 1..30 LOOP
      slot_name := CASE ((idx - 1) % 5)
        WHEN 0 THEN 'weapon'
        WHEN 1 THEN 'head'
        WHEN 2 THEN 'chest'
        WHEN 3 THEN 'hands'
        ELSE 'charm'
      END;
      rarity_name := CASE
        WHEN idx <= 16 THEN 'common'
        WHEN idx <= 24 THEN 'uncommon'
        WHEN idx <= 28 THEN 'rare'
        ELSE 'epic'
      END;
      bonus_key := CASE path_name
        WHEN 'swordsman' THEN CASE WHEN idx % 3 = 0 THEN 'constitution' ELSE 'strength' END
        WHEN 'mage' THEN CASE WHEN idx % 3 = 0 THEN 'dexterity' ELSE 'intelligence' END
        WHEN 'tank' THEN CASE WHEN idx % 3 = 0 THEN 'strength' ELSE 'constitution' END
        ELSE CASE WHEN idx % 3 = 0 THEN 'intelligence' ELSE 'dexterity' END
      END;
      bonus_val := CASE rarity_name
        WHEN 'common' THEN 1
        WHEN 'uncommon' THEN 2
        WHEN 'rare' THEN 3
        ELSE 4
      END;
      slug_text := format('eq-%s-v%02s', path_name, idx);
      item_name := initcap(path_name) || ' Relic ' || idx::TEXT;

      INSERT INTO public.shop_items (
        slug, name, description, category, rarity, price, is_active, metadata
      )
      VALUES (
        slug_text,
        item_name,
        format('Path-bound gear for %s. (%s +%s)', initcap(path_name), upper(left(bonus_key, 3)), bonus_val),
        'equipment',
        rarity_name,
        CASE rarity_name
          WHEN 'common' THEN 130 + idx
          WHEN 'uncommon' THEN 200 + idx * 2
          WHEN 'rare' THEN 320 + idx * 3
          ELSE 480 + idx * 4
        END,
        true,
        jsonb_build_object(
          'slot', slot_name,
          'allowed_paths', jsonb_build_array(path_name),
          'bonuses', jsonb_build_object(bonus_key, bonus_val)
        )
      )
      ON CONFLICT (slug) DO UPDATE
      SET name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          rarity = EXCLUDED.rarity,
          price = EXCLUDED.price,
          is_active = true,
          metadata = EXCLUDED.metadata;
    END LOOP;
  END LOOP;
END;
$$;
