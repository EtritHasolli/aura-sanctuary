-- One-time path reroll for non-admin users.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS path_reroll_used boolean NOT NULL DEFAULT false;

-- Update the immutable guard to allow the reroll function via a session flag.
CREATE OR REPLACE FUNCTION public.guard_immutable_aura_path()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow the reroll function to bypass this guard
  IF current_setting('aura.allow_path_reroll', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF OLD.aura_path IS NOT NULL AND NEW.aura_path IS DISTINCT FROM OLD.aura_path THEN
    RAISE EXCEPTION 'Aura path is locked after first selection';
  END IF;
  IF OLD.aura_path IS NOT NULL AND NEW.aura_path IS NULL THEN
    RAISE EXCEPTION 'Aura path cannot be cleared once selected';
  END IF;
  RETURN NEW;
END;
$$;

-- Bypasses the immutable guard for exactly one use per user.
CREATE OR REPLACE FUNCTION public.use_path_reroll(p_new_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_used boolean;
  v_current_path text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT path_reroll_used, aura_path::text
  INTO v_used, v_current_path
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  IF v_used THEN RAISE EXCEPTION 'Path reroll already used'; END IF;
  IF v_current_path IS NULL THEN RAISE EXCEPTION 'No path set yet — choose a path first'; END IF;

  IF p_new_path NOT IN (
    'swordsman','mage','tank','rogue',
    'evilswordsman','evilmage','evilpaladin','evilrogue'
  ) THEN
    RAISE EXCEPTION 'Invalid path: %', p_new_path;
  END IF;

  -- Set session flag to allow the guard to pass, then update, then clear
  PERFORM set_config('aura.allow_path_reroll', 'true', true);

  UPDATE public.profiles
  SET aura_path = p_new_path::public.aura_path,
      path_reroll_used = true,
      path_testing_override = false
  WHERE id = v_uid;

  PERFORM set_config('aura.allow_path_reroll', 'false', true);
END;
$$;

REVOKE ALL ON FUNCTION public.use_path_reroll(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.use_path_reroll(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.use_path_reroll(text) TO authenticated;
