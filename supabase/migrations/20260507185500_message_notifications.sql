CREATE OR REPLACE FUNCTION public.notify_friend_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
BEGIN
  SELECT COALESCE(NULLIF(display_name, ''), 'A friend')
  INTO v_sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, message, type)
  VALUES (
    NEW.recipient_id,
    format(
      'New message from %s: %s /friends?friend=%s&message=%s',
      COALESCE(v_sender_name, 'A friend'),
      NEW.content,
      NEW.sender_id,
      NEW.id
    ),
    'info'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_friend_message ON public.friend_messages;
CREATE TRIGGER trg_notify_friend_message
AFTER INSERT ON public.friend_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_friend_message();

CREATE OR REPLACE FUNCTION public.notify_party_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party_name TEXT;
BEGIN
  SELECT COALESCE(NULLIF(name, ''), 'Party')
  INTO v_party_name
  FROM public.parties
  WHERE id = NEW.party_id;

  INSERT INTO public.notifications (user_id, message, type)
  SELECT
    pm.user_id,
    format(
      'New tavern message in %s from %s: %s /tavern?party=%s&message=%s',
      COALESCE(v_party_name, 'Party'),
      COALESCE(NULLIF(NEW.display_name, ''), 'Someone'),
      NEW.content,
      NEW.party_id,
      NEW.id
    ),
    'info'
  FROM public.party_members pm
  WHERE pm.party_id = NEW.party_id
    AND pm.user_id <> NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_party_chat_message ON public.chat_messages;
CREATE TRIGGER trg_notify_party_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_party_chat_message();
