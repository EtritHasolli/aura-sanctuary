import { getWordBank } from "./wordBank";

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local calendar day key `YYYY-MM-DD` (user's timezone). */
export function getLocalDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Seed for the daily word-search grid (same for all players on a calendar day). */
export function getDailyWordSearchSeedForDayKey(dayKey: string): number {
  return hashDayKey(dayKey) ^ 0x13579bdf;
}

/** FNV-1a style seed for deterministic daily content from `YYYY-MM-DD`. */
export function hashDayKey(dayKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dayKey.length; i++) {
    h ^= dayKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic solution for the given calendar day. */
export function getDailySolutionWord(dayKey: string): string {
  const bank = getWordBank();
  if (bank.length === 0) return "error";
  const rand = mulberry32(hashDayKey(dayKey));
  const idx = Math.floor(rand() * bank.length);
  return bank[idx]!;
}

export function isValidGuess(word: string, bank: string[]): boolean {
  const w = word.toLowerCase();
  if (w.length !== 5) return false;
  let lo = 0;
  let hi = bank.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const c = bank[mid]!;
    if (c === w) return true;
    if (c < w) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

export type LetterScore = "correct" | "present" | "absent";

/** Wordle-style feedback for one guess against the solution. */
/**
 * Higher is better: fewer guesses wins; ties broken by faster time (lower seconds).
 */
export function dailyWordleLeaderboardScore(guesses: number, elapsedSeconds: number): number {
  const g = Math.max(1, Math.min(6, guesses));
  const bonus = Math.max(0, 100_000 - Math.min(99_999, Math.floor(elapsedSeconds)));
  return (7 - g) * 100_000 + bonus;
}

export function scoreGuess(guess: string, solution: string): LetterScore[] {
  const g = guess.toLowerCase().split("");
  const s = solution.toLowerCase().split("");
  const result: LetterScore[] = Array(5).fill("absent");
  const avail = new Map<string, number>();
  for (const ch of s) {
    avail.set(ch, (avail.get(ch) ?? 0) + 1);
  }
  for (let i = 0; i < 5; i++) {
    if (g[i] === s[i]) {
      result[i] = "correct";
      const ch = g[i]!;
      avail.set(ch, (avail.get(ch) ?? 0) - 1);
    }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === "correct") continue;
    const ch = g[i]!;
    const n = avail.get(ch) ?? 0;
    if (n > 0) {
      result[i] = "present";
      avail.set(ch, n - 1);
    }
  }
  return result;
}
