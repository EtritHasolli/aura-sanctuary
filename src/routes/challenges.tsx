import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trophy, Info } from "lucide-react";
import {
  useChallengeTemplates,
  useCreateChallengeTemplate,
  useStartChallengeRun,
} from "@/hooks/useChallenges";
import { toast } from "sonner";

export const Route = createFileRoute("/challenges")({
  head: () => ({ meta: [{ title: "Challenges — Aura" }] }),
  component: ChallengesPage,
});

function ChallengesPage() {
  const { data: templates = [], isLoading } = useChallengeTemplates();
  const start = useStartChallengeRun();
  const create = useCreateChallengeTemplate();
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(7);
  const [type, setType] = useState<"habit" | "daily" | "todo">("daily");
  const [title, setTitle] = useState("");
  const [difficulty, setDifficulty] = useState<"trivial" | "easy" | "medium" | "hard">("easy");
  const [sacredMask, setSacredMask] = useState(127);
  const [showInfo, setShowInfo] = useState(false);
  const DOW_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const toggleSacredDay = (mask: number, dow: number) => mask ^ (1 << dow);

  const onStart = async (id: string) => {
    try {
      const r = await start.mutateAsync(id);
      setLastRun(typeof r?.run_id === "string" ? r.run_id : null);
      toast.success("Challenge started — new quests added to your log.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start challenge");
    }
  };

  const onCreate = async () => {
    if (!name.trim()) {
      toast.error("Challenge name is required.");
      return;
    }
    try {
      await create.mutateAsync({
        name,
        description,
        duration_days: Math.max(1, Math.min(90, duration)),
        type,
        title: title.trim() || name.trim(),
        difficulty,
        sacred_days: type === "daily" ? sacredMask : 127,
      });
      toast.success("Custom challenge created.");
      setName("");
      setDescription("");
      setTitle("");
      setDuration(7);
      setType("daily");
      setDifficulty("easy");
      setSacredMask(127);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create challenge");
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="text-primary" size={28} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              CHALLENGES
            </h1>
            <button
              type="button"
              onClick={() => setShowInfo(true)}
              className="text-muted-foreground hover:text-primary"
              title="Challenges guide"
            >
              <Info size={16} />
            </button>
          </div>
          <p
            className="text-xs text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Join a timed arc — tasks copy into your Quest Log and score as you finish to-dos.
          </p>
        </div>
      </div>

      <div className="pixel-panel p-4 space-y-3">
        <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          CREATE CUSTOM CHALLENGE
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Challenge name"
            className="px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm"
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Tracked task title"
            className="px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description"
            className="sm:col-span-2 px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "habit" | "daily" | "todo")}
            className="px-2 py-1.5 bg-input border-2 border-border text-sm"
          >
            <option value="habit">Habit</option>
            <option value="daily">Daily</option>
            <option value="todo">To-do</option>
          </select>
          <select
            value={difficulty}
            onChange={(e) =>
              setDifficulty(e.target.value as "trivial" | "easy" | "medium" | "hard")
            }
            className="px-2 py-1.5 bg-input border-2 border-border text-sm"
          >
            <option value="trivial">Trivial</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <input
            type="number"
            min={1}
            max={90}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value || 7))}
            className="px-2 py-1.5 bg-input border-2 border-border text-sm"
            placeholder="Duration (days)"
          />
        </div>

        {type === "daily" && (
          <div
            className="text-[10px] text-muted-foreground"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Sacred days:
            <div className="flex flex-wrap gap-1 mt-1">
              {DOW_LABELS.map((lb, dow) => (
                <button
                  key={lb + dow}
                  type="button"
                  onClick={() => setSacredMask((m) => toggleSacredDay(m, dow))}
                  className={`px-1.5 py-0.5 border ${(sacredMask >> dow) & 1 ? "border-primary bg-primary/15 text-primary" : "border-border opacity-50"}`}
                >
                  {lb}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => void onCreate()}
          disabled={create.isPending}
          className="px-3 py-2 bg-primary text-primary-foreground disabled:opacity-50"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
        >
          {create.isPending ? "CREATING..." : "CREATE TRIAL"}
        </button>
      </div>

      {lastRun && (
        <div
          className="pixel-panel p-3 text-xs text-muted-foreground"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Last run id: {lastRun}
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Loading templates...</p>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="pixel-panel p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                  {t.name}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                <p
                  className="text-[10px] text-muted-foreground mt-2"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  {t.duration_days} days · tasks spawn in Quest Log
                </p>
              </div>
              <button
                onClick={() => onStart(t.id)}
                disabled={start.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground shrink-0 disabled:opacity-50"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              >
                {start.isPending ? "STARTING..." : "BEGIN"}
              </button>
            </div>
          ))}
        </div>
      )}
      {showInfo && (
        <div
          className="fixed inset-0 z-[130] bg-black/50 p-4 flex items-center justify-center"
          onClick={() => setShowInfo(false)}
        >
          <div
            className="pixel-panel w-full max-w-xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                CHALLENGES GUIDE
              </h3>
              <button
                type="button"
                onClick={() => setShowInfo(false)}
                className="px-2 py-0.5 border border-border hover:border-primary text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CLOSE
              </button>
            </div>
            <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
              <li>
                <strong className="text-foreground">Create challenge:</strong> Define the tracked
                task, type, duration, and difficulty.
              </li>
              <li>
                <strong className="text-foreground">Start run:</strong> Starting a challenge copies
                tasks into your Quest Log.
              </li>
              <li>
                <strong className="text-foreground">Scoring:</strong> Progress and leaderboard
                scores increase as you complete challenge tasks.
              </li>
              <li>
                <strong className="text-foreground">Daily timing:</strong> Daily-type challenges
                follow your daily schedule and repeat settings.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
