import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePomodoro, type PomodoroSession } from "./PomodoroContext";

const MAX_MINUTES = 240;

/** Inputs are kept as strings so a field can be cleared while typing a new value. */
type DraftSession = { focus: string; break: string };

const PRESETS: { label: string; plan: PomodoroSession[] }[] = [
  { label: "CLASSIC 25/5", plan: [{ focusMinutes: 25, breakMinutes: 5 }] },
  { label: "DEEP 50/10", plan: [{ focusMinutes: 50, breakMinutes: 10 }] },
  {
    label: "4× + LONG BREAK",
    plan: [
      { focusMinutes: 25, breakMinutes: 5 },
      { focusMinutes: 25, breakMinutes: 5 },
      { focusMinutes: 25, breakMinutes: 5 },
      { focusMinutes: 25, breakMinutes: 20 },
    ],
  },
];

function toDraft(plan: PomodoroSession[]): DraftSession[] {
  return plan.map((s) => ({ focus: String(s.focusMinutes), break: String(s.breakMinutes) }));
}

function parseMinutes(raw: string): number | null {
  const n = Number(raw);
  if (!raw.trim() || !Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded >= 1 && rounded <= MAX_MINUTES ? rounded : null;
}

/** Edits the Pomodoro session queue. Used on the Settings page and in the Sanctuary popup. */
export function PomodoroSessionEditor({ onSaved }: { onSaved?: () => void }) {
  const { sessionPlan, updateSessionPlan, running } = usePomodoro();
  const [draft, setDraft] = useState<DraftSession[]>(() => toDraft(sessionPlan));

  // Pick up changes saved elsewhere (other editor instance, DB load on login).
  useEffect(() => {
    setDraft(toDraft(sessionPlan));
  }, [sessionPlan]);

  const patch = (index: number, field: keyof DraftSession, value: string) => {
    const clean = value.replace(/[^\d]/g, "").slice(0, 3);
    setDraft((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: clean } : row)));
  };

  const addSession = () => {
    setDraft((rows) => [...rows, { ...(rows[rows.length - 1] ?? { focus: "25", break: "5" }) }]);
  };

  const removeSession = (index: number) => {
    setDraft((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  };

  const totalMinutes = draft.reduce(
    (sum, row) => sum + (parseMinutes(row.focus) ?? 0) + (parseMinutes(row.break) ?? 0),
    0,
  );

  const save = () => {
    const parsed: PomodoroSession[] = [];
    for (const [i, row] of draft.entries()) {
      const focusMinutes = parseMinutes(row.focus);
      const breakMinutes = parseMinutes(row.break);
      if (focusMinutes == null || breakMinutes == null) {
        toast.error(`Session ${i + 1}: enter minutes between 1 and ${MAX_MINUTES}.`);
        return;
      }
      parsed.push({ focusMinutes, breakMinutes });
    }
    updateSessionPlan(parsed);
    toast.success(
      running ? "Saved — applies after the current phase." : "Pomodoro sessions saved.",
    );
    onSaved?.();
  };

  const fieldClass =
    "mt-1 w-full px-2 py-1 bg-input border-2 border-border focus:border-primary outline-none text-sm tabular-nums";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => setDraft(toDraft(preset.plan))}
            className="px-2 py-1 border-2 border-border hover:border-primary"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
        {draft.map((row, index) => {
          const focusInvalid = parseMinutes(row.focus) == null;
          const breakInvalid = parseMinutes(row.break) == null;
          return (
            <div key={index} className="border border-border p-2 space-y-1 bg-background/30">
              <div
                className="text-[11px] text-muted-foreground"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                Session {index + 1}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                <label className="text-xs text-muted-foreground">
                  Focus (min)
                  <input
                    inputMode="numeric"
                    value={row.focus}
                    onChange={(e) => patch(index, "focus", e.target.value)}
                    aria-invalid={focusInvalid}
                    className={`${fieldClass} ${focusInvalid ? "border-destructive" : ""}`}
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  Break (min)
                  <input
                    inputMode="numeric"
                    value={row.break}
                    onChange={(e) => patch(index, "break", e.target.value)}
                    aria-invalid={breakInvalid}
                    className={`${fieldClass} ${breakInvalid ? "border-destructive" : ""}`}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeSession(index)}
                  disabled={draft.length <= 1}
                  className="h-9 px-2 border-2 border-border hover:border-destructive disabled:opacity-50 disabled:cursor-not-allowed text-destructive"
                  title="Remove session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addSession}
        className="w-full flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-border hover:border-primary text-muted-foreground hover:text-foreground"
        style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}
      >
        <Plus size={12} /> ADD SESSION
      </button>

      <p className="text-xs text-muted-foreground">
        Start the timer for Session 1; breaks and the next sessions then run automatically and loop.
        One full cycle is {totalMinutes} min.
        {running ? " The timer is running, so changes apply after the current phase." : ""}
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={save}
          className="px-4 py-2.5 bg-primary text-primary-foreground"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
        >
          SAVE POMODORO
        </button>
      </div>
    </div>
  );
}
