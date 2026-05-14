-- Allow users to delete their own battle completion rows (needed for uncomplete daily).
CREATE POLICY "battle_completions_delete_own"
  ON public.battle_completions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
