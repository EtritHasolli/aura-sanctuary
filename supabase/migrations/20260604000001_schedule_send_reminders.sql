-- Schedule the send-reminders edge function to run every minute via pg_cron.
-- This fires server-side push notifications for task reminders so they work
-- even when the user's device has the app fully closed.
--
-- Requires the pg_cron extension (enabled by default on Supabase Pro).
-- On free tier, schedule manually: Dashboard → Edge Functions → send-reminders → Schedule → "* * * * *"

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('send-reminders');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
DECLARE
  v_url  text;
  v_key  text;
  v_sql  text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  BEGIN
    v_url := current_setting('app.supabase_url');
    v_key := current_setting('app.supabase_anon_key');
  EXCEPTION WHEN OTHERS THEN
    -- Settings not configured — skip scheduling but don't fail the migration.
    RETURN;
  END;

  v_sql := 'SELECT net.http_post('
    || 'url := ' || quote_literal(v_url || '/functions/v1/send-reminders') || ','
    || 'headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer ' || v_key || '''),'
    || 'body := ''{}''::jsonb'
    || ');';

  PERFORM cron.schedule('send-reminders', '* * * * *', v_sql);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;
