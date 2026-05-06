-- Allow party members to update their party (boss HP/state changes).
-- Needed for Tavern boss attacks from clients.

DROP POLICY IF EXISTS "Parties updatable by members" ON public.parties;

CREATE POLICY "Parties updatable by members"
  ON public.parties
  FOR UPDATE
  USING (public.is_party_member(id, auth.uid()))
  WITH CHECK (public.is_party_member(id, auth.uid()));
