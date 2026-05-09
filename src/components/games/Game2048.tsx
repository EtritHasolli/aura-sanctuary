import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCcw, Trophy, Skull } from "lucide-react";
import { useSubmitMinigameScore } from "@/hooks/useMinigames";
import { Leaderboard } from "./Leaderboard";

const SIZE = 4;
const STORAGE_KEY = "aura.minigames.2048.best";
const GAME_2048_SLUG = "2048";
const GAME_2048_CATEGORY = "classic";

function format2048Score(score: number) {
  return Number.isFinite(score) ? Math.round(score).toLocaleString() : "—";
}

type Board = number[][];

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneBoard(b: Board): Board {
  return b.map((row) => row.slice());
}

function emptyCells(b: Board) {
  const cells: Array<[number, number]> = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (b[r][c] === 0) cells.push([r, c]);
    }
  }
  return cells;
}

function spawn(b: Board): Board {
  const empties = emptyCells(b);
  if (empties.length === 0) return b;
  const [r, c] = empties[Math.floor(Math.random() * empties.length)];
  const next = cloneBoard(b);
  next[r][c] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function startBoard(): Board {
  return spawn(spawn(emptyBoard()));
}

/** Slides + merges a single row to the LEFT. Returns new row + score gained. */
function slideRowLeft(row: number[]): { row: number[]; gained: number } {
  const filtered = row.filter((n) => n !== 0);
  const merged: number[] = [];
  let gained = 0;
  for (let i = 0; i < filtered.length; i++) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      const v = filtered[i] * 2;
      merged.push(v);
      gained += v;
      i++; // skip merged neighbour
    } else {
      merged.push(filtered[i]);
    }
  }
  while (merged.length < SIZE) merged.push(0);
  return { row: merged, gained };
}

function reverseRow(row: number[]) {
  return row.slice().reverse();
}

function transpose(b: Board): Board {
  const t = emptyBoard();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      t[c][r] = b[r][c];
    }
  }
  return t;
}

function move(b: Board, dir: "left" | "right" | "up" | "down") {
  let working = cloneBoard(b);
  if (dir === "right") working = working.map(reverseRow);
  if (dir === "up") working = transpose(working);
  if (dir === "down") working = transpose(working).map(reverseRow);

  let gained = 0;
  let moved = false;
  const next: Board = working.map((row) => {
    const { row: slid, gained: g } = slideRowLeft(row);
    gained += g;
    if (slid.some((v, i) => v !== row[i])) moved = true;
    return slid;
  });

  let finalBoard = next;
  if (dir === "right") finalBoard = finalBoard.map(reverseRow);
  if (dir === "up") finalBoard = transpose(finalBoard);
  if (dir === "down") finalBoard = transpose(finalBoard.map(reverseRow));

  return { board: finalBoard, gained, moved };
}

function hasMoves(b: Board) {
  if (emptyCells(b).length > 0) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = b[r][c];
      if (r + 1 < SIZE && b[r + 1][c] === v) return true;
      if (c + 1 < SIZE && b[r][c + 1] === v) return true;
    }
  }
  return false;
}

function reachedTarget(b: Board, target = 2048) {
  return b.some((row) => row.some((v) => v >= target));
}

const TILE_COLORS: Record<number, string> = {
  0: "bg-secondary/30 text-transparent",
  2: "bg-secondary text-foreground",
  4: "bg-secondary/80 text-foreground",
  8: "bg-accent/30 text-foreground",
  16: "bg-accent/50 text-foreground",
  32: "bg-accent/70 text-card",
  64: "bg-accent text-card",
  128: "bg-primary/40 text-card",
  256: "bg-primary/60 text-card",
  512: "bg-primary/80 text-card",
  1024: "bg-primary text-card",
  2048: "bg-primary text-card ring-2 ring-accent",
  4096: "bg-destructive/70 text-card",
  8192: "bg-destructive text-card",
};

function tileClass(v: number) {
  return TILE_COLORS[v] ?? "bg-destructive text-card";
}

export function Game2048() {
  const [board, setBoard] = useState<Board>(() => startBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const v = Number(window.localStorage.getItem(STORAGE_KEY) ?? "0");
    return Number.isFinite(v) ? v : 0;
  });
  const [won, setWon] = useState(false);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const [over, setOver] = useState(false);
  const [isNewHigh, setIsNewHigh] = useState(false);

  const boardRef = useRef(board);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  const submitMutation = useSubmitMinigameScore();
  const submittedScore = useRef<number | null>(null);

  const handleMove = useCallback((dir: "left" | "right" | "up" | "down") => {
    if (over) return;
    if (won && !keepPlaying) return;
    const { board: nextBoard, gained, moved } = move(boardRef.current, dir);
    if (!moved) return;
    const spawned = spawn(nextBoard);
    setBoard(spawned);
    setScore((s) => {
      const next = s + gained;
      if (next > best) {
        setBest(next);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, String(next));
        }
      }
      return next;
    });
    if (!won && reachedTarget(spawned, 2048)) {
      setWon(true);
    }
    if (!hasMoves(spawned)) {
      setOver(true);
    }
  }, [best, keepPlaying, over, won]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, "left" | "right" | "up" | "down"> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
        ArrowDown: "down",
        a: "left",
        d: "right",
        w: "up",
        s: "down",
        A: "left",
        D: "right",
        W: "up",
        S: "down",
        h: "left",
        l: "right",
        k: "up",
        j: "down",
      };
      const dir = map[e.key];
      if (!dir) return;
      e.preventDefault();
      handleMove(dir);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleMove]);

  // Touch swipe
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 24;
    if (Math.max(absX, absY) < threshold) return;
    if (absX > absY) {
      handleMove(dx > 0 ? "right" : "left");
    } else {
      handleMove(dy > 0 ? "down" : "up");
    }
  };

  const newGame = () => {
    setBoard(startBoard());
    setScore(0);
    setWon(false);
    setKeepPlaying(false);
    setOver(false);
    setIsNewHigh(false);
    submittedScore.current = null;
  };

  useEffect(() => {
    if (!over) return;
    if (submittedScore.current === score) return;
    submittedScore.current = score;
    const maxTile = boardRef.current.flat().reduce((m, v) => (v > m ? v : m), 0);
    submitMutation.mutate(
      {
        game_slug: GAME_2048_SLUG,
        category: GAME_2048_CATEGORY,
        score,
        metadata: { max_tile: maxTile },
      },
      {
        onSuccess: (res) => setIsNewHigh(res.is_new_high),
        onError: () => setIsNewHigh(false),
      },
    );
  }, [over, score, submitMutation]);

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] gap-4">
      <div className="space-y-3 min-w-0">
        <div
          className="relative grid gap-1 p-1 border-2 border-border bg-card w-full max-w-[420px] mx-auto select-none touch-none"
          style={{
            gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${SIZE}, minmax(0, 1fr))`,
            aspectRatio: "1 / 1",
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {board.flatMap((row, r) =>
            row.map((v, c) => (
              <div
                key={`${r}-${c}`}
                className={`aspect-square flex items-center justify-center border-2 border-border/50 text-base sm:text-lg ${tileClass(v)}`}
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                {v === 0 ? "" : v}
              </div>
            )),
          )}

          {over && (
            <Overlay
              icon={<Skull size={20} />}
              title="GAME OVER"
              subtitle={`Score: ${score}`}
              onAction={newGame}
              actionLabel="NEW GAME"
            />
          )}
          {won && !keepPlaying && !over && (
            <Overlay
              icon={<Trophy size={20} className="text-primary" />}
              title="YOU WON!"
              subtitle={`Score: ${score}`}
              onAction={() => setKeepPlaying(true)}
              actionLabel="KEEP PLAYING"
              secondaryAction={newGame}
              secondaryLabel="NEW GAME"
            />
          )}
        </div>

        <div className="grid grid-cols-3 gap-1 max-w-[200px] mx-auto sm:hidden">
          <div />
          <DirButton onClick={() => handleMove("up")} label="↑" />
          <div />
          <DirButton onClick={() => handleMove("left")} label="←" />
          <DirButton onClick={() => handleMove("down")} label="↓" />
          <DirButton onClick={() => handleMove("right")} label="→" />
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="pixel-panel p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <ScorePill label="SCORE" value={score} />
            <ScorePill label="BEST" value={best} accent />
          </div>
          {isNewHigh && over && (
            <span
              className="block px-2 py-1 border-2 border-accent text-accent text-[10px] text-center"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              NEW BEST!
            </span>
          )}
          <button
            type="button"
            onClick={newGame}
            className="w-full px-3 py-2 border-2 border-border hover:border-primary text-[10px] flex items-center justify-center gap-1"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            <RotateCcw size={11} /> NEW GAME
          </button>
        </div>
        <Leaderboard
          gameSlug={GAME_2048_SLUG}
          category={GAME_2048_CATEGORY}
          formatScore={format2048Score}
        />
        <p
          className="text-[10px] text-muted-foreground text-center leading-relaxed"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          ARROWS / WASD TO MOVE · SWIPE ON MOBILE · MERGE TILES TO REACH 2048
        </p>
      </div>
    </div>
  );
}

function DirButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="aspect-square border-2 border-border hover:border-primary text-base"
      style={{ fontFamily: "var(--font-pixel)" }}
    >
      {label}
    </button>
  );
}

function ScorePill({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`px-2 py-1 border-2 ${accent ? "border-accent text-accent" : "border-border text-foreground"} text-[10px]`}
      style={{ fontFamily: "var(--font-pixel)" }}
    >
      <div className="opacity-70">{label}</div>
      <div className="text-base leading-none">{value}</div>
    </div>
  );
}

function Overlay({
  icon,
  title,
  subtitle,
  onAction,
  actionLabel,
  secondaryAction,
  secondaryLabel,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onAction: () => void;
  actionLabel: string;
  secondaryAction?: () => void;
  secondaryLabel?: string;
}) {
  return (
    <div className="absolute inset-0 bg-card/85 flex flex-col items-center justify-center gap-2 p-4">
      <div className="flex items-center gap-2 text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
        {icon}
        <span className="text-base">{title}</span>
      </div>
      <div className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
        {subtitle}
      </div>
      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onAction}
          className="px-3 py-1.5 border-2 border-primary text-primary hover:bg-primary/10 text-[10px]"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {actionLabel}
        </button>
        {secondaryAction && (
          <button
            type="button"
            onClick={secondaryAction}
            className="px-3 py-1.5 border-2 border-border hover:border-primary text-[10px]"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export default Game2048;
