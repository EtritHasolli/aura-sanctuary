import { getWordSearchBank } from "./wordBank";

export type WordPlacement = {
  word: string;
  r0: number;
  c0: number;
  dr: number;
  dc: number;
};

export type WordSearchPuzzle = {
  size: number;
  grid: string[][];
  words: string[];
  placements: WordPlacement[];
};

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

function tryGenerate(
  size: number,
  words: string[],
  rand: () => number,
): WordSearchPuzzle | null {
  const grid: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ""),
  );
  const placements: WordPlacement[] = [];
  const r = rand;

  for (const word of words) {
    const L = word.length;
    const dirs = [...DIRS];
    shuffleInPlace(dirs, r);
    let placed = false;
    for (let attempt = 0; attempt < 400 && !placed; attempt++) {
      const dr = dirs[attempt % dirs.length]![0];
      const dc = dirs[attempt % dirs.length]![1];
      const r0 = Math.floor(r() * size);
      const c0 = Math.floor(r() * size);
      const r1 = r0 + dr * (L - 1);
      const c1 = c0 + dc * (L - 1);
      if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;

      let ok = true;
      for (let k = 0; k < L; k++) {
        const rr = r0 + dr * k;
        const cc = c0 + dc * k;
        const ch = word[k]!.toUpperCase();
        const cell = grid[rr]![cc]!;
        if (cell !== "" && cell !== ch) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      for (let k = 0; k < L; k++) {
        const rr = r0 + dr * k;
        const cc = c0 + dc * k;
        grid[rr]![cc] = word[k]!.toUpperCase();
      }
      placements.push({ word, r0, c0, dr, dc });
      placed = true;
    }
    if (!placed) return null;
  }

  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) {
      if (grid[i]![j] === "") {
        grid[i]![j] = String.fromCharCode(65 + Math.floor(r() * 26));
      }
    }
  }

  return { size, grid, words, placements };
}

/**
 * Build a word search. Uses a numeric seed so puzzles are reproducible
 * (e.g. daily) or random ("new puzzle").
 */
export function generateWordSearchPuzzle(opts: {
  seed: number;
  size?: number;
  wordCount?: number;
}): WordSearchPuzzle {
  const size = opts.size ?? 14;
  const wordCount = opts.wordCount ?? 18;
  const bank = getWordSearchBank();
  const rand = mulberry32(opts.seed >>> 0);

  for (let outer = 0; outer < 80; outer++) {
    const pickRand = mulberry32((opts.seed >>> 0) * 1009 + outer * 977);
    const pool = [...bank];
    shuffleInPlace(pool, pickRand);
    const words = pool.slice(0, Math.min(wordCount, pool.length));
    words.sort((a, b) => b.length - a.length);
    const puzzle = tryGenerate(size, words, pickRand);
    if (puzzle) return puzzle;
  }

  const w = bank[0] ?? "hello";
  const emergency = tryGenerate(8, [w], mulberry32(1));
  if (emergency) return emergency;
  const g = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => "A"));
  for (let i = 0; i < w.length; i++) g[3]![i] = w[i]!.toUpperCase();
  return {
    size: 8,
    grid: g,
    words: [w],
    placements: [{ word: w, r0: 3, c0: 0, dr: 0, dc: 1 }],
  };
}

/** Extract letters along a line between two inclusive cells (must be straight / diagonal). */
export function lineLetters(
  grid: string[][],
  r0: number,
  c0: number,
  r1: number,
  c1: number,
): { letters: string; cells: { r: number; c: number }[] } | null {
  const dr = r1 - r0;
  const dc = c1 - c0;
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);
  if (dr === 0 && dc === 0) return null;
  if (!(dr === 0 || dc === 0 || adr === adc)) return null;
  const sdr = dr === 0 ? 0 : dr / adr;
  const sdc = dc === 0 ? 0 : dc / adc;
  const steps = Math.max(adr, adc);
  const cells: { r: number; c: number }[] = [];
  let letters = "";
  for (let k = 0; k <= steps; k++) {
    const r = r0 + sdr * k;
    const c = c0 + sdc * k;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0]!.length) return null;
    cells.push({ r, c });
    letters += grid[r]![c]!;
  }
  return { letters, cells };
}

export function matchesPlacedWord(
  letters: string,
  placements: WordPlacement[],
): string | null {
  const up = letters.toUpperCase();
  const rev = up.split("").reverse().join("");
  for (const p of placements) {
    const w = p.word.toUpperCase();
    if (up === w || rev === w) return p.word;
  }
  return null;
}
