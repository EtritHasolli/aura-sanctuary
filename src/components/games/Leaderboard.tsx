import { Crown, Medal, Trophy, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  useMinigameLeaderboard,
  useMinigamePersonalBest,
  type LeaderboardRow,
} from "@/hooks/useMinigames";

export interface LeaderboardProps {
  gameSlug: string;
  category?: string;
  /**
   * Optional formatter for the score column (e.g. show duration alongside).
   * Receives the score and metadata, returns the display string for the row.
   */
  formatScore?: (score: number, metadata: Record<string, unknown> | null) => string;
  /** Title shown above the list (e.g. "EASY · LEADERBOARD"). */
  title?: string;
}

const fallbackFormat = (score: number) =>
  Number.isFinite(score) ? Math.round(score).toLocaleString() : "—";

export function Leaderboard({
  gameSlug,
  category = "",
  formatScore = fallbackFormat,
  title = "LEADERBOARD",
}: LeaderboardProps) {
  const { user } = useAuth();
  const { data: rows = [], isLoading } = useMinigameLeaderboard(gameSlug, category, 25);
  const { data: personalBest } = useMinigamePersonalBest(gameSlug, category);

  const myRowVisible = !!user && rows.some((r) => r.user_id === user.id);

  return (
    <div className="pixel-panel p-3 sm:p-4 flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-primary" />
        <h3
          className="text-sm text-primary uppercase tracking-wide"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {title}
        </h3>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading scores…</p>
      ) : rows.length === 0 ? (
        <p
          className="text-xs text-muted-foreground italic"
          style={{ fontFamily: "var(--font-display)" }}
        >
          No scores yet — be the first!
        </p>
      ) : (
        <ol className="flex flex-col gap-1">
          {rows.map((row) => (
            <LeaderboardRowView
              key={row.user_id}
              row={row}
              isSelf={!!user && row.user_id === user.id}
              formatScore={formatScore}
            />
          ))}
        </ol>
      )}

      {/* If the player is signed in, has a score, but isn't in the top 25,
          show their position separately so they can see how far they are. */}
      {user && personalBest && !myRowVisible && (
        <>
          <div className="my-1 border-t-2 border-border" />
          <div
            className="flex items-center justify-between gap-2 px-2 py-1.5 bg-primary/10 border-2 border-primary"
            title="Your personal best"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-[10px] text-primary"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                #{personalBest.rank}
              </span>
              <User size={12} className="text-primary shrink-0" />
              <span
                className="text-xs text-primary truncate"
                style={{ fontFamily: "var(--font-display)" }}
              >
                You
              </span>
            </div>
            <span
              className="text-xs text-primary"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {formatScore(personalBest.score, personalBest.metadata)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function LeaderboardRowView({
  row,
  isSelf,
  formatScore,
}: {
  row: LeaderboardRow;
  isSelf: boolean;
  formatScore: (score: number, metadata: Record<string, unknown> | null) => string;
}) {
  const rankIcon =
    row.rank === 1 ? (
      <Crown size={14} className="text-accent" />
    ) : row.rank === 2 ? (
      <Medal size={14} className="text-primary/80" />
    ) : row.rank === 3 ? (
      <Medal size={14} className="text-muted-foreground" />
    ) : null;

  return (
    <li
      className={`flex items-center gap-2 px-2 py-1.5 border-2 transition-colors ${
        isSelf
          ? "bg-primary/10 border-primary"
          : "border-transparent hover:border-border bg-secondary/30"
      }`}
    >
      <span
        className="w-6 text-[10px] text-muted-foreground tabular-nums"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        #{row.rank}
      </span>
      <div className="w-6 h-6 border border-border bg-card overflow-hidden shrink-0 flex items-center justify-center">
        {row.avatar_url ? (
          <img
            src={row.avatar_url}
            alt={row.display_name ?? "player"}
            className="w-full h-full object-cover pixelated"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <User size={12} className="text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-1">
        <span
          className={`text-xs truncate ${isSelf ? "text-primary" : "text-foreground"}`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {row.display_name ?? "Adventurer"}
          {isSelf && " (you)"}
        </span>
        {row.level != null && (
          <span
            className="text-[9px] text-muted-foreground"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            L{row.level}
          </span>
        )}
        {rankIcon}
      </div>
      <span
        className={`text-xs tabular-nums ${isSelf ? "text-primary" : "text-foreground"}`}
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        {formatScore(row.score, row.metadata)}
      </span>
    </li>
  );
}

export default Leaderboard;
