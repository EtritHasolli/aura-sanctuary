CREATE OR REPLACE FUNCTION public.list_pending_friend_requests()
RETURNS TABLE (
  requester_id UUID,
  display_name TEXT,
  email TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    f.user_id AS requester_id,
    COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1), 'Unknown') AS display_name,
    COALESCE(u.email, '') AS email,
    p.avatar_url,
    f.created_at
  FROM public.friendships f
  LEFT JOIN public.profiles p ON p.id = f.user_id
  LEFT JOIN auth.users u ON u.id = f.user_id
  WHERE f.friend_id = v_uid
    AND f.status = 'pending'
  ORDER BY f.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.list_pending_friend_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_friend_requests() TO authenticated;
