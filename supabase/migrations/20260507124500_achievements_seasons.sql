-- Phase 6: Achievements + seasonal shop flag

CREATE TABLE IF NOT EXISTS public.achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES public.achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE public.shop_items
  ADD COLUMN IF NOT EXISTS season_slug TEXT;

COMMENT ON COLUMN public.shop_items.season_slug IS 'NULL = always available; otherwise only shown when shop season matches.';

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_read" ON public.achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_achievements_read" ON public.user_achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_achievements_self_ins" ON public.user_achievements FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

INSERT INTO public.achievements (slug, name, description)
SELECT x.slug, x.name, x.descr
FROM (VALUES
  ('first_hero', 'First Hero', 'Reach level 5.'),
  ('gold_hoard', 'Gold Hoard', 'Hold at least 500 gold at once.'),
  ('iron_will', 'Iron Will', 'Reach 10 Strength.')
) AS x(slug, name, descr)
WHERE NOT EXISTS (SELECT 1 FROM public.achievements a WHERE a.slug = x.slug);

CREATE OR REPLACE FUNCTION public.try_unlock_achievements()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  pr public.profiles%ROWTYPE;
  v_prev INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO pr FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  SELECT COUNT(*)::INT INTO v_prev FROM public.user_achievements WHERE user_id = v_uid;

  IF pr.level >= 5 THEN
    INSERT INTO public.user_achievements (user_id, achievement_id)
    SELECT v_uid, a.id FROM public.achievements a WHERE a.slug = 'first_hero'
    ON CONFLICT DO NOTHING;
  END IF;

  IF pr.gold >= 500 THEN
    INSERT INTO public.user_achievements (user_id, achievement_id)
    SELECT v_uid, a.id FROM public.achievements a WHERE a.slug = 'gold_hoard'
    ON CONFLICT DO NOTHING;
  END IF;

  IF pr.strength >= 10 THEN
    INSERT INTO public.user_achievements (user_id, achievement_id)
    SELECT v_uid, a.id FROM public.achievements a WHERE a.slug = 'iron_will'
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN json_build_object(
    'newly_unlocked',
    GREATEST(0, (SELECT COUNT(*)::INT FROM public.user_achievements WHERE user_id = v_uid) - v_prev)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.try_unlock_achievements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_unlock_achievements() TO authenticated;

INSERT INTO public.shop_items (slug, name, description, category, rarity, price, season_slug, metadata)
SELECT 'solstice-lantern', 'Solstice Lantern', 'Limited seasonal decor for your sanctuary.', 'furniture', 'rare', 120, 'solstice', '{}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.shop_items WHERE slug = 'solstice-lantern');
