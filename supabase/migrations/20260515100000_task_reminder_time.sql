-- Add reminder_time to tasks so each quest can have a daily reminder.
-- Stored as HH:MM in 24h format (e.g. '08:30'). NULL means no reminder.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder_time TEXT;

COMMENT ON COLUMN public.tasks.reminder_time IS
  'Optional daily reminder time in HH:MM 24h format. Null = no reminder.';
