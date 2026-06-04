import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useNewDayModal } from "@/hooks/useNewDayModal";
import type { PendingYesterdayDaily } from "@/hooks/useNewDayModal";

function DailyRow({
  daily,
  checked,
  onToggle,
}: {
  daily: PendingYesterdayDaily;
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

export function NewDayModal() {
  const { open, pendingDailies, confirm, dismiss, isSubmitting } = useNewDayModal();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    void confirm([...checked]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !isSubmitting) dismiss(); }}>
      <DialogContent className="max-w-lg border-2 border-border bg-background p-0 gap-0">
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
                key={d.id}
                daily={d}
                checked={checked.has(d.id)}
                onToggle={() => toggle(d.id)}
              />
            ))}
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No incomplete dailies from yesterday.
          </div>
        )}

        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={handleStart}
            disabled={isSubmitting}
            className="w-full text-xs px-4 py-2 border-2 border-primary bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {isSubmitting ? "SAVING..." : "START YOUR DAY"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
