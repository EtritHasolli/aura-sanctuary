CREATE OR REPLACE FUNCTION public.rename_party(p_party_id UUID, p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_name TEXT := trim(COALESCE(p_name, ''));
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_party_id IS NULL THEN RAISE EXCEPTION 'Party id is required'; END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Party name cannot be empty'; END IF;
  IF char_length(v_name) > 48 THEN RAISE EXCEPTION 'Party name too long'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.parties
    WHERE id = p_party_id AND leader_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Only the party owner can rename this tavern';
  END IF;

  UPDATE public.parties
  SET name = v_name
  WHERE id = p_party_id;

  RETURN json_build_object('ok', true, 'name', v_name);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rename_party(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_party(UUID, TEXT) TO authenticated;
