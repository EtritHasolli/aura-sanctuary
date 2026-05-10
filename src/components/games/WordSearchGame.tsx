import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
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

const WS_PROGRESS_KEY = (seed: number) => `aura:word-search-progress:${seed}`;

type WordSearchStoredProgress = {
  v?: number;
  found: string[];
  startedAt: number;
  completedAt: number | null;
  dailySubmitDone?: boolean;
};

function readWordSearchProgress(seed: number, validWords: string[]) {
  try {
    const raw = localStorage.getItem(WS_PROGRESS_KEY(seed));
    if (!raw) return null;
    const data = JSON.parse(raw) as WordSearchStoredProgress;
    if (!data || !Array.isArray(data.found)) return null;
    const allowed = new Set(validWords);
    const found = new Set<string>();
    for (const w of data.found) {
      if (typeof w === "string" && allowed.has(w)) found.add(w);
    }
    const startedAt =
      typeof data.startedAt === "number" && Number.isFinite(data.startedAt)
        ? data.startedAt
        : Date.now();
    let completedAt =
      typeof data.completedAt === "number" && Number.isFinite(data.completedAt)
        ? data.completedAt
        : null;
    if (found.size >= validWords.length && completedAt == null) {
      completedAt = Date.now();
    }
    const dailySubmitDone = data.dailySubmitDone === true;
    return { found, startedAt, completedAt, dailySubmitDone };
  } catch {
    return null;
  }
}

function writeWordSearchProgress(
  seed: number,
  payload: {
    found: Set<string>;
    startedAt: number;
    completedAt: number | null;
    dailySubmitDone: boolean;
  },
) {
  try {
    localStorage.setItem(
      WS_PROGRESS_KEY(seed),
      JSON.stringify({
        v: 1,
        found: [...payload.found].sort(),
        startedAt: payload.startedAt,
        completedAt: payload.completedAt,
        dailySubmitDone: payload.dailySubmitDone,
      }),
    );
  } catch {
    // ignore quota / private mode
  }
}

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

function wordHue(word: string) {
  let h = 0;
  for (let i = 0; i < word.length; i++) h = (h * 31 + word.charCodeAt(i)) >>> 0;
  return h % 360;
}

function cellsAlongPlacement(p: { word: string; r0: number; c0: number; dr: number; dc: number }) {
  return Array.from({ length: p.word.length }, (_, k) => ({
    r: p.r0 + p.dr * k,
    c: p.c0 + p.dc * k,
  }));
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
  const dragAnchorRef = useRef<{ r: number; c: number } | null>(null);
  const gridBoardRef = useRef<HTMLDivElement | null>(null);
  const [dragClient, setDragClient] = useState<{ x: number; y: number } | null>(null);
  const [dragHoverCell, setDragHoverCell] = useState<{ r: number; c: number } | null>(null);
  const [dragOverlay, setDragOverlay] = useState<{
    polylinePoints: string;
    tail: { x1: number; y1: number; x2: number; y2: number } | null;
    validDir: boolean;
  } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [lbNotice, setLbNotice] = useState<string | null>(null);
  const submitSigRef = useRef<string | null>(null);
  const dailySubmitDoneRef = useRef(false);
  const persistSkipRef = useRef(true);

  const isDailyPuzzle = seed === dailySeed;
  const wordListKey = useMemo(() => [...puzzle.words].sort().join("\0"), [puzzle.words]);

  const settledCellStyles = useMemo(() => {
    const map = new Map<string, { hue: number; word: string }>();
    for (const p of puzzle.placements) {
      if (!found.has(p.word)) continue;
      const hue = wordHue(p.word);
      for (const { r, c } of cellsAlongPlacement(p)) {
        map.set(`${r},${c}`, { hue, word: p.word });
      }
    }
    return map;
  }, [found, puzzle.placements]);

  const endSelection = useCallback(() => {
    dragAnchorRef.current = null;
    setAnchor(null);
    setDragClient(null);
    setDragHoverCell(null);
    setDragOverlay(null);
  }, []);

  useLayoutEffect(() => {
    persistSkipRef.current = true;
    endSelection();
    if (typeof window === "undefined") {
      setFound(new Set());
      setStartedAt(Date.now());
      setCompletedAt(null);
      dailySubmitDoneRef.current = false;
      submitSigRef.current = null;
      return;
    }
    const loaded = readWordSearchProgress(seed, puzzle.words);
    if (loaded) {
      setFound(loaded.found);
      setStartedAt(loaded.startedAt);
      setCompletedAt(loaded.completedAt);
      dailySubmitDoneRef.current = loaded.dailySubmitDone;
      if (loaded.dailySubmitDone && seed === dailySeed) {
        submitSigRef.current = `${dayKey}:${seed}`;
      } else {
        submitSigRef.current = null;
      }
    } else {
      setFound(new Set());
      setStartedAt(Date.now());
      setCompletedAt(null);
      dailySubmitDoneRef.current = false;
      submitSigRef.current = null;
    }
  }, [seed, wordListKey, dayKey, dailySeed, endSelection]);

  const done = found.size >= puzzle.words.length;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (persistSkipRef.current) {
      persistSkipRef.current = false;
      return;
    }
    if (startedAt == null) return;
    writeWordSearchProgress(seed, {
      found,
      startedAt,
      completedAt,
      dailySubmitDone: dailySubmitDoneRef.current,
    });
  }, [seed, found, startedAt, completedAt]);

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
          dailySubmitDoneRef.current = true;
          writeWordSearchProgress(seed, {
            found,
            startedAt,
            completedAt,
            dailySubmitDone: true,
          });
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

  useLayoutEffect(() => {
    const board = gridBoardRef.current;
    if (!board || !anchor || !dragClient) {
      setDragOverlay(null);
      return;
    }
    const br = board.getBoundingClientRect();
    const cellCenter = (r: number, c: number) => {
      const el = board.querySelector<HTMLElement>(
        `[data-word-search-cell][data-row="${r}"][data-col="${c}"]`,
      );
      if (!el) return null;
      const er = el.getBoundingClientRect();
      return { x: er.left + er.width / 2 - br.left, y: er.top + er.height / 2 - br.top };
    };

    const cursorLocal = { x: dragClient.x - br.left, y: dragClient.y - br.top };
    const previewLine =
      dragHoverCell != null
        ? lineLetters(puzzle.grid, anchor.r, anchor.c, dragHoverCell.r, dragHoverCell.c)
        : null;
    const validDir = previewLine != null && previewLine.cells.length > 1;

    if (validDir && previewLine) {
      const pts = previewLine.cells
        .map(({ r, c }) => cellCenter(r, c))
        .filter((p): p is { x: number; y: number } => p != null);
      const polylinePoints = pts.map((p) => `${p.x},${p.y}`).join(" ");
      const last = pts[pts.length - 1] ?? null;
      const tail = last
        ? { x1: last.x, y1: last.y, x2: cursorLocal.x, y2: cursorLocal.y }
        : null;
      setDragOverlay({ polylinePoints, tail, validDir: true });
      return;
    }

    const startPt = cellCenter(anchor.r, anchor.c);
    if (startPt) {
      setDragOverlay({
        polylinePoints: `${startPt.x},${startPt.y}`,
        tail: { x1: startPt.x, y1: startPt.y, x2: cursorLocal.x, y2: cursorLocal.y },
        validDir: false,
      });
    } else {
      setDragOverlay(null);
    }
  }, [anchor, dragClient, dragHoverCell, puzzle.grid]);

  const previewHighlightKeys = useMemo(() => {
    if (!anchor || !dragHoverCell) return new Set<string>();
    const line = lineLetters(puzzle.grid, anchor.r, anchor.c, dragHoverCell.r, dragHoverCell.c);
    if (!line || line.cells.length < 2) return new Set<string>();
    return new Set(line.cells.map(({ r, c }) => `${r},${c}`));
  }, [anchor, dragHoverCell, puzzle.grid]);

  const onCellPointerDown = (r: number, c: number, e: PointerEvent<HTMLButtonElement>) => {
    if (done) return;
    dragAnchorRef.current = { r, c };
    setAnchor({ r, c });
    setDragClient({ x: e.clientX, y: e.clientY });
    setDragHoverCell({ r, c });
  };

  const onCellPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragAnchorRef.current == null) return;
    setDragClient({ x: e.clientX, y: e.clientY });
    const cell = resolveCellFromPointer(e.clientX, e.clientY);
    if (cell) setDragHoverCell(cell);
  };

  const tryComplete = useCallback(
    (r: number, c: number) => {
      if (!anchor) return;
      if (anchor.r === r && anchor.c === c) {
        endSelection();
        return;
      }
      const line = lineLetters(puzzle.grid, anchor.r, anchor.c, r, c);
      endSelection();
      if (!line) return;
      const w = matchesPlacedWord(line.letters, puzzle.placements);
      if (!w) return;
      setFound((prev) => {
        if (prev.has(w)) return prev;
        return new Set([...prev, w]);
      });
    },
    [anchor, puzzle.grid, puzzle.placements, endSelection],
  );

  const resolveCellFromPointer = (clientX: number, clientY: number) => {
    const under = document.elementFromPoint(clientX, clientY);
    const cell = under?.closest("[data-word-search-cell]") as HTMLElement | null;
    const row = cell?.dataset.row;
    const col = cell?.dataset.col;
    if (row == null || col == null) return null;
    const r = Number(row);
    const c = Number(col);
    return Number.isFinite(r) && Number.isFinite(c) ? { r, c } : null;
  };

  const onCellPointerUp = (e: PointerEvent<HTMLButtonElement>, fallbackR: number, fallbackC: number) => {
    const end = resolveCellFromPointer(e.clientX, e.clientY);
    tryComplete(end?.r ?? fallbackR, end?.c ?? fallbackC);
  };

  const newRandomPuzzle = () => {
    endSelection();
    setLbNotice(null);
    setSeed(randomSeed());
  };

  const todaysPuzzle = () => {
    endSelection();
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
          onPointerLeave={() => {
            if (dragAnchorRef.current) endSelection();
          }}
        >
          <div ref={gridBoardRef} className="relative shrink-0 inline-block">
            <div
              className="inline-grid gap-0 border-2 border-border p-2 bg-card"
              style={{
                gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))`,
              }}
            >
              {puzzle.grid.map((row, r) =>
                row.map((ch, c) => {
                  const isAnchor = anchor?.r === r && anchor?.c === c;
                  const settled = settledCellStyles.get(`${r},${c}`);
                  const onPreview = previewHighlightKeys.has(`${r},${c}`);
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      data-word-search-cell
                      data-row={r}
                      data-col={c}
                      className={cn(
                        "relative z-[1] w-8 h-8 sm:w-9 sm:h-9 xl:w-10 xl:h-10 flex items-center justify-center text-xs sm:text-sm xl:text-base font-semibold uppercase border border-border/60 hover:bg-primary/15 active:bg-primary/25 transition-[background-color,box-shadow] duration-150",
                        isAnchor && "bg-primary/35 ring-2 ring-primary z-[2]",
                        settled && !isAnchor && "ring-1 ring-inset",
                        onPreview && !settled && "bg-primary/25",
                      )}
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        ...(settled && !isAnchor
                          ? {
                              backgroundColor: `hsla(${settled.hue}, 62%, 52%, 0.38)`,
                              boxShadow: `inset 0 0 0 2px hsla(${settled.hue}, 75%, 42%, 0.65)`,
                            }
                          : undefined),
                      }}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        onCellPointerDown(r, c, e);
                      }}
                      onPointerMove={onCellPointerMove}
                      onPointerUp={(e) => {
                        try {
                          onCellPointerUp(e, r, c);
                        } finally {
                          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                            e.currentTarget.releasePointerCapture(e.pointerId);
                          }
                        }
                      }}
                      onPointerCancel={(e) => {
                        endSelection();
                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
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
            {dragOverlay && (
              <svg
                className="pointer-events-none absolute left-0 top-0 z-[3] overflow-visible"
                width="100%"
                height="100%"
                aria-hidden
              >
                {dragOverlay.polylinePoints.includes(" ") ? (
                  <polyline
                    points={dragOverlay.polylinePoints}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth={5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.85}
                    className="drop-shadow-[0_0_6px_hsl(var(--primary)/0.55)]"
                  />
                ) : (
                  <circle
                    cx={Number(dragOverlay.polylinePoints.split(",")[0])}
                    cy={Number(dragOverlay.polylinePoints.split(",")[1])}
                    r={3}
                    fill="hsl(var(--primary))"
                    opacity={0.9}
                  />
                )}
                {dragOverlay.tail && (
                  <line
                    x1={dragOverlay.tail.x1}
                    y1={dragOverlay.tail.y1}
                    x2={dragOverlay.tail.x2}
                    y2={dragOverlay.tail.y2}
                    stroke="hsl(var(--primary))"
                    strokeWidth={dragOverlay.validDir ? 3 : 2}
                    strokeLinecap="round"
                    strokeDasharray={dragOverlay.validDir ? "6 5" : "5 6"}
                    opacity={dragOverlay.validDir ? 0.55 : 0.35}
                  />
                )}
              </svg>
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

