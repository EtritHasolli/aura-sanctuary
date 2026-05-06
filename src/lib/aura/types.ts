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
  gold: number;
  strength: number;
  intelligence: number;
  constitution: number;
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

export function xpForLevel(level: number) { return 50 + (level - 1) * 25; }
