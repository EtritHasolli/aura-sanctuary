-- Phase 5: Quest arcs (scroll-style multi-step progression)

CREATE TABLE IF NOT EXISTS public.quest_arcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quest_arc_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arc_id UUID NOT NULL REFERENCES public.quest_arcs(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  step_kind TEXT NOT NULL CHECK (step_kind IN ('complete_todos', 'strike_boss', 'spend_gold')),
  goal INT NOT NULL DEFAULT 1 CHECK (goal >= 1),
  reward_gold INT NOT NULL DEFAULT 0,
  reward_xp INT NOT NULL DEFAULT 0,
  UNIQUE (arc_id, step_order)
);

CREATE TABLE IF NOT EXISTS public.user_quest_arc_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  arc_id UUID NOT NULL REFERENCES public.quest_arcs(id) ON DELETE CASCADE,
  current_step INT NOT NULL DEFAULT 1,
  progress_count INT NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, arc_id)
);

CREATE INDEX IF NOT EXISTS user_quest_arc_progress_user_idx ON public.user_quest_arc_progress(user_id);

ALTER TABLE public.quest_arcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quest_arc_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_quest_arc_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quest_arcs_read" ON public.quest_arcs FOR SELECT TO authenticated USING (true);
CREATE POLICY "quest_arc_steps_read" ON public.quest_arc_steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_quest_arc_progress_owner" ON public.user_quest_arc_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

INSERT INTO public.quest_arcs (slug, title, description)
SELECT 'shadow-cleansing', 'Shadow Cleansing', 'Push back the Shadow through deeds and strikes.'
WHERE NOT EXISTS (SELECT 1 FROM public.quest_arcs WHERE slug = 'shadow-cleansing');

INSERT INTO public.quest_arc_steps (arc_id, step_order, step_kind, goal, reward_gold, reward_xp)
SELECT a.id, 1, 'complete_todos', 3, 30, 15 FROM public.quest_arcs a WHERE a.slug = 'shadow-cleansing'
  AND NOT EXISTS (SELECT 1 FROM public.quest_arc_steps s WHERE s.arc_id = a.id AND s.step_order = 1);

INSERT INTO public.quest_arc_steps (arc_id, step_order, step_kind, goal, reward_gold, reward_xp)
SELECT a.id, 2, 'strike_boss', 2, 40, 20 FROM public.quest_arcs a WHERE a.slug = 'shadow-cleansing'
  AND NOT EXISTS (SELECT 1 FROM public.quest_arc_steps s WHERE s.arc_id = a.id AND s.step_order = 2);

INSERT INTO public.quest_arc_steps (arc_id, step_order, step_kind, goal, reward_gold, reward_xp)
SELECT a.id, 3, 'spend_gold', 50, 60, 35 FROM public.quest_arcs a WHERE a.slug = 'shadow-cleansing'
  AND NOT EXISTS (SELECT 1 FROM public.quest_arc_steps s WHERE s.arc_id = a.id AND s.step_order = 3);

CREATE OR REPLACE FUNCTION public.ensure_quest_arc_started(p_arc_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_arc UUID;
  v_row UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO v_arc FROM public.quest_arcs WHERE slug = p_arc_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'Arc not found'; END IF;

  INSERT INTO public.user_quest_arc_progress (user_id, arc_id, current_step, progress_count, completed)
  VALUES (v_uid, v_arc, 1, 0, false)
  ON CONFLICT (user_id, arc_id) DO NOTHING
  RETURNING id INTO v_row;

  SELECT id INTO v_row FROM public.user_quest_arc_progress WHERE user_id = v_uid AND arc_id = v_arc;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_quest_arc_event(
  p_kind TEXT,
  p_amount INT DEFAULT 1
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  r public.user_quest_arc_progress%ROWTYPE;
  st public.quest_arc_steps%ROWTYPE;
  v_gold_reward INT := 0;
  v_xp_reward INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_kind <> 'spend_gold' AND (p_amount IS NULL OR p_amount < 1) THEN
    p_amount := 1;
  END IF;
  IF p_kind = 'spend_gold' AND (p_amount IS NULL OR p_amount < 1) THEN
    RETURN json_build_object('gold_awarded', 0, 'xp_awarded', 0);
  END IF;

  FOR r IN
    SELECT * FROM public.user_quest_arc_progress WHERE user_id = v_uid AND NOT completed
  LOOP
    SELECT * INTO st FROM public.quest_arc_steps
    WHERE arc_id = r.arc_id AND step_order = r.current_step;
    IF NOT FOUND THEN CONTINUE; END IF;

    IF st.step_kind IS DISTINCT FROM p_kind THEN CONTINUE; END IF;

    UPDATE public.user_quest_arc_progress
    SET progress_count = progress_count + p_amount, updated_at = now()
    WHERE id = r.id
    RETURNING * INTO r;

    IF r.progress_count >= st.goal THEN
      v_gold_reward := v_gold_reward + st.reward_gold;
      v_xp_reward := v_xp_reward + st.reward_xp;

      IF EXISTS (SELECT 1 FROM public.quest_arc_steps WHERE arc_id = r.arc_id AND step_order = r.current_step + 1) THEN
        UPDATE public.user_quest_arc_progress
        SET current_step = current_step + 1, progress_count = 0, updated_at = now()
        WHERE id = r.id;
      ELSE
        UPDATE public.user_quest_arc_progress
        SET completed = true, progress_count = st.goal, updated_at = now()
        WHERE id = r.id;
      END IF;
    END IF;
  END LOOP;

  IF v_gold_reward > 0 OR v_xp_reward > 0 THEN
    UPDATE public.profiles
    SET gold = gold + v_gold_reward, xp = xp + v_xp_reward
    WHERE id = v_uid;
  END IF;

  RETURN json_build_object('gold_awarded', v_gold_reward, 'xp_awarded', v_xp_reward);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_quest_arc_started(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_quest_arc_event(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_quest_arc_started(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_quest_arc_event(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.quest_arc_on_todo_done()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'todo' AND NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    PERFORM public.record_quest_arc_event('complete_todos', 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quest_arc_todo ON public.tasks;
CREATE TRIGGER trg_quest_arc_todo
  AFTER UPDATE OF completed ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.quest_arc_on_todo_done();
