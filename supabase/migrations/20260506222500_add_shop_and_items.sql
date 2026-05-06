-- Shop + inventory system for Aura Sanctuary

-- Catalog of items sold in the shop
CREATE TABLE public.shop_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('cosmetic', 'consumable', 'furniture', 'pet')),
  rarity TEXT NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  price INT NOT NULL CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Shop items readable by authenticated users"
  ON public.shop_items
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- User-owned item quantities
CREATE TABLE public.user_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.shop_items ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  equipped BOOLEAN NOT NULL DEFAULT false,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

ALTER TABLE public.user_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User items owner all"
  ON public.user_items
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX user_items_user_id_idx ON public.user_items(user_id);
CREATE INDEX user_items_item_id_idx ON public.user_items(item_id);

-- Purchase log for audit/history
CREATE TABLE public.shop_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.shop_items ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  total_cost INT NOT NULL CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shop_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Purchase history owner read"
  ON public.shop_purchases
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Purchase history owner insert"
  ON public.shop_purchases
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX shop_purchases_user_id_idx ON public.shop_purchases(user_id, created_at DESC);

-- Keep updated_at in sync
CREATE TRIGGER user_items_touch
  BEFORE UPDATE ON public.user_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Secure purchase RPC:
-- - validates auth
-- - checks active item and stock request
-- - verifies user gold with row lock
-- - debits gold
-- - upserts inventory
-- - writes purchase log
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

-- Starter shop catalog
INSERT INTO public.shop_items (slug, name, description, category, rarity, price, metadata)
VALUES
  ('pet-wizard-hat', 'Wizard Hat', 'A tiny hat that makes your pet look arcane.', 'cosmetic', 'uncommon', 120, '{"slot":"hat"}'),
  ('pet-crown', 'Tiny Crown', 'A royal crown for milestone victories.', 'cosmetic', 'rare', 250, '{"slot":"hat"}'),
  ('room-neon-lamp', 'Neon Lamp', 'Adds a warm ambient glow to the sanctuary.', 'furniture', 'common', 90, '{"placement":"room"}'),
  ('room-bonsai', 'Bonsai Shelf', 'A calming bonsai display for your focus corner.', 'furniture', 'uncommon', 180, '{"placement":"shelf"}'),
  ('room-rune-rug', 'Rune Rug', 'A decorative rug with subtle mystic symbols.', 'furniture', 'rare', 320, '{"placement":"floor"}'),
  ('pet-amber-aura', 'Amber Aura', 'A cozy amber glow around your pet.', 'cosmetic', 'rare', 220, '{"slot":"aura"}'),
  ('loot-key', 'Mystery Key', 'Used to open one mystery box.', 'consumable', 'common', 70, '{"consumable":true}'),
  ('hp-herb-tea', 'Herb Tea', 'Restores a small amount of HP.', 'consumable', 'common', 45, '{"effect":{"hp":8}}'),
  ('focus-incense', 'Focus Incense', 'Small temporary focus boost for one session.', 'consumable', 'uncommon', 95, '{"effect":{"xp_bonus_pct":10}}'),
  ('pet-scout-form', 'Scout Form', 'Unlocks an alternate pet evolution skin.', 'pet', 'epic', 500, '{"unlock":"scout-form"}')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  price = EXCLUDED.price,
  metadata = EXCLUDED.metadata,
  is_active = true;
