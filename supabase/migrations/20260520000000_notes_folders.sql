ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.notes(id) ON DELETE SET NULL,
  -- stores a highlight color hex string (e.g. "#d99630") reused for the color picker
  ADD COLUMN IF NOT EXISTS emoji TEXT;

CREATE INDEX IF NOT EXISTS notes_parent_id_idx ON public.notes(parent_id);
