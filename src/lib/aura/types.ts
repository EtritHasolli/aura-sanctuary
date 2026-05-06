export type TaskType = "habit" | "daily" | "todo";
export type Difficulty = "trivial" | "easy" | "medium" | "hard";
export type PetState = "idle" | "working" | "sleeping";

export interface Profile {
  id: string;
  display_name: string;
  level: number;
  xp: number;
  hp: number;
  max_hp: number;
  stamina: number;
  max_stamina: number;
  gold: number;
  strength: number;
  intelligence: number;
  constitution: number;
  /** Cached sum from equipped gear (server-maintained). */
  equip_str_bonus?: number;
  equip_int_bonus?: number;
  equip_con_bonus?: number;
  equip_max_stamina_bonus?: number;
  equip_xp_bonus_pct?: number;
  equip_gold_bonus_pct?: number;
  pet_name: string;
  pet_state: PetState;
}

export interface Task {
  id: string;
  user_id: string;
  type: TaskType;
  title: string;
  notes: string | null;
  completed: boolean;
  difficulty: Difficulty;
  positive_count: number;
  negative_count: number;
  source_note_id: string | null;
  created_at: string;
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  source_task_id: string | null;
  created_at: string;
  updated_at: string;
}

export const DIFFICULTY_XP: Record<Difficulty, number> = {
  trivial: 2, easy: 5, medium: 10, hard: 20,
};
export const DIFFICULTY_GOLD: Record<Difficulty, number> = {
  trivial: 1, easy: 3, medium: 7, hard: 15,
};
export const DIFFICULTY_HP_LOSS: Record<Difficulty, number> = {
  trivial: 2, easy: 5, medium: 10, hard: 18,
};

/**
 * XP required to advance FROM `level` TO `level + 1`
 * (`useApplyReward` subtracts this while `xp >= xpForLevel(level)`).
 *
 * Gentle early game; curves upward so high levels grind more than linear.
 */
export function xpForLevel(level: number) {
  const n = Math.max(0, level - 1);
  const base = 45;
  const linear = n * 24;
  const quad = Math.floor(n * n * 3.5);
  return Math.max(25, base + linear + quad);
}
