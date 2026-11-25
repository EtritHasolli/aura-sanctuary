-- Study-call invites now carry a deep link so the notification is clickable:
--   "<name> invited you to a Study Call! Room code: ABC123 /call?room=ABC123&from=<inviter id>"
-- The app strips the trailing link for display; clicking the notification (in-app
-- bell, toast, or OS push via trg_push_on_notification) joins the call. `from`
-- lets the Friends list badge the inviter.
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
  v_uid         UUID := auth.uid();
  v_sender      TEXT;
  v_are_friends BOOLEAN;
  v_code        TEXT := upper(trim(p_room_code));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF v_code !~ '^[A-Z0-9]{4,12}$' THEN RAISE EXCEPTION 'Invalid room code'; END IF;

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
    format(
      '%s invited you to a Study Call! Room code: %s /call?room=%s&from=%s',
      v_sender, v_code, v_code, v_uid
    ),
    'info'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_call_invite(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_call_invite(UUID, TEXT) TO authenticated;
