-- Phase 8: Moonshards (premium-style currency) + purchase_shop_item currency support

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS moonshards INT NOT NULL DEFAULT 0 CHECK (moonshards >= 0);

ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS currency_type TEXT NOT NULL DEFAULT 'gold'
    CHECK (currency_type IN ('gold', 'moonshard'));

COMMENT ON COLUMN public.shop_items.currency_type IS 'Which balance purchase_shop_item deducts from.';

INSERT INTO public.shop_items (slug, name, description, category, rarity, price, currency_type, metadata)
SELECT 'moonshard-cosmetic-orb', 'Lunar Cosmetic Orb', 'A shimmering orb bought with Moonshards.', 'cosmetic', 'epic', 3, 'moonshard', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.shop_items WHERE slug = 'moonshard-cosmetic-orb');

-- Return shape changed (adds moonshards_left), so replace is not enough.
DROP FUNCTION IF EXISTS public.purchase_shop_item(TEXT, INT);

CREATE FUNCTION public.purchase_shop_item(
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

  IF COALESCE(v_item.currency_type, 'gold') = 'moonshard' THEN
    IF v_profile.moonshards < v_total_cost THEN
      RAISE EXCEPTION 'Insufficient moonshards: need %, have %', v_total_cost, v_profile.moonshards;
    END IF;
    UPDATE public.profiles
    SET moonshards = moonshards - v_total_cost
    WHERE id = v_uid;
  ELSE
    IF v_profile.gold < v_total_cost THEN
      RAISE EXCEPTION 'Insufficient gold: need %, have %', v_total_cost, v_profile.gold;
    END IF;
    UPDATE public.profiles
    SET gold = gold - v_total_cost
    WHERE id = v_uid;
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

REVOKE EXECUTE ON FUNCTION public.purchase_shop_item(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(TEXT, INT) TO authenticated;
