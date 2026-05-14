-- The path_reroll migration accidentally dropped the path_testing_override bypass
-- from guard_immutable_aura_path. Restore it alongside the reroll session flag.

CREATE OR REPLACE FUNCTION public.guard_immutable_aura_path()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow the reroll RPC to bypass via session flag
  IF current_setting('aura.allow_path_reroll', true) = 'true' THEN
    RETURN NEW;
  END IF;
  -- Allow admin/testing override stored on the profile row itself
  IF COALESCE(NEW.path_testing_override, false) THEN
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
