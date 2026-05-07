CREATE OR REPLACE FUNCTION public.send_friend_request_by_email(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_target_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  SELECT id
  INTO v_target_id
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'No user found with that email';
  END IF;
  IF v_target_id = v_uid THEN
    RAISE EXCEPTION 'Cannot add yourself';
  END IF;

  RETURN public.send_friend_request(v_target_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_friend_request_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request_by_email(TEXT) TO authenticated;
