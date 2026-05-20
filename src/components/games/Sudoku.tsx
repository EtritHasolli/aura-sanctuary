import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubmitMinigameScore } from "@/hooks/useMinigames";
import {
  readSudokuUserSettings,
  SUDOKU_SETTINGS_CHANGED_EVENT,
  type SudokuUserSettings,
} from "@/lib/games/sudokuUserSettings";
import { Leaderboard } from "./Leaderboard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Difficulty = "easy" | "medium" | "hard";

const SUDOKU_GAME_SLUG = "sudoku";

/**
 * Score formula: faster solves => higher score, capped at 9_999.
 * Within a single difficulty leaderboard the score order matches solve-time.
 */
function sudokuScore(durationSeconds: number) {
  return Math.max(1, 9999 - Math.floor(durationSeconds));
}

function formatSudokuScore(_score: number, metadata: Record<string, unknown> | null) {
  const dur = Number(metadata?.duration_seconds ?? 0);
  if (!Number.isFinite(dur) || dur <= 0) return "—";
  const mm = Math.floor(dur / 60).toString().padStart(2, "0");
  const ss = (Math.floor(dur) % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// ---------------------------------------------------------------------------
// Puzzle generation
// ---------------------------------------------------------------------------

type Cell = {
  value: number; // 0 = empty
  given: boolean;
};

function emptyBoard(): Cell[] {
  return Array.from({ length: 81 }, () => ({ value: 0, given: false }));
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/** Returns true if placing `val` at index `i` in board `b` is legal. */
function canPlace(b: number[], i: number, val: number): boolean {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let j = 0; j < 9; j++) {
    if (b[r * 9 + j] === val) return false;
    if (b[j * 9 + c] === val) return false;
    if (b[(br + Math.floor(j / 3)) * 9 + bc + (j % 3)] === val) return false;
  }
  return true;
}

/** Fills `b` with a complete valid grid using randomised backtracking. */
function fillGrid(b: number[], i = 0): boolean {
  if (i === 81) return true;
  if (b[i] !== 0) return fillGrid(b, i + 1);
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const v of digits) {
    if (canPlace(b, i, v)) {
      b[i] = v;
      if (fillGrid(b, i + 1)) return true;
      b[i] = 0;
    }
  }
  return false;
}

/**
 * Counts solutions in `b`, stopping early once `maxCount` is reached.
 * Used to verify a puzzle has exactly one solution.
 */
function countSolutions(b: number[], maxCount = 2): number {
  const empty = b.indexOf(0);
  if (empty === -1) return 1;
  let count = 0;
  for (let v = 1; v <= 9; v++) {
    if (canPlace(b, empty, v)) {
      b[empty] = v;
      count += countSolutions(b, maxCount);
      b[empty] = 0;
      if (count >= maxCount) return count;
    }
  }
  return count;
}

// Target number of givens per difficulty
const GIVENS: Record<Difficulty, number> = { easy: 38, medium: 30, hard: 24 };

/**
 * Generates a fresh puzzle string (81 chars, 0 = blank) with a unique solution.
 * Algorithm:
 *  1. Fill a complete grid with randomised backtracking.
 *  2. Shuffle all 81 cell indices and remove them one by one.
 *  3. After each removal, verify the puzzle still has a unique solution;
 *     restore the cell if uniqueness breaks.
 *  4. Stop once the target number of givens is reached.
 */
function generatePuzzle(difficulty: Difficulty): { puzzle: string; solution: number[] } {
  const solved = new Array<number>(81).fill(0);
  fillGrid(solved);

  const puzzle = solved.slice();
  const target = GIVENS[difficulty];
  const indices = shuffle(Array.from({ length: 81 }, (_, i) => i));

  let givens = 81;
  for (const idx of indices) {
    if (givens <= target) break;
    const backup = puzzle[idx]!;
    puzzle[idx] = 0;
    if (countSolutions(puzzle.slice()) !== 1) {
      puzzle[idx] = backup;
    } else {
      givens--;
    }
  }

  return { puzzle: puzzle.join(""), solution: solved };
}

function parsePuzzle(puzzle: string): Cell[] {
  return puzzle.split("").map((c) => {
    const n = Number(c);
    const isGiven = Number.isFinite(n) && n >= 1 && n <= 9;
    return { value: isGiven ? n : 0, given: isGiven };
  });
}

function rowOf(i: number) {
  return Math.floor(i / 9);
}
function colOf(i: number) {
  return i % 9;
}
function boxOf(i: number) {
  return Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
}

function findConflicts(cells: Cell[]): Set<number> {
  const conflicts = new Set<number>();
  const rows: Map<number, number[]>[] = Array.from({ length: 9 }, () => new Map());
  const cols: Map<number, number[]>[] = Array.from({ length: 9 }, () => new Map());
  const boxes: Map<number, number[]>[] = Array.from({ length: 9 }, () => new Map());

  cells.forEach((cell, i) => {
    if (cell.value === 0) return;
    const r = rowOf(i);
    const c = colOf(i);
    const b = boxOf(i);
    [
      { map: rows[r] },
      { map: cols[c] },
      { map: boxes[b] },
    ].forEach(({ map }) => {
      const arr = map.get(cell.value) ?? [];
      arr.push(i);
      map.set(cell.value, arr);
    });
  });

  const collect = (map: Map<number, number[]>) => {
    for (const [, indices] of map) {
      if (indices.length > 1) {
        indices.forEach((i) => conflicts.add(i));
      }
    }
  };
  rows.forEach(collect);
  cols.forEach(collect);
  boxes.forEach(collect);
  return conflicts;
}

function isComplete(cells: Cell[]) {
  if (cells.some((c) => c.value === 0)) return false;
  return findConflicts(cells).size === 0;
}

export function Sudoku() {
  const { user } = useAuth();
  const settingsUserId = user?.id ?? null;
  const [userSettings, setUserSettings] = useState<SudokuUserSettings>(() =>
    readSudokuUserSettings(settingsUserId),
  );

  useEffect(() => {
    setUserSettings(readSudokuUserSettings(settingsUserId));
  }, [settingsUserId]);

  useEffect(() => {
    const onSettingsChanged = (e: Event) => {
      const ce = e as CustomEvent<SudokuUserSettings>;
      if (ce.detail) setUserSettings(ce.detail);
      else setUserSettings(readSudokuUserSettings(settingsUserId));
    };
    window.addEventListener(SUDOKU_SETTINGS_CHANGED_EVENT, onSettingsChanged);
    return () => window.removeEventListener(SUDOKU_SETTINGS_CHANGED_EVENT, onSettingsChanged);
  }, [settingsUserId]);

  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [seed] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [lockedDigit, setLockedDigit] = useState<number | null>(null);
  const [cells, setCells] = useState<Cell[]>(() => emptyBoard());
  const [history, setHistory] = useState<Cell[][]>([]);
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  /** False in the lobby (empty grid); true after Start loads a puzzle. */
  const [sessionActive, setSessionActive] = useState(false);
  const [solved, setSolved] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [submitResult, setSubmitResult] = useState<
    | { isNewHigh: boolean; durationSeconds: number; score: number }
    | null
  >(null);
  const submitMutation = useSubmitMinigameScore();
  const submittedKey = useRef<string | null>(null);
  const solutionRef = useRef<number[]>([]);

  useEffect(() => {
    if (startedAt == null || completedAt != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [completedAt, startedAt]);

  useEffect(() => {
    setCells(emptyBoard());
    setSelected(null);
    setLockedDigit(null);
    setHistory([]);
    setSessionActive(false);
    setSolved(false);
    setStartedAt(null);
    setCompletedAt(null);
    setSubmitResult(null);
    submittedKey.current = null;
  }, [difficulty, seed]);

  // Auto-clear locked digit once all 9 of that digit are placed
  useEffect(() => {
    if (lockedDigit == null) return;
    const count = cells.filter((c) => c.value === lockedDigit).length;
    if (count >= 9) setLockedDigit(null);
  }, [cells, lockedDigit]);

  const conflicts = useMemo(() => findConflicts(cells), [cells]);

  /** Count of each digit 1–9 on the board (a full grid has nine of each). */
  const digitCounts = useMemo(() => {
    const counts = new Array<number>(10).fill(0);
    for (const cell of cells) {
      if (cell.value >= 1 && cell.value <= 9) counts[cell.value]++;
    }
    return counts;
  }, [cells]);

  const startGame = useCallback((diff: Difficulty) => {
    const { puzzle, solution } = generatePuzzle(diff);
    solutionRef.current = solution;
    setCells(parsePuzzle(puzzle));
    setSelected(null);
    setLockedDigit(null);
    setHistory([]);
    setSolved(false);
    setCompletedAt(null);
    setSubmitResult(null);
    submittedKey.current = null;
    const t = Date.now();
    setStartedAt(t);
    setNow(t);
    setSessionActive(true);
  }, []);

  const place = useCallback(
    (value: number) => {
      if (!sessionActive || solved) return;
      if (selected == null) return;
      const cell = cells[selected];
      if (cell.given) return;
      if (cell.value === value) return;
      setHistory((h) => [...h, cells]);
      setCells((prev) => {
        const next = prev.slice();
        next[selected] = { ...prev[selected], value };
        return next;
      });
    },
    [selected, cells, sessionActive, solved],
  );

  const erase = useCallback(() => {
    if (!sessionActive || solved) return;
    if (selected == null) return;
    const cell = cells[selected];
    if (cell.given) return;
    if (cell.value === 0) return;
    setHistory((h) => [...h, cells]);
    setCells((prev) => {
      const next = prev.slice();
      next[selected] = { ...prev[selected], value: 0 };
      return next;
    });
  }, [selected, cells, sessionActive, solved]);

  const undo = useCallback(() => {
    if (!sessionActive || solved) return;
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1]!;
      setCells(prev);
      return h.slice(0, -1);
    });
  }, [sessionActive, solved]);

  useEffect(() => {
    if (!solved && isComplete(cells)) {
      setSolved(true);
      setCompletedAt(Date.now());
    }
  }, [cells, solved]);

  useEffect(() => {
    if (!solved || completedAt == null || startedAt == null) return;
    const key = `${difficulty}:${seed}:${startedAt}`;
    if (submittedKey.current === key) return;
    submittedKey.current = key;

    const durationSeconds = Math.max(1, Math.floor((completedAt - startedAt) / 1000));
    const score = sudokuScore(durationSeconds);

    submitMutation.mutate(
      {
        game_slug: SUDOKU_GAME_SLUG,
        category: difficulty,
        score,
        metadata: { duration_seconds: durationSeconds, difficulty },
      },
      {
        onSuccess: (res) => {
          setSubmitResult({ isNewHigh: res.is_new_high, durationSeconds, score });
        },
        onError: () => {
          setSubmitResult({ isNewHigh: false, durationSeconds, score });
        },
      },
    );
  }, [solved, completedAt, startedAt, difficulty, seed, submitMutation]);

  // Keyboard input + sticky digit hold on desktop
  const keyHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyHoldDigit = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!sessionActive || solved) return;
      if (e.key >= "1" && e.key <= "9") {
        const n = Number(e.key);
        if (!e.repeat && userSettings.stickyDigitMode) {
          keyHoldDigit.current = n;
          keyHoldTimer.current = setTimeout(() => {
            setLockedDigit((prev) => (prev === n ? null : n));
            keyHoldDigit.current = null; // mark as long-press so keyup won't place
          }, 500);
        }
        // In sticky mode placement happens on keyup; otherwise place immediately
        if (!userSettings.stickyDigitMode && !e.repeat && selected != null) place(n);
      } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
        erase();
      } else if (e.key === "ArrowLeft") {
        setSelected((s) => (s == null ? null : Math.max(0, s - 1)));
      } else if (e.key === "ArrowRight") {
        setSelected((s) => (s == null ? null : Math.min(80, s + 1)));
      } else if (e.key === "ArrowUp") {
        setSelected((s) => (s == null ? null : Math.max(0, s - 9)));
      } else if (e.key === "ArrowDown") {
        setSelected((s) => (s == null ? null : Math.min(80, s + 9)));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "9") {
        const n = Number(e.key);
        if (keyHoldTimer.current != null) {
          // Timer still running = short tap, place the digit
          clearTimeout(keyHoldTimer.current);
          keyHoldTimer.current = null;
          if (selected != null) place(n);
        }
        keyHoldDigit.current = null;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [selected, place, erase, sessionActive, solved, userSettings.stickyDigitMode]);

  const elapsedSeconds =
    startedAt == null
      ? 0
      : Math.max(0, Math.floor(((completedAt ?? now) - startedAt) / 1000));
  const mm = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const ss = (elapsedSeconds % 60).toString().padStart(2, "0");
  const timerVisible = sessionActive && startedAt != null;

  const boardOnSelect = (i: number) => {
    if (userSettings.stickyDigitMode && lockedDigit != null) {
      const cell = cells[i];
      if (!cell.given) {
        setHistory((h) => [...h, cells]);
        setCells((prev) => {
          const next = prev.slice();
          next[i] = { ...prev[i], value: cell.value === lockedDigit ? 0 : lockedDigit };
          return next;
        });
        return;
      }
    }
    setSelected(i);
  };

  const digitPad = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
    const filled = userSettings.removeFilledDigitsFromPad && digitCounts[n] >= 9;
    if (filled) return <div key={n} className="aspect-square w-full" />;
    return (
      <DigitButton
        key={n}
        digit={n}
        disabled={!sessionActive || solved}
        locked={userSettings.stickyDigitMode && lockedDigit === n}
        stickyMode={userSettings.stickyDigitMode}
        onClick={() => {
          if (userSettings.stickyDigitMode) {
            if (lockedDigit === n) { setLockedDigit(null); return; }
            place(n);
          } else {
            place(n);
          }
        }}
        onLongPress={() => {
          if (!userSettings.stickyDigitMode) return;
          setLockedDigit((prev) => (prev === n ? null : n));
        }}
      />
    );
  });

  return (
    <>
      {/* Difficulty picker modal */}
      <Dialog open={diffModalOpen} onOpenChange={setDiffModalOpen}>
        <DialogContent className="max-w-xs w-[calc(100vw-2rem)] p-5 gap-4">
          <DialogHeader>
            <DialogTitle
              className="text-primary text-base text-center"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              SELECT DIFFICULTY
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDifficulty(d);
                  startGame(d);
                  setDiffModalOpen(false);
                }}
                className={`px-3 py-3 border-2 text-sm uppercase ${
                  difficulty === d
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:border-primary/60"
                }`}
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                {d}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] gap-4">
        <div className="space-y-3 min-w-0">

          {/* ── DESKTOP layout: board + controls side by side ── */}
          <div className="hidden lg:flex items-start gap-4">
            <SudokuBoard
              cells={cells}
              selected={selected}
              conflicts={conflicts}
              interactive={sessionActive && !solved}
              onSelect={boardOnSelect}
              highlightHouses={userSettings.highlightHouses}
              highlightSameNumbers={userSettings.highlightSameNumbers}
              lockedDigit={userSettings.stickyDigitMode ? lockedDigit : null}
              solution={solutionRef.current}
            />
            {/* Desktop controls: 3×3 pad + action row */}
            <div className="flex flex-col gap-2 w-[180px] shrink-0">
              <div className="grid grid-cols-3 gap-1">{digitPad}</div>
              {/* Undo / Erase / New */}
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  disabled={!sessionActive || solved || history.length === 0}
                  onClick={undo}
                  className="py-2 border-2 border-border hover:border-primary text-[9px] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  UNDO
                </button>
                <button
                  type="button"
                  disabled={!sessionActive || solved}
                  onClick={erase}
                  className="py-2 border-2 border-border hover:border-destructive text-[9px] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ERASE
                </button>
                <button
                  type="button"
                  onClick={() => setDiffModalOpen(true)}
                  className="py-2 border-2 border-border hover:border-primary text-[9px] flex items-center justify-center"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  NEW
                </button>
              </div>
              {/* Timer */}
              {timerVisible && userSettings.showTimer && (
                <div
                  className="py-2 border-2 border-border text-[11px] flex items-center justify-center gap-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ⌛ {mm}:{ss}
                </div>
              )}
            </div>
          </div>

          {/* ── MOBILE layout: board full-width, controls below ── */}
          <div className="lg:hidden space-y-3">
            <SudokuBoard
              cells={cells}
              selected={selected}
              conflicts={conflicts}
              interactive={sessionActive && !solved}
              onSelect={boardOnSelect}
              highlightHouses={userSettings.highlightHouses}
              highlightSameNumbers={userSettings.highlightSameNumbers}
              lockedDigit={userSettings.stickyDigitMode ? lockedDigit : null}
              solution={solutionRef.current}
            />
            {/* Digit row: 1–9 in a single horizontal line */}
            <div className="flex gap-3 justify-center">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
                const filled = userSettings.removeFilledDigitsFromPad && digitCounts[n] >= 9;
                if (filled) return <div key={n} className="flex-1 aspect-square" />;
                return (
                  <DigitButton
                    key={n}
                    digit={n}
                    disabled={!sessionActive || solved}
                    locked={userSettings.stickyDigitMode && lockedDigit === n}
                    stickyMode={userSettings.stickyDigitMode}
                    borderless
                    onClick={() => {
                      if (userSettings.stickyDigitMode) {
                        if (lockedDigit === n) { setLockedDigit(null); return; }
                        place(n);
                      } else {
                        place(n);
                      }
                    }}
                    onLongPress={() => {
                      if (!userSettings.stickyDigitMode) return;
                      setLockedDigit((prev) => (prev === n ? null : n));
                    }}
                  />
                );
              })}
            </div>
            {/* Erase + Undo row */}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!sessionActive || solved || history.length === 0}
                onClick={undo}
                className="flex-1 py-2 border-2 border-border hover:border-primary text-[10px] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                UNDO
              </button>
              <button
                type="button"
                disabled={!sessionActive || solved}
                onClick={erase}
                className="flex-1 py-2 border-2 border-border hover:border-destructive text-[10px] flex items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                ERASE
              </button>
            </div>
            {/* New game + timer row */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDiffModalOpen(true)}
                className="flex-1 py-2 border-2 border-border hover:border-primary text-[10px] flex items-center justify-center"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                NEW GAME
              </button>
              {timerVisible && userSettings.showTimer && (
                <div
                  className="flex-1 py-2 border-2 border-border text-[10px] flex items-center justify-center gap-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ⌛ {mm}:{ss}
                </div>
              )}
            </div>
          </div>

          {solved && (
            <div
              className="pixel-panel p-3 flex flex-wrap items-center gap-2 text-xs text-primary"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Trophy size={16} className="text-primary" />
              <span>SOLVED in {mm}:{ss}!</span>
              <Sparkles size={14} className="text-accent" />
              {submitResult?.isNewHigh && (
                <span className="ml-auto px-2 py-0.5 bg-accent text-card text-[10px]">
                  NEW BEST!
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar: leaderboard only */}
        <div className="min-w-0 space-y-3">
          <Leaderboard
            gameSlug={SUDOKU_GAME_SLUG}
            category={difficulty}
            formatScore={formatSudokuScore}
            title={`${difficulty.toUpperCase()} · LEADERBOARD`}
          />
        </div>
      </div>
    </>
  );
}

function SudokuBoard({
  cells,
  selected,
  conflicts,
  interactive,
  onSelect,
  highlightHouses,
  highlightSameNumbers,
  lockedDigit,
  solution,
}: {
  cells: Cell[];
  selected: number | null;
  conflicts: Set<number>;
  interactive: boolean;
  onSelect: (i: number) => void;
  highlightHouses: boolean;
  highlightSameNumbers: boolean;
  lockedDigit: number | null;
  solution: number[];
}) {
  const selectedValue = selected != null ? cells[selected].value : 0;
  // In sticky mode the "active digit" for highlighting is the locked digit, not the selected cell's value.
  const highlightDigit = lockedDigit ?? selectedValue;
  return (
    <div className="grid grid-cols-9 border-2 border-border bg-card aspect-square w-full max-w-[420px]">
      {cells.map((cell, i) => {
        const r = rowOf(i);
        const c = colOf(i);
        const isSelected = i === selected && lockedDigit == null;
        // Highlight the selected cell's row, column, and 3x3 box (classic Sudoku "houses").
        const inSameRow = selected != null && lockedDigit == null && rowOf(selected) === r;
        const inSameCol = selected != null && lockedDigit == null && colOf(selected) === c;
        const inSameBox = selected != null && lockedDigit == null && boxOf(selected) === boxOf(i);
        const isPeer = inSameRow || inSameCol || inSameBox;
        const sameValue =
          highlightDigit > 0 && cell.value === highlightDigit && !isSelected;
        const isConflict = conflicts.has(i);

        const borderTop = r % 3 === 0 && r !== 0 ? "border-t-2 border-t-black" : "";
        const borderLeft = c % 3 === 0 && c !== 0 ? "border-l-2 border-l-black" : "";

        // Layer: house tint, matching digits, selection / locked-digit highlight (strongest).
        let bg = "";
        if (isSelected) bg = "bg-primary/40";
        else if (highlightSameNumbers && sameValue) bg = "bg-primary/28";
        else if (highlightHouses && isPeer) bg = "bg-primary/16";

        const isWrong = !cell.given && cell.value !== 0 && solution.length > 0 && cell.value !== solution[i];
        const valueColor = cell.given
          ? "text-foreground"
          : isWrong || isConflict
            ? "text-destructive"
            : "text-primary";

        return (
          <button
            key={i}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onSelect(i)}
            className={`relative aspect-square flex items-center justify-center text-lg border border-border/50 transition-colors disabled:cursor-default disabled:opacity-60 ${borderTop} ${borderLeft} ${bg}`}
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            <span className={valueColor}>{cell.value === 0 ? "" : cell.value}</span>
          </button>
        );
      })}
    </div>
  );
}

function DigitButton({
  digit,
  disabled,
  locked,
  stickyMode,
  borderless = false,
  onClick,
  onLongPress,
}: {
  digit: number;
  disabled: boolean;
  locked: boolean;
  stickyMode: boolean;
  borderless?: boolean;
  onClick: () => void;
  onLongPress: () => void;
}) {
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const startHold = (e: React.TouchEvent | React.MouseEvent) => {
    if (!stickyMode) return;
    e.preventDefault();
    didLongPress.current = false;
    holdTimer.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, 500);
  };

  const cancelHold = () => {
    if (holdTimer.current != null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (didLongPress.current) return; // long-press already handled
        onClick();
      }}
      className={`aspect-square text-base disabled:opacity-40 disabled:pointer-events-none ${
        borderless
          ? locked
            ? "text-primary underline underline-offset-2"
            : "text-foreground"
          : locked
            ? "border-2 border-primary bg-primary/20 text-primary"
            : "border-2 border-border hover:border-primary disabled:hover:border-border"
      }`}
      style={{ fontFamily: "var(--font-pixel)" }}
    >
      {digit}
    </button>
  );
}

export default Sudoku;
