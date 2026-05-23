-- Allow authenticated users to send a study-call invite notification to a friend.
CREATE OR REPLACE FUNCTION public.send_call_invite(
  p_friend_id UUID,
  p_room_code  TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_sender     TEXT;
  v_are_friends BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(trim(p_room_code)) = 0 THEN RAISE EXCEPTION 'Room code required'; END IF;

  -- Only allow inviting actual friends
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND ((user_id = v_uid AND friend_id = p_friend_id)
        OR (friend_id = v_uid AND user_id = p_friend_id))
  ) INTO v_are_friends;
  IF NOT v_are_friends THEN RAISE EXCEPTION 'Not friends'; END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Someone')
  INTO v_sender
  FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.notifications (user_id, message, type)
  VALUES (
    p_friend_id,
    v_sender || ' invited you to a Study Call! Room code: ' || upper(trim(p_room_code)),
    'info'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_call_invite(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_call_invite(UUID, TEXT) TO authenticated;
