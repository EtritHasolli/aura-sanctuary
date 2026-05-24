-- Admin RPC: returns all users with stats.
-- Only callable by users who are in the admin_users table.

CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  display_name    TEXT,
  level           INT,
  gold            INT,
  moonshards      INT,
  xp              INT,
  hp              INT,
  max_hp          INT,
  subscription_tier TEXT,
  task_count      BIGINT,
  friend_code     TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    p.display_name,
    p.level,
    p.gold,
    COALESCE(p.moonshards, 0),
    p.xp,
    p.hp,
    p.max_hp,
    COALESCE(p.subscription_tier, 'free'),
    (SELECT COUNT(*) FROM public.tasks t WHERE t.user_id = u.id),
    p.friend_code
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO authenticated, service_role;
