-- Path skill overhaul for task-driven party boss gameplay.
-- Skills now primarily affect task -> pending damage generation or rage mitigation.

CREATE OR REPLACE FUNCTION public.use_skill_focus_ward()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'focus_ward';
  v_eff_str INT := 0;
  v_flat INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 35;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, strength + COALESCE(equip_str_bonus, 0)
  INTO v_path, v_cd, v_eff_str FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'swordsman' THEN RAISE EXCEPTION 'Only Swordsman may use Battle Focus'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  -- Flat pending-damage boost per qualifying task while active.
  v_flat := LEAST(18, GREATEST(0, FLOOR(v_eff_str / 4)));

  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (
    v_uid,
    'swordsman_task_flat_bonus',
    now() + interval '20 minutes',
    jsonb_build_object('flat', v_flat)
  )
  ON CONFLICT (user_id, buff_key)
  DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_str / 2)));
  v_cd_minutes := GREATEST(12, FLOOR(35 * (100 - v_reduction_pct) / 100.0));

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'buff', 'swordsman_task_flat_bonus',
    'flat_bonus', v_flat,
    'duration_minutes', 20,
    'cooldown_minutes', v_cd_minutes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.use_skill_party_mend(p_party_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'party_mend';
  v_eff_int INT := 0;
  v_pct INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 45;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_party_id IS NOT NULL AND NOT public.is_party_member(p_party_id, v_uid) THEN
    RAISE EXCEPTION 'Not a party member';
  END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, intelligence + COALESCE(equip_int_bonus, 0)
  INTO v_path, v_cd, v_eff_int FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'mage' THEN RAISE EXCEPTION 'Only Mage may use Arcane Mend'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  -- Multiplier on task-generated pending damage while active.
  v_pct := LEAST(60, GREATEST(0, FLOOR(v_eff_int * 1.5)));

  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (
    v_uid,
    'mage_task_mult_bonus',
    now() + interval '25 minutes',
    jsonb_build_object('pct', v_pct)
  )
  ON CONFLICT (user_id, buff_key)
  DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_int / 2)));
  v_cd_minutes := GREATEST(15, FLOOR(45 * (100 - v_reduction_pct) / 100.0));
  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'buff', 'mage_task_mult_bonus',
    'pct', v_pct,
    'duration_minutes', 25,
    'cooldown_minutes', v_cd_minutes
  );
END;
$$;

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
  v_pct INT := 35;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 40;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, dexterity + COALESCE(equip_dex_bonus, 0)
  INTO v_path, v_cd, v_eff_dex FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'rogue' THEN RAISE EXCEPTION 'Only Rogue may use Shadow Strike'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  -- Rogue gets a longer window and dexterity-tuned multiplier.
  v_pct := LEAST(50, GREATEST(35, 35 + FLOOR(v_eff_dex / 6)));

  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (
    v_uid,
    'boss_dmg_bonus',
    now() + interval '60 minutes',
    jsonb_build_object('pct', v_pct)
  )
  ON CONFLICT (user_id, buff_key)
  DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_dex / 2)));
  v_cd_minutes := GREATEST(15, FLOOR(40 * (100 - v_reduction_pct) / 100.0));
  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'buff', 'boss_dmg_bonus',
    'pct', v_pct,
    'duration_minutes', 60,
    'cooldown_minutes', v_cd_minutes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.use_skill_second_wind()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_path public.aura_path;
  v_cd TIMESTAMPTZ;
  v_sk TEXT := 'second_wind';
  v_eff_con INT := 0;
  v_pct INT := 0;
  v_cd_minutes INT := 1440; -- 24h
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, constitution + COALESCE(equip_con_bonus, 0)
  INTO v_path, v_cd, v_eff_con FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'tank' THEN RAISE EXCEPTION 'Only Tank may use Iron Guard'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  -- Reduces rage gained from missed dailies while active.
  v_pct := LEAST(65, GREATEST(0, FLOOR(v_eff_con * 1.8)));

  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (
    v_uid,
    'tank_rage_guard_bonus',
    now() + interval '24 hours',
    jsonb_build_object('pct', v_pct)
  )
  ON CONFLICT (user_id, buff_key)
  DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'buff', 'tank_rage_guard_bonus',
    'pct', v_pct,
    'duration_minutes', 1440,
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
  v_flat_bonus INT := 0;
  v_mage_pct INT := 0;
  v_rogue_pct INT := 0;
  v_total_mult_pct INT := 0;
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

  SELECT COALESCE((pb.meta ->> 'flat')::INT, 0)
  INTO v_flat_bonus
  FROM public.profile_buffs pb
  WHERE pb.user_id = NEW.user_id
    AND pb.buff_key = 'swordsman_task_flat_bonus'
    AND pb.expires_at > now()
  LIMIT 1;

  SELECT COALESCE((pb.meta ->> 'pct')::INT, 0)
  INTO v_mage_pct
  FROM public.profile_buffs pb
  WHERE pb.user_id = NEW.user_id
    AND pb.buff_key = 'mage_task_mult_bonus'
    AND pb.expires_at > now()
  LIMIT 1;

  SELECT COALESCE((pb.meta ->> 'pct')::INT, 0)
  INTO v_rogue_pct
  FROM public.profile_buffs pb
  WHERE pb.user_id = NEW.user_id
    AND pb.buff_key = 'boss_dmg_bonus'
    AND pb.expires_at > now()
  LIMIT 1;

  v_total_mult_pct := LEAST(120, GREATEST(0, v_mage_pct) + GREATEST(0, v_rogue_pct));
  v_delta := GREATEST(1, v_delta + GREATEST(0, v_flat_bonus));
  v_delta := GREATEST(1, FLOOR(v_delta * (100 + v_total_mult_pct) / 100.0));
  v_delta := LEAST(250, v_delta);

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

CREATE OR REPLACE FUNCTION public.apply_party_shadow_from_missed_dailies()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tz TEXT;
  v_today DATE;
  v_yesterday DATE;
  v_yest_dow INT;
  v_missed INT := 0;
  v_base_delta INT := 0;
  v_reduction_pct INT := 0;
  v_delta INT := 0;
  r RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT COALESCE(NULLIF(trim(timezone), ''), 'UTC') INTO v_tz FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;

  v_today := (timezone(v_tz, now()))::date;
  v_yesterday := v_today - 1;

  v_yest_dow := EXTRACT(DOW FROM make_timestamptz(
    EXTRACT(YEAR FROM v_yesterday)::INT,
    EXTRACT(MONTH FROM v_yesterday)::INT,
    EXTRACT(DAY FROM v_yesterday)::INT,
    12, 0, 0,
    v_tz
  ))::INT;

  SELECT COUNT(*)::INT INTO v_missed
  FROM public.tasks t
  WHERE t.user_id = v_uid
    AND t.type = 'daily'
    AND (t.sacred_days::INT & (1 << v_yest_dow)) <> 0
    AND (t.last_completed_local_date IS NULL OR t.last_completed_local_date < v_yesterday);

  IF v_missed <= 0 THEN
    RETURN json_build_object('applied', false, 'missed_dailies', 0);
  END IF;

  SELECT COALESCE((pb.meta ->> 'pct')::INT, 0)
  INTO v_reduction_pct
  FROM public.profile_buffs pb
  WHERE pb.user_id = v_uid
    AND pb.buff_key = 'tank_rage_guard_bonus'
    AND pb.expires_at > now()
  LIMIT 1;

  v_base_delta := v_missed * 2;
  v_reduction_pct := LEAST(95, GREATEST(0, v_reduction_pct));
  v_delta := GREATEST(0, CEIL(v_base_delta * (100 - v_reduction_pct) / 100.0));

  IF v_delta <= 0 THEN
    RETURN json_build_object(
      'applied', true,
      'missed_dailies', v_missed,
      'rage_delta', 0,
      'rage_reduction_pct', v_reduction_pct
    );
  END IF;

  FOR r IN SELECT party_id FROM public.party_members WHERE user_id = v_uid
  LOOP
    UPDATE public.parties
    SET boss_rage = LEAST(5000, COALESCE(boss_rage, 0) + v_delta)
    WHERE id = r.party_id;
  END LOOP;

  RETURN json_build_object(
    'applied', true,
    'missed_dailies', v_missed,
    'rage_delta', v_delta,
    'rage_reduction_pct', v_reduction_pct
  );
END;
$$;
