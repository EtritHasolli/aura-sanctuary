CREATE OR REPLACE FUNCTION public.join_party_by_id(p_party_id UUID)
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
  IF p_party_id IS NULL THEN RAISE EXCEPTION 'Party id is required'; END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;

  INSERT INTO public.party_members (party_id, user_id)
  VALUES (p_party_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', p_party_id, 'name', v_party.name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_party_by_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_party_by_id(UUID) TO authenticated;

CREATE TABLE IF NOT EXISTS public.party_adventures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'mythic')),
  boss_name TEXT NOT NULL,
  boss_hp INT NOT NULL,
  boss_max_hp INT NOT NULL,
  task_damage_only BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  next_tick_on DATE NOT NULL DEFAULT CURRENT_DATE + 1,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS party_adventures_party_active_idx
  ON public.party_adventures(party_id, active);

ALTER TABLE public.party_adventures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "party_adventures_viewable_by_members"
  ON public.party_adventures
  FOR SELECT
  TO authenticated
  USING (public.is_party_member(party_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.party_adventure_damage (
  adventure_id UUID NOT NULL REFERENCES public.party_adventures(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pending_damage INT NOT NULL DEFAULT 0,
  PRIMARY KEY (adventure_id, user_id)
);

CREATE INDEX IF NOT EXISTS party_adventure_damage_adventure_idx
  ON public.party_adventure_damage(adventure_id);

ALTER TABLE public.party_adventure_damage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "party_adventure_damage_viewable_by_members"
  ON public.party_adventure_damage
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.party_adventures pa
      WHERE pa.id = adventure_id
        AND public.is_party_member(pa.party_id, auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.start_party_adventure(p_party_id UUID, p_difficulty TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_boss_name TEXT;
  v_boss_hp INT;
  v_roll INT;
  v_adv_id UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id = p_party_id AND leader_id = v_uid) THEN
    RAISE EXCEPTION 'Only party leader can start adventures';
  END IF;

  CASE lower(trim(p_difficulty))
    WHEN 'easy' THEN
      v_roll := floor(random() * 3)::INT;
      IF v_roll = 0 THEN v_boss_name := 'Moss Ogre'; v_boss_hp := 300; END IF;
      IF v_roll = 1 THEN v_boss_name := 'Grove Boar'; v_boss_hp := 340; END IF;
      IF v_roll = 2 THEN v_boss_name := 'Root Lurker'; v_boss_hp := 380; END IF;
    WHEN 'medium' THEN
      v_roll := floor(random() * 3)::INT;
      IF v_roll = 0 THEN v_boss_name := 'Dusk Drake'; v_boss_hp := 700; END IF;
      IF v_roll = 1 THEN v_boss_name := 'Ash Basilisk'; v_boss_hp := 780; END IF;
      IF v_roll = 2 THEN v_boss_name := 'Storm Harrier'; v_boss_hp := 860; END IF;
    WHEN 'hard' THEN
      v_roll := floor(random() * 3)::INT;
      IF v_roll = 0 THEN v_boss_name := 'Void Titan'; v_boss_hp := 1400; END IF;
      IF v_roll = 1 THEN v_boss_name := 'Blight Golem'; v_boss_hp := 1580; END IF;
      IF v_roll = 2 THEN v_boss_name := 'Night Colossus'; v_boss_hp := 1720; END IF;
    WHEN 'mythic' THEN
      v_roll := floor(random() * 3)::INT;
      IF v_roll = 0 THEN v_boss_name := 'Eclipse Hydra'; v_boss_hp := 2500; END IF;
      IF v_roll = 1 THEN v_boss_name := 'Astral Leviathan'; v_boss_hp := 2850; END IF;
      IF v_roll = 2 THEN v_boss_name := 'Sunless Wyrm'; v_boss_hp := 3200; END IF;
    ELSE
      RAISE EXCEPTION 'Invalid adventure difficulty';
  END CASE;

  UPDATE public.party_adventures SET active = false WHERE party_id = p_party_id AND active = true;

  INSERT INTO public.party_adventures (
    party_id, difficulty, boss_name, boss_hp, boss_max_hp, task_damage_only, active, next_tick_on, created_by
  )
  VALUES (p_party_id, lower(trim(p_difficulty)), v_boss_name, v_boss_hp, v_boss_hp, true, true, CURRENT_DATE + 1, v_uid)
  RETURNING id INTO v_adv_id;

  UPDATE public.parties
  SET boss_name = v_boss_name, boss_hp = v_boss_hp, boss_max_hp = v_boss_hp
  WHERE id = p_party_id;

  RETURN json_build_object('ok', true, 'adventure_id', v_adv_id, 'boss_name', v_boss_name, 'boss_hp', v_boss_hp);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_party_adventure(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_party_adventure(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_party_adventure_damage_from_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta INT := 0;
  r RECORD;
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.type = 'habit' THEN
    v_delta := GREATEST(0, COALESCE(NEW.positive_count, 0) - COALESCE(OLD.positive_count, 0)) * 4;
  ELSIF NEW.type = 'daily' AND NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    v_delta := CASE NEW.difficulty
      WHEN 'trivial' THEN 6 WHEN 'easy' THEN 10 WHEN 'medium' THEN 16 ELSE 24
    END;
  ELSIF NEW.type = 'todo' AND NEW.completed = true AND (OLD.completed IS DISTINCT FROM true) THEN
    v_delta := CASE NEW.difficulty
      WHEN 'trivial' THEN 8 WHEN 'easy' THEN 12 WHEN 'medium' THEN 20 ELSE 30
    END;
  END IF;

  IF v_delta <= 0 THEN RETURN NEW; END IF;

  FOR r IN
    SELECT pa.id AS adventure_id
    FROM public.party_members pm
    JOIN public.party_adventures pa ON pa.party_id = pm.party_id
    WHERE pm.user_id = NEW.user_id
      AND pa.active = true
      AND pa.task_damage_only = true
  LOOP
    INSERT INTO public.party_adventure_damage (adventure_id, user_id, pending_damage)
    VALUES (r.adventure_id, NEW.user_id, v_delta)
    ON CONFLICT (adventure_id, user_id)
    DO UPDATE SET pending_damage = public.party_adventure_damage.pending_damage + EXCLUDED.pending_damage;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_party_adventure_damage ON public.tasks;
CREATE TRIGGER trg_record_party_adventure_damage
AFTER UPDATE OF completed, positive_count ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.record_party_adventure_damage_from_task();

CREATE OR REPLACE FUNCTION public.apply_due_party_adventure_damage_for_user()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_today DATE := CURRENT_DATE;
  r RECORD;
  v_sum INT;
  v_new_hp INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  FOR r IN
    SELECT pa.id, pa.party_id, pa.boss_hp, pa.next_tick_on
    FROM public.party_adventures pa
    JOIN public.party_members pm ON pm.party_id = pa.party_id
    WHERE pm.user_id = v_uid
      AND pa.active = true
      AND pa.task_damage_only = true
      AND pa.next_tick_on <= v_today
  LOOP
    SELECT COALESCE(SUM(pad.pending_damage), 0)
    INTO v_sum
    FROM public.party_adventure_damage pad
    WHERE pad.adventure_id = r.id;

    IF v_sum > 0 THEN
      v_new_hp := GREATEST(0, r.boss_hp - v_sum);
      UPDATE public.party_adventures
      SET boss_hp = v_new_hp,
          active = CASE WHEN v_new_hp <= 0 THEN false ELSE active END,
          next_tick_on = v_today + 1
      WHERE id = r.id;

      UPDATE public.parties
      SET boss_hp = v_new_hp
      WHERE id = r.party_id;

      UPDATE public.party_adventure_damage
      SET pending_damage = 0
      WHERE adventure_id = r.id;
    ELSE
      UPDATE public.party_adventures
      SET next_tick_on = v_today + 1
      WHERE id = r.id;
    END IF;
  END LOOP;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_due_party_adventure_damage_for_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_due_party_adventure_damage_for_user() TO authenticated;
