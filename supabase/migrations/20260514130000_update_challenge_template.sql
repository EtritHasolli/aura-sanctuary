-- Allow the owner of a custom challenge template to update it.
-- Templates have no created_by column, so we allow any authenticated user
-- (matches the permissive insert policy via create_custom_challenge_template).
CREATE OR REPLACE FUNCTION public.update_custom_challenge_template(
  p_id          UUID,
  p_name        TEXT,
  p_description TEXT,
  p_duration    INT,
  p_blueprint   JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF trim(p_name) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  UPDATE public.challenge_templates
  SET
    name           = trim(p_name),
    description    = trim(COALESCE(p_description, '')),
    duration_days  = GREATEST(1, LEAST(90, p_duration)),
    task_blueprint = p_blueprint
  WHERE id = p_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found'; END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_custom_challenge_template(UUID, TEXT, TEXT, INT, JSONB) TO authenticated;
