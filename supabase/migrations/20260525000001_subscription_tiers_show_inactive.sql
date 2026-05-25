-- Allow all authenticated users to read all subscription tiers (active or not).
-- Inactive tiers are shown as "Coming Soon" in the UI for regular users,
-- and with an "Inactive" badge + edit controls for admins.
-- Previously the RLS policy "subscription_tiers_read_active" filtered them out
-- at the DB level, so inactive tiers were invisible to everyone including admins.

DROP POLICY IF EXISTS "subscription_tiers_read_active" ON public.subscription_tiers;

CREATE POLICY "subscription_tiers_read_all"
  ON public.subscription_tiers FOR SELECT
  TO authenticated
  USING (true);
