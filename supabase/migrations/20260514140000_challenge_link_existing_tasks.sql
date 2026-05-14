-- Replace the "create new tasks" approach with linking existing user tasks.
-- A separate junction table keeps challenge_run_id on tasks free for other uses
-- and avoids duplicating the user's quest log.

CREATE TABLE IF NOT EXISTS public.challenge_task_links (
  run_id  UUID NOT NULL REFERENCES public.challenge_runs(id)  ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id)           ON DELETE CASCADE,
  PRIMARY KEY (run_id, task_id)
);

ALTER TABLE public.challenge_task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenge_task_links_read" ON public.challenge_task_links
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_task_links_insert" ON public.challenge_task_links
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.challenge_participants cp
      WHERE cp.run_id = challenge_task_links.run_id AND cp.user_id = auth.uid()
    )
  );

-- Rewrite start_challenge_run: match blueprint titles to existing tasks,
-- link them to the run, and do NOT create new tasks.
CREATE OR REPLACE FUNCTION public.start_challenge_run(p_template_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tpl    public.challenge_templates%ROWTYPE;
  v_run    UUID;
  v_tz     TEXT;
  v_start  DATE;
  v_end    DATE;
  v_len    INT;
  v_i      INT;
  elem     JSONB;
  v_title  TEXT;
  v_task   UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_tpl FROM public.challenge_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  -- Prevent duplicate active runs for the same template by the same user.
  IF EXISTS (
    SELECT 1
    FROM public.challenge_runs cr
    JOIN public.challenge_participants cp ON cp.run_id = cr.id
    WHERE cr.template_id = p_template_id
      AND cp.user_id = v_uid
      AND cr.ends_on >= (now() AT TIME ZONE 'UTC')::date
  ) THEN
    RAISE EXCEPTION 'You already have an active run for this challenge';
  END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'UTC') INTO v_tz
  FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_start := (timezone(v_tz, now()))::date;
  v_end   := v_start + (v_tpl.duration_days - 1);

  INSERT INTO public.challenge_runs (template_id, starts_on, ends_on)
  VALUES (p_template_id, v_start, v_end)
  RETURNING id INTO v_run;

  INSERT INTO public.challenge_participants (run_id, user_id)
  VALUES (v_run, v_uid)
  ON CONFLICT (run_id, user_id) DO NOTHING;

  -- Link existing tasks matched by title; silently skip unmatched ones.
  v_len := COALESCE(jsonb_array_length(v_tpl.task_blueprint), 0);
  FOR v_i IN 0..(v_len - 1) LOOP
    elem    := v_tpl.task_blueprint -> v_i;
    v_title := elem ->> 'title';
    CONTINUE WHEN v_title IS NULL OR v_title = '';

    SELECT id INTO v_task
    FROM public.tasks
    WHERE user_id = v_uid AND title = v_title
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO public.challenge_task_links (run_id, task_id)
      VALUES (v_run, v_task)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN json_build_object('run_id', v_run, 'ends_on', v_end);
END;
$$;

-- Also update the score trigger to use the junction table.
CREATE OR REPLACE FUNCTION public.increment_challenge_score_on_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run UUID;
BEGIN
  -- Find an active run that links this task
  SELECT ctl.run_id INTO v_run
  FROM public.challenge_task_links ctl
  JOIN public.challenge_runs cr ON cr.id = ctl.run_id
  WHERE ctl.task_id = NEW.id
    AND cr.ends_on >= now()::date
  LIMIT 1;

  IF v_run IS NULL THEN RETURN NEW; END IF;

  IF NEW.type IN ('daily', 'todo')
     AND NEW.completed = true
     AND (OLD.completed IS DISTINCT FROM true) THEN
    UPDATE public.challenge_participants
    SET score = score + 1
    WHERE run_id = v_run AND user_id = NEW.user_id;
  END IF;

  IF NEW.type = 'habit'
     AND COALESCE(NEW.positive_count, 0) > COALESCE(OLD.positive_count, 0) THEN
    UPDATE public.challenge_participants
    SET score = score + (COALESCE(NEW.positive_count, 0) - COALESCE(OLD.positive_count, 0))
    WHERE run_id = v_run AND user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- RPC: return the current user's active run per template_id.
CREATE OR REPLACE FUNCTION public.get_my_challenge_runs()
RETURNS TABLE (template_id UUID, run_id UUID, ends_on DATE)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cr.template_id, cr.id AS run_id, cr.ends_on
  FROM public.challenge_runs cr
  JOIN public.challenge_participants cp ON cp.run_id = cr.id
  WHERE cp.user_id = auth.uid()
    AND cr.ends_on >= now()::date;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_challenge_runs() TO authenticated;
