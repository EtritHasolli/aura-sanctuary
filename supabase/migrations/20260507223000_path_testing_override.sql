-- Testing-only path respec override.
-- Keeps immutable path as default behavior, but allows respec when
-- profiles.path_testing_override = true.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS path_testing_override BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.guard_immutable_aura_path()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
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
