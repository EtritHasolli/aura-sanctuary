-- Phase 3: Companion catalog + user collection + hatch from egg consumable

CREATE TABLE IF NOT EXISTS public.companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rarity TEXT NOT NULL DEFAULT 'common',
  can_mount BOOLEAN NOT NULL DEFAULT false,
  sprite_key TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_companions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  companion_id UUID NOT NULL REFERENCES public.companions(id) ON DELETE CASCADE,
  bond_xp INT NOT NULL DEFAULT 0,
  equipped_as TEXT NOT NULL DEFAULT 'none' CHECK (equipped_as IN ('none', 'pet', 'mount')),
  hatched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, companion_id)
);

CREATE INDEX IF NOT EXISTS user_companions_user_idx ON public.user_companions(user_id);

ALTER TABLE public.companions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_companions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companions_read_all" ON public.companions FOR SELECT USING (true);

CREATE POLICY "user_companions_owner" ON public.user_companions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Only one pet and one mount equipped
CREATE OR REPLACE FUNCTION public.enforce_single_companion_equip()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.equipped_as = 'pet' THEN
    UPDATE public.user_companions SET equipped_as = 'none'
    WHERE user_id = NEW.user_id AND equipped_as = 'pet' AND id <> NEW.id;
  ELSIF NEW.equipped_as = 'mount' THEN
    UPDATE public.user_companions SET equipped_as = 'none'
    WHERE user_id = NEW.user_id AND equipped_as = 'mount' AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_companions_equip ON public.user_companions;
CREATE TRIGGER trg_user_companions_equip
  AFTER INSERT OR UPDATE OF equipped_as ON public.user_companions
  FOR EACH ROW WHEN (NEW.equipped_as <> 'none')
  EXECUTE FUNCTION public.enforce_single_companion_equip();

INSERT INTO public.companions (slug, name, description, rarity, can_mount, sprite_key)
VALUES
  ('sprig', 'Sprig', 'Your starter forest spirit.', 'common', false, 'default'),
  ('ember-pip', 'Ember Pip', 'A warm ember mouse.', 'uncommon', false, 'ember'),
  ('mist-strider', 'Mist Strider', 'A gentle mount of morning fog.', 'rare', true, 'mist')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.shop_items (slug, name, description, category, rarity, price, metadata)
VALUES
  ('companion-egg', 'Mystery Companion Egg', 'Hatch a random companion. May duplicate into bond XP.', 'consumable', 'rare', 200, '{"hatch":"companion_random"}')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  price = EXCLUDED.price,
  metadata = EXCLUDED.metadata,
  is_active = true;

CREATE OR REPLACE FUNCTION public.hatch_companion_egg()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_item public.shop_items%ROWTYPE;
  v_ui public.user_items%ROWTYPE;
  v_pick UUID;
  v_slug TEXT;
  v_name TEXT;
  v_existing UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_item FROM public.shop_items WHERE slug = 'companion-egg' AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Egg not in catalog'; END IF;

  SELECT * INTO v_ui FROM public.user_items ui
  WHERE ui.user_id = v_uid AND ui.item_id = v_item.id FOR UPDATE;
  IF NOT FOUND OR v_ui.quantity < 1 THEN RAISE EXCEPTION 'No companion egg in inventory'; END IF;

  UPDATE public.user_items SET quantity = quantity - 1 WHERE id = v_ui.id;

  SELECT id INTO v_pick FROM public.companions ORDER BY random() LIMIT 1;
  SELECT slug, name INTO v_slug, v_name FROM public.companions WHERE id = v_pick;

  SELECT id INTO v_existing FROM public.user_companions WHERE user_id = v_uid AND companion_id = v_pick;

  IF v_existing IS NOT NULL THEN
    UPDATE public.user_companions SET bond_xp = bond_xp + 25 WHERE id = v_existing;
    RETURN json_build_object('duplicate', true, 'slug', v_slug, 'name', v_name, 'bond_bonus', 25);
  END IF;

  INSERT INTO public.user_companions (user_id, companion_id, bond_xp, equipped_as)
  VALUES (v_uid, v_pick, 0, 'none');

  RETURN json_build_object('duplicate', false, 'slug', v_slug, 'name', v_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hatch_companion_egg() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hatch_companion_egg() TO authenticated;
