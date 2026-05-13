-- Cross-device Habitica integration.
--
-- The credentials table is intentionally NOT exposed to PostgREST: RLS is
-- enabled but no policies are granted to `authenticated`, so the Habitica
-- API token can only be touched by the `habitica` Edge Function via the
-- service-role key. This keeps the token off the client entirely.

CREATE TABLE IF NOT EXISTS public.user_integrations (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  provider TEXT NOT NULL,
  external_user_id TEXT NOT NULL,
  api_token TEXT NOT NULL,
  display_name TEXT,
  username TEXT,
  remote_level INT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- Lock out the anon/authenticated roles entirely. The Edge Function uses the
-- service role which bypasses RLS, so it remains the only path to this table.
REVOKE ALL ON public.user_integrations FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.touch_user_integrations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_integrations_updated_at ON public.user_integrations;
CREATE TRIGGER trg_user_integrations_updated_at
BEFORE UPDATE ON public.user_integrations
FOR EACH ROW
EXECUTE FUNCTION public.touch_user_integrations_updated_at();

-- Track which Habitica task each Aura task corresponds to.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS habitica_task_id TEXT;

CREATE INDEX IF NOT EXISTS tasks_user_habitica_task_id_idx
  ON public.tasks (user_id, habitica_task_id);
