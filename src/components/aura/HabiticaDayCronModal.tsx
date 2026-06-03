import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useHabiticaDayCron } from "@/hooks/useHabitica";
import type { HabiticaPendingDaily } from "@/hooks/useHabitica";

function DailyRow({
  daily,
  checked,
  onToggle,
}: {
  daily: HabiticaPendingDaily;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 px-3 py-2 border text-left transition-colors ${
        checked
          ? "border-primary bg-primary/10 text-primary"
          : "border-border hover:border-primary/50 text-foreground/80"
      }`}
    >
      <span
        className={`w-4 h-4 border-2 flex-shrink-0 flex items-center justify-center text-[10px] ${
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      <span className="text-xs truncate" style={{ fontFamily: "var(--font-pixel)" }}>
        {daily.title}
      </span>
    </button>
  );
}

export function HabiticaDayCronModal() {
  const { open, pendingDailies, runCron, isRunning, dismiss } = useHabiticaDayCron();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (habiticaTaskId: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(habiticaTaskId)) {
        next.delete(habiticaTaskId);
      } else {
        next.add(habiticaTaskId);
      }
      return next;
    });
  };

  const handleStart = () => {
    void runCron([...checked]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isRunning) dismiss(); }}>
      <DialogContent className="max-w-sm border-2 border-border bg-background p-0 gap-0">
        <div className="border-b border-border px-4 py-3">
          <DialogTitle
            className="text-sm text-primary"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            NEW DAY
          </DialogTitle>
          <p className="text-[11px] text-muted-foreground mt-1">
            Yesterday&apos;s dailies haven&apos;t been settled yet. Mark any you completed before starting the new day.
          </p>
        </div>

        {pendingDailies.length > 0 ? (
          <div className="px-4 py-3 flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {pendingDailies.map((d) => (
              <DailyRow
                key={d.habiticaTaskId}
                daily={d}
                checked={checked.has(d.habiticaTaskId)}
                onToggle={() => toggle(d.habiticaTaskId)}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No incomplete dailies from yesterday.
          </div>
        )}

        <div className="border-t border-border px-4 py-3 flex gap-2 justify-end">
          <button
            type="button"
            onClick={dismiss}
            disabled={isRunning}
            className="text-xs px-3 py-1.5 border border-border hover:border-primary/50 text-muted-foreground disabled:opacity-50"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            SKIP
          </button>
          <button
            type="button"
            onClick={handleStart}
            disabled={isRunning}
            className="text-xs px-3 py-1.5 border-2 border-primary bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {isRunning ? "STARTING..." : "START YOUR DAY"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
