-- Add per-tier limits for archive notes and active tasks.
--
-- Free tier: 25 notes, 30 active tasks.
-- Paid tiers: NULL = unlimited.
--
-- Enforcement is via BEFORE INSERT triggers so the limit is respected
-- regardless of whether the insert comes from the client SDK or any
-- future RPC. The trigger raises an exception whose message the client
-- surfaces as a toast.

-- ============================================================================
-- 1. Add limit columns to subscription_tiers
-- ============================================================================

ALTER TABLE public.subscription_tiers
  ADD COLUMN IF NOT EXISTS max_notes   INTEGER DEFAULT NULL CHECK (max_notes   IS NULL OR max_notes   > 0),
  ADD COLUMN IF NOT EXISTS max_tasks   INTEGER DEFAULT NULL CHECK (max_tasks   IS NULL OR max_tasks   > 0);

-- Free tier gets the concrete caps; paid tiers stay NULL (unlimited).
UPDATE public.subscription_tiers
SET    max_notes = 25, max_tasks = 30
WHERE  slug = 'free';

-- ============================================================================
-- 2. check_note_limit — enforced on notes BEFORE INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_note_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier   public.subscription_tiers;
  v_count  INT;
BEGIN
  v_tier := public.effective_subscription_tier(NEW.user_id);

  IF v_tier.max_notes IS NULL THEN
    RETURN NEW;  -- unlimited
  END IF;

  SELECT COUNT(*)::INT
  INTO   v_count
  FROM   public.notes
  WHERE  user_id = NEW.user_id
    AND  is_folder = false;   -- folders don't count against the note limit

  IF v_count >= v_tier.max_notes THEN
    RAISE EXCEPTION 'Note limit reached (% / %). Upgrade your plan to add more notes.',
      v_count, v_tier.max_notes;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_note_limit() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_note_limit() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_check_note_limit ON public.notes;
CREATE TRIGGER trg_check_note_limit
  BEFORE INSERT ON public.notes
  FOR EACH ROW
  WHEN (NEW.is_folder = false OR NEW.is_folder IS NULL)
  EXECUTE FUNCTION public.check_note_limit();

-- ============================================================================
-- 3. check_task_limit — enforced on tasks BEFORE INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_task_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier   public.subscription_tiers;
  v_count  INT;
BEGIN
  v_tier := public.effective_subscription_tier(NEW.user_id);

  IF v_tier.max_tasks IS NULL THEN
    RETURN NEW;  -- unlimited
  END IF;

  -- Count only non-completed tasks (active tasks).
  SELECT COUNT(*)::INT
  INTO   v_count
  FROM   public.tasks
  WHERE  user_id = NEW.user_id
    AND  (completed IS NULL OR completed = false);

  IF v_count >= v_tier.max_tasks THEN
    RAISE EXCEPTION 'Active task limit reached (% / %). Upgrade your plan to add more tasks.',
      v_count, v_tier.max_tasks;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_task_limit() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_task_limit() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_check_task_limit ON public.tasks;
CREATE TRIGGER trg_check_task_limit
  BEFORE INSERT ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_task_limit();

-- ============================================================================
-- 4. Update admin_upsert_subscription_tier to handle max_notes / max_tasks
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_subscription_tier(
  p_slug TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT '',
  p_sort_order INT DEFAULT 0,
  p_price_usd NUMERIC DEFAULT 0,
  p_max_parties_owned INT DEFAULT 3,
  p_max_parties_joined INT DEFAULT 5,
  p_monthly_moonshards INT DEFAULT 0,
  p_signup_bonus_moonshards INT DEFAULT 0,
  p_perks JSONB DEFAULT '{}'::jsonb,
  p_is_active BOOLEAN DEFAULT true,
  p_max_notes INT DEFAULT NULL,
  p_max_tasks INT DEFAULT NULL
)
RETURNS public.subscription_tiers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_active_count INT;
  v_existing public.subscription_tiers%ROWTYPE;
  v_row public.subscription_tiers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'Slug is required';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  SELECT * INTO v_existing FROM public.subscription_tiers WHERE slug = p_slug;

  IF NOT FOUND AND p_is_active THEN
    SELECT COUNT(*)::INT INTO v_active_count FROM public.subscription_tiers WHERE is_active = true;
    IF v_active_count >= 3 THEN
      RAISE EXCEPTION 'Only 3 active tiers are allowed. Deactivate one before adding another.';
    END IF;
  END IF;

  INSERT INTO public.subscription_tiers (
    slug, name, description, sort_order, price_usd,
    is_free, is_active,
    max_parties_owned, max_parties_joined,
    monthly_moonshards, signup_bonus_moonshards, perks,
    max_notes, max_tasks,
    updated_at
  )
  VALUES (
    trim(p_slug),
    trim(p_name),
    COALESCE(p_description, ''),
    COALESCE(p_sort_order, 0),
    GREATEST(0, COALESCE(p_price_usd, 0)),
    COALESCE(v_existing.is_free, false),
    COALESCE(p_is_active, true),
    GREATEST(0, COALESCE(p_max_parties_owned, 0)),
    GREATEST(0, COALESCE(p_max_parties_joined, 0)),
    GREATEST(0, COALESCE(p_monthly_moonshards, 0)),
    GREATEST(0, COALESCE(p_signup_bonus_moonshards, 0)),
    COALESCE(p_perks, '{}'::jsonb),
    p_max_notes,
    p_max_tasks,
    now()
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    price_usd = EXCLUDED.price_usd,
    is_active = EXCLUDED.is_active,
    max_parties_owned = EXCLUDED.max_parties_owned,
    max_parties_joined = EXCLUDED.max_parties_joined,
    monthly_moonshards = EXCLUDED.monthly_moonshards,
    signup_bonus_moonshards = EXCLUDED.signup_bonus_moonshards,
    perks = EXCLUDED.perks,
    max_notes = EXCLUDED.max_notes,
    max_tasks = EXCLUDED.max_tasks,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_subscription_tier
  (TEXT, TEXT, TEXT, INT, NUMERIC, INT, INT, INT, INT, JSONB, BOOLEAN, INT, INT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_subscription_tier
  (TEXT, TEXT, TEXT, INT, NUMERIC, INT, INT, INT, INT, JSONB, BOOLEAN, INT, INT)
  TO authenticated, service_role;
