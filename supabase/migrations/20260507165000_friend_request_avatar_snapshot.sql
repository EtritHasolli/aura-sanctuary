ALTER TABLE public.friendships
  ADD COLUMN IF NOT EXISTS requester_name TEXT,
  ADD COLUMN IF NOT EXISTS requester_email TEXT,
  ADD COLUMN IF NOT EXISTS requester_avatar_url TEXT;

-- Backfill pending requests with sender identity snapshots when available.
UPDATE public.friendships f
SET
  requester_name = COALESCE(
    NULLIF(trim(p.display_name), ''),
    split_part(u.email, '@', 1),
    f.requester_name
  ),
  requester_email = COALESCE(u.email, f.requester_email),
  requester_avatar_url = COALESCE(p.avatar_url, f.requester_avatar_url)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE f.user_id = u.id
  AND f.status = 'pending'
  AND (
    f.requester_name IS NULL
    OR f.requester_email IS NULL
    OR f.requester_avatar_url IS NULL
  );

CREATE OR REPLACE FUNCTION public.send_friend_request(p_friend_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_sender_name TEXT;
  v_sender_email TEXT;
  v_sender_avatar_url TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_friend_id IS NULL THEN RAISE EXCEPTION 'Friend id is required'; END IF;
  IF p_friend_id = v_uid THEN RAISE EXCEPTION 'Cannot add yourself'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE (
      (user_id = v_uid AND friend_id = p_friend_id)
      OR (user_id = p_friend_id AND friend_id = v_uid)
    )
      AND status = 'accepted'
  ) THEN
    RETURN json_build_object('ok', true, 'status', 'already_friends');
  END IF;

  SELECT
    COALESCE(NULLIF(trim(p.display_name), ''), split_part(u.email, '@', 1), 'Someone'),
    COALESCE(u.email, ''),
    p.avatar_url
  INTO v_sender_name, v_sender_email, v_sender_avatar_url
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_uid;

  INSERT INTO public.friendships (
    user_id,
    friend_id,
    status,
    requester_name,
    requester_email,
    requester_avatar_url
  )
  VALUES (
    v_uid,
    p_friend_id,
    'pending',
    v_sender_name,
    v_sender_email,
    v_sender_avatar_url
  )
  ON CONFLICT (user_id, friend_id)
  DO UPDATE SET
    requester_name = EXCLUDED.requester_name,
    requester_email = EXCLUDED.requester_email,
    requester_avatar_url = EXCLUDED.requester_avatar_url;

  INSERT INTO public.notifications (user_id, message, type)
  VALUES (
    p_friend_id,
    v_sender_name || ' sent you a friend request.',
    'info'
  );

  RETURN json_build_object('ok', true, 'status', 'pending');
END;
$$;
