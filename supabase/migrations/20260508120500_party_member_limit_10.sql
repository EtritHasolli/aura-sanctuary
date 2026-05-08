-- Enforce a hard party size cap of 10 members.

CREATE OR REPLACE FUNCTION public.join_party_by_id(p_party_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party public.parties%ROWTYPE;
  v_member_count INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_party_id IS NULL THEN RAISE EXCEPTION 'Party id is required'; END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.party_members pm
    WHERE pm.party_id = p_party_id AND pm.user_id = v_uid
  ) THEN
    RETURN json_build_object('party_id', p_party_id, 'name', v_party.name);
  END IF;

  SELECT COUNT(*)::INT INTO v_member_count
  FROM public.party_members pm
  WHERE pm.party_id = p_party_id;

  IF v_member_count >= 10 THEN
    RAISE EXCEPTION 'Party is full (max 10 members)';
  END IF;

  INSERT INTO public.party_members (party_id, user_id)
  VALUES (p_party_id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', p_party_id, 'name', v_party.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.join_party_by_invite_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party public.parties%ROWTYPE;
  v_member_count INT := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_party
  FROM public.parties
  WHERE invite_code = upper(trim(p_code))
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No party for that code'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.party_members pm
    WHERE pm.party_id = v_party.id AND pm.user_id = v_uid
  ) THEN
    RETURN json_build_object('party_id', v_party.id, 'name', v_party.name);
  END IF;

  SELECT COUNT(*)::INT INTO v_member_count
  FROM public.party_members pm
  WHERE pm.party_id = v_party.id;

  IF v_member_count >= 10 THEN
    RAISE EXCEPTION 'Party is full (max 10 members)';
  END IF;

  INSERT INTO public.party_members (party_id, user_id)
  VALUES (v_party.id, v_uid)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('party_id', v_party.id, 'name', v_party.name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_party_by_id(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_party_by_id(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.join_party_by_invite_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_party_by_invite_code(TEXT) TO authenticated;
