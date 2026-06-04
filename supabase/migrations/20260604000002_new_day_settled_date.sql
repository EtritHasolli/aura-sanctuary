ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS new_day_settled_date date;
