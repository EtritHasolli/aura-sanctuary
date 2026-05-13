-- RPC so authenticated users can create custom challenge templates without
-- a direct INSERT policy on the table (which is admin-only).
CREATE OR REPLACE FUNCTION public.create_custom_challenge_template(
  p_name        TEXT,
  p_description TEXT,
  p_duration    INT,
  p_blueprint   JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id  UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF trim(p_name) = '' THEN RAISE EXCEPTION 'Name is required'; END IF;

  INSERT INTO public.challenge_templates (name, description, duration_days, task_blueprint)
  VALUES (trim(p_name), trim(COALESCE(p_description, '')), GREATEST(1, LEAST(90, p_duration)), p_blueprint)
  RETURNING id INTO v_id;

  RETURN json_build_object('template_id', v_id);
END;
$$;
