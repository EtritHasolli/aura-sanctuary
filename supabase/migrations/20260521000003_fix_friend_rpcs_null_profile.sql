-- Guard friend request RPCs against missing profile rows.
-- If sender/acceptor has no profile (e.g. handle_new_user failed), the SELECT INTO
-- returns NULL and the notification INSERT would violate the NOT NULL constraint on
-- notifications.message, causing a 400. Add an IS NOT NULL guard before each insert.

CREATE OR REPLACE FUNCTION public.send_friend_request(p_friend_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sender_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_friend_id IS NULL THEN RAISE EXCEPTION 'Friend id is required'; END IF;
  IF p_friend_id = v_uid THEN RAISE EXCEPTION 'Cannot add yourself'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE (
      (user_id = v_uid AND friend_id = p_friend_id)
      OR (user_id = p_friend_id AND friend_id = v_uid)
    )
    AND status = 'accepted'
  ) THEN
    RETURN json_build_object('ok', true, 'status', 'already_friends');
  END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (v_uid, p_friend_id, 'pending')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Someone')
  INTO v_sender_name
  FROM public.profiles WHERE id = v_uid;

  IF v_sender_name IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, message, type)
    VALUES (p_friend_id, v_sender_name || ' sent you a friend request.', 'info');
  END IF;

  RETURN json_build_object('ok', true, 'status', 'pending');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_friend_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;

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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'User id is required'; END IF;
  IF p_user_id = v_uid THEN RAISE EXCEPTION 'Cannot accept yourself'; END IF;

  UPDATE public.friendships
  SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
  WHERE (user_id = p_user_id AND friend_id = v_uid)
     OR (user_id = v_uid AND friend_id = p_user_id);

  INSERT INTO public.friendships (user_id, friend_id, status, accepted_at)
  VALUES (p_user_id, v_uid, 'accepted', now())
  ON CONFLICT (user_id, friend_id)
  DO UPDATE SET status = 'accepted', accepted_at = COALESCE(public.friendships.accepted_at, now());

  INSERT INTO public.friendships (user_id, friend_id, status, accepted_at)
  VALUES (v_uid, p_user_id, 'accepted', now())
  ON CONFLICT (user_id, friend_id)
  DO UPDATE SET status = 'accepted', accepted_at = COALESCE(public.friendships.accepted_at, now());

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'A friend')
  INTO v_acceptor_name
  FROM public.profiles WHERE id = v_uid;

  IF v_acceptor_name IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, message, type)
    VALUES (p_user_id, v_acceptor_name || ' accepted your friend request.', 'success');
  END IF;

  RETURN json_build_object('ok', true, 'status', 'accepted');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_friend_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;
