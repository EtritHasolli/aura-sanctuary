-- get_friend_habitica_profile runs as SECURITY DEFINER (owner = postgres /
-- supabase superuser). The original migration revoked ALL on user_integrations
-- from every role including postgres-owned function executors, which caused
-- the SELECT inside the function body to fail with a permission error.
--
-- Fix: grant column-level SELECT on only the public_profile column to the
-- postgres role so the SECURITY DEFINER function can read it. The api_token
-- and other sensitive columns remain inaccessible to authenticated clients.

GRANT SELECT (public_profile, user_id, provider)
  ON public.user_integrations
  TO postgres;

-- Also grant to supabase_admin which Supabase uses as the function definer
-- role in some configurations.
GRANT SELECT (public_profile, user_id, provider)
  ON public.user_integrations
  TO supabase_admin;

-- Recreate the function to ensure it picks up the updated grants cleanly.
CREATE OR REPLACE FUNCTION public.get_friend_habitica_profile(p_friend_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_profile JSONB;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_caller = p_friend_user_id THEN
    SELECT public_profile INTO v_profile
    FROM public.user_integrations
    WHERE user_id = p_friend_user_id AND provider = 'habitica';
    RETURN COALESCE(v_profile, '{}'::jsonb);
  END IF;

  IF NOT public.is_accepted_friend(v_caller, p_friend_user_id) THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT public_profile INTO v_profile
  FROM public.user_integrations
  WHERE user_id = p_friend_user_id AND provider = 'habitica';

  RETURN COALESCE(v_profile, '{}'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_friend_habitica_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_habitica_profile(UUID) TO authenticated;
