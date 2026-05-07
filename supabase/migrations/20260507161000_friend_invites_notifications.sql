-- Ensure notifications table exists for in-app feed
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning')),
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_select_own'
  ) THEN
    CREATE POLICY notifications_select_own
      ON public.notifications
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_insert_own'
  ) THEN
    CREATE POLICY notifications_insert_own
      ON public.notifications
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_update_own'
  ) THEN
    CREATE POLICY notifications_update_own
      ON public.notifications
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_delete_own'
  ) THEN
    CREATE POLICY notifications_delete_own
      ON public.notifications
      FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END
$$;

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

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (v_uid, p_friend_id, 'pending')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  SELECT COALESCE(NULLIF(trim(display_name), ''), 'Someone')
  INTO v_sender_name
  FROM public.profiles
  WHERE id = v_uid;

  INSERT INTO public.notifications (user_id, message, type)
  VALUES (
    p_friend_id,
    v_sender_name || ' sent you a friend request.',
    'info'
  );

  RETURN json_build_object('ok', true, 'status', 'pending');
END;
$$;

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

  UPDATE public.friendships
  SET status = 'accepted', accepted_at = now()
  WHERE user_id = p_user_id AND friend_id = v_uid AND status = 'pending';

  IF NOT EXISTS (
    SELECT 1 FROM public.friendships WHERE user_id = v_uid AND friend_id = p_user_id
  ) THEN
    INSERT INTO public.friendships (user_id, friend_id, status, accepted_at)
    VALUES (v_uid, p_user_id, 'accepted', now());
  ELSE
    UPDATE public.friendships
    SET status = 'accepted', accepted_at = COALESCE(accepted_at, now())
    WHERE user_id = v_uid AND friend_id = p_user_id;
  END IF;

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
