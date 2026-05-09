import rawWords from "../../../words.txt?raw";
import rawWordSearchSupplement from "../../../wordSearchSupplement.txt?raw";

let cached: string[] | null = null;
let cachedSearch: string[] | null = null;

/** Lowercase 5-letter words from the project word list (deduped). */
export function getWordBank(): string[] {
  if (!cached) {
    const set = new Set<string>();
    for (const line of rawWords.split(/\r?\n/)) {
      const w = line.trim().toLowerCase();
      if (w.length === 5 && /^[a-z]+$/.test(w)) set.add(w);
    }
    cached = [...set];
    cached.sort();
  }
  return cached;
}

/**
 * Words for word search: all 5-letter `words.txt` entries plus `wordSearchSupplement.txt`
 * (lengths 4 and 6–9 by design, so Wordle’s bank stays 5-only).
 */
export function getWordSearchBank(): string[] {
  if (!cachedSearch) {
    const set = new Set<string>(getWordBank());
    for (const line of rawWordSearchSupplement.split(/\r?\n/)) {
      const w = line.trim().toLowerCase();
      if (w.length >= 4 && w.length <= 14 && /^[a-z]+$/.test(w)) set.add(w);
    }
    cachedSearch = [...set];
    cachedSearch.sort();
  }
  return cachedSearch;
}
