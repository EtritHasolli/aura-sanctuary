-- Balance pass: stat utility parity, cooldown scaling, rage relief, and economy sinks

-- Gold sinks (consumables) to keep late-game economy useful
INSERT INTO public.shop_items (slug, name, description, category, rarity, price, currency_type, metadata)
SELECT
  'stamina-vigor-draught',
  'Vigor Draught',
  'Restores 30 stamina. A direct gold sink for extra boss attempts.',
  'consumable',
  'uncommon',
  45,
  'gold',
  '{"effect":{"stamina":30}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.shop_items WHERE slug = 'stamina-vigor-draught');

INSERT INTO public.shop_items (slug, name, description, category, rarity, price, currency_type, metadata)
SELECT
  'hp-phoenix-salt',
  'Phoenix Salt',
  'Restores 25 HP. Safety consumable for rough streaks.',
  'consumable',
  'rare',
  60,
  'gold',
  '{"effect":{"hp":25}}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.shop_items WHERE slug = 'hp-phoenix-salt');

-- Mercy redemption: set by death handler in client; redeemed by hard to-do completion
CREATE OR REPLACE FUNCTION public.redeem_ghost_mercy_if_eligible(
  p_task_type TEXT,
  p_task_difficulty TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_buff RECORD;
  v_gold_refund INT := 0;
  v_xp_refund INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_task_type <> 'todo' OR p_task_difficulty <> 'hard' THEN
    RETURN json_build_object('redeemed', false, 'reason', 'not_eligible_task');
  END IF;

  SELECT id, meta, expires_at
  INTO v_buff
  FROM public.profile_buffs
  WHERE user_id = v_uid
    AND buff_key = 'ghost_mercy'
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('redeemed', false, 'reason', 'no_active_mercy');
  END IF;

  v_gold_refund := GREATEST(0, FLOOR(COALESCE((v_buff.meta ->> 'lost_gold')::NUMERIC, 0) * 0.5)::INT);
  v_xp_refund := GREATEST(0, FLOOR(COALESCE((v_buff.meta ->> 'lost_xp')::NUMERIC, 0) * 0.5)::INT);

  UPDATE public.profiles
  SET
    gold = gold + v_gold_refund,
    xp = xp + v_xp_refund
  WHERE id = v_uid;

  DELETE FROM public.profile_buffs WHERE id = v_buff.id;

  RETURN json_build_object(
    'redeemed', true,
    'gold_refund', v_gold_refund,
    'xp_refund', v_xp_refund
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_ghost_mercy_if_eligible(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_ghost_mercy_if_eligible(TEXT, TEXT) TO authenticated;

-- To-do vent valve: completions can calm rage slightly
CREATE OR REPLACE FUNCTION public.maybe_relieve_party_rage_from_todo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'todo' AND NEW.completed = true AND COALESCE(OLD.completed, false) = false THEN
    -- 20% chance: reduce rage by 1 for each party user belongs to
    IF random() < 0.20 THEN
      UPDATE public.parties p
      SET boss_rage = GREATEST(0, COALESCE(p.boss_rage, 0) - 1)
      WHERE p.id IN (
        SELECT pm.party_id
        FROM public.party_members pm
        WHERE pm.user_id = NEW.user_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_todo_relieve_rage ON public.tasks;
CREATE TRIGGER trg_todo_relieve_rage
AFTER UPDATE OF completed ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.maybe_relieve_party_rage_from_todo();

-- INT utility + path synergy + effective max stamina cap for Keeper
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
  v_eff_int INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 30;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, intelligence + COALESCE(equip_int_bonus, 0)
  INTO v_path, v_cd, v_eff_int FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'warden' THEN RAISE EXCEPTION 'Only Warden may use Focus Ward'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_int / 2)));
  v_cd_minutes := GREATEST(10, FLOOR(30 * (100 - v_reduction_pct) / 100.0));

  PERFORM public.prune_expired_buffs(v_uid);

  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (v_uid, 'xp_focus_bonus', now() + interval '2 hours', '{"pct":25}'::jsonb)
  ON CONFLICT (user_id, buff_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'buff', 'xp_focus_bonus',
    'expires_at', now() + interval '2 hours',
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
  v_heal INT := 18;
  v_new_hp INT;
  v_max INT;
  v_eff_int INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 45;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_party_member(p_party_id, v_uid) THEN RAISE EXCEPTION 'Not a party member'; END IF;

  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, intelligence + COALESCE(equip_int_bonus, 0)
  INTO v_path, v_cd, v_eff_int FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'scholar' THEN RAISE EXCEPTION 'Only Scholar may use Party Mend'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  -- Path synergy: if any party member has active Focus Ward, mend gets +10%
  IF EXISTS (
    SELECT 1
    FROM public.party_members pm
    JOIN public.profile_buffs pb ON pb.user_id = pm.user_id
    WHERE pm.party_id = p_party_id
      AND pb.buff_key = 'xp_focus_bonus'
      AND pb.expires_at > now()
  ) THEN
    v_heal := GREATEST(1, FLOOR(v_heal * 1.10)::INT);
  END IF;

  SELECT boss_hp, boss_max_hp INTO v_new_hp, v_max FROM public.parties WHERE id = p_party_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;
  v_new_hp := LEAST(v_max, v_new_hp + v_heal);
  UPDATE public.parties SET boss_hp = v_new_hp WHERE id = p_party_id;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_int / 2)));
  v_cd_minutes := GREATEST(15, FLOOR(45 * (100 - v_reduction_pct) / 100.0));

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;

  RETURN json_build_object('ok', true, 'boss_hp', v_new_hp, 'heal', v_heal, 'cooldown_minutes', v_cd_minutes);
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
  v_eff_int INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 40;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, intelligence + COALESCE(equip_int_bonus, 0)
  INTO v_path, v_cd, v_eff_int FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'strider' THEN RAISE EXCEPTION 'Only Strider may use Shadow Strike'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  PERFORM public.prune_expired_buffs(v_uid);
  INSERT INTO public.profile_buffs (user_id, buff_key, expires_at, meta)
  VALUES (v_uid, 'boss_dmg_bonus', now() + interval '20 minutes', '{"pct":35}'::jsonb)
  ON CONFLICT (user_id, buff_key) DO UPDATE SET expires_at = EXCLUDED.expires_at, meta = EXCLUDED.meta;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_int / 2)));
  v_cd_minutes := GREATEST(15, FLOOR(40 * (100 - v_reduction_pct) / 100.0));

  UPDATE public.profiles
  SET skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid;

  RETURN json_build_object('ok', true, 'buff', 'boss_dmg_bonus', 'cooldown_minutes', v_cd_minutes);
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
  v_gain INT := 22;
  v_sta INT;
  v_max INT;
  v_eff_max INT;
  v_eff_int INT := 0;
  v_reduction_pct INT := 0;
  v_cd_minutes INT := 60;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT aura_path, (skill_cooldowns ->> v_sk)::timestamptz, max_stamina, max_stamina + COALESCE(equip_max_stamina_bonus, 0), intelligence + COALESCE(equip_int_bonus, 0)
  INTO v_path, v_cd, v_max, v_eff_max, v_eff_int FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF v_path IS NULL THEN RAISE EXCEPTION 'Choose an Aura path in Settings first'; END IF;
  IF v_path <> 'keeper' THEN RAISE EXCEPTION 'Only Keeper may use Second Wind'; END IF;
  IF v_cd IS NOT NULL AND v_cd > now() THEN RAISE EXCEPTION 'Skill on cooldown until %', v_cd; END IF;

  v_reduction_pct := LEAST(40, GREATEST(0, FLOOR(v_eff_int / 2)));
  v_cd_minutes := GREATEST(20, FLOOR(60 * (100 - v_reduction_pct) / 100.0));

  UPDATE public.profiles
  SET
    stamina = LEAST(v_eff_max, stamina + v_gain),
    skill_cooldowns = jsonb_set(skill_cooldowns, ARRAY[v_sk], to_jsonb(now() + make_interval(mins => v_cd_minutes)), true)
  WHERE id = v_uid
  RETURNING stamina, v_eff_max INTO v_sta, v_max;

  RETURN json_build_object('ok', true, 'stamina', v_sta, 'gained', v_gain, 'max_stamina', v_max, 'cooldown_minutes', v_cd_minutes);
END;
$$;
