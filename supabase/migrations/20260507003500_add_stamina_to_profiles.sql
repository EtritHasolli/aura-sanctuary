-- Add stamina resource for tavern boss attacks.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stamina INT NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_stamina INT NOT NULL DEFAULT 100;
