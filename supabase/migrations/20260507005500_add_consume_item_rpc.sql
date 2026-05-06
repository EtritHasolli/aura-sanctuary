-- Consumable usage RPC (supports stamina/hp effects from item metadata)

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

  v_stamina_gain := COALESCE((v_item.metadata -> 'effect' ->> 'stamina')::INT, 0) * p_quantity;
  v_hp_gain := COALESCE((v_item.metadata -> 'effect' ->> 'hp')::INT, 0) * p_quantity;

  UPDATE public.user_items
  SET quantity = quantity - p_quantity
  WHERE id = v_user_item.id;

  UPDATE public.profiles
  SET
    stamina = LEAST(max_stamina, GREATEST(0, stamina + v_stamina_gain)),
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

REVOKE EXECUTE ON FUNCTION public.consume_user_item(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_user_item(TEXT, INT) TO authenticated;

-- Add stamina consumables (upsert for idempotence)
INSERT INTO public.shop_items (slug, name, description, category, rarity, price, metadata)
VALUES
  ('stamina-herbal-tea', 'Stamina Herbal Tea', 'Restores a small burst of stamina.', 'consumable', 'common', 55, '{"effect":{"stamina":12}}'),
  ('stamina-energy-bar', 'Energy Bar', 'Quick snack that restores stamina.', 'consumable', 'uncommon', 95, '{"effect":{"stamina":25}}'),
  ('stamina-crystal-vial', 'Crystal Vial', 'A potent vial for major stamina recovery.', 'consumable', 'rare', 170, '{"effect":{"stamina":45}}')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  price = EXCLUDED.price,
  metadata = EXCLUDED.metadata,
  is_active = true;
