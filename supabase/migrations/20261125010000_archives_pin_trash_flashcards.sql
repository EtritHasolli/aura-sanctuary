-- Archives upgrade: pinned notes, a trash with restore, and spaced-repetition flashcards.

-- ============================================================================
-- 1. Pinned notes + soft delete (trash)
-- ============================================================================
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS pinned     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS notes_user_deleted_idx ON public.notes(user_id, deleted_at);

-- Trashed notes still count toward the plan's note limit (check_note_limit counts every
-- row). Excluding them would let a restore push a user past their limit, since restoring
-- is an UPDATE and the limit trigger only runs on INSERT.

-- ============================================================================
-- 2. Flashcards — "Question :: Answer" lines inside a note are cards.
--    Card text lives in the note; this table only stores scheduling state.
--    card_key is a client-computed hash of the normalised question text.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.note_flashcard_states (
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id          UUID        NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  card_key         TEXT        NOT NULL CHECK (length(card_key) BETWEEN 1 AND 64),
  ease             REAL        NOT NULL DEFAULT 2.5,
  interval_days    INTEGER     NOT NULL DEFAULT 0,
  reps             INTEGER     NOT NULL DEFAULT 0,
  due_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reviewed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, note_id, card_key)
);

ALTER TABLE public.note_flashcard_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS note_flashcard_states_select_own ON public.note_flashcard_states;
CREATE POLICY note_flashcard_states_select_own
  ON public.note_flashcard_states FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- Writes go through review_flashcard() so scheduling and the XP cap can't be bypassed.

-- XP earned from reviews per local day, for the daily cap.
CREATE TABLE IF NOT EXISTS public.flashcard_daily_xp (
  user_id UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day     DATE    NOT NULL,
  xp      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE public.flashcard_daily_xp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flashcard_daily_xp_select_own ON public.flashcard_daily_xp;
CREATE POLICY flashcard_daily_xp_select_own
  ON public.flashcard_daily_xp FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. review_flashcard — SM-2-style scheduling + capped XP.
--    p_grade: 'again' | 'hard' | 'good' | 'easy'
--    Returns { xp_awarded, xp_today, xp_cap, interval_days, due_at }.
--    XP is only earned for cards that were due (or new) and not failed; the client
--    applies it with the normal reward flow.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.review_flashcard(
  p_note_id  UUID,
  p_card_key TEXT,
  p_grade    TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_xp_cap    CONSTANT INTEGER := 25;
  v_xp_card   CONSTANT INTEGER := 1;
  v_now       TIMESTAMPTZ := now();
  v_tz        TEXT;
  v_day       DATE;
  v_state     public.note_flashcard_states;
  v_was_due   BOOLEAN;
  v_ease      REAL;
  v_interval  INTEGER;
  v_reps      INTEGER;
  v_due       TIMESTAMPTZ;
  v_xp_today  INTEGER;
  v_award     INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_grade NOT IN ('again', 'hard', 'good', 'easy') THEN RAISE EXCEPTION 'Invalid grade'; END IF;
  IF p_card_key IS NULL OR length(p_card_key) NOT BETWEEN 1 AND 64 THEN
    RAISE EXCEPTION 'Invalid card';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.notes
    WHERE id = p_note_id AND user_id = v_uid AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Note not found';
  END IF;

  SELECT * INTO v_state
  FROM public.note_flashcard_states
  WHERE user_id = v_uid AND note_id = p_note_id AND card_key = p_card_key
  FOR UPDATE;

  -- New cards (no state row yet) are always due.
  v_was_due  := NOT FOUND OR v_state.due_at <= v_now;
  v_ease     := COALESCE(v_state.ease, 2.5);
  v_interval := COALESCE(v_state.interval_days, 0);
  v_reps     := COALESCE(v_state.reps, 0);

  IF p_grade = 'again' THEN
    v_reps     := 0;
    v_interval := 0;
    v_ease     := greatest(1.3, v_ease - 0.2);
    v_due      := v_now + interval '10 minutes';
  ELSE
    IF p_grade = 'hard' THEN
      v_interval := greatest(1, round(greatest(v_interval, 1) * 1.2)::INTEGER);
      v_ease     := greatest(1.3, v_ease - 0.15);
    ELSIF v_reps = 0 THEN
      v_interval := CASE WHEN p_grade = 'easy' THEN 3 ELSE 1 END;
    ELSIF v_reps = 1 THEN
      v_interval := CASE WHEN p_grade = 'easy' THEN 6 ELSE 3 END;
    ELSE
      -- numeric rounding (half away from zero) matches the client's Math.round preview.
      v_interval := greatest(v_interval + 1, round((v_interval * v_ease)::NUMERIC)::INTEGER);
      IF p_grade = 'easy' THEN v_interval := round(v_interval * 1.3)::INTEGER; END IF;
    END IF;
    IF p_grade = 'easy' THEN v_ease := least(3.0, v_ease + 0.15); END IF;
    v_interval := least(v_interval, 365);
    v_reps     := v_reps + 1;
    v_due      := v_now + make_interval(days => v_interval);
  END IF;

  INSERT INTO public.note_flashcard_states AS s
    (user_id, note_id, card_key, ease, interval_days, reps, due_at, last_reviewed_at)
  VALUES (v_uid, p_note_id, p_card_key, v_ease, v_interval, v_reps, v_due, v_now)
  ON CONFLICT (user_id, note_id, card_key) DO UPDATE
    SET ease = EXCLUDED.ease,
        interval_days = EXCLUDED.interval_days,
        reps = EXCLUDED.reps,
        due_at = EXCLUDED.due_at,
        last_reviewed_at = EXCLUDED.last_reviewed_at;

  -- Daily cap is per local calendar day of the user.
  SELECT COALESCE(NULLIF(timezone, ''), 'UTC') INTO v_tz FROM public.profiles WHERE id = v_uid;
  BEGIN
    v_day := (v_now AT TIME ZONE COALESCE(v_tz, 'UTC'))::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_day := (v_now AT TIME ZONE 'UTC')::DATE;
  END;

  INSERT INTO public.flashcard_daily_xp (user_id, day, xp)
  VALUES (v_uid, v_day, 0)
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT xp INTO v_xp_today
  FROM public.flashcard_daily_xp
  WHERE user_id = v_uid AND day = v_day
  FOR UPDATE;

  IF v_was_due AND p_grade <> 'again' AND v_xp_today < v_xp_cap THEN
    v_award := least(v_xp_card, v_xp_cap - v_xp_today);
    UPDATE public.flashcard_daily_xp
    SET xp = xp + v_award
    WHERE user_id = v_uid AND day = v_day;
    v_xp_today := v_xp_today + v_award;
  END IF;

  RETURN json_build_object(
    'xp_awarded', v_award,
    'xp_today', v_xp_today,
    'xp_cap', v_xp_cap,
    'interval_days', v_interval,
    'due_at', v_due
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.review_flashcard(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.review_flashcard(UUID, TEXT, TEXT) TO authenticated;
