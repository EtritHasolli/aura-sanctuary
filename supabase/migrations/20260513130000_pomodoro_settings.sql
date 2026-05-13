-- Add pomodoro_settings column to profiles to persist timer config per user
alter table profiles
  add column if not exists pomodoro_settings jsonb default null;
