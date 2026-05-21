CREATE OR REPLACE FUNCTION public.notify_friend_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_name TEXT;
  v_preview TEXT;
BEGIN
  SELECT COALESCE(NULLIF(display_name, ''), 'A friend')
  INTO v_sender_name
  FROM public.profiles
  WHERE id = NEW.sender_id;

  v_preview := left(regexp_replace(NEW.content, '\s+', ' ', 'g'), 180);

  INSERT INTO public.notifications (user_id, message, type)
  VALUES (
    NEW.recipient_id,
    format(
      '%s: %s /friends?friend=%s&message=%s',
      COALESCE(v_sender_name, 'A friend'),
      v_preview,
      NEW.sender_id,
      NEW.id
    ),
    'info'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_party_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_party_name TEXT;
  v_preview TEXT;
BEGIN
  SELECT COALESCE(NULLIF(name, ''), 'Party')
  INTO v_party_name
  FROM public.parties
  WHERE id = NEW.party_id;

  v_preview := left(regexp_replace(NEW.content, '\s+', ' ', 'g'), 180);

  INSERT INTO public.notifications (user_id, message, type)
  SELECT
    pm.user_id,
    format(
      'New tavern message in %s from %s: %s /tavern?party=%s&message=%s',
      COALESCE(v_party_name, 'Party'),
      COALESCE(NULLIF(NEW.display_name, ''), 'Someone'),
      v_preview,
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
