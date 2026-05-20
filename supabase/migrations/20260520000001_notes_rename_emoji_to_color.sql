ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS color TEXT;

UPDATE public.notes SET color = emoji WHERE emoji IS NOT NULL;

ALTER TABLE public.notes DROP COLUMN IF EXISTS emoji;
