-- Allow the Lemon Squeezy webhook (service_role key) to call
-- admin_set_user_subscription without a user JWT.
-- Previously the function rejected any call where auth.uid() IS NULL.
-- Service-role callers have auth.role() = 'service_role' but no sub claim.

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
  -- Allow service_role (webhook, server-side scripts) to bypass user-auth check.
  IF v_uid IS NULL THEN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  ELSIF NOT public.is_admin(v_uid) THEN
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
