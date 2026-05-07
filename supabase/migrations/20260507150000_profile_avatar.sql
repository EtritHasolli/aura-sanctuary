-- Profile avatar (data URL) for HUD picture
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
