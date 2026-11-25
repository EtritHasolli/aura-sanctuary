-- Key rotation: stop embedding an API key in SQL.
--
-- The push trigger used to carry the legacy service_role JWT inline (migration
-- 20260521000002), which leaked through the public repo. Server-to-server calls now use
-- the project's new secret API key (sb_secret_…), stored in Supabase Vault under the name
-- 'aura_secret_key' and read at call time. It is sent on the `apikey` header — the new keys
-- aren't JWTs, so `Authorization: Bearer` would be rejected.
--
-- Create the Vault entry once in the SQL editor (never in a migration):
--   select vault.create_secret('<sb_secret_… value>', 'aura_secret_key',
--                              'Secret API key for pg_net calls to Edge Functions');
-- Rotate later with vault.update_secret(<id>, '<new value>').

-- ============================================================================
-- 1. Web push on new notifications
-- ============================================================================
CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_sub    BOOLEAN;
  v_net_exists BOOLEAN;
  v_key        TEXT;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_net_exists;
  IF NOT v_net_exists THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id LIMIT 1
  ) INTO v_has_sub;
  IF NOT v_has_sub THEN RETURN NEW; END IF;

  -- A missing key must never block the notification insert itself.
  BEGIN
    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'aura_secret_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_key := NULL;
  END;
  IF v_key IS NULL OR v_key = '' THEN
    RAISE WARNING 'trigger_push_on_notification: Vault secret "aura_secret_key" not found; push skipped';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://wvuoisxjuzyaoapuofrk.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',       v_key
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id,
      'title',   'Aura',
      'message', regexp_replace(NEW.message, '\s*/\S+\?[^\s]*', '', 'g'),
      -- The notification id: unique per notification, and the same tag the app uses for
      -- its own OS notification, so the two collapse into one instead of showing twice.
      'tag',     NEW.id::text,
      'url',     COALESCE((regexp_match(NEW.message, '\s*(/\S+\?\S+)'))[1], '/')
    )
  );

  RETURN NEW;
END;
$$;

-- (Re)attach the trigger so this migration doesn't depend on 20260521000002 having run.
DROP TRIGGER IF EXISTS trg_push_on_notification ON public.notifications;
CREATE TRIGGER trg_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_on_notification();

-- ============================================================================
-- 2. Server-side task reminders, every minute via pg_cron
--    (replaces the 20260604000001 schedule, which needed app.* settings and the anon key).
--    The job reads the key from Vault on every run, so nothing secret is stored in cron.job.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron is not enabled; send-reminders was not scheduled';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('send-reminders');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- not scheduled yet
  END;

  PERFORM cron.schedule(
    'send-reminders',
    '* * * * *',
    $cron$
      select net.http_post(
        url     := 'https://wvuoisxjuzyaoapuofrk.supabase.co/functions/v1/send-reminders',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'aura_secret_key')
        ),
        body    := '{}'::jsonb
      )
      where exists (select 1 from vault.decrypted_secrets where name = 'aura_secret_key')
    $cron$
  );
END;
$$;
