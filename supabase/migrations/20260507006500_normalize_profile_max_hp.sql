-- Align existing profiles with canonical max HP: 50 + (level - 1) * 10 (level >= 1).
-- Clamps current HP so it never exceeds new max_hp.

UPDATE public.profiles p
SET
  max_hp = 50 + GREATEST(0, p.level - 1) * 10,
  hp = LEAST(p.hp, 50 + GREATEST(0, p.level - 1) * 10);
