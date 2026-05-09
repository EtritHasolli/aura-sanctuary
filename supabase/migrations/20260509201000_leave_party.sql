-- Allow members to leave a party; promote another member if the leader leaves; drop empty parties.

CREATE OR REPLACE FUNCTION public.leave_party(p_party_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_party public.parties%ROWTYPE;
  v_new_leader UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_party_id IS NULL THEN RAISE EXCEPTION 'Party id is required'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.party_members pm
    WHERE pm.party_id = p_party_id AND pm.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'You are not in this party';
  END IF;

  SELECT * INTO v_party FROM public.parties WHERE id = p_party_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;

  IF v_party.leader_id = v_uid THEN
    SELECT pm.user_id INTO v_new_leader
    FROM public.party_members pm
    WHERE pm.party_id = p_party_id AND pm.user_id <> v_uid
    ORDER BY pm.joined_at ASC
    LIMIT 1;

    UPDATE public.parties
    SET leader_id = v_new_leader
    WHERE id = p_party_id;
  END IF;

  DELETE FROM public.party_members
  WHERE party_id = p_party_id AND user_id = v_uid;

  IF NOT EXISTS (SELECT 1 FROM public.party_members WHERE party_id = p_party_id) THEN
    DELETE FROM public.parties WHERE id = p_party_id;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.leave_party(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_party(UUID) TO authenticated;
