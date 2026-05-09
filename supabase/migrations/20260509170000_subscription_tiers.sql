-- Phase 10: Subscription tiers + party caps + admin tooling
--
-- Adds an admin-managed catalogue of up to 3 subscription tiers (one of which
-- is marked is_free = true and is mandatory). Each tier carries a set of caps
-- and perks (max parties owned/joined, monthly moonshards stipend, signup
-- bonus moonshards). Free is the default for every profile and is the fallback
-- whenever a paid subscription expires.
--
-- The admin surface (admin_upsert_subscription_tier, admin_set_user_subscription,
-- admin_delete_subscription_tier) is gated by a small admin_users table; rows
-- in that table are created manually by the developer via the SQL editor with
-- a simple INSERT (see the bottom of this migration for the snippet).

-- ============================================================================
-- 1. admin_users + is_admin()
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_self_read" ON public.admin_users;
CREATE POLICY "admin_users_self_read"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE user_id = COALESCE(p_user_id, auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;

-- ============================================================================
-- 2. subscription_tiers catalogue
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_tiers (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  price_usd NUMERIC(8, 2) NOT NULL DEFAULT 0 CHECK (price_usd >= 0),
  is_free BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_parties_owned INT NOT NULL DEFAULT 3 CHECK (max_parties_owned >= 0),
  max_parties_joined INT NOT NULL DEFAULT 5 CHECK (max_parties_joined >= 0),
  monthly_moonshards INT NOT NULL DEFAULT 0 CHECK (monthly_moonshards >= 0),
  signup_bonus_moonshards INT NOT NULL DEFAULT 0 CHECK (signup_bonus_moonshards >= 0),
  perks JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly one tier may be the "free" default at any time.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_tiers_one_free_idx
  ON public.subscription_tiers ((is_free))
  WHERE is_free = true;

ALTER TABLE public.subscription_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_tiers_read_active" ON public.subscription_tiers;
CREATE POLICY "subscription_tiers_read_active"
  ON public.subscription_tiers FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Seed: free → adventurer → legend (sort_order ascending)
INSERT INTO public.subscription_tiers
  (slug, name, description, sort_order, price_usd, is_free, is_active,
   max_parties_owned, max_parties_joined, monthly_moonshards, signup_bonus_moonshards, perks)
VALUES
  ('free', 'Wanderer', 'Free forever. Everything you need to start your sanctuary.',
    0, 0, true, true, 3, 5, 0, 0, '{}'::jsonb),
  ('adventurer', 'Adventurer', 'For active heroes who want bigger fellowships and a small monthly stipend.',
    1, 4.99, false, true, 5, 10, 10, 5,
    jsonb_build_object('chat_history_days', 60, 'forge_daily_attempts', 6)),
  ('legend', 'Legend', 'Unlock the highest party caps, the largest monthly stipend, and exclusive cosmetic flair.',
    2, 9.99, false, true, 10, 20, 30, 25,
    jsonb_build_object('chat_history_days', 365, 'forge_daily_attempts', 999, 'cosmetic_borders', true))
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 3. profiles: subscription columns
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_last_stipend_at TIMESTAMPTZ;

-- FK with ON DELETE SET DEFAULT bounces removed tiers back to 'free'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_subscription_tier_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_tier_fkey
      FOREIGN KEY (subscription_tier)
      REFERENCES public.subscription_tiers(slug)
      ON UPDATE CASCADE ON DELETE SET DEFAULT;
  END IF;
END$$;

-- ============================================================================
-- 4. effective_subscription_tier — handles expiry
-- ============================================================================

CREATE OR REPLACE FUNCTION public.effective_subscription_tier(p_user_id UUID DEFAULT NULL)
RETURNS public.subscription_tiers
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_slug TEXT;
  v_expires TIMESTAMPTZ;
  v_tier public.subscription_tiers;
BEGIN
  IF v_uid IS NULL THEN
    SELECT * INTO v_tier FROM public.subscription_tiers WHERE is_free = true LIMIT 1;
    RETURN v_tier;
  END IF;

  SELECT subscription_tier, subscription_expires_at
  INTO v_slug, v_expires
  FROM public.profiles
  WHERE id = v_uid;

  IF v_slug IS NULL OR (v_expires IS NOT NULL AND v_expires < now()) THEN
    SELECT * INTO v_tier FROM public.subscription_tiers WHERE is_free = true LIMIT 1;
    RETURN v_tier;
  END IF;

  SELECT * INTO v_tier
  FROM public.subscription_tiers
  WHERE slug = v_slug AND is_active = true;

  IF NOT FOUND THEN
    SELECT * INTO v_tier FROM public.subscription_tiers WHERE is_free = true LIMIT 1;
  END IF;

  RETURN v_tier;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.effective_subscription_tier(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.effective_subscription_tier(UUID) TO authenticated, service_role;

-- ============================================================================
-- 5. current_user_subscription_limits — convenience for the client
-- ============================================================================

CREATE OR REPLACE FUNCTION public.current_user_subscription_limits()
RETURNS TABLE (
  tier_slug TEXT,
  tier_name TEXT,
  is_free BOOLEAN,
  max_parties_owned INT,
  max_parties_joined INT,
  parties_owned INT,
  parties_joined INT,
  expires_at TIMESTAMPTZ,
  monthly_moonshards INT,
  next_stipend_eligible_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tier public.subscription_tiers;
  v_owned INT := 0;
  v_joined INT := 0;
  v_expires TIMESTAMPTZ;
  v_last_stipend TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_tier := public.effective_subscription_tier(v_uid);

  SELECT subscription_expires_at, subscription_last_stipend_at
  INTO v_expires, v_last_stipend
  FROM public.profiles
  WHERE id = v_uid;

  SELECT COUNT(*)::INT INTO v_owned FROM public.parties WHERE leader_id = v_uid;
  SELECT COUNT(*)::INT INTO v_joined FROM public.party_members WHERE user_id = v_uid;

  tier_slug := v_tier.slug;
  tier_name := v_tier.name;
  is_free := v_tier.is_free;
  max_parties_owned := v_tier.max_parties_owned;
  max_parties_joined := v_tier.max_parties_joined;
  parties_owned := v_owned;
  parties_joined := v_joined;
  expires_at := v_expires;
  monthly_moonshards := v_tier.monthly_moonshards;
  next_stipend_eligible_at := CASE
    WHEN v_tier.monthly_moonshards <= 0 THEN NULL
    WHEN v_last_stipend IS NULL THEN now()
    ELSE v_last_stipend + INTERVAL '28 days'
  END;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_subscription_limits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_subscription_limits() TO authenticated;

-- ============================================================================
-- 6. create_party — enforces max_parties_owned
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_party(
  p_name TEXT,
  p_boss_name TEXT DEFAULT 'Shadow Wyrm',
  p_kind TEXT DEFAULT 'party'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_code TEXT;
  v_tier public.subscription_tiers;
  v_owned INT;
  v_joined INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_kind NOT IN ('party', 'guild') THEN RAISE EXCEPTION 'Invalid party kind'; END IF;

  v_tier := public.effective_subscription_tier(v_uid);

  SELECT COUNT(*)::INT INTO v_owned FROM public.parties WHERE leader_id = v_uid;
  IF v_owned >= COALESCE(v_tier.max_parties_owned, 0) THEN
    RAISE EXCEPTION 'Party-creation cap reached for the % tier (% parties). Upgrade to host more.',
      v_tier.name, v_tier.max_parties_owned;
  END IF;

  -- Creating also auto-joins, so check the joined cap up front.
  SELECT COUNT(*)::INT INTO v_joined FROM public.party_members WHERE user_id = v_uid;
  IF v_joined >= COALESCE(v_tier.max_parties_joined, 0) THEN
    RAISE EXCEPTION 'You are already in % parties (the cap for the % tier). Leave one or upgrade.',
      v_joined, v_tier.name;
  END IF;

  FOR i IN 1..12 LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.parties WHERE invite_code = v_code);
  END LOOP;

  INSERT INTO public.parties
    (name, boss_name, boss_hp, boss_max_hp, leader_id, invite_code, party_kind, shadow_pressure_mode)
  VALUES (p_name, p_boss_name, 1000, 1000, v_uid, v_code, p_kind, 'support')
  RETURNING id INTO v_id;

  INSERT INTO public.party_members (party_id, user_id) VALUES (v_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', v_id, 'invite_code', v_code);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_party(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_party(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 7. join_party_by_id / join_party_by_invite_code — enforce max_parties_joined
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_party_by_id(p_party_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party public.parties%ROWTYPE;
  v_member_count INT := 0;
  v_tier public.subscription_tiers;
  v_joined INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_party_id IS NULL THEN RAISE EXCEPTION 'Party id is required'; END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.party_members pm
    WHERE pm.party_id = p_party_id AND pm.user_id = v_uid
  ) THEN
    RETURN json_build_object('party_id', p_party_id, 'name', v_party.name);
  END IF;

  v_tier := public.effective_subscription_tier(v_uid);

  SELECT COUNT(*)::INT INTO v_joined FROM public.party_members WHERE user_id = v_uid;
  IF v_joined >= COALESCE(v_tier.max_parties_joined, 0) THEN
    RAISE EXCEPTION 'You are already in % parties (the cap for the % tier). Leave one or upgrade.',
      v_joined, v_tier.name;
  END IF;

  SELECT COUNT(*)::INT INTO v_member_count
  FROM public.party_members pm
  WHERE pm.party_id = p_party_id;

  IF v_member_count >= 10 THEN
    RAISE EXCEPTION 'Party is full (max 10 members)';
  END IF;

  INSERT INTO public.party_members (party_id, user_id)
  VALUES (p_party_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', p_party_id, 'name', v_party.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_party_by_invite_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party public.parties%ROWTYPE;
  v_member_count INT := 0;
  v_tier public.subscription_tiers;
  v_joined INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_party
  FROM public.parties
  WHERE invite_code = upper(trim(p_code))
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No party for that code'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.party_members pm
    WHERE pm.party_id = v_party.id AND pm.user_id = v_uid
  ) THEN
    RETURN json_build_object('party_id', v_party.id, 'name', v_party.name);
  END IF;

  v_tier := public.effective_subscription_tier(v_uid);

  SELECT COUNT(*)::INT INTO v_joined FROM public.party_members WHERE user_id = v_uid;
  IF v_joined >= COALESCE(v_tier.max_parties_joined, 0) THEN
    RAISE EXCEPTION 'You are already in % parties (the cap for the % tier). Leave one or upgrade.',
      v_joined, v_tier.name;
  END IF;

  SELECT COUNT(*)::INT INTO v_member_count
  FROM public.party_members pm
  WHERE pm.party_id = v_party.id;

  IF v_member_count >= 10 THEN
    RAISE EXCEPTION 'Party is full (max 10 members)';
  END IF;

  INSERT INTO public.party_members (party_id, user_id)
  VALUES (v_party.id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', v_party.id, 'name', v_party.name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_party_by_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_party_by_id(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.join_party_by_invite_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_party_by_invite_code(TEXT) TO authenticated;

-- ============================================================================
-- 8. claim_monthly_moonshards — idempotent monthly stipend
-- ============================================================================

CREATE OR REPLACE FUNCTION public.claim_monthly_moonshards()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tier public.subscription_tiers;
  v_last TIMESTAMPTZ;
  v_award INT := 0;
  v_eligible BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_tier := public.effective_subscription_tier(v_uid);

  IF COALESCE(v_tier.monthly_moonshards, 0) <= 0 THEN
    RETURN json_build_object('moonshards_awarded', 0, 'reason', 'no_stipend_for_tier');
  END IF;

  SELECT subscription_last_stipend_at
  INTO v_last
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  v_eligible := v_last IS NULL OR v_last + INTERVAL '28 days' <= now();
  IF NOT v_eligible THEN
    RETURN json_build_object(
      'moonshards_awarded', 0,
      'reason', 'too_soon',
      'next_eligible_at', v_last + INTERVAL '28 days'
    );
  END IF;

  v_award := v_tier.monthly_moonshards;

  UPDATE public.profiles
  SET subscription_last_stipend_at = now()
  WHERE id = v_uid;

  PERFORM public.grant_moonshards_internal(
    v_uid,
    v_award,
    'subscription_monthly_stipend',
    jsonb_build_object('tier_slug', v_tier.slug)
  );

  RETURN json_build_object(
    'moonshards_awarded', v_award,
    'tier_slug', v_tier.slug,
    'next_eligible_at', now() + INTERVAL '28 days'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_monthly_moonshards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_monthly_moonshards() TO authenticated;

-- ============================================================================
-- 9. Admin: upsert / set / delete subscription tiers + assign user
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_subscription_tier(
  p_slug TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_sort_order INT DEFAULT 0,
  p_price_usd NUMERIC DEFAULT 0,
  p_max_parties_owned INT DEFAULT 3,
  p_max_parties_joined INT DEFAULT 5,
  p_monthly_moonshards INT DEFAULT 0,
  p_signup_bonus_moonshards INT DEFAULT 0,
  p_perks JSONB DEFAULT '{}'::jsonb,
  p_is_active BOOLEAN DEFAULT true
)
RETURNS public.subscription_tiers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_active_count INT;
  v_existing public.subscription_tiers%ROWTYPE;
  v_row public.subscription_tiers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'Slug is required';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  SELECT * INTO v_existing FROM public.subscription_tiers WHERE slug = p_slug;

  IF NOT FOUND AND p_is_active THEN
    -- Cap of 3 active tiers
    SELECT COUNT(*)::INT INTO v_active_count FROM public.subscription_tiers WHERE is_active = true;
    IF v_active_count >= 3 THEN
      RAISE EXCEPTION 'Only 3 active tiers are allowed. Deactivate one before adding another.';
    END IF;
  END IF;

  INSERT INTO public.subscription_tiers (
    slug, name, description, sort_order, price_usd,
    is_free, is_active,
    max_parties_owned, max_parties_joined,
    monthly_moonshards, signup_bonus_moonshards, perks, updated_at
  )
  VALUES (
    trim(p_slug),
    trim(p_name),
    COALESCE(p_description, ''),
    COALESCE(p_sort_order, 0),
    GREATEST(0, COALESCE(p_price_usd, 0)),
    COALESCE(v_existing.is_free, false), -- never flip is_free via this RPC
    COALESCE(p_is_active, true),
    GREATEST(0, COALESCE(p_max_parties_owned, 0)),
    GREATEST(0, COALESCE(p_max_parties_joined, 0)),
    GREATEST(0, COALESCE(p_monthly_moonshards, 0)),
    GREATEST(0, COALESCE(p_signup_bonus_moonshards, 0)),
    COALESCE(p_perks, '{}'::jsonb),
    now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    price_usd = EXCLUDED.price_usd,
    is_active = EXCLUDED.is_active,
    max_parties_owned = EXCLUDED.max_parties_owned,
    max_parties_joined = EXCLUDED.max_parties_joined,
    monthly_moonshards = EXCLUDED.monthly_moonshards,
    signup_bonus_moonshards = EXCLUDED.signup_bonus_moonshards,
    perks = EXCLUDED.perks,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_subscription_tier
  (TEXT, TEXT, TEXT, INT, NUMERIC, INT, INT, INT, INT, JSONB, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_subscription_tier
  (TEXT, TEXT, TEXT, INT, NUMERIC, INT, INT, INT, INT, JSONB, BOOLEAN)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_subscription_tier(p_slug TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_free BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT is_free INTO v_is_free FROM public.subscription_tiers WHERE slug = p_slug;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_is_free THEN
    RAISE EXCEPTION 'The free tier cannot be deleted.';
  END IF;

  DELETE FROM public.subscription_tiers WHERE slug = p_slug;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_subscription_tier(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_subscription_tier(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_user_subscription(
  p_user_id UUID,
  p_tier_slug TEXT,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_grant_signup_bonus BOOLEAN DEFAULT true
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tier public.subscription_tiers;
  v_prev_tier TEXT;
  v_bonus INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_tier FROM public.subscription_tiers WHERE slug = p_tier_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown tier slug: %', p_tier_slug; END IF;
  IF NOT v_tier.is_active THEN RAISE EXCEPTION 'Tier % is inactive', p_tier_slug; END IF;

  SELECT subscription_tier INTO v_prev_tier FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found: %', p_user_id; END IF;

  UPDATE public.profiles
  SET
    subscription_tier = v_tier.slug,
    subscription_started_at = now(),
    subscription_expires_at = p_expires_at
  WHERE id = p_user_id;

  IF p_grant_signup_bonus AND COALESCE(v_tier.signup_bonus_moonshards, 0) > 0
     AND v_prev_tier IS DISTINCT FROM v_tier.slug THEN
    v_bonus := public.grant_moonshards_internal(
      p_user_id,
      v_tier.signup_bonus_moonshards,
      'subscription_signup_bonus',
      jsonb_build_object('tier_slug', v_tier.slug)
    );
  END IF;

  RETURN json_build_object(
    'user_id', p_user_id,
    'tier_slug', v_tier.slug,
    'expires_at', p_expires_at,
    'signup_bonus_awarded', v_bonus
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_subscription(UUID, TEXT, TIMESTAMPTZ, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_subscription(UUID, TEXT, TIMESTAMPTZ, BOOLEAN)
  TO authenticated, service_role;

-- ============================================================================
-- 10. Admin onboarding snippet
-- ============================================================================
-- Run this once in the Supabase SQL editor with your own user UUID to gain
-- admin powers (so the in-app admin panel becomes visible / RPCs succeed):
--
--   INSERT INTO public.admin_users (user_id, note)
--   VALUES ('<your_uuid_here>'::uuid, 'developer')
--   ON CONFLICT (user_id) DO NOTHING;
