CREATE OR REPLACE FUNCTION public.accept_friend_request(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_acceptor_name TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'Cannot accept yourself';
  END IF;

  -- Force both directions into accepted state.
  UPDATE public.friendships
  SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
  WHERE (user_id = p_user_id AND friend_id = v_uid)
     OR (user_id = v_uid AND friend_id = p_user_id);

  INSERT INTO public.friendships (user_id, friend_id, status, accepted_at)
  VALUES (p_user_id, v_uid, 'accepted', now())
  ON CONFLICT (user_id, friend_id)
  DO UPDATE
  SET status = 'accepted', accepted_at = COALESCE(public.friendships.accepted_at, now());

  INSERT INTO public.friendships (user_id, friend_id, status, accepted_at)
  VALUES (v_uid, p_user_id, 'accepted', now())
  ON CONFLICT (user_id, friend_id)
  DO UPDATE
  SET status = 'accepted', accepted_at = COALESCE(public.friendships.accepted_at, now());

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'A friend')
  INTO v_acceptor_name
  FROM public.profiles
  WHERE id = v_uid;

  INSERT INTO public.notifications (user_id, message, type)
  VALUES (
    p_user_id,
    v_acceptor_name || ' accepted your friend request.',
    'success'
  );

  RETURN json_build_object('ok', true, 'status', 'accepted');
END;
$$;
