import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Eraser, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useSubmitMinigameScore } from "@/hooks/useMinigames";
import { Leaderboard } from "./Leaderboard";

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

/**
 * Each puzzle is 81 characters (row-major). 0 = empty, 1..9 = given.
 * Win is detected via classic Sudoku rules (no duplicate in row/col/box) so
 * we don't need to store the solution.
 */
const PUZZLE_BANK: Record<Difficulty, string[]> = {
  easy: [
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    "100489006730000040000001295007120600500703008006095700914600000020000037800512004",
    "020608000580009700000040000370000500600000004008000013000020000009800036000305070",
    "300040000050780020906100000800009005060030070500200001000007309030014050000050006",
  ],
  medium: [
    "000260701680070090190004500820100040004602900050003028009300074040050036703018000",
    "002030008000008000031020000060050270010000050097060030000040910000700000400090700",
    "008007000200008100000049000020000600000060040000300920080000004500004001070090030",
  ],
  hard: [
    "800000000003600000070090200050007000000045700000100030001000068008500010090000400",
    "000000010400000000020000000000050407008000300001090000300400200050100000000806000",
  ],
};

type Cell = {
  value: number; // 0 = empty
  given: boolean;
};

function parsePuzzle(puzzle: string): Cell[] {
  return puzzle.split("").map((c) => {
    const n = Number(c);
    return { value: Number.isFinite(n) && n >= 1 && n <= 9 ? n : 0, given: n >= 1 };
  });
}

function pickPuzzle(difficulty: Difficulty): string {
  const bank = PUZZLE_BANK[difficulty];
  return bank[Math.floor(Math.random() * bank.length)];
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
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [seed, setSeed] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [cells, setCells] = useState<Cell[]>(() => parsePuzzle(pickPuzzle("easy")));
  const [solved, setSolved] = useState(false);
  // startedAt is null until the player makes their first real input;
  // the timer only starts ticking from that moment.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [completedAt, setCompletedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [submitResult, setSubmitResult] = useState<
    | { isNewHigh: boolean; durationSeconds: number; score: number }
    | null
  >(null);
  const submitMutation = useSubmitMinigameScore();
  const submittedKey = useRef<string | null>(null);

  useEffect(() => {
    if (startedAt == null || completedAt != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [completedAt, startedAt]);

  useEffect(() => {
    setCells(parsePuzzle(pickPuzzle(difficulty)));
    setSelected(null);
    setSolved(false);
    setStartedAt(null);
    setCompletedAt(null);
    setSubmitResult(null);
    submittedKey.current = null;
  }, [difficulty, seed]);

  const conflicts = useMemo(() => findConflicts(cells), [cells]);

  const startTimerIfNeeded = useCallback(() => {
    setStartedAt((s) => s ?? Date.now());
  }, []);

  const place = useCallback(
    (value: number) => {
      if (selected == null) return;
      const cell = cells[selected];
      if (cell.given) return;
      startTimerIfNeeded();
      setCells((prev) => {
        const next = prev.slice();
        next[selected] = { ...prev[selected], value };
        return next;
      });
    },
    [selected, cells, startTimerIfNeeded],
  );

  const erase = useCallback(() => {
    if (selected == null) return;
    const cell = cells[selected];
    if (cell.given) return;
    startTimerIfNeeded();
    setCells((prev) => {
      const next = prev.slice();
      next[selected] = { ...prev[selected], value: 0 };
      return next;
    });
  }, [selected, cells, startTimerIfNeeded]);

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

  // Keyboard input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selected == null) return;
      if (e.key >= "1" && e.key <= "9") {
        place(Number(e.key));
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, place, erase]);

  const elapsedSeconds =
    startedAt == null
      ? 0
      : Math.max(0, Math.floor(((completedAt ?? now) - startedAt) / 1000));
  const mm = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const ss = (elapsedSeconds % 60).toString().padStart(2, "0");
  const timerActive = startedAt != null;

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] gap-4">
      <div className="space-y-3 min-w-0">
        <div className="flex flex-col items-center lg:flex-row lg:items-start gap-4">
          <SudokuBoard
            cells={cells}
            selected={selected}
            conflicts={conflicts}
            onSelect={setSelected}
          />
          <div className="flex flex-col gap-2 w-full lg:w-auto">
            <div className="grid grid-cols-3 gap-1 w-full max-w-[180px] mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => place(n)}
                  className="aspect-square border-2 border-border hover:border-primary text-base"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={erase}
              className="px-3 py-2 border-2 border-border hover:border-destructive text-[10px] flex items-center justify-center gap-1"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Eraser size={12} /> ERASE
            </button>
            <div
              className={`px-3 py-2 border-2 text-[11px] flex items-center justify-center gap-1 ${
                timerActive
                  ? "border-border text-foreground"
                  : "border-border/60 text-muted-foreground/70 italic"
              }`}
              style={{ fontFamily: "var(--font-pixel)" }}
              title={timerActive ? undefined : "Make a move to start the timer"}
            >
              ⌛ {timerActive ? `${mm}:${ss}` : "--:--"}
            </div>
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

      <div className="min-w-0 space-y-3">
        <div className="pixel-panel p-3 space-y-2">
          <div className="grid grid-cols-3 gap-1">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={`px-1 py-1.5 border-2 text-[10px] uppercase ${
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
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="w-full px-3 py-2 border-2 border-border hover:border-primary text-[10px] flex items-center justify-center gap-1"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            <RotateCcw size={11} /> NEW PUZZLE
          </button>
        </div>
        <Leaderboard
          gameSlug={SUDOKU_GAME_SLUG}
          category={difficulty}
          formatScore={formatSudokuScore}
          title={`${difficulty.toUpperCase()} · LEADERBOARD`}
        />
        <p
          className="text-[10px] text-muted-foreground text-center leading-relaxed"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          TAP A CELL · TYPE 1-9 ON KEYBOARD OR USE THE PAD · BACKSPACE TO ERASE · ARROWS TO NAVIGATE
        </p>
      </div>
    </div>
  );
}

function SudokuBoard({
  cells,
  selected,
  conflicts,
  onSelect,
}: {
  cells: Cell[];
  selected: number | null;
  conflicts: Set<number>;
  onSelect: (i: number) => void;
}) {
  const selectedValue = selected != null ? cells[selected].value : 0;
  return (
    <div className="grid grid-cols-9 border-2 border-border bg-card aspect-square w-full max-w-[420px]">
      {cells.map((cell, i) => {
        const r = rowOf(i);
        const c = colOf(i);
        const isSelected = i === selected;
        const isPeer =
          selected != null &&
          (rowOf(selected) === r || colOf(selected) === c || boxOf(selected) === boxOf(i));
        const sameValue =
          selectedValue > 0 && cell.value === selectedValue && i !== selected;
        const isConflict = conflicts.has(i);

        const borderTop = r % 3 === 0 && r !== 0 ? "border-t-2 border-t-primary/70" : "";
        const borderLeft = c % 3 === 0 && c !== 0 ? "border-l-2 border-l-primary/70" : "";

        let bg = "";
        if (isSelected) bg = "bg-primary/30";
        else if (sameValue) bg = "bg-primary/15";
        else if (isPeer) bg = "bg-secondary/40";

        const valueColor = cell.given
          ? "text-foreground"
          : isConflict
            ? "text-destructive"
            : "text-primary";

        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`relative aspect-square flex items-center justify-center text-lg border border-border/50 transition-colors ${borderTop} ${borderLeft} ${bg}`}
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            <span className={valueColor}>{cell.value === 0 ? "" : cell.value}</span>
          </button>
        );
      })}
    </div>
  );
}

export default Sudoku;
