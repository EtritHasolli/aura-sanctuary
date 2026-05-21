-- Trigger web push whenever a notification row is inserted for a user
-- who has at least one push subscription.
-- Uses pg_net (enabled by default on Supabase) to call the send-push edge function.

CREATE OR REPLACE FUNCTION public.trigger_push_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_sub BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.push_subscriptions WHERE user_id = NEW.user_id LIMIT 1
  ) INTO v_has_sub;

  IF NOT v_has_sub THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := 'https://wvuoisxjuzyaoapuofrk.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2dW9pc3hqdXp5YW9hcHVvZnJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODA5MDI0MywiZXhwIjoyMDkzNjY2MjQzfQ.w2Ol1AQeEswXUFRosCvCcvbLqtoFqizuCw9rekzTLLc'
    ),
    body    := jsonb_build_object(
      'user_id', NEW.user_id,
      'title',   'Aura',
      'message', NEW.message,
      'tag',     COALESCE(NEW.type, 'info'),
      'url',     '/'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_on_notification ON public.notifications;
CREATE TRIGGER trg_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_on_notification();
