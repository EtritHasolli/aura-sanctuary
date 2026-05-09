-- Phase 9: Moonshard acquisition mechanics
--
-- Acquisition channels implemented in this migration:
--   1) Achievement unlock         → +1 moonshard per newly unlocked achievement
--   2) Boss kill (strike_party_boss final blow)
--                                 → 25% chance of +1 moonshard on the killing strike
--   3) Level milestone            → +1 moonshard for every 5 levels reached
--                                   (claim is idempotent and server-trusted)
--   4) Daily login streak         → +1 moonshard at 7-day, 14-day, 30-day milestones
--                                   per streak run; resets when the streak breaks
--   5) Quest arc completion       → 3..5 moonshards (random) when an arc transitions
--                                   from incomplete → completed inside record_quest_arc_event
--   6) IAP / Premium stub         → admin_grant_moonshard_bundle (service_role only) +
--                                   moonshard_bundles catalog seed
--
-- All grants flow through grant_moonshards_internal and are recorded in
-- moonshard_grants_log so we have a single audit trail and can verify totals.

-- ============================================================================
-- 0. Schema additions
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_streak INT NOT NULL DEFAULT 0
    CHECK (login_streak >= 0),
  ADD COLUMN IF NOT EXISTS last_login_date DATE,
  ADD COLUMN IF NOT EXISTS login_streak_milestones_claimed INT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS moonshard_level_milestone INT NOT NULL DEFAULT 0
    CHECK (moonshard_level_milestone >= 0);

CREATE TABLE IF NOT EXISTS public.moonshard_grants_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INT NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moonshard_grants_log_user_idx
  ON public.moonshard_grants_log(user_id, granted_at DESC);

ALTER TABLE public.moonshard_grants_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moonshard_grants_log_owner_read" ON public.moonshard_grants_log;
CREATE POLICY "moonshard_grants_log_owner_read"
  ON public.moonshard_grants_log
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.moonshard_bundles (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  amount INT NOT NULL CHECK (amount > 0),
  price_usd NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.moonshard_bundles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "moonshard_bundles_read" ON public.moonshard_bundles;
CREATE POLICY "moonshard_bundles_read"
  ON public.moonshard_bundles
  FOR SELECT TO authenticated
  USING (is_active = true);

INSERT INTO public.moonshard_bundles (slug, name, amount, price_usd) VALUES
  ('starter-pouch', 'Starter Pouch', 5, 0.99),
  ('travelers-cache', 'Traveler''s Cache', 25, 4.99),
  ('lunar-vault', 'Lunar Vault', 75, 12.99)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 1. Internal helper — single chokepoint for all moonshard grants
-- ============================================================================

CREATE OR REPLACE FUNCTION public.grant_moonshards_internal(
  p_user_id UUID,
  p_amount INT,
  p_reason TEXT,
  p_meta JSONB DEFAULT '{}'::jsonb
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.profiles
  SET moonshards = moonshards + p_amount
  WHERE id = p_user_id;

  INSERT INTO public.moonshard_grants_log (user_id, amount, reason, meta)
  VALUES (p_user_id, p_amount, p_reason, COALESCE(p_meta, '{}'::jsonb));

  RETURN p_amount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_moonshards_internal(UUID, INT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 2. Achievement unlock → +1 moonshard per newly unlocked achievement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.try_unlock_achievements()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  pr public.profiles%ROWTYPE;
  v_prev INT;
  v_next INT;
  v_grant INT;
  v_moonshards INT := 0;
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

  SELECT COUNT(*)::INT INTO v_next FROM public.user_achievements WHERE user_id = v_uid;
  v_grant := GREATEST(0, v_next - v_prev);

  IF v_grant > 0 THEN
    v_moonshards := public.grant_moonshards_internal(
      v_uid,
      v_grant,
      'achievement_unlock',
      jsonb_build_object('count', v_grant)
    );
  END IF;

  RETURN json_build_object(
    'newly_unlocked', v_grant,
    'moonshards_awarded', v_moonshards
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.try_unlock_achievements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_unlock_achievements() TO authenticated;

-- ============================================================================
-- 3. Level milestone — claim_level_moonshards (idempotent server-trusted RPC)
--    Awards 1 moonshard for every 5 levels reached since last claim.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_level_moonshards()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_level INT;
  v_last_milestone INT;
  v_target_milestone INT;
  v_award INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT level, COALESCE(moonshard_level_milestone, 0)
  INTO v_level, v_last_milestone
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_target_milestone := (v_level / 5) * 5;

  IF v_target_milestone > v_last_milestone THEN
    v_award := (v_target_milestone - v_last_milestone) / 5;
    UPDATE public.profiles
    SET moonshard_level_milestone = v_target_milestone
    WHERE id = v_uid;

    PERFORM public.grant_moonshards_internal(
      v_uid,
      v_award,
      'level_milestone',
      jsonb_build_object(
        'from_milestone', v_last_milestone,
        'to_milestone', v_target_milestone,
        'level', v_level
      )
    );
  END IF;

  RETURN json_build_object(
    'moonshards_awarded', v_award,
    'milestone', v_target_milestone,
    'level', v_level
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_level_moonshards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_level_moonshards() TO authenticated;

-- ============================================================================
-- 4. Daily login streak — record_daily_login
--    +1 moonshard at 7, 14, 30 day streak milestones (per streak run).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_daily_login()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  v_yesterday DATE := CURRENT_DATE - 1;
  v_last DATE;
  v_streak INT;
  v_milestones INT[];
  v_award INT := 0;
  v_milestone INT;
  v_targets INT[] := ARRAY[7, 14, 30];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT
    last_login_date,
    COALESCE(login_streak, 0),
    COALESCE(login_streak_milestones_claimed, '{}'::INT[])
  INTO v_last, v_streak, v_milestones
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  IF v_last = v_today THEN
    -- Same calendar day, no streak change
    NULL;
  ELSIF v_last = v_yesterday THEN
    v_streak := v_streak + 1;
  ELSE
    -- streak broken (or first ever login)
    v_streak := 1;
    v_milestones := '{}'::INT[];
  END IF;

  FOREACH v_milestone IN ARRAY v_targets LOOP
    IF v_streak >= v_milestone AND NOT (v_milestone = ANY(v_milestones)) THEN
      v_award := v_award + 1;
      v_milestones := array_append(v_milestones, v_milestone);
    END IF;
  END LOOP;

  UPDATE public.profiles
  SET
    last_login_date = v_today,
    login_streak = v_streak,
    login_streak_milestones_claimed = v_milestones
  WHERE id = v_uid;

  IF v_award > 0 THEN
    PERFORM public.grant_moonshards_internal(
      v_uid,
      v_award,
      'login_streak',
      jsonb_build_object(
        'streak', v_streak,
        'milestones_claimed', v_milestones
      )
    );
  END IF;

  RETURN json_build_object(
    'streak', v_streak,
    'last_login_date', v_today,
    'moonshards_awarded', v_award,
    'milestones_claimed', v_milestones
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_daily_login() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_daily_login() TO authenticated;

-- ============================================================================
-- 5. Quest arc completion — record_quest_arc_event now grants 3..5 moonshards
--    per arc that transitions from incomplete to completed in the same call.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_quest_arc_event(
  p_kind TEXT,
  p_amount INT DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  r public.user_quest_arc_progress%ROWTYPE;
  st public.quest_arc_steps%ROWTYPE;
  v_gold_reward INT := 0;
  v_xp_reward INT := 0;
  v_arcs_completed INT := 0;
  v_moonshards INT := 0;
  v_arc_award INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_kind <> 'spend_gold' AND (p_amount IS NULL OR p_amount < 1) THEN
    p_amount := 1;
  END IF;
  IF p_kind = 'spend_gold' AND (p_amount IS NULL OR p_amount < 1) THEN
    RETURN json_build_object(
      'gold_awarded', 0, 'xp_awarded', 0,
      'arcs_completed', 0, 'moonshards_awarded', 0
    );
  END IF;

  FOR r IN
    SELECT * FROM public.user_quest_arc_progress WHERE user_id = v_uid AND NOT completed
  LOOP
    SELECT * INTO st FROM public.quest_arc_steps
    WHERE arc_id = r.arc_id AND step_order = r.current_step;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF st.step_kind IS DISTINCT FROM p_kind THEN CONTINUE; END IF;

    UPDATE public.user_quest_arc_progress
    SET progress_count = progress_count + p_amount, updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;

    IF r.progress_count >= st.goal THEN
      v_gold_reward := v_gold_reward + st.reward_gold;
      v_xp_reward := v_xp_reward + st.reward_xp;

      IF EXISTS (
        SELECT 1 FROM public.quest_arc_steps
        WHERE arc_id = r.arc_id AND step_order = r.current_step + 1
      ) THEN
        UPDATE public.user_quest_arc_progress
        SET current_step = current_step + 1, progress_count = 0, updated_at = now()
        WHERE id = r.id;
      ELSE
        UPDATE public.user_quest_arc_progress
        SET completed = true, progress_count = st.goal, updated_at = now()
        WHERE id = r.id;
        v_arcs_completed := v_arcs_completed + 1;
        v_arc_award := 3 + floor(random() * 3)::INT; -- inclusive 3..5
        v_moonshards := v_moonshards + v_arc_award;
        PERFORM public.grant_moonshards_internal(
          v_uid,
          v_arc_award,
          'quest_arc_complete',
          jsonb_build_object('arc_id', r.arc_id)
        );
      END IF;
    END IF;
  END LOOP;

  IF v_gold_reward > 0 OR v_xp_reward > 0 THEN
    UPDATE public.profiles
    SET gold = gold + v_gold_reward, xp = xp + v_xp_reward
    WHERE id = v_uid;
  END IF;

  RETURN json_build_object(
    'gold_awarded', v_gold_reward,
    'xp_awarded', v_xp_reward,
    'arcs_completed', v_arcs_completed,
    'moonshards_awarded', v_moonshards
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_quest_arc_event(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_quest_arc_event(TEXT, INT) TO authenticated;

-- ============================================================================
-- 6. Boss kill bonus — strike_party_boss
--    On the killing strike, 25% chance for +1 moonshard.
--    Function body is the latest definition (from
--    20260508104500_boss_level_ladder_progression) plus a new branch and a
--    new bonus_moonshards field on the JSON return.
-- ============================================================================

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
  v_bonus_moonshards INT := 0;
  v_roll NUMERIC;
  v_slug TEXT;
  v_item_id UUID;
  v_item_name TEXT;
  v_boss_pct INT := 0;
  v_rage INT := 0;
  v_next_level INT;
  v_next_loop_count INT;
  v_next_max_hp INT;
  v_next_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_party_member(p_party_id, v_uid) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;

  PERFORM public.prune_expired_buffs(v_uid);

  SELECT COALESCE((pb.meta ->> 'pct')::INT, 0)
  INTO v_boss_pct
  FROM public.profile_buffs pb
  WHERE pb.user_id = v_uid AND pb.buff_key = 'boss_dmg_bonus' AND pb.expires_at > now()
  LIMIT 1;

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

  IF v_boss_pct > 0 THEN
    v_dmg := GREATEST(1, floor(v_dmg * (100 + v_boss_pct) / 100.0)::INT);
  END IF;

  SELECT pt.*
  INTO v_party
  FROM public.parties pt
  WHERE pt.id = p_party_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  v_rage := COALESCE(v_party.boss_rage, 0);
  IF v_rage > 0 THEN
    v_dmg := GREATEST(1, floor(v_dmg * 100.0 / (100.0 + (v_rage::NUMERIC / 4.0)))::INT);
  END IF;

  v_old_hp := COALESCE(v_party.boss_hp, 0);

  IF v_old_hp <= 0 THEN
    v_new_hp := v_party.boss_max_hp;
  ELSE
    v_new_hp := GREATEST(0, v_old_hp - v_dmg);
    v_killed := v_old_hp > 0 AND v_new_hp <= 0;
  END IF;

  v_next_level := GREATEST(1, COALESCE(v_party.boss_level, 1));
  v_next_loop_count := GREATEST(0, COALESCE(v_party.boss_loop_count, 0));

  IF v_killed THEN
    IF v_next_level < 10 THEN
      v_next_level := v_next_level + 1;
    ELSE
      v_next_loop_count := v_next_loop_count + 1;
    END IF;
    v_next_name := public.party_boss_name_for_level(v_next_level);
    v_next_max_hp := public.party_boss_scaled_hp(p_party_id, v_next_level, v_next_loop_count);
    v_new_hp := v_next_max_hp;
  END IF;

  UPDATE public.parties pt
  SET
    boss_hp = v_new_hp,
    boss_max_hp = CASE WHEN v_killed THEN v_next_max_hp ELSE pt.boss_max_hp END,
    boss_name = CASE WHEN v_killed THEN v_next_name ELSE pt.boss_name END,
    boss_level = CASE WHEN v_killed THEN v_next_level ELSE pt.boss_level END,
    boss_loop_count = CASE WHEN v_killed THEN v_next_loop_count ELSE pt.boss_loop_count END,
    boss_rage = CASE
      WHEN v_killed THEN GREATEST(0, floor(COALESCE(pt.boss_rage, 0) * 0.55)::INT)
      ELSE pt.boss_rage
    END
  WHERE pt.id = p_party_id;

  UPDATE public.profiles pr
  SET stamina = pr.stamina - v_stamina_cost
  WHERE pr.id = v_uid;

  IF v_old_hp > 0 AND v_new_hp < v_old_hp THEN
    PERFORM public.record_quest_arc_event('strike_boss', 1);
  END IF;

  IF v_killed THEN
    v_bonus_gold := floor(((12 + floor(random() * 24)::INT) * (1 + v_gold_pct / 100)))::INT;

    UPDATE public.profiles pr
    SET gold = pr.gold + v_bonus_gold
    WHERE pr.id = v_uid;

    -- 25% chance: 1 moonshard on the killing strike
    IF random() < 0.25 THEN
      v_bonus_moonshards := public.grant_moonshards_internal(
        v_uid,
        1,
        'boss_kill',
        jsonb_build_object(
          'party_id', p_party_id,
          'boss_level', COALESCE(v_party.boss_level, 1),
          'boss_name', COALESCE(v_party.boss_name, '')
        )
      );
    END IF;

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
    'boss_max_hp', (SELECT boss_max_hp FROM public.parties WHERE id = p_party_id),
    'boss_level', (SELECT boss_level FROM public.parties WHERE id = p_party_id),
    'boss_name', (SELECT boss_name FROM public.parties WHERE id = p_party_id),
    'bonus_gold', v_bonus_gold,
    'bonus_moonshards', v_bonus_moonshards,
    'drop_slug', CASE WHEN v_killed THEN v_slug ELSE NULL END,
    'drop_name', CASE WHEN v_killed THEN v_item_name ELSE NULL END,
    'stamina_spent', v_stamina_cost,
    'boss_rage_after', (SELECT boss_rage FROM public.parties WHERE id = p_party_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.strike_party_boss(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.strike_party_boss(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.strike_party_boss(UUID) TO authenticated;

-- ============================================================================
-- 7. IAP / Premium stub — admin_grant_moonshard_bundle
--    NOT exposed to anon/authenticated; intended to be called from the SQL
--    editor or a server-side function (service_role) once IAP is wired.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_grant_moonshard_bundle(
  p_user_id UUID,
  p_bundle_slug TEXT,
  p_reason TEXT DEFAULT 'iap_bundle'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount INT;
  v_granted INT;
BEGIN
  SELECT amount INTO v_amount
  FROM public.moonshard_bundles
  WHERE slug = p_bundle_slug AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bundle not found or inactive: %', p_bundle_slug;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Profile not found: %', p_user_id;
  END IF;

  v_granted := public.grant_moonshards_internal(
    p_user_id,
    v_amount,
    p_reason,
    jsonb_build_object('bundle_slug', p_bundle_slug)
  );

  RETURN json_build_object(
    'user_id', p_user_id,
    'bundle_slug', p_bundle_slug,
    'amount', v_granted
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_grant_moonshard_bundle(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_moonshard_bundle(UUID, TEXT, TEXT)
  TO service_role;
