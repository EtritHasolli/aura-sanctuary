import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApplyReward } from "@/hooks/useProfile";
import { useReviewFlashcard, type DeckCard } from "@/hooks/useFlashcards";
import { previewInterval, type FlashcardGrade } from "@/lib/archives/flashcards";

const GRADES: { grade: FlashcardGrade; label: string; className: string }[] = [
  { grade: "again", label: "AGAIN", className: "border-destructive text-destructive hover:bg-destructive/10" },
  { grade: "hard", label: "HARD", className: "border-[color:var(--color-gold)] hover:bg-secondary" },
  { grade: "good", label: "GOOD", className: "border-primary hover:bg-primary/10" },
  { grade: "easy", label: "EASY", className: "border-accent hover:bg-accent/10" },
];

function shuffle<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function FlashcardReviewDialog({
  open,
  onOpenChange,
  title,
  cards,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** All cards in scope; the session reviews the due ones (or all of them in practice mode). */
  cards: DeckCard[];
}) {
  const review = useReviewFlashcard();
  const reward = useApplyReward();
  const [queue, setQueue] = useState<DeckCard[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [capReached, setCapReached] = useState(false);
  const [practice, setPractice] = useState(false);
  const [started, setStarted] = useState(false);

  const dueCards = cards.filter((c) => c.due);

  // Snapshot the queue when the dialog opens so cards don't reshuffle mid-session.
  useEffect(() => {
    if (!open) {
      setStarted(false);
      return;
    }
    setQueue(shuffle(cards.filter((c) => c.due)));
    setRevealed(false);
    setReviewed(0);
    setXpEarned(0);
    setCapReached(false);
    setPractice(false);
    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on open
  }, [open]);

  const queued = queue[0];
  // The queue is a snapshot; read the card's latest scheduling state for the interval labels.
  const current = queued
    ? (cards.find((c) => c.noteId === queued.noteId && c.key === queued.key) ?? queued)
    : undefined;

  const startPractice = () => {
    setPractice(true);
    setQueue(shuffle(cards));
    setRevealed(false);
  };

  const grade = useCallback(
    async (g: FlashcardGrade) => {
      if (!current || review.isPending) return;
      try {
        const result = await review.mutateAsync({ noteId: current.noteId, cardKey: current.key, grade: g });
        if (result.xp_awarded > 0) {
          await reward.mutateAsync({ xp: result.xp_awarded });
          setXpEarned((x) => x + result.xp_awarded);
        }
        if (result.xp_today >= result.xp_cap) setCapReached(true);
        setReviewed((n) => n + 1);
        // "Again" puts the card back at the end of this session.
        setQueue(([head, ...rest]) => (g === "again" ? [...rest, head] : rest));
        setRevealed(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save review.");
      }
    },
    [current, review, reward],
  );

  // Keyboard: Space/Enter reveals, 1–4 grades.
  useEffect(() => {
    if (!open || !current) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      const idx = ["1", "2", "3", "4"].indexOf(e.key);
      if (revealed && idx >= 0) {
        e.preventDefault();
        void grade(GRADES[idx].grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, current, revealed, grade]);

  const pixel = { fontFamily: "var(--font-pixel)" } as const;
  const nextDue = cards
    .filter((c) => !c.due && c.state)
    .map((c) => new Date(c.state!.due_at).getTime())
    .sort((a, b) => a - b)[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle style={pixel} className="text-sm">
            {title}
          </DialogTitle>
        </DialogHeader>

        {!started ? null : current ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground" style={pixel}>
              <span>
                {reviewed} DONE · {queue.length} LEFT
              </span>
              <span>
                {practice ? "PRACTICE · NO XP" : `+${xpEarned} XP`}
                {capReached && !practice ? " · DAILY CAP" : ""}
              </span>
            </div>

            <div className="border-2 border-border bg-background/40 p-5 min-h-48 flex flex-col">
              <div className="text-[9px] text-muted-foreground mb-3 truncate" style={pixel}>
                {current.noteTitle}
              </div>
              <div className="text-lg text-foreground whitespace-pre-wrap">{current.question}</div>
              {revealed && (
                <div className="mt-4 pt-4 border-t-2 border-dashed border-border text-lg text-primary whitespace-pre-wrap">
                  {current.answer}
                </div>
              )}
            </div>

            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="w-full py-2.5 bg-primary text-primary-foreground"
                style={{ ...pixel, fontSize: 10 }}
              >
                SHOW ANSWER <span className="opacity-60">(SPACE)</span>
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {GRADES.map((g, i) => (
                  <button
                    key={g.grade}
                    type="button"
                    disabled={review.isPending || reward.isPending}
                    onClick={() => void grade(g.grade)}
                    className={`py-2 border-2 disabled:opacity-50 ${g.className}`}
                    style={{ ...pixel, fontSize: 9 }}
                  >
                    {g.label}
                    <div className="text-[8px] text-muted-foreground mt-1">
                      {i + 1} · {previewInterval(current.state, g.grade)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : reviewed > 0 ? (
          <div className="text-center space-y-3 py-6">
            <p className="text-primary" style={pixel}>
              SESSION COMPLETE
            </p>
            <p className="text-sm text-muted-foreground">
              Reviewed {reviewed} card{reviewed === 1 ? "" : "s"}
              {practice ? " (practice)" : ` · +${xpEarned} XP`}
              {capReached && !practice ? " · daily flashcard XP cap reached" : ""}
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 bg-primary text-primary-foreground"
              style={{ ...pixel, fontSize: 10 }}
            >
              DONE
            </button>
          </div>
        ) : (
          <div className="text-center space-y-3 py-6">
            {cards.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No flashcards yet. Write lines like <code className="text-primary">Question :: Answer</code>{" "}
                in a note.
              </p>
            ) : (
              <>
                <p className="text-primary" style={pixel}>
                  ALL CAUGHT UP
                </p>
                <p className="text-sm text-muted-foreground">
                  {dueCards.length === 0 && nextDue
                    ? `Next card is due ${new Date(nextDue).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}.`
                    : "Nothing is due right now."}
                </p>
                <button
                  type="button"
                  onClick={startPractice}
                  className="px-4 py-2 border-2 border-border hover:border-primary"
                  style={{ ...pixel, fontSize: 10 }}
                >
                  PRACTICE ANYWAY (NO XP)
                </button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
