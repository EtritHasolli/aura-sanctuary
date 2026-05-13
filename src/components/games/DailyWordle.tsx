import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  dailyWordleLeaderboardScore,
  getDailySolutionWord,
  getLocalDayKey,
  isValidGuess,
  scoreGuess,
  type LetterScore,
} from "@/lib/games/dailyWord";
import { getWordBank } from "@/lib/games/wordBank";
import { useAuth } from "@/hooks/useAuth";
import { useSubmitMinigameScore } from "@/hooks/useMinigames";
import { Leaderboard } from "./Leaderboard";

const DAILY_WORDLE_GAME_SLUG = "daily-wordle";

function formatWordleLeaderboardScore(
  _score: number,
  metadata: Record<string, unknown> | null,
  opts?: { isSelf?: boolean },
) {
  const g = Number(metadata?.guesses ?? 0);
  const sec = Number(metadata?.elapsed_seconds ?? 0);
  if (!Number.isFinite(g) || g < 1) return "—";
  const mm = Math.floor(sec / 60).toString().padStart(2, "0");
  const ss = (Math.floor(sec) % 60).toString().padStart(2, "0");
  const tone = opts?.isSelf ? "text-primary" : "text-foreground";
  return (
    <div
      className={`flex flex-col items-end gap-0.5 leading-tight text-right ${tone}`}
      style={{ fontFamily: "var(--font-pixel)" }}
    >
      <span className="text-[10px] opacity-90">
        {g} {g === 1 ? "guess" : "guesses"}
      </span>
      <span className="text-xs tabular-nums font-semibold">{mm}:{ss}</span>
    </div>
  );
}

const STORAGE_KEY = "aura-daily-wordle-v1";
const STATS_KEY = "aura-daily-wordle-stats-v1";

const WORDLE_GREEN = "#6aaa64";
const WORDLE_YELLOW = "#c9b458";
const WORDLE_GRAY = "#787c7e";

type TileState = LetterScore | "empty" | "tbd";

type Persisted = {
  v: 1;
  dayKey: string;
  guesses: string[];
  /** ms timestamp when the first guess of the day was submitted */
  playStartedAt?: number | null;
};

type Stats = {
  games: number;
  wins: number;
  streak: number;
  maxStreak: number;
  lastWinDay: string | null;
};

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Persisted;
    if (p?.v !== 1 || typeof p.dayKey !== "string" || !Array.isArray(p.guesses)) return null;
    return p;
  } catch {
    return null;
  }
}

function savePersisted(p: Persisted) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) {
      return { games: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: null };
    }
    const s = JSON.parse(raw) as Partial<Stats>;
    return {
      games: Number(s.games) || 0,
      wins: Number(s.wins) || 0,
      streak: Number(s.streak) || 0,
      maxStreak: Number(s.maxStreak) || 0,
      lastWinDay: typeof s.lastWinDay === "string" ? s.lastWinDay : null,
    };
  } catch {
    return { games: 0, wins: 0, streak: 0, maxStreak: 0, lastWinDay: null };
  }
}

function saveStats(s: Stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function updateStatsAfterGame(dayKey: string, won: boolean) {
  const st = loadStats();
  st.games += 1;
  if (won) {
    st.wins += 1;
    const prev = st.lastWinDay;
    if (prev) {
      const d0 = new Date(prev + "T12:00:00");
      const d1 = new Date(dayKey + "T12:00:00");
      const diff = Math.round((d1.getTime() - d0.getTime()) / 86400000);
      st.streak = diff === 1 ? st.streak + 1 : 1;
    } else {
      st.streak = 1;
    }
    st.lastWinDay = dayKey;
    st.maxStreak = Math.max(st.maxStreak, st.streak);
  } else {
    st.streak = 0;
  }
  saveStats(st);
}

function normalizeGuesses(raw: unknown[]): string[] {
  return raw
    .filter((x): x is string => typeof x === "string" && x.length === 5)
    .map((x) => x.toLowerCase());
}

const ROWS = 6;
const COLS = 5;

function backfillStatsIfNeeded(dayKey: string, guessList: string[]) {
  const doneKey = `aura-daily-wordle-done-${dayKey}`;
  if (localStorage.getItem(doneKey)) return;
  const sol = getDailySolutionWord(dayKey);
  const won = guessList.some((x) => x.toLowerCase() === sol);
  const lost = guessList.length >= ROWS && !won;
  if (won || lost) {
    updateStatsAfterGame(dayKey, won);
    localStorage.setItem(doneKey, "1");
  }
}

const KEYBOARD_ROWS = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACK"],
];

export function DailyWordle() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const submitMutation = useSubmitMinigameScore();
  const bank = useMemo(() => getWordBank(), []);
  const dayKey = useMemo(() => getLocalDayKey(), []);
  const solution = useMemo(() => getDailySolutionWord(dayKey), [dayKey]);

  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState("");
  const [playStartedAt, setPlayStartedAt] = useState<number | null>(null);
  const [shakeRow, setShakeRow] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lbNotice, setLbNotice] = useState<string | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const lastLbSig = useRef<string | null>(null);

  const outcome = useMemo(() => {
    if (guesses.some((g) => g.toLowerCase() === solution)) return "won" as const;
    if (guesses.length >= ROWS) return "lost" as const;
    return null;
  }, [guesses, solution]);

  const { data: remoteRow, isFetched, isError } = useQuery({
    queryKey: ["daily_wordle_progress", user?.id, dayKey],
    queryFn: async () => {
      const uid = user!.id;
      const { data, error } = await supabase
        .from("daily_wordle_progress")
        .select("guesses, play_started_at")
        .eq("user_id", uid)
        .eq("day_key", dayKey)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    lastLbSig.current = null;
  }, [dayKey]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setCloudReady(true);
    } else {
      setCloudReady(false);
    }
  }, [authLoading, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    const p = loadPersisted();
    if (!p || p.dayKey !== dayKey) {
      setGuesses([]);
      setCurrent("");
      setPlayStartedAt(null);
      savePersisted({ v: 1, dayKey, guesses: [], playStartedAt: null });
      return;
    }
    const g = p.guesses.filter((x) => typeof x === "string" && x.length === 5);
    setGuesses(g);
    setCurrent("");
    setPlayStartedAt(typeof p.playStartedAt === "number" ? p.playStartedAt : null);
    backfillStatsIfNeeded(dayKey, g);
  }, [dayKey, user, authLoading]);

  useEffect(() => {
    if (!user || authLoading) return;
    if (!isFetched) return;

    let applied: string[] = [];

    if (isError) {
      const p = loadPersisted();
      if (p?.dayKey === dayKey) {
        applied = p.guesses.filter((x) => typeof x === "string" && x.length === 5);
        setGuesses(applied);
        setPlayStartedAt(typeof p.playStartedAt === "number" ? p.playStartedAt : null);
      } else {
        setGuesses([]);
        setPlayStartedAt(null);
      }
      setCurrent("");
      setCloudReady(true);
      backfillStatsIfNeeded(dayKey, applied);
      return;
    }

    setCurrent("");
    if (remoteRow != null && Array.isArray(remoteRow.guesses)) {
      applied = normalizeGuesses(remoteRow.guesses as unknown[]);
      setGuesses(applied);
      setPlayStartedAt(
        remoteRow.play_started_at
          ? new Date(remoteRow.play_started_at).getTime()
          : null,
      );
    } else {
      const p = loadPersisted();
      if (p?.dayKey === dayKey && p.guesses.length > 0) {
        applied = p.guesses.filter((x) => typeof x === "string" && x.length === 5);
        setGuesses(applied);
        setPlayStartedAt(typeof p.playStartedAt === "number" ? p.playStartedAt : null);
      } else {
        setGuesses([]);
        setPlayStartedAt(null);
      }
    }
    backfillStatsIfNeeded(dayKey, applied);
    setCloudReady(true);
  }, [user, authLoading, isFetched, isError, remoteRow, dayKey]);

  useEffect(() => {
    if (authLoading) return;
    if (user) return;
    savePersisted({ v: 1, dayKey, guesses, playStartedAt });
  }, [authLoading, user, dayKey, guesses, playStartedAt]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !cloudReady) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase.from("daily_wordle_progress").upsert(
        {
          user_id: user.id,
          day_key: dayKey,
          guesses,
          play_started_at: playStartedAt
            ? new Date(playStartedAt).toISOString()
            : null,
        },
        { onConflict: "user_id,day_key" },
      );
      if (!cancelled && error) {
        console.error("[daily wordle] save failed", error.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, cloudReady, dayKey, guesses, playStartedAt]);

  useEffect(() => {
    if (outcome !== "won" || !user) return;
    const sig = `${dayKey}:${guesses.join(",")}`;
    if (lastLbSig.current === sig) return;
    const start =
      playStartedAt ?? Date.now() - 300_000; /* legacy saves: conservative time penalty */
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - start) / 1000));
    const gCount = guesses.length;
    const score = dailyWordleLeaderboardScore(gCount, elapsedSeconds);
    lastLbSig.current = sig;
    submitMutation.mutate(
      {
        game_slug: DAILY_WORDLE_GAME_SLUG,
        category: dayKey,
        score,
        metadata: { guesses: gCount, elapsed_seconds: elapsedSeconds },
      },
      {
        onSuccess: (res) => {
          setLbNotice(res.is_new_high ? "New personal best for today!" : null);
        },
        onError: () => {
          lastLbSig.current = null;
          setLbNotice(null);
        },
      },
    );
  }, [outcome, user, dayKey, guesses, playStartedAt, submitMutation]);

  useEffect(() => {
    if (!outcome) return;
    const doneKey = `aura-daily-wordle-done-${dayKey}`;
    if (localStorage.getItem(doneKey)) return;
    updateStatsAfterGame(dayKey, outcome === "won");
    localStorage.setItem(doneKey, "1");
  }, [outcome, dayKey]);

  const letterKeyboardState = useMemo(() => {
    const m = new Map<string, LetterScore>();
    for (const g of guesses) {
      const scores = scoreGuess(g, solution);
      const letters = g.toUpperCase().split("");
      letters.forEach((ch, i) => {
        const s = scores[i]!;
        const prev = m.get(ch);
        const rank = (x: LetterScore) =>
          x === "correct" ? 3 : x === "present" ? 2 : 1;
        if (!prev || rank(s) > rank(prev)) m.set(ch, s);
      });
    }
    return m;
  }, [guesses, solution]);

  const submit = useCallback(() => {
    if (outcome) return;
    if (authLoading || (user && !cloudReady)) return;
    const g = current.toLowerCase();
    if (g.length !== COLS) {
      setMessage("Not enough letters");
      setShakeRow(guesses.length);
      setTimeout(() => setShakeRow(null), 500);
      return;
    }
    if (!isValidGuess(g, bank)) {
      setMessage("Not in word list");
      setShakeRow(guesses.length);
      setTimeout(() => setShakeRow(null), 500);
      return;
    }
    setMessage(null);
    if (guesses.length === 0) {
      setPlayStartedAt((t) => t ?? Date.now());
    }
    setGuesses((prev) => [...prev, g]);
    setCurrent("");
  }, [current, bank, outcome, guesses.length, user, cloudReady, authLoading]);

  const onKey = useCallback(
    (key: string) => {
      if (outcome) return;
      if (authLoading || (user && !cloudReady)) return;
      if (key === "ENTER") {
        submit();
        return;
      }
      if (key === "BACK" || key === "BACKSPACE") {
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (current.length >= COLS) return;
      if (/^[A-Z]$/.test(key)) {
        setCurrent((c) => c + key.toLowerCase());
      }
    },
    [current.length, outcome, submit, user, cloudReady, authLoading],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (outcome) return;
      if (authLoading || (user && !cloudReady)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      if (k === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if (k === "Backspace") {
        e.preventDefault();
        setCurrent((c) => c.slice(0, -1));
        return;
      }
      if (/^[a-zA-Z]$/.test(k) && current.length < COLS) {
        e.preventDefault();
        setCurrent((c) => c + k.toLowerCase());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submit, outcome, current.length, user, cloudReady, authLoading]);

  const stats = loadStats();

  const resetToday = async () => {
    if (!confirm("Clear today's progress? This cannot be undone.")) return;
    setGuesses([]);
    setCurrent("");
    setPlayStartedAt(null);
    lastLbSig.current = null;
    setLbNotice(null);
    savePersisted({ v: 1, dayKey, guesses: [], playStartedAt: null });
    localStorage.removeItem(`aura-daily-wordle-done-${dayKey}`);
    if (user) {
      const { error } = await supabase
        .from("daily_wordle_progress")
        .delete()
        .eq("user_id", user.id)
        .eq("day_key", dayKey);
      if (error) console.error("[daily wordle] reset failed", error.message);
      queryClient.setQueryData(["daily_wordle_progress", user.id, dayKey], null);
    }
  };

  const tiles: { letter: string; state: TileState }[][] = useMemo(() => {
    const rows: { letter: string; state: TileState }[][] = [];
    for (let r = 0; r < ROWS; r++) {
      const row: { letter: string; state: TileState }[] = [];
      const g = guesses[r];
      const scores = g ? scoreGuess(g, solution) : null;
      for (let c = 0; c < COLS; c++) {
        if (g) {
          row.push({ letter: g[c]!.toUpperCase(), state: scores![c]! });
        } else if (r === guesses.length) {
          const ch = current[c] ?? "";
          row.push({
            letter: ch ? ch.toUpperCase() : "",
            state: ch ? "tbd" : "empty",
          });
        } else {
          row.push({ letter: "", state: "empty" });
        }
      }
      rows.push(row);
    }
    return rows;
  }, [guesses, current, solution]);

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] gap-4">
      <div className="flex flex-col items-center gap-6 max-w-lg mx-auto w-full min-w-0">
      <div className="text-center space-y-1 w-full">
        {(authLoading || (user && !cloudReady)) && (
          <p
            className="text-[10px] text-primary/90"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Loading your puzzle…
          </p>
        )}
        <div
          className="flex flex-wrap justify-center gap-4 text-[10px] text-muted-foreground"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          <span>{dayKey}</span>
          <span>WINS {stats.wins}/{stats.games}</span>
          <span>STREAK {stats.streak}</span>
          <span>MAX {stats.maxStreak}</span>
        </div>
      </div>

      {message && (
        <p
          className="text-xs text-destructive"
          style={{ fontFamily: "var(--font-pixel)" }}
          role="status"
        >
          {message}
        </p>
      )}

      <div
        className="grid gap-1.5 sm:gap-2"
        style={{
          gridTemplateRows: `repeat(${ROWS}, minmax(0, 1fr))`,
          gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))`,
        }}
      >
        {tiles.map((row, ri) => (
          <div key={ri} className="contents">
            {row.map((cell, ci) => (
              <div
                key={ci}
                className={cn(
                  "w-12 h-12 sm:w-14 sm:h-14 border-2 flex items-center justify-center text-lg sm:text-xl font-bold uppercase select-none transition-colors",
                  shakeRow === ri && "border-destructive",
                  cell.state === "empty" && "border-border bg-secondary/30",
                  cell.state === "tbd" && "border-border bg-background",
                  cell.state === "correct" && "border-transparent text-white",
                  cell.state === "present" && "border-transparent text-white",
                  cell.state === "absent" && "border-transparent text-white",
                )}
                style={{
                  fontFamily: "var(--font-display), ui-sans-serif, system-ui",
                  ...(cell.state === "correct"
                    ? { backgroundColor: WORDLE_GREEN }
                    : cell.state === "present"
                      ? { backgroundColor: WORDLE_YELLOW }
                      : cell.state === "absent"
                        ? { backgroundColor: WORDLE_GRAY }
                        : {}),
                }}
              >
                {cell.letter}
              </div>
            ))}
          </div>
        ))}
      </div>

      {outcome === "won" && (
        <div
          className="text-primary text-sm text-center space-y-1"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          <p className="flex items-center justify-center gap-2">
            <Trophy size={16} />
            You got it in {guesses.length} {guesses.length === 1 ? "try" : "tries"}!
          </p>
          {!user && (
            <p className="text-[10px] text-muted-foreground">
              Sign in to post your result on today&apos;s leaderboard.
            </p>
          )}
          {lbNotice && (
            <p className="text-[10px] text-accent flex items-center justify-center gap-1">
              <Sparkles size={12} />
              {lbNotice}
            </p>
          )}
        </div>
      )}
      {outcome === "lost" && (
        <p className="text-sm" style={{ fontFamily: "var(--font-pixel)" }}>
          The word was{" "}
          <span className="text-primary font-semibold uppercase">{solution}</span>
        </p>
      )}

      <div className="w-full space-y-1">
        {KEYBOARD_ROWS.map((kr, i) => (
          <div key={i} className="flex gap-0.5 sm:gap-1 justify-center">
            {kr.map((key) => {
              const wide = key === "ENTER" || key === "BACK";
              const st = key.length === 1 ? letterKeyboardState.get(key) : undefined;
              const bg =
                st === "correct"
                  ? WORDLE_GREEN
                  : st === "present"
                    ? WORDLE_YELLOW
                    : st === "absent"
                      ? WORDLE_GRAY
                      : undefined;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={
                    !!outcome || authLoading || (!!user && !cloudReady)
                  }
                  onClick={() => onKey(key)}
                  className={cn(
                    "flex-1 rounded py-3 text-[8px] sm:text-[10px] font-semibold uppercase min-h-9 sm:min-h-11 flex items-center justify-center border-2 border-border",
                    !bg && "bg-secondary hover:bg-secondary/80",
                    wide ? "flex-[1.6] sm:flex-[1.8]" : "flex-1",
                  )}
                  style={{
                    fontFamily: "var(--font-pixel)",
                    ...(bg
                      ? { backgroundColor: bg, color: "#fff", borderColor: bg }
                      : {}),
                  }}
                >
                  {key === "BACK" ? "⌫" : key}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      </div>

      <div className="min-w-0 space-y-3 flex flex-col">
        <button
          type="button"
          onClick={() => void resetToday()}
          className="flex items-center justify-center px-3 py-2 border-2 border-border hover:border-primary text-xs w-full text-muted-foreground hover:text-primary"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Reset today
        </button>
        <Leaderboard
          gameSlug={DAILY_WORDLE_GAME_SLUG}
          category={dayKey}
          formatScore={formatWordleLeaderboardScore}
          title={`DAILY WORDLE · ${dayKey}`}
        />
      </div>
    </div>
  );
}
