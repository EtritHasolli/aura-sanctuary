CREATE OR REPLACE FUNCTION public.are_friends(_a UUID, _b UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND (
        (f.user_id = _a AND f.friend_id = _b)
        OR
        (f.user_id = _b AND f.friend_id = _a)
      )
  );
$$;

CREATE TABLE IF NOT EXISTS public.friend_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.friend_messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_friend_messages_pair_time
  ON public.friend_messages (LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id), created_at);

CREATE POLICY "Friend messages selectable by participants"
ON public.friend_messages
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND auth.uid() IN (sender_id, recipient_id)
);

CREATE POLICY "Friend messages insert by sender when friendship accepted"
ON public.friend_messages
FOR INSERT
WITH CHECK (
  auth.uid() = sender_id
  AND public.are_friends(sender_id, recipient_id)
);
