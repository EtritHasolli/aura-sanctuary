/**
 * Flashcards live inside notes as lines of the form
 *   Question :: Answer
 * (an optional leading "- " bullet is allowed). Spaces around "::" are required so
 * things like `std::vector` or URLs are never treated as cards. Lines inside ```
 * code fences are ignored.
 */

export interface Flashcard {
  /** Stable id derived from the question text; also the DB card_key. */
  key: string;
  question: string;
  answer: string;
}

export type FlashcardGrade = "again" | "hard" | "good" | "easy";

export interface FlashcardState {
  note_id: string;
  card_key: string;
  ease: number;
  interval_days: number;
  reps: number;
  due_at: string;
}

const CARD_RE = /^\s*(?:[-*]\s+)?(.+?)\s+::\s+(.+?)\s*$/;
const FENCE_RE = /^\s*```/;

/** 32-bit FNV-1a, hex. */
function fnv1a(text: string, seed: number) {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Same question (ignoring case and spacing) → same key, so edits to the answer keep progress. */
export function flashcardKey(question: string) {
  const normalized = question.trim().toLowerCase().replace(/\s+/g, " ");
  return `c${fnv1a(normalized, 0x811c9dc5)}${fnv1a(normalized, 0x01000193)}`;
}

export function parseFlashcards(content: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const seen = new Set<string>();
  let inFence = false;
  for (const line of content.split("\n")) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(CARD_RE);
    if (!match) continue;
    const question = match[1].trim();
    const answer = match[2].trim();
    if (!question || !answer) continue;
    const key = flashcardKey(question);
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ key, question, answer });
  }
  return cards;
}

export function stateKey(noteId: string, cardKey: string) {
  return `${noteId}:${cardKey}`;
}

export function isCardDue(state: FlashcardState | undefined, now = Date.now()) {
  return !state || new Date(state.due_at).getTime() <= now;
}

/**
 * Mirror of the scheduling in the review_flashcard() SQL function, used only to label
 * the grade buttons ("1d", "6d", …). The server result is authoritative.
 */
export function previewInterval(state: FlashcardState | undefined, grade: FlashcardGrade): string {
  if (grade === "again") return "10m";
  const ease = state?.ease ?? 2.5;
  const prev = state?.interval_days ?? 0;
  const reps = state?.reps ?? 0;
  let days: number;
  if (grade === "hard") days = Math.max(1, Math.round(Math.max(prev, 1) * 1.2));
  else if (reps === 0) days = grade === "easy" ? 3 : 1;
  else if (reps === 1) days = grade === "easy" ? 6 : 3;
  else {
    days = Math.max(prev + 1, Math.round(prev * ease));
    if (grade === "easy") days = Math.round(days * 1.3);
  }
  days = Math.min(days, 365);
  if (days >= 60) return `${Math.round(days / 30)}mo`;
  return `${days}d`;
}
