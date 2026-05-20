import type { Database } from "@/integrations/supabase/types";

export type TaskType = "habit" | "daily" | "todo";
export type Difficulty = "trivial" | "easy" | "medium" | "hard";
export type RepeatUnit = "day" | "week" | "month" | "year";
export type CharacterState = "idle" | "working" | "sleeping";
export type AuraPath =
  | "swordsman"
  | "mage"
  | "tank"
  | "rogue"
  | "evilswordsman"
  | "evilmage"
  | "evilpaladin"
  | "evilrogue";

export const AURA_PATHS: Array<{
  id: AuraPath;
  label: string;
  fantasy: string;
  skill: string;
  growth: string;
  alignment: "good" | "evil";
}> = [
  {
    id: "swordsman",
    label: "Swordsman",
    fantasy: "Frontline duelist who sharpens body and will.",
    skill: "Battle Focus",
    growth: "Per level: STR +2, CON +1",
    alignment: "good",
  },
  {
    id: "mage",
    label: "Mage",
    fantasy: "Arcane tactician weaving precision and intellect.",
    skill: "Arcane Mend",
    growth: "Per level: INT +2, DEX +1",
    alignment: "good",
  },
  {
    id: "tank",
    label: "Paladin",
    fantasy: "Holy bulwark guardian shielding the party from chaos.",
    skill: "Iron Guard",
    growth: "Per level: CON +2, STR +1",
    alignment: "good",
  },
  {
    id: "rogue",
    label: "Rogue",
    fantasy: "Shadow skirmisher striking where foes are weakest.",
    skill: "Shadow Strike",
    growth: "Per level: DEX +2, INT +1",
    alignment: "good",
  },
  {
    id: "evilswordsman",
    label: "Chaos Knight",
    fantasy: "Brutal conqueror who turns pain into dark momentum.",
    skill: "Death Swing",
    growth: "Per level: STR +2, CON +1",
    alignment: "evil",
  },
  {
    id: "evilmage",
    label: "Warlock",
    fantasy: "Corrupt scholar bending the void to their dark whims.",
    skill: "Void Blast",
    growth: "Per level: INT +2, DEX +1",
    alignment: "evil",
  },
  {
    id: "evilpaladin",
    label: "Death Knight",
    fantasy: "Fallen guardian who enforces a cold, iron will.",
    skill: "Soul Reap",
    growth: "Per level: CON +2, STR +1",
    alignment: "evil",
  },
  {
    id: "evilrogue",
    label: "Assassin",
    fantasy: "Whisper in the dark, striking from the heart of malice.",
    skill: "Venom Strike",
    growth: "Per level: DEX +2, INT +1",
    alignment: "evil",
  },
];

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
  moonshards?: number;
  strength: number;
  intelligence: number;
  constitution: number;
  dexterity: number;
  /** IANA timezone for dailies / streaks. */
  timezone?: string;
  aura_path?: AuraPath | null;
  path_testing_override?: boolean;
  path_reroll_used?: boolean;
  skill_cooldowns?: Record<string, string>;
  /** Cached sum from equipped gear (server-maintained). */
  equip_str_bonus?: number;
  equip_int_bonus?: number;
  equip_con_bonus?: number;
  equip_dex_bonus?: number;
  equip_max_stamina_bonus?: number;
  equip_xp_bonus_pct?: number;
  equip_gold_bonus_pct?: number;
  avatar_url?: string | null;
  /** Display label for the player's character (stored as `pet_name` in DB). */
  character_name: string;
  /** Pomodoro-driven pose for friend cards / profile (stored as `pet_state` in DB). */
  character_state: CharacterState;
  /** Unique 8-digit code (may include leading zeros) for friend requests. Server-assigned, not editable. */
  friend_code?: string;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface TaskChecklistItem {
  id: string;
  task_id: string;
  title: string;
  done: boolean;
  position: number;
  created_at: string;
}

export interface HabiticaTaskMeta {
  type: "habit" | "daily" | "todo" | "reward" | null;
  /** Hidden "value" / color driver (-50..+50 ish). */
  value: number | null;
  streak: number | null;
  counterUp: number | null;
  counterDown: number | null;
  completed: boolean | null;
  /** ISO datetime for todo deadlines on Habitica. */
  date: string | null;
  startDate: string | null;
  frequency: string | null;
  everyX: number | null;
  daysOfMonth: number[];
  weeksOfMonth: number[];
  repeat: Record<string, boolean>;
  checklist: { id: string; text: string; completed: boolean }[];
  tags: string[];
  history: {
    date: number;
    value: number | null;
    scoredUp: number | null;
    scoredDown: number | null;
  }[];
  refreshedAt: string | null;
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
  last_completed_at?: string | null;
  /** Bitmask Sun=1<<0 .. Sat=1<<6; 127 = every day. */
  sacred_days?: number;
  repeat_every?: number;
  repeat_unit?: RepeatUnit;
  repeat_anchor_date?: string | null;
  streak_current?: number;
  streak_best?: number;
  last_completed_local_date?: string | null;
  challenge_run_id?: string | null;
  /** Optional daily reminder time in HH:MM 24h format. Null = no reminder. */
  reminder_time?: string | null;
  /** Set when this task mirrors a Habitica habit/daily. */
  habitica_task_id?: string | null;
  /** Cached Habitica-side metadata (streak, counter, value, checklist, etc.). */
  habitica_meta?: HabiticaTaskMeta | null;
  /** Joined client-side (see `useTasks`). */
  checklist?: TaskChecklistItem[];
  tags?: Pick<Tag, "id" | "name">[];
}

export interface Note {
  id: string;
  user_id: string;
  title: string;
  content: string;
  source_task_id: string | null;
  parent_id: string | null;
  color: string | null;
  is_folder: boolean;
  created_at: string;
  updated_at: string;
}

export const DIFFICULTY_XP: Record<Difficulty, number> = {
  trivial: 2,
  easy: 5,
  medium: 10,
  hard: 20,
};
export const DIFFICULTY_GOLD: Record<Difficulty, number> = {
  trivial: 1,
  easy: 3,
  medium: 7,
  hard: 15,
};
export const DIFFICULTY_HP_LOSS: Record<Difficulty, number> = {
  trivial: 2,
  easy: 5,
  medium: 10,
  hard: 18,
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

/** Maps a Supabase `profiles` row to app `Profile` (DB still uses `pet_name` / `pet_state`). */
export function profileFromDbRow(row: Database["public"]["Tables"]["profiles"]["Row"]): Profile {
  const { pet_name, pet_state, aura_path, ...rest } = row;
  return {
    ...rest,
    aura_path: aura_path as AuraPath | null,
    character_name: pet_name,
    character_state: pet_state as CharacterState,
  };
}

export function profilePatchToDb(
  patch: Partial<Profile>,
): Partial<Database["public"]["Tables"]["profiles"]["Update"]> {
  const { character_name, character_state, friend_code: _fc, ...rest } = patch;
  const out: Partial<Database["public"]["Tables"]["profiles"]["Update"]> = { ...rest };
  if (character_name !== undefined) out.pet_name = character_name;
  if (character_state !== undefined) out.pet_state = character_state;
  return out;
}
