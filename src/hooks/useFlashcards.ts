import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Note } from "@/lib/aura/types";
import {
  isCardDue,
  parseFlashcards,
  stateKey,
  type Flashcard,
  type FlashcardGrade,
  type FlashcardState,
} from "@/lib/archives/flashcards";
import { useAuth } from "./useAuth";

// The flashcard tables aren't in the generated Supabase types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useFlashcardStates() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["flashcard-states", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await db
        .from("note_flashcard_states")
        .select("note_id, card_key, ease, interval_days, reps, due_at")
        .eq("user_id", user!.id);
      // Table missing (migration not applied yet): every card simply counts as new.
      if (error) return new Map<string, FlashcardState>();
      const map = new Map<string, FlashcardState>();
      for (const row of (data ?? []) as FlashcardState[]) map.set(stateKey(row.note_id, row.card_key), row);
      return map;
    },
  });
}

export interface ReviewResult {
  xp_awarded: number;
  xp_today: number;
  xp_cap: number;
  interval_days: number;
  due_at: string;
}

export function useReviewFlashcard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      noteId,
      cardKey,
      grade,
    }: {
      noteId: string;
      cardKey: string;
      grade: FlashcardGrade;
    }): Promise<ReviewResult> => {
      const { data, error } = await db.rpc("review_flashcard", {
        p_note_id: noteId,
        p_card_key: cardKey,
        p_grade: grade,
      });
      if (error) throw new Error(error.message);
      return data as ReviewResult;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flashcard-states", user?.id] }),
  });
}

export interface DeckCard extends Flashcard {
  noteId: string;
  noteTitle: string;
  state: FlashcardState | undefined;
  due: boolean;
}

/** Every card across the given notes, with its scheduling state. */
export function useFlashcardDeck(notes: Note[]) {
  const { data: states } = useFlashcardStates();
  return useMemo(() => {
    const now = Date.now();
    const cards: DeckCard[] = [];
    for (const note of notes) {
      if (note.is_folder || !note.content.includes("::")) continue;
      for (const card of parseFlashcards(note.content)) {
        const state = states?.get(stateKey(note.id, card.key));
        cards.push({
          ...card,
          noteId: note.id,
          noteTitle: note.title || "Untitled",
          state,
          due: isCardDue(state, now),
        });
      }
    }
    return cards;
  }, [notes, states]);
}
