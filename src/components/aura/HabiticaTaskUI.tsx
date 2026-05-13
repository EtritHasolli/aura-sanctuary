import { useMemo } from "react";
import { CalendarClock, Flame, Link2, Minus, Plus } from "lucide-react";
import type { Task, HabiticaTaskMeta } from "@/lib/aura/types";
import { habiticaValueColor } from "@/lib/aura/habiticaTaskValue";

interface HabiticaTaskBadgeProps {
  task: Task;
}

/**
 * Inline row badge for a Habitica-linked quest — shows daily streak / habit
 * counters and a small link icon. Returns null when the task has no Habitica
 * metadata.
 */
export function HabiticaTaskBadge({ task }: HabiticaTaskBadgeProps) {
  const meta = task.habitica_meta;
  if (!task.habitica_task_id || !meta) return null;

  return (
    <span
      className="text-[10px] text-muted-foreground border border-border bg-background/40 px-1 py-0.5 flex items-center gap-1"
      title="Linked to Habitica"
      style={{ fontFamily: "var(--font-pixel)" }}
    >
      <Link2 size={10} className="text-primary" />
      {meta.type === "habit" && (
        <>
          <Plus size={9} className="text-primary" />
          <span>{meta.counterUp ?? 0}</span>
          <Minus size={9} className="text-destructive" />
          <span>{meta.counterDown ?? 0}</span>
        </>
      )}
      {meta.type === "daily" && typeof meta.streak === "number" && (
        <>
          <Flame size={9} className="text-[color:var(--color-gold)]" />
          <span>{meta.streak}</span>
        </>
      )}
    </span>
  );
}

interface HabiticaTaskDetailsProps {
  task: Task;
  onCounterChange?: (counterUp: number, counterDown: number) => void;
}

/**
 * Habitica detail section for the quest dialog: frequency, due date, history
 * spark, and remote checklist.
 */
export function HabiticaTaskDetails({ task, onCounterChange }: HabiticaTaskDetailsProps) {
  const meta = task.habitica_meta ?? null;
  const repeatDays = useMemo(() => {
    const r = meta?.repeat ?? {};
    const order: { key: keyof typeof r; label: string }[] = [
      { key: "m", label: "M" },
      { key: "t", label: "T" },
      { key: "w", label: "W" },
      { key: "th", label: "T" },
      { key: "f", label: "F" },
      { key: "s", label: "S" },
      { key: "su", label: "S" },
    ];
    return order.map((d) => ({ ...d, on: !!r[d.key] }));
  }, [meta?.repeat]);

  if (!task.habitica_task_id || !meta) return null;
  const recentHistory = (meta.history ?? []).slice(-14);
  const dueDate = meta.date ? new Date(meta.date) : null;

  const counterUp = meta.counterUp ?? 0;
  const counterDown = meta.counterDown ?? 0;

  return (
    <div className="border-2 border-border bg-background/30 p-2 space-y-2">
      <div
        className="text-[10px] text-primary flex items-center gap-1"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <Link2 size={10} /> {meta.type ?? "task"}
      </div>

      {/* VALUE + STREAK on one line */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {typeof meta.value === "number" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ fontFamily: "var(--font-pixel)" }}>VALUE</span>
            <span className="text-foreground text-sm">{meta.value.toFixed(1)}</span>
          </div>
        )}
        {meta.type === "daily" && typeof meta.streak === "number" && (
          <div className="flex items-center gap-1">
            <span style={{ fontFamily: "var(--font-pixel)" }}>STREAK</span>
            <span className="text-foreground flex items-center gap-0.5">
              <Flame size={10} className="text-[color:var(--color-gold)]" />{meta.streak}
            </span>
          </div>
        )}
      </div>

      {/* + / − count with editable inputs for habits */}
      {meta.type === "habit" && (
        <div className="flex gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <span
              className="text-primary"
              style={{ fontFamily: "var(--font-pixel)" }}
            >+</span>
            <input
              type="number"
              min={0}
              value={counterUp}
              onChange={(e) => onCounterChange?.(Math.max(0, Number(e.target.value)), counterDown)}
              className="w-14 px-1 py-0.5 bg-input border border-border text-center text-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
              aria-label="Positive count"
            />
          </div>
          <div className="flex items-center gap-1">
            <span
              className="text-destructive"
              style={{ fontFamily: "var(--font-pixel)" }}
            >−</span>
            <input
              type="number"
              min={0}
              value={counterDown}
              onChange={(e) => onCounterChange?.(counterUp, Math.max(0, Number(e.target.value)))}
              className="w-14 px-1 py-0.5 bg-input border border-border text-center text-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
              aria-label="Negative count"
            />
          </div>
        </div>
      )}


      {meta.type === "daily" && repeatDays.some((d) => d.on) && (
        <div>
          <div
            className="text-[10px] text-muted-foreground mb-1"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            DAYS
          </div>
          <div className="flex gap-1">
            {repeatDays.map((d) => (
              <span
                key={`${d.key}-${d.label}`}
                className={`w-5 h-5 flex items-center justify-center text-[10px] border ${
                  d.on
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border text-muted-foreground/60"
                }`}
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {dueDate && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
          <CalendarClock size={11} />
          <span style={{ fontFamily: "var(--font-pixel)" }}>DUE</span>
          <span className="text-foreground">{dueDate.toLocaleDateString()}</span>
        </div>
      )}

      {meta.checklist.length > 0 && (
        <div>
          <div
            className="text-[10px] text-muted-foreground mb-1"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            HABITICA CHECKLIST
          </div>
          <ul className="space-y-0.5">
            {meta.checklist.map((c) => (
              <li
                key={c.id}
                className={`text-xs flex items-center gap-1.5 ${
                  c.completed ? "text-muted-foreground line-through" : "text-foreground"
                }`}
              >
                <span
                  aria-hidden
                  className={`inline-block w-3 h-3 border ${
                    c.completed ? "bg-primary border-primary" : "border-border"
                  }`}
                />
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recentHistory.length > 0 && <HabiticaHistorySpark history={recentHistory} />}

      {meta.refreshedAt && (
        <div className="text-[10px] text-muted-foreground/70">
          Snapshot {new Date(meta.refreshedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

function HabiticaHistorySpark({ history }: { history: HabiticaTaskMeta["history"] }) {
  const points = history
    .map((h) => (typeof h.value === "number" ? h.value : null))
    .filter((v): v is number => v != null);
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const w = 120;
  const h = 24;
  const stepX = w / Math.max(1, points.length - 1);
  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const stroke = habiticaValueColor(points[points.length - 1]) ?? "currentColor";
  return (
    <div>
      <div
        className="text-xs text-muted-foreground mb-1"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        VALUE TREND
      </div>
      <svg width={160} height={36} viewBox={`0 0 ${w} ${h}`} className="block w-40 h-9" preserveAspectRatio="none">
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
      </svg>
    </div>
  );
}
