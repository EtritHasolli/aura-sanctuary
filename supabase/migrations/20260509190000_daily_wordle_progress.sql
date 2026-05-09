-- Server-side Daily Wordle guesses (per user + calendar day in client TZ, stored as YYYY-MM-DD string).
-- Prevents clearing localStorage from resetting an in-progress or finished game for signed-in players.

CREATE TABLE IF NOT EXISTS public.daily_wordle_progress (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  guesses TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  play_started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day_key),
  CONSTRAINT daily_wordle_day_key_format CHECK (day_key ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT daily_wordle_guesses_max CHECK (cardinality(guesses) IS NULL OR cardinality(guesses) <= 6)
);

CREATE INDEX IF NOT EXISTS idx_daily_wordle_progress_day_key
  ON public.daily_wordle_progress (day_key);

ALTER TABLE public.daily_wordle_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_wordle_progress_select_own" ON public.daily_wordle_progress;
CREATE POLICY "daily_wordle_progress_select_own"
  ON public.daily_wordle_progress
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_wordle_progress_insert_own" ON public.daily_wordle_progress;
CREATE POLICY "daily_wordle_progress_insert_own"
  ON public.daily_wordle_progress
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_wordle_progress_update_own" ON public.daily_wordle_progress;
CREATE POLICY "daily_wordle_progress_update_own"
  ON public.daily_wordle_progress
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "daily_wordle_progress_delete_own" ON public.daily_wordle_progress;
CREATE POLICY "daily_wordle_progress_delete_own"
  ON public.daily_wordle_progress
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS daily_wordle_progress_touch ON public.daily_wordle_progress;
CREATE TRIGGER daily_wordle_progress_touch
  BEFORE UPDATE ON public.daily_wordle_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();
