-- Phase 4: Party leadership + invite codes + guild kind + challenges

ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_code TEXT,
  ADD COLUMN IF NOT EXISTS party_kind TEXT NOT NULL DEFAULT 'tavern' CHECK (party_kind IN ('tavern', 'party', 'guild')),
  ADD COLUMN IF NOT EXISTS shadow_pressure_mode TEXT NOT NULL DEFAULT 'support' CHECK (shadow_pressure_mode IN ('support', 'hardcore'));

CREATE UNIQUE INDEX IF NOT EXISTS parties_invite_code_uq ON public.parties(invite_code) WHERE invite_code IS NOT NULL;

UPDATE public.parties p
SET invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
WHERE p.invite_code IS NULL;

-- Backfill leader from first member (arbitrary) for existing rows
UPDATE public.parties pt
SET leader_id = sub.uid
FROM (
  SELECT DISTINCT ON (party_id) party_id, user_id AS uid
  FROM public.party_members
  ORDER BY party_id, joined_at ASC
) sub
WHERE pt.id = sub.party_id AND pt.leader_id IS NULL;

CREATE POLICY "Parties insert by authenticated" ON public.parties
  FOR INSERT TO authenticated
  WITH CHECK (leader_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_party(
  p_name TEXT,
  p_boss_name TEXT DEFAULT 'Shadow Wyrm',
  p_kind TEXT DEFAULT 'party'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_code TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_kind NOT IN ('party', 'guild') THEN RAISE EXCEPTION 'Invalid party kind'; END IF;

  FOR i IN 1..12 LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.parties WHERE invite_code = v_code);
  END LOOP;

  INSERT INTO public.parties (name, boss_name, boss_hp, boss_max_hp, leader_id, invite_code, party_kind, shadow_pressure_mode)
  VALUES (p_name, p_boss_name, 1000, 1000, v_uid, v_code, p_kind, 'support')
  RETURNING id INTO v_id;

  INSERT INTO public.party_members (party_id, user_id) VALUES (v_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', v_id, 'invite_code', v_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_party_by_invite_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party public.parties%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_party FROM public.parties WHERE invite_code = upper(trim(p_code)) LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No party for that code'; END IF;

  INSERT INTO public.party_members (party_id, user_id) VALUES (v_party.id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', v_party.id, 'name', v_party.name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_party(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_party_by_invite_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_party(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_party_by_invite_code(TEXT) TO authenticated;

-- Challenges
CREATE TABLE IF NOT EXISTS public.challenge_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_days INT NOT NULL DEFAULT 7 CHECK (duration_days >= 1 AND duration_days <= 90),
  task_blueprint JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.challenge_templates(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.challenge_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.challenge_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score INT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, user_id)
);

CREATE INDEX IF NOT EXISTS challenge_participants_run_idx ON public.challenge_participants(run_id);

ALTER TABLE public.challenge_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "challenge_templates_read" ON public.challenge_templates FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_runs_read" ON public.challenge_runs FOR SELECT TO authenticated USING (true);

CREATE POLICY "challenge_participants_read" ON public.challenge_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "challenge_participants_self_ins" ON public.challenge_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "challenge_participants_self_upd" ON public.challenge_participants FOR UPDATE TO authenticated USING (auth.uid() = user_id);

INSERT INTO public.challenge_templates (name, description, duration_days, task_blueprint)
SELECT 'Seven-Day Focus', 'Complete one small to-do each day for a week.', 7,
  '[
    {"type":"todo","title":"Day 1 bounty","difficulty":"easy"},
    {"type":"todo","title":"Day 2 bounty","difficulty":"easy"},
    {"type":"todo","title":"Day 3 bounty","difficulty":"medium"},
    {"type":"todo","title":"Day 4 bounty","difficulty":"medium"},
    {"type":"todo","title":"Day 5 bounty","difficulty":"medium"},
    {"type":"todo","title":"Day 6 bounty","difficulty":"hard"},
    {"type":"todo","title":"Day 7 bounty","difficulty":"hard"}
  ]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.challenge_templates WHERE name = 'Seven-Day Focus');

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS challenge_run_id UUID REFERENCES public.challenge_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tasks_challenge_run_idx ON public.tasks(challenge_run_id);

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

  INSERT INTO public.challenge_participants (run_id, user_id) VALUES (v_run, v_uid);

  v_len := COALESCE(jsonb_array_length(v_tpl.task_blueprint), 0);
  IF v_len > 0 THEN
    FOR v_i IN 0..(v_len - 1) LOOP
      elem := v_tpl.task_blueprint->v_i;
      INSERT INTO public.tasks (user_id, type, title, notes, difficulty, challenge_run_id)
      VALUES (
        v_uid,
        COALESCE((elem->>'type')::public.task_type, 'todo'),
        COALESCE(elem->>'title', 'Challenge step'),
        '*Challenge quest*',
        COALESCE((elem->>'difficulty')::public.task_difficulty, 'easy'),
        v_run
      );
    END LOOP;
  END IF;

  RETURN json_build_object('run_id', v_run, 'ends_on', v_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_challenge_run(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_challenge_run(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_challenge_score_on_todo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.type = 'todo' AND NEW.challenge_run_id IS NOT NULL AND NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    UPDATE public.challenge_participants
    SET score = score + 1
    WHERE run_id = NEW.challenge_run_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_challenge_todo ON public.tasks;
CREATE TRIGGER trg_challenge_todo
  AFTER UPDATE OF completed ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_challenge_score_on_todo();
