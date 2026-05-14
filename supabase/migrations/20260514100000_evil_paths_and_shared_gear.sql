-- Add evil aura paths and share gear pools with their good counterparts.
-- Pairs: swordsman <-> evilswordsman, mage <-> evilmage, tank <-> evilpaladin, rogue <-> evilrogue

-- 1. Extend the aura_path enum with evil variants
ALTER TYPE public.aura_path ADD VALUE IF NOT EXISTS 'evilswordsman';
ALTER TYPE public.aura_path ADD VALUE IF NOT EXISTS 'evilmage';
ALTER TYPE public.aura_path ADD VALUE IF NOT EXISTS 'evilpaladin';
ALTER TYPE public.aura_path ADD VALUE IF NOT EXISTS 'evilrogue';

-- 2. Update handle_new_user to accept evil paths
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
    WHEN v_path_text IN ('swordsman', 'mage', 'tank', 'rogue',
                         'evilswordsman', 'evilmage', 'evilpaladin', 'evilrogue')
    THEN v_path_text::public.aura_path
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

-- 3. Update all swordsman path gear to also allow evilswordsman
UPDATE public.shop_items
SET metadata = jsonb_set(
  metadata::jsonb,
  '{allowed_paths}',
  '["swordsman","evilswordsman"]'::jsonb
)
WHERE category = 'equipment'
  AND (metadata::jsonb)->'allowed_paths' @> '["swordsman"]'::jsonb
  AND NOT (metadata::jsonb)->'allowed_paths' @> '["evilswordsman"]'::jsonb;

-- 4. Update all mage path gear to also allow evilmage
UPDATE public.shop_items
SET metadata = jsonb_set(
  metadata::jsonb,
  '{allowed_paths}',
  '["mage","evilmage"]'::jsonb
)
WHERE category = 'equipment'
  AND (metadata::jsonb)->'allowed_paths' @> '["mage"]'::jsonb
  AND NOT (metadata::jsonb)->'allowed_paths' @> '["evilmage"]'::jsonb;

-- 5. Update all tank path gear to also allow evilpaladin
UPDATE public.shop_items
SET metadata = jsonb_set(
  metadata::jsonb,
  '{allowed_paths}',
  '["tank","evilpaladin"]'::jsonb
)
WHERE category = 'equipment'
  AND (metadata::jsonb)->'allowed_paths' @> '["tank"]'::jsonb
  AND NOT (metadata::jsonb)->'allowed_paths' @> '["evilpaladin"]'::jsonb;

-- 6. Update all rogue path gear to also allow evilrogue
UPDATE public.shop_items
SET metadata = jsonb_set(
  metadata::jsonb,
  '{allowed_paths}',
  '["rogue","evilrogue"]'::jsonb
)
WHERE category = 'equipment'
  AND (metadata::jsonb)->'allowed_paths' @> '["rogue"]'::jsonb
  AND NOT (metadata::jsonb)->'allowed_paths' @> '["evilrogue"]'::jsonb;
