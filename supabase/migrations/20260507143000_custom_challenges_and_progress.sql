-- Custom challenges: support sacred-day schedules and habit progress scoring

CREATE OR REPLACE FUNCTION public.start_challenge_run(p_template_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tpl public.challenge_templates%ROWTYPE;
  v_run UUID;
  v_tz TEXT;
  v_start DATE;
  v_end DATE;
  v_i INT;
  v_len INT;
  elem JSONB;
  v_type public.task_type;
  v_title TEXT;
  v_notes TEXT;
  v_diff public.task_difficulty;
  v_sacred SMALLINT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_tpl FROM public.challenge_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'UTC') INTO v_tz FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  v_start := (timezone(v_tz, now()))::date;
  v_end := v_start + (v_tpl.duration_days - 1);

  INSERT INTO public.challenge_runs (template_id, starts_on, ends_on)
  VALUES (p_template_id, v_start, v_end)
  RETURNING id INTO v_run;

  INSERT INTO public.challenge_participants (run_id, user_id) VALUES (v_run, v_uid)
  ON CONFLICT (run_id, user_id) DO NOTHING;

  v_len := COALESCE(jsonb_array_length(v_tpl.task_blueprint), 0);
  IF v_len > 0 THEN
    FOR v_i IN 0..(v_len - 1) LOOP
      elem := v_tpl.task_blueprint->v_i;
      v_type := COALESCE((elem->>'type')::public.task_type, 'todo');
      v_title := COALESCE(elem->>'title', 'Challenge step');
      v_notes := COALESCE(elem->>'notes', '*Challenge quest*');
      v_diff := COALESCE((elem->>'difficulty')::public.task_difficulty, 'easy');
      v_sacred := CASE
        WHEN v_type = 'daily' THEN COALESCE((elem->>'sacred_days')::SMALLINT, 127)
        ELSE 127
      END;

      INSERT INTO public.tasks (user_id, type, title, notes, difficulty, challenge_run_id, sacred_days)
      VALUES (v_uid, v_type, v_title, v_notes, v_diff, v_run, v_sacred);
    END LOOP;
  END IF;

  RETURN json_build_object('run_id', v_run, 'ends_on', v_end);
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_challenge_score_on_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.challenge_run_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Dailies / todos score when completed toggles false -> true
  IF NEW.type IN ('daily', 'todo')
     AND NEW.completed = true
     AND (OLD.completed IS DISTINCT FROM true) THEN
    UPDATE public.challenge_participants
    SET score = score + 1
    WHERE run_id = NEW.challenge_run_id AND user_id = NEW.user_id;
  END IF;

  -- Habits score each time positive_count increments
  IF NEW.type = 'habit' AND COALESCE(NEW.positive_count, 0) > COALESCE(OLD.positive_count, 0) THEN
    UPDATE public.challenge_participants
    SET score = score + (COALESCE(NEW.positive_count, 0) - COALESCE(OLD.positive_count, 0))
    WHERE run_id = NEW.challenge_run_id AND user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_challenge_todo ON public.tasks;
DROP TRIGGER IF EXISTS trg_challenge_progress ON public.tasks;
CREATE TRIGGER trg_challenge_progress
  AFTER UPDATE OF completed, positive_count ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_challenge_score_on_progress();
