import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ChevronRight, Gamepad2, Grid3x3, Hash, Trophy } from "lucide-react";
import { Sudoku } from "@/components/games/Sudoku";
import { Game2048 } from "@/components/games/Game2048";
import { GameRulesButton } from "@/components/games/GameRules";

export const Route = createFileRoute("/minigames")({
  head: () => ({ meta: [{ title: "Minigames — Aura" }] }),
  component: MinigamesPage,
});

type GameKey = "sudoku" | "2048";

interface GameMeta {
  key: GameKey;
  name: string;
  blurb: string;
  longBlurb: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  rules: React.ReactNode;
}

const SUDOKU_RULES = (
  <>
    <p>
      Fill the 9×9 grid so that every <strong>row</strong>, every{" "}
      <strong>column</strong>, and every <strong>3×3 box</strong> contains the
      digits 1-9 with no repeats.
    </p>
    <ul className="list-disc list-inside space-y-1">
      <li>
        Pre-filled (given) cells are part of the puzzle and can&apos;t be
        changed.
      </li>
      <li>
        Tap or click a cell to select it, then either tap a number on the on-
        screen keypad or press <strong>1-9</strong> on your keyboard.
      </li>
      <li>
        Use <strong>Backspace</strong> / <strong>Delete</strong> or the ERASE
        button to clear a cell. Arrow keys move the selection.
      </li>
      <li>
        Conflicts (the same digit twice in a row, column, or box) are
        highlighted in red.
      </li>
    </ul>
    <p className="text-muted-foreground">
      <strong>Scoring:</strong> the timer starts on your first move. Faster
      solves earn higher scores. Each difficulty (Easy / Medium / Hard) has its
      own leaderboard.
    </p>
  </>
);

const GAME_2048_RULES = (
  <>
    <p>
      Slide tiles in any direction. When two tiles with the same number touch,
      they <strong>merge into one</strong> with double the value.
    </p>
    <ul className="list-disc list-inside space-y-1">
      <li>
        Use <strong>Arrow keys</strong> or <strong>WASD</strong> on desktop, or
        swipe on mobile.
      </li>
      <li>A new 2 (or occasionally a 4) appears after every successful move.</li>
      <li>
        Reach the <strong>2048</strong> tile to win — you can keep playing for a
        higher score afterwards.
      </li>
      <li>
        The game ends when no moves are possible and your final score is
        submitted to the leaderboard.
      </li>
    </ul>
    <p className="text-muted-foreground">
      <strong>Tip:</strong> pick a corner and keep your largest tile there;
      avoid moves that scatter your big tiles.
    </p>
  </>
);

const GAMES: GameMeta[] = [
  {
    key: "sudoku",
    name: "Sudoku",
    blurb: "Fill the grid · 1-9 once per row, column & box.",
    longBlurb:
      "Classic logic puzzle. Three difficulties, separate leaderboards — fastest solve wins.",
    icon: Grid3x3,
    accent: "text-primary",
    rules: SUDOKU_RULES,
  },
  {
    key: "2048",
    name: "2048",
    blurb: "Merge identical tiles to reach the legendary 2048.",
    longBlurb:
      "Slide and combine. Highest score on game-over locks in your spot on the leaderboard.",
    icon: Hash,
    accent: "text-accent",
    rules: GAME_2048_RULES,
  },
];

function MinigamesPage() {
  const [active, setActive] = useState<GameKey | null>(null);

  if (active == null) {
    return <GameList onSelect={setActive} />;
  }

  const meta = GAMES.find((g) => g.key === active)!;
  return <GameView meta={meta} onBack={() => setActive(null)} />;
}

function GameList({ onSelect }: { onSelect: (k: GameKey) => void }) {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Gamepad2 className="text-primary" size={24} />
        <div>
          <h1
            className="text-2xl text-primary"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            MINIGAMES
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a game. Climb the leaderboards. More games coming soon.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((g) => {
          const Icon = g.icon;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => onSelect(g.key)}
              className="pixel-panel p-4 text-left flex flex-col gap-3 hover:border-primary transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div
                  className={`w-12 h-12 border-2 border-border bg-secondary/50 flex items-center justify-center ${g.accent}`}
                >
                  <Icon size={24} />
                </div>
                <ChevronRight
                  size={18}
                  className="text-muted-foreground group-hover:text-primary transition-colors"
                />
              </div>
              <div>
                <h3
                  className="text-lg text-primary"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  {g.name}
                </h3>
                <p
                  className="text-sm text-muted-foreground mt-1"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {g.longBlurb}
                </p>
              </div>
              <div
                className="mt-auto flex items-center gap-1 text-[10px] text-accent"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                <Trophy size={11} />
                <span>LEADERBOARD ENABLED</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GameView({ meta, onBack }: { meta: GameMeta; onBack: () => void }) {
  const Icon = meta.icon;
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 px-3 py-1.5 border-2 border-border hover:border-primary text-[10px]"
            style={{ fontFamily: "var(--font-pixel)" }}
            aria-label="Back to minigames"
          >
            <ArrowLeft size={12} />
            <span>BACK</span>
          </button>
          <div className="min-w-0">
            <h1
              className="text-2xl text-primary flex items-center gap-2"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Icon size={20} className={meta.accent} />
              <span className="truncate">{meta.name.toUpperCase()}</span>
            </h1>
            <p className="text-xs text-muted-foreground truncate">{meta.blurb}</p>
          </div>
        </div>
        <GameRulesButton title={meta.name} buttonLabel={`How to play ${meta.name}`}>
          {meta.rules}
        </GameRulesButton>
      </div>

      <div className="pixel-panel p-4 sm:p-6">
        {meta.key === "sudoku" && <Sudoku />}
        {meta.key === "2048" && <Game2048 />}
      </div>
    </div>
  );
}
