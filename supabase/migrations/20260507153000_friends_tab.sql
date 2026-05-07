-- Friends graph + minimal RPCs

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friend_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  CONSTRAINT friendships_pair_unique UNIQUE (user_id, friend_id),
  CONSTRAINT friendships_no_self CHECK (user_id <> friend_id)
);

CREATE INDEX IF NOT EXISTS friendships_user_idx ON public.friendships(user_id, status);
CREATE INDEX IF NOT EXISTS friendships_friend_idx ON public.friendships(friend_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships_read_participants"
  ON public.friendships
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE POLICY "friendships_insert_self"
  ON public.friendships
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "friendships_update_participants"
  ON public.friendships
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

CREATE OR REPLACE FUNCTION public.send_friend_request(p_friend_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_friend_id IS NULL THEN RAISE EXCEPTION 'Friend id is required'; END IF;
  IF p_friend_id = v_uid THEN RAISE EXCEPTION 'Cannot add yourself'; END IF;

  INSERT INTO public.friendships (user_id, friend_id, status)
  VALUES (v_uid, p_friend_id, 'pending')
  ON CONFLICT (user_id, friend_id) DO NOTHING;

  RETURN json_build_object('ok', true);
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

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_friend_request(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_friend_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;
