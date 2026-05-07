CREATE OR REPLACE FUNCTION public.send_party_invite_notification(p_friend_id UUID, p_party_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sender_name TEXT;
  v_party_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_friend_id IS NULL OR p_party_id IS NULL THEN RAISE EXCEPTION 'Missing party or friend'; END IF;
  IF p_friend_id = v_uid THEN RAISE EXCEPTION 'Cannot invite yourself'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.party_members
    WHERE party_id = p_party_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You are not in that party';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (user_id = v_uid AND friend_id = p_friend_id)
        OR (friend_id = v_uid AND user_id = p_friend_id)
      )
  ) THEN
    RAISE EXCEPTION 'User is not your friend';
  END IF;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'A friend')
  INTO v_sender_name
  FROM public.profiles
  WHERE id = v_uid;

  SELECT name INTO v_party_name
  FROM public.parties
  WHERE id = p_party_id;

  IF v_party_name IS NULL THEN
    RAISE EXCEPTION 'Party not found';
  END IF;

  INSERT INTO public.notifications (user_id, message, type)
  VALUES (
    p_friend_id,
    v_sender_name || ' invited you to party "' || v_party_name || '". Open: /tavern?invite=' || p_party_id::text,
    'info'
  );

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_party_invite_notification(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_party_invite_notification(UUID, UUID) TO authenticated;
