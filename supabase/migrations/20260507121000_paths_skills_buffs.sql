-- Phase 2: Aura path (class), skill cooldowns, temporary buffs

CREATE TYPE public.aura_path AS ENUM ('warden', 'scholar', 'strider', 'keeper');

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS aura_path public.aura_path,
  ADD COLUMN IF NOT EXISTS skill_cooldowns JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.skill_cooldowns IS 'Map skill key -> ISO timestamp last used.';

CREATE TABLE IF NOT EXISTS public.profile_buffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  buff_key TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, buff_key)
);

CREATE INDEX IF NOT EXISTS profile_buffs_user_exp_idx ON public.profile_buffs(user_id, expires_at);

ALTER TABLE public.profile_buffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_buffs_owner" ON public.profile_buffs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.prune_expired_buffs(p_uid UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.profile_buffs WHERE user_id = p_uid AND expires_at <= now();
$$;

REVOKE EXECUTE ON FUNCTION public.prune_expired_buffs(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prune_expired_buffs(UUID) TO authenticated;

-- Focus Ward: next focus session +25% XP (stored meta), 2h buff, 30m cooldown
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz
  INTO v_path, v_cd FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'warden' THEN RAISE EXCEPTION 'Only Warden may use Focus Ward'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  PERFORM public.prune_expired_buffs(v_uid);

  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (v_uid, 'xp_focus_bonus', now() + interval '2 hours', '{"pct":25}'::jsonb)
  ON CONFLICT (user_id, buff_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + interval '30 minutes'), true)
  WHERE id = v_uid;

  RETURN json_build_object('ok', true, 'buff', 'xp_focus_bonus', 'expires_at', now() + interval '2 hours');
END;
$$;

-- Scholar: small party boss heal (flat), 45m cooldown
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
  v_heal INT := 18;
  v_new_hp INT;
  v_max INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_party_member(p_party_id, v_uid) THEN RAISE EXCEPTION 'Not a party member'; END IF;

  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz
  INTO v_path, v_cd FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'scholar' THEN RAISE EXCEPTION 'Only Scholar may use Party Mend'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  SELECT boss_hp, boss_max_hp INTO v_new_hp, v_max FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;

  v_new_hp := LEAST(v_max, v_new_hp + v_heal);

  UPDATE public.parties SET boss_hp = v_new_hp WHERE id = p_party_id;

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + interval '45 minutes'), true)
  WHERE id = v_uid;

  RETURN json_build_object('ok', true, 'boss_hp', v_new_hp, 'heal', v_heal);
END;
$$;

-- Strider: next boss strike +35% damage, 20m buff, 40m cooldown
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz
  INTO v_path, v_cd FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'strider' THEN RAISE EXCEPTION 'Only Strider may use Shadow Strike'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  PERFORM public.prune_expired_buffs(v_uid);

  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (v_uid, 'boss_dmg_bonus', now() + interval '20 minutes', '{"pct":35}'::jsonb)
  ON CONFLICT (user_id, buff_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + interval '40 minutes'), true)
  WHERE id = v_uid;

  RETURN json_build_object('ok', true, 'buff', 'boss_dmg_bonus');
END;
$$;

-- Keeper: restore stamina, 60m cooldown
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
  v_gain INT := 22;
  v_sta INT;
  v_max INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz
  INTO v_path, v_cd FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'keeper' THEN RAISE EXCEPTION 'Only Keeper may use Second Wind'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  UPDATE public.profiles
  SET
    stamina = LEAST(max_stamina, stamina + v_gain),
    skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + interval '60 minutes'), true)
  WHERE id = v_uid
  RETURNING stamina, max_stamina INTO v_sta, v_max;

  RETURN json_build_object('ok', true, 'stamina', v_sta, 'gained', v_gain);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.use_skill_focus_ward() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.use_skill_party_mend(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.use_skill_shadow_strike() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.use_skill_second_wind() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.use_skill_focus_ward() TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_skill_party_mend(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_skill_shadow_strike() TO authenticated;
GRANT EXECUTE ON FUNCTION public.use_skill_second_wind() TO authenticated;
