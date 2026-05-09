import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  Gamepad2,
  Grid3x3,
  Hash,
  Search,
  Trophy,
} from "lucide-react";
import { Sudoku } from "@/components/games/Sudoku";
import { Game2048 } from "@/components/games/Game2048";
import { DailyWordle } from "@/components/games/DailyWordle";
import { WordSearchGame } from "@/components/games/WordSearchGame";
import { GameRulesButton } from "@/components/games/GameRules";
import { SudokuSettingsButton } from "@/components/games/SudokuSettingsButton";

export const Route = createFileRoute("/minigames")({
  head: () => ({ meta: [{ title: "Minigames — Aura" }] }),
  component: MinigamesPage,
});

type GameKey = "sudoku" | "2048" | "daily-wordle" | "word-search";

interface GameMeta {
  key: GameKey;
  name: string;
  blurb: string;
  longBlurb: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  rules: React.ReactNode;
  /** When false, hide the leaderboard badge (game is offline / daily). */
  leaderboard?: boolean;
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
        The board starts <strong>empty</strong>. Choose a difficulty, then tap{" "}
        <strong>START</strong> to load a puzzle (givens appear) and begin the timer. The number
        pad is off until then.
      </li>
      <li>
        Pre-filled (given) cells are part of the puzzle and can&apos;t be
        changed.
      </li>
      <li>
        After <strong>START</strong>, tap or click a cell to select it, then either tap a number on
        the on-screen keypad or press <strong>1-9</strong> on your keyboard.
      </li>
      <li>
        Use <strong>Backspace</strong> / <strong>Delete</strong> or the ERASE button to clear a
        cell. Arrow keys move the selection (same session — inactive before <strong>START</strong>).
      </li>
      <li>
        Conflicts (the same digit twice in a row, column, or box) are
        highlighted in red.
      </li>
    </ul>
    <p className="text-muted-foreground">
      <strong>Flow:</strong> choose a difficulty, then tap <strong>START</strong> to load a
      puzzle and begin the timer. Faster solves earn higher scores. Each difficulty (Easy /
      Medium / Hard) has its own leaderboard.
    </p>
  </>
);

const DAILY_WORDLE_RULES = (
  <>
    <p>
      Guess the <strong>five-letter word</strong> in six tries. Each guess must be a valid word
      from the game dictionary.
    </p>
    <p>
      <strong>One puzzle per day</strong> (your local calendar date).{" "}
      <strong>Everyone gets the same word</strong> on a given day.
    </p>
    <ul className="list-disc list-inside space-y-1">
      <li>
        <strong>Green</strong> means the letter is correct in that spot.
      </li>
      <li>
        <strong>Yellow</strong> means the letter appears in the word but not in that spot.
      </li>
      <li>
        <strong>Gray</strong> means the letter does not appear in the word (or extra copies
        are already used).
      </li>
      <li>
        When signed in, your <strong>guesses are saved on the server</strong> for that day
        (switch devices or browsers and your progress follows you). Guests only have progress
        on this browser; clearing site data resets a guest game.
      </li>
      <li>
        The <strong>daily leaderboard</strong> is for signed-in players only. You are ranked by{" "}
        <strong>fewest guesses</strong> first; ties break on <strong>fastest time</strong> from
        your first guess to the winning word. <strong>One best score per day</strong> while
        signed in.
      </li>
    </ul>
    <p className="text-muted-foreground">
      Use the on-screen keyboard or type letters on your keyboard; Enter submits, Backspace
      deletes. Use <strong>Reset today</strong> above the leaderboard to clear today&apos;s
      puzzle (and your cloud save when signed in).
    </p>
  </>
);

const WORD_SEARCH_RULES = (
  <>
    <p>
      Find every hidden word in the letter grid. Words read in straight lines:{" "}
      <strong>horizontal, vertical, or diagonal</strong>, forward or backward.
    </p>
    <ul className="list-disc list-inside space-y-1">
      <li>
        <strong>Tap</strong> one letter, then <strong>tap</strong> another at the end of the word
        along a straight line — horizontal, vertical, or diagonal, like drawing a ruler from start to
        end. Words can read <strong>forward or backward</strong>.
      </li>
      <li>
        Words come from the shared dictionary: mostly five letters, plus shorter and longer
        words (about four to nine letters) for variety.
      </li>
      <li>
        Use <strong>Today&apos;s grid</strong> for a deterministic daily layout, or{" "}
        <strong>New puzzle</strong> for a fresh random grid.
      </li>
      <li>
        The <strong>leaderboard</strong> only counts completions of Today&apos;s grid (same
        puzzle for everyone). Sign in to save your best time.
      </li>
    </ul>
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
  {
    key: "daily-wordle",
    name: "Daily Wordle",
    blurb: "One five-letter word per day — same answer for everyone.",
    longBlurb:
      "Classic Wordle-style play: daily leaderboard, local stats, six guesses.",
    icon: CalendarDays,
    accent: "text-green-600 dark:text-green-400",
    rules: DAILY_WORDLE_RULES,
  },
  {
    key: "word-search",
    name: "Word Search",
    blurb: "Hunt words in every direction on a letter grid.",
    longBlurb:
      "Mixed word lengths on the grid; today’s puzzle has a speed leaderboard and random grids are practice.",
    icon: Search,
    accent: "text-sky-600 dark:text-sky-400",
    rules: WORD_SEARCH_RULES,
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
              {g.leaderboard !== false && (
                <div
                  className="mt-auto flex items-center gap-1 text-[10px] text-accent"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  <Trophy size={11} />
                  <span>LEADERBOARD ENABLED</span>
                </div>
              )}
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
            className="flex items-center px-3 py-1.5 border-2 border-border hover:border-primary text-[10px]"
            style={{ fontFamily: "var(--font-pixel)" }}
            aria-label="Back to minigames"
          >
            BACK
          </button>
          <div className="min-w-0">
            <h1
              className="text-2xl text-primary flex items-center gap-2"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Icon size={20} className={meta.accent} />
              <span className="truncate">{meta.name.toUpperCase()}</span>
            </h1>
            <p className="text-sm text-muted-foreground truncate leading-snug">{meta.blurb}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meta.key === "sudoku" && <SudokuSettingsButton />}
          <GameRulesButton title={meta.name} buttonLabel={`How to play ${meta.name}`}>
            {meta.rules}
          </GameRulesButton>
        </div>
      </div>

      <div className="pixel-panel p-4 sm:p-6">
        {meta.key === "sudoku" && <Sudoku />}
        {meta.key === "2048" && <Game2048 />}
        {meta.key === "daily-wordle" && <DailyWordle />}
        {meta.key === "word-search" && <WordSearchGame />}
      </div>
    </div>
  );
}
