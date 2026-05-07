import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trophy } from "lucide-react";
import { useChallengeTemplates, useStartChallengeRun } from "@/hooks/useChallenges";
import { toast } from "sonner";

export const Route = createFileRoute("/challenges")({
  head: () => ({ meta: [{ title: "Challenges — Aura" }] }),
  component: ChallengesPage,
});

function ChallengesPage() {
  const { data: templates = [], isLoading } = useChallengeTemplates();
  const start = useStartChallengeRun();
  const [lastRun, setLastRun] = useState<string | null>(null);

  const onStart = async (id: string) => {
    try {
      const r = await start.mutateAsync(id);
      setLastRun(typeof r?.run_id === "string" ? r.run_id : null);
      toast.success("Challenge started — new quests added to your log.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start challenge");
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Trophy className="text-primary" size={28} />
        <div>
          <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            CHALLENGES
          </h1>
          <p
            className="text-xs text-muted-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Join a timed arc — tasks copy into your Quest Log and score as you finish to-dos.
          </p>
        </div>
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
    </div>
  );
}
