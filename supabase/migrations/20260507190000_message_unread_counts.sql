CREATE TABLE IF NOT EXISTS public.message_read_states (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('friend', 'party')),
  scope_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope_type, scope_id)
);

ALTER TABLE public.message_read_states ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_read_states'
      AND policyname = 'message_read_states_select_own'
  ) THEN
    CREATE POLICY message_read_states_select_own
      ON public.message_read_states
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_read_states'
      AND policyname = 'message_read_states_insert_own'
  ) THEN
    CREATE POLICY message_read_states_insert_own
      ON public.message_read_states
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_read_states'
      AND policyname = 'message_read_states_update_own'
  ) THEN
    CREATE POLICY message_read_states_update_own
      ON public.message_read_states
      FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mark_message_scope_read(
  p_scope_type TEXT,
  p_scope_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_scope_type NOT IN ('friend', 'party') THEN
    RAISE EXCEPTION 'Invalid message scope';
  END IF;

  INSERT INTO public.message_read_states (user_id, scope_type, scope_id, last_read_at)
  VALUES (v_uid, p_scope_type, p_scope_id, now())
  ON CONFLICT (user_id, scope_type, scope_id)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_message_unread_counts()
RETURNS TABLE(scope_type TEXT, scope_id UUID, unread_count INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH v AS (SELECT auth.uid() AS uid)
  SELECT 'party'::TEXT AS scope_type, cm.party_id AS scope_id, COUNT(*)::INT AS unread_count
  FROM v
  JOIN public.party_members pm ON pm.user_id = v.uid
  JOIN public.chat_messages cm ON cm.party_id = pm.party_id
  LEFT JOIN public.message_read_states rs
    ON rs.user_id = v.uid
    AND rs.scope_type = 'party'
    AND rs.scope_id = cm.party_id
  WHERE v.uid IS NOT NULL
    AND cm.user_id <> v.uid
    AND cm.created_at > COALESCE(rs.last_read_at, 'epoch'::timestamptz)
  GROUP BY cm.party_id

  UNION ALL

  SELECT 'friend'::TEXT AS scope_type, fm.sender_id AS scope_id, COUNT(*)::INT AS unread_count
  FROM v
  JOIN public.friend_messages fm ON fm.recipient_id = v.uid
  LEFT JOIN public.message_read_states rs
    ON rs.user_id = v.uid
    AND rs.scope_type = 'friend'
    AND rs.scope_id = fm.sender_id
  WHERE v.uid IS NOT NULL
    AND fm.created_at > COALESCE(rs.last_read_at, 'epoch'::timestamptz)
  GROUP BY fm.sender_id;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_message_scope_read(TEXT, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_message_unread_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_message_scope_read(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_unread_counts() TO authenticated;
