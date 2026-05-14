-- handle_new_user was overwritten in 20260514100000_evil_paths_and_shared_gear
-- without the friend_code generation added in 20260512120000_profile_friend_code.
-- This restores both: evil path support AND friend_code allocation.

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
    WHEN v_path_text IN ('swordsman', 'mage', 'tank', 'rogue',
                         'evilswordsman', 'evilmage', 'evilpaladin', 'evilrogue')
    THEN v_path_text::public.aura_path
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
