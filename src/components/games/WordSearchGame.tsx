import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDailyWordSearchSeedForDayKey,
  getLocalDayKey,
} from "@/lib/games/dailyWord";
import {
  generateWordSearchPuzzle,
  lineLetters,
  matchesPlacedWord,
} from "@/lib/games/wordSearchGenerator";
import { useAuth } from "@/hooks/useAuth";
import { useSubmitMinigameScore } from "@/hooks/useMinigames";
import { Leaderboard } from "./Leaderboard";

const WORD_SEARCH_GAME_SLUG = "word-search";

/** Higher = better (faster finish). Same shape as Sudoku time-derived scores. */
function wordSearchScore(durationSeconds: number) {
  return Math.max(1, 999_999 - Math.floor(durationSeconds));
}

function formatWordSearchScore(_score: number, metadata: Record<string, unknown> | null) {
  const sec = Number(metadata?.duration_seconds ?? 0);
  if (!Number.isFinite(sec) || sec < 0) return "—";
  const mm = Math.floor(sec / 60).toString().padStart(2, "0");
  const ss = (Math.floor(sec) % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function randomSeed() {
  return Math.floor(Math.random() * 0x7fffffff);
}

export function WordSearchGame() {
  const { user } = useAuth();
  const submitMutation = useSubmitMinigameScore();
  const dayKey = useMemo(() => getLocalDayKey(), []);
  const dailySeed = useMemo(() => getDailyWordSearchSeedForDayKey(dayKey), [dayKey]);
  const [seed, setSeed] = useState(() => dailySeed);
  const puzzle = useMemo(
    () => generateWordSearchPuzzle({ seed, size: 15, wordCount: 18 }),
    [seed],
  );
  const [found, setFound] = useState<Set<string>>(() => new Set());
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [lbNotice, setLbNotice] = useState<string | null>(null);
  const submitSigRef = useRef<string | null>(null);

  const isDailyPuzzle = seed === dailySeed;

  useEffect(() => {
    setStartedAt(Date.now());
    setCompletedAt(null);
    submitSigRef.current = null;
  }, [seed]);

  const done = found.size >= puzzle.words.length;

  useEffect(() => {
    if (!done || !isDailyPuzzle || startedAt == null) return;
    setCompletedAt((c) => c ?? Date.now());
  }, [done, isDailyPuzzle, startedAt]);

  useEffect(() => {
    if (!done || !isDailyPuzzle || !user || startedAt == null || completedAt == null) return;
    const sig = `${dayKey}:${seed}`;
    if (submitSigRef.current === sig) return;
    const durationSeconds = Math.max(1, Math.floor((completedAt - startedAt) / 1000));
    const score = wordSearchScore(durationSeconds);
    submitSigRef.current = sig;
    submitMutation.mutate(
      {
        game_slug: WORD_SEARCH_GAME_SLUG,
        category: dayKey,
        score,
        metadata: { duration_seconds: durationSeconds, seed, daily: true },
      },
      {
        onSuccess: (res) => {
          setLbNotice(res.is_new_high ? "New personal best on today's grid!" : null);
        },
        onError: () => {
          submitSigRef.current = null;
          setLbNotice(null);
        },
      },
    );
  }, [
    done,
    isDailyPuzzle,
    user,
    dayKey,
    seed,
    startedAt,
    completedAt,
    submitMutation,
  ]);

  const onCellPointerDown = (r: number, c: number) => {
    if (done) return;
    setAnchor({ r, c });
  };

  const tryComplete = useCallback(
    (r: number, c: number) => {
      if (!anchor) return;
      if (anchor.r === r && anchor.c === c) {
        setAnchor(null);
        return;
      }
      const line = lineLetters(puzzle.grid, anchor.r, anchor.c, r, c);
      setAnchor(null);
      if (!line) return;
      const w = matchesPlacedWord(line.letters, puzzle.placements);
      if (!w) return;
      setFound((prev) => {
        if (prev.has(w)) return prev;
        return new Set([...prev, w]);
      });
    },
    [anchor, puzzle.grid, puzzle.placements],
  );

  const onCellPointerUp = (r: number, c: number) => {
    tryComplete(r, c);
  };

  const newRandomPuzzle = () => {
    setFound(new Set());
    setAnchor(null);
    setLbNotice(null);
    setSeed(randomSeed());
  };

  const todaysPuzzle = () => {
    setFound(new Set());
    setAnchor(null);
    setLbNotice(null);
    setSeed(getDailyWordSearchSeedForDayKey(getLocalDayKey()));
  };

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] gap-4">
      <div className="space-y-4 min-w-0 w-full">
        {done && (
          <div
            className="text-center text-primary text-sm space-y-1"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            <p className="flex items-center justify-center gap-2">
              <Trophy size={16} />
              All words found!
            </p>
            {isDailyPuzzle && !user && (
              <p className="text-[10px] text-muted-foreground">
                Sign in to save your time on today&apos;s leaderboard.
              </p>
            )}
            {lbNotice && (
              <p className="text-[10px] text-accent">{lbNotice}</p>
            )}
          </div>
        )}

        <div
          className="w-full max-w-full overflow-x-auto pb-2 select-none flex justify-center xl:justify-start"
          onPointerLeave={() => setAnchor(null)}
        >
          <div
            className="inline-grid gap-0 border-2 border-border p-2 bg-card shrink-0"
            style={{
              gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
            }}
          >
            {puzzle.grid.map((row, r) =>
              row.map((ch, c) => {
                const isAnchor = anchor?.r === r && anchor?.c === c;
                return (
                  <button
                    key={`${r}-${c}`}
                    type="button"
                    className={cn(
                      "w-8 h-8 sm:w-9 sm:h-9 xl:w-10 xl:h-10 flex items-center justify-center text-xs sm:text-sm xl:text-base font-semibold uppercase border border-border/60 hover:bg-primary/15 active:bg-primary/25",
                      isAnchor && "bg-primary/30 ring-1 ring-primary",
                    )}
                    style={{ fontFamily: "ui-monospace, monospace" }}
                    onPointerDown={(e) => {
                      e.currentTarget.setPointerCapture(e.pointerId);
                      onCellPointerDown(r, c);
                    }}
                    onPointerUp={(e) => {
                      try {
                        onCellPointerUp(r, c);
                      } finally {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      }
                    }}
                  >
                    {ch}
                  </button>
                );
              }),
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-3 flex flex-col">
        <div>
          <h3
            className="text-xs text-muted-foreground mb-2 uppercase tracking-wide"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Words ({found.size}/{puzzle.words.length})
          </h3>
          <ul className="grid grid-cols-3 gap-x-1.5 gap-y-1">
            {[...puzzle.words]
              .sort()
              .map((w) => (
                <li
                  key={w}
                  className={cn(
                    "text-[20px] uppercase tracking-wide font-medium leading-tight",
                    found.has(w) && "line-through text-muted-foreground",
                  )}
                  style={{ fontFamily: "var(--font-display), monospace" }}
                >
                  {w}
                </li>
              ))}
          </ul>
        </div>

        <div
          className="flex flex-row gap-2 shrink-0"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          <button
            type="button"
            onClick={todaysPuzzle}
            className="flex flex-1 min-w-0 items-center justify-center px-2 py-2 border-2 border-border hover:border-primary text-[10px] sm:text-xs"
          >
            <span className="truncate">Today&apos;s grid</span>
          </button>
          <button
            type="button"
            onClick={newRandomPuzzle}
            className="flex flex-1 min-w-0 items-center justify-center px-2 py-2 border-2 border-border hover:border-primary text-[10px] sm:text-xs"
          >
            <span className="truncate">New puzzle</span>
          </button>
        </div>

        <Leaderboard
          gameSlug={WORD_SEARCH_GAME_SLUG}
          category={dayKey}
          formatScore={formatWordSearchScore}
          title={`WORD SEARCH · ${dayKey}`}
        />
      </div>
    </div>
  );
}
