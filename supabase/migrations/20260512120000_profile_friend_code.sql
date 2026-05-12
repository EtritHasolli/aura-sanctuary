-- Unique 8-digit friend codes for adding friends without shareable web URLs (installed apps).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS friend_code TEXT;

DO $$
DECLARE
  r RECORD;
  v_code TEXT;
  v_tries INT;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE friend_code IS NULL LOOP
    v_tries := 0;
    LOOP
      v_code := lpad((floor(random() * 100000000))::bigint::text, 8, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE friend_code = v_code);
      v_tries := v_tries + 1;
      IF v_tries > 500 THEN
        RAISE EXCEPTION 'Could not allocate friend_code for profile %', r.id;
      END IF;
    END LOOP;
    UPDATE public.profiles SET friend_code = v_code WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.profiles ALTER COLUMN friend_code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_friend_code_key'
  ) THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_friend_code_key UNIQUE (friend_code);
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.friend_code IS 'Unique 8-digit code (leading zeros) for friend requests; not user-editable.';

-- Block client updates to friend_code (SECURITY DEFINER RPCs could bypass with careful design; normal updates cannot change it).
CREATE OR REPLACE FUNCTION public.protect_profile_friend_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.friend_code IS NOT NULL AND NEW.friend_code IS DISTINCT FROM OLD.friend_code THEN
    NEW.friend_code := OLD.friend_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_friend_code ON public.profiles;
CREATE TRIGGER trg_protect_profile_friend_code
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_friend_code();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_path_text TEXT;
  v_path public.aura_path;
  v_code TEXT;
  v_tries INT := 0;
BEGIN
  v_path_text := lower(COALESCE(NEW.raw_user_meta_data->>'aura_path', ''));
  v_path := CASE
    WHEN v_path_text IN ('swordsman', 'mage', 'tank', 'rogue') THEN v_path_text::public.aura_path
    ELSE NULL
  END;

  LOOP
    v_code := lpad((floor(random() * 100000000))::bigint::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE friend_code = v_code);
    v_tries := v_tries + 1;
    IF v_tries > 500 THEN
      RAISE EXCEPTION 'Could not allocate friend code for new user';
    END IF;
  END LOOP;

  INSERT INTO public.profiles (id, display_name, aura_path, friend_code)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1), 'Adventurer'),
    v_path,
    v_code
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.send_friend_request_by_friend_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_norm TEXT;
  v_target UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_norm := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  IF length(v_norm) <> 8 OR v_norm !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'Enter an 8-digit friend code';
  END IF;

  SELECT id INTO v_target FROM public.profiles WHERE friend_code = v_norm LIMIT 1;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'No user found with that friend code';
  END IF;
  IF v_target = v_uid THEN
    RAISE EXCEPTION 'Cannot add yourself';
  END IF;

  RETURN public.send_friend_request(v_target);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_friend_request_by_friend_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request_by_friend_code(TEXT) TO authenticated;
