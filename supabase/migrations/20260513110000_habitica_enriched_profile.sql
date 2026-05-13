-- Enriched Habitica data:
--   • user_integrations.public_profile — cached read-only snapshot (class,
--     level, exp/exp_to_next, gold, hp/max_hp, mp/max_mp, gear summary,
--     avatar URL, login streak, achievements count, etc.). Safe to expose
--     to accepted friends.
--   • tasks.habitica_meta — per-task Habitica details (streak, counter,
--     value, due date, frequency, checklist snapshot, history excerpt, tags).
--   • get_friend_habitica_profile(uuid) — RLS-safe RPC so a friend can read
--     the other's public profile without touching the locked-down
--     user_integrations table.

ALTER TABLE public.user_integrations
  ADD COLUMN IF NOT EXISTS public_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS habitica_meta JSONB;

-- An accepted-friend predicate, reusable across the schema.
CREATE OR REPLACE FUNCTION public.is_accepted_friend(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = _a AND f.friend_id = _b)
        OR (f.user_id = _b AND f.friend_id = _a)
      )
  );
$$;

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
    -- Convenience: callers can also fetch their own snapshot through this RPC.
    SELECT public_profile INTO v_profile
    FROM public.user_integrations
    WHERE user_id = p_friend_user_id AND provider = 'habitica';
    RETURN COALESCE(v_profile, '{}'::jsonb);
  END IF;

  IF NOT public.is_accepted_friend(v_caller, p_friend_user_id) THEN
    -- Don't leak whether the friend has Habitica connected at all.
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
