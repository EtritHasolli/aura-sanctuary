-- Extend get_my_challenge_runs to include score and starts_on for progress display.
CREATE OR REPLACE FUNCTION public.get_my_challenge_runs()
RETURNS TABLE (template_id UUID, run_id UUID, starts_on DATE, ends_on DATE, score INT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT cr.template_id, cr.id AS run_id, cr.starts_on, cr.ends_on, cp.score
  FROM public.challenge_runs cr
  JOIN public.challenge_participants cp ON cp.run_id = cr.id
  WHERE cp.user_id = auth.uid()
    AND cr.ends_on >= now()::date;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_challenge_runs() TO authenticated;
