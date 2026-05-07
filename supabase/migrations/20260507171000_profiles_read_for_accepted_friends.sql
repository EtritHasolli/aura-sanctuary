-- Allow users to read profile stats of accepted friends.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Profiles viewable by accepted friends'
  ) THEN
    CREATE POLICY "Profiles viewable by accepted friends"
      ON public.profiles
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.friendships f
          WHERE f.status = 'accepted'
            AND (
              (f.user_id = auth.uid() AND f.friend_id = profiles.id)
              OR (f.friend_id = auth.uid() AND f.user_id = profiles.id)
            )
        )
      );
  END IF;
END
$$;
