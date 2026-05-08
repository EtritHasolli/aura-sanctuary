-- Make Rogue Shadow Strike affect task-generated party adventure damage.
-- Also extend active window to 1 hour to match gameplay expectation.

CREATE OR REPLACE FUNCTION public.use_skill_shadow_strike()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'shadow_strike';
  v_eff_dex INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 40;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, dexterity + COALESCE(equip_dex_bonus, 0)
  INTO v_path, v_cd, v_eff_dex FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'rogue' THEN RAISE EXCEPTION 'Only Rogue may use Shadow Strike'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (v_uid, 'boss_dmg_bonus', now() + interval '60 minutes', '{"pct":35}'::jsonb)
  ON CONFLICT (user_id, buff_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_dex / 2)));
  v_cd_minutes := GREATEST(15, FLOOR(40 * (100 - v_reduction_pct) / 100.0));
  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;
  RETURN json_build_object(
    'ok', true,
    'buff', 'boss_dmg_bonus',
    'duration_minutes', 60,
    'cooldown_minutes', v_cd_minutes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_party_adventure_damage_from_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta INT := 0;
  v_buff_pct INT := 0;
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

  -- Shadow Strike buff also amplifies task-generated pending boss damage while active.
  SELECT COALESCE((pb.meta ->> 'pct')::INT, 0)
  INTO v_buff_pct
  FROM public.profile_buffs pb
  WHERE pb.user_id = NEW.user_id
    AND pb.buff_key = 'boss_dmg_bonus'
    AND pb.expires_at > now()
  LIMIT 1;

  IF v_buff_pct > 0 THEN
    v_delta := GREATEST(1, FLOOR(v_delta * (100 + v_buff_pct) / 100.0));
  END IF;

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
