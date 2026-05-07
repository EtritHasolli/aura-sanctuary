import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { Plus, Minus, Check, Trash2, FileDown, X, ExternalLink, Flame } from "lucide-react";
import {
  useTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useUserTags,
  useCreateTagAndAssign,
  useRemoveTaskTag,
} from "@/hooks/useTasks";
import { useApplyReward, useProfile } from "@/hooks/useProfile";
import { withGoldEquipBonus, withXpEquipBonus } from "@/lib/aura/equipmentBonuses";
import { useNotes, useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import type { Task, TaskType, Difficulty } from "@/lib/aura/types";
import type { Note } from "@/lib/aura/types";
import { DIFFICULTY_GOLD, DIFFICULTY_HP_LOSS, DIFFICULTY_XP } from "@/lib/aura/types";
import { addCalendarDays, calendarDateInTimeZone, isSacredToday } from "@/lib/aura/dates";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export const Route = createFileRoute("/quests")({
  head: () => ({ meta: [{ title: "Quests — Aura" }] }),
  component: QuestsPage,
});

const COLUMNS: {
  type: TaskType;
  label: string;
  stat: "strength" | "constitution" | "intelligence";
  hint: string;
}[] = [
  { type: "habit", label: "HABITS", stat: "strength", hint: "+/- repeated actions" },
  { type: "daily", label: "DAILIES", stat: "constitution", hint: "Must complete each day" },
  { type: "todo", label: "TO-DOS", stat: "intelligence", hint: "One-time quests" },
];

const DIFF_STARS: Record<Difficulty, string> = {
  trivial: "★",
  easy: "★★",
  medium: "★★★",
  hard: "★★★★",
};

const DOW_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toggleSacredDay(mask: number, dow: number) {
  return mask ^ (1 << dow);
}

function QuestsPage() {
  const { data: tasks = [] } = useTasks();
  const { data: notes = [] } = useNotes();
  const { data: allTags = [] } = useUserTags();
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!tagFilter) return tasks;
    return tasks.filter((t) => t.tags?.some((g) => g.id === tagFilter));
  }, [tasks, tagFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
        QUEST LOG
      </h1>

      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="text-[10px] text-muted-foreground"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            SIGILS
          </span>
          <button
            type="button"
            onClick={() => setTagFilter(null)}
            className={`px-2 py-0.5 border text-[10px] ${!tagFilter ? "border-primary bg-primary/20" : "border-border"}`}
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            ALL
          </button>
          {allTags.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setTagFilter(g.id)}
              className={`px-2 py-0.5 border text-[10px] ${tagFilter === g.id ? "border-primary bg-primary/20" : "border-border"}`}
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.type}
            type={col.type}
            label={col.label}
            stat={col.stat}
            hint={col.hint}
            tasks={filtered.filter((t) => t.type === col.type)}
            notes={notes}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  type,
  label,
  stat,
  hint,
  tasks,
  notes,
}: {
  type: TaskType;
  label: string;
  stat: "strength" | "intelligence" | "constitution";
  hint: string;
  tasks: Task[];
  notes: Note[];
}) {
  const [title, setTitle] = useState("");
  const [diff, setDiff] = useState<Difficulty>("easy");
  const [sacredMask, setSacredMask] = useState(127);
  const create = useCreateTask();

  return (
    <div className="pixel-panel p-3 flex flex-col">
      <div className="mb-3">
        <h2 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          {label}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>

      {type === "daily" && (
        <div
          className="mb-2 text-[10px] text-muted-foreground"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Sacred days (new dailies):
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

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          create.mutate({
            type,
            title: title.trim(),
            difficulty: diff,
            sacred_days: type === "daily" ? sacredMask : 127,
          });
          setTitle("");
        }}
        className="flex gap-1 mb-3"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New quest..."
          className="flex-1 px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm"
        />
        <select
          value={diff}
          onChange={(e) => setDiff(e.target.value as Difficulty)}
          className="bg-input border-2 border-border text-sm px-1"
          title={diff}
        >
          <option value="trivial">★</option>
          <option value="easy">★★</option>
          <option value="medium">★★★</option>
          <option value="hard">★★★★</option>
        </select>
        <button className="px-2 bg-primary text-primary-foreground">
          <Plus size={14} />
        </button>
      </form>

      <div className="space-y-2 overflow-y-auto">
        <AnimatePresence>
          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">No quests yet.</p>
          )}
          {tasks.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <TaskRow task={t} stat={stat} notes={notes} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  stat,
  notes,
}: {
  task: Task;
  stat: "strength" | "intelligence" | "constitution";
  notes: Note[];
}) {
  const update = useUpdateTask();
  const updateNote = useUpdateNote();
  const del = useDeleteTask();
  const reward = useApplyReward();
  const { data: prof } = useProfile();
  const createNote = useCreateNote();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const addCl = useCreateChecklistItem();
  const patchCl = useUpdateChecklistItem();
  const delCl = useDeleteChecklistItem();
  const addTag = useCreateTagAndAssign();
  const rmTag = useRemoveTaskTag();
  const [clTitle, setClTitle] = useState("");
  const [tagInput, setTagInput] = useState("");

  const linkedNote = notes.find((n) => n.id === task.source_note_id) ?? null;
  const [notesText, setNotesText] = useState(linkedNote?.content ?? task.notes ?? "");

  useEffect(() => {
    setNotesText(linkedNote?.content ?? task.notes ?? "");
  }, [linkedNote?.content, task.notes, task.source_note_id]);

  const completePositive = () => {
    if (!prof) return;
    const tz = prof.timezone || "UTC";
    const today = calendarDateInTimeZone(tz);

    if (task.type === "todo" && task.checklist?.length && !task.checklist.every((c) => c.done)) {
      toast.error("Complete all quest steps first.");
      return;
    }

    if (task.type === "daily") {
      if (task.last_completed_local_date === today) {
        toast.info("Already sealed today.");
        return;
      }
      if (!isSacredToday(task.sacred_days ?? 127, tz)) {
        toast.error("Not a sacred day for this daily.");
        return;
      }
    }

    const baseXp = DIFFICULTY_XP[task.difficulty];
    const baseGold = DIFFICULTY_GOLD[task.difficulty];
    reward.mutate({
      xp: baseXp,
      gold: baseGold,
      stat,
    });

    if (task.type === "habit") {
      update.mutate({ id: task.id, patch: { positive_count: task.positive_count + 1 } });
    } else if (task.type === "daily") {
      const yesterday = addCalendarDays(today, -1);
      let streak = 1;
      if (task.last_completed_local_date === yesterday) streak = (task.streak_current ?? 0) + 1;
      const best = Math.max(task.streak_best ?? 0, streak);
      update.mutate({
        id: task.id,
        patch: {
          completed: true,
          last_completed_local_date: today,
          streak_current: streak,
          streak_best: best,
          last_completed_at: new Date().toISOString(),
        },
      });
    } else {
      update.mutate({ id: task.id, patch: { completed: true } });
    }

    const xpOut = prof ? withXpEquipBonus(baseXp, prof) : baseXp;
    const goldOut = prof ? withGoldEquipBonus(baseGold, prof) : baseGold;
    toast.success(`+${xpOut} XP · +${goldOut}g`);
  };

  const negative = () => {
    reward.mutate({ hp: -DIFFICULTY_HP_LOSS[task.difficulty] });
    update.mutate({ id: task.id, patch: { negative_count: task.negative_count + 1 } });
    toast.error(`-${DIFFICULTY_HP_LOSS[task.difficulty]} HP`);
  };

  const saveNotes = (val: string) => {
    update.mutate({ id: task.id, patch: { notes: val } });
    if (linkedNote) updateNote.mutate({ id: linkedNote.id, patch: { content: val } });
  };

  const convertToNote = async () => {
    const note = await createNote.mutateAsync({
      title: task.title,
      content: task.notes || `*Converted from quest.*`,
      source_task_id: task.id,
    });
    update.mutate({ id: task.id, patch: { source_note_id: note.id } });
    toast.success("Saved to Archives");
    navigate({ to: "/archives", search: { id: note.id } });
  };

  const patchSacred = (dow: number) => {
    const next = toggleSacredDay(task.sacred_days ?? 127, dow);
    update.mutate({ id: task.id, patch: { sacred_days: next } as Partial<Task> });
  };

  return (
    <div
      className={`border-2 border-border bg-secondary/50 p-2 ${task.completed ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2">
        {task.type === "habit" ? (
          <>
            <button
              onClick={completePositive}
              className="w-7 h-7 bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground border border-primary flex items-center justify-center"
            >
              <Plus size={14} />
            </button>
            <button
              onClick={negative}
              className="w-7 h-7 bg-destructive/20 hover:bg-destructive text-destructive hover:text-destructive-foreground border border-destructive flex items-center justify-center"
            >
              <Minus size={14} />
            </button>
          </>
        ) : (
          <button
            onClick={completePositive}
            disabled={task.completed}
            className={`w-7 h-7 border-2 ${task.completed ? "bg-primary border-primary" : "border-border hover:border-primary"} flex items-center justify-center`}
          >
            {task.completed && <Check size={14} className="text-primary-foreground" />}
          </button>
        )}
        <button className="flex-1 text-left text-sm" onClick={() => setOpen((o) => !o)}>
          {task.title}
        </button>
        <span className="text-xs text-primary" title={task.difficulty}>
          {DIFF_STARS[task.difficulty]}
        </span>
        {task.type === "daily" && (
          <span
            className="text-[10px] text-[color:var(--color-gold)] flex items-center gap-0.5"
            title="Streak"
          >
            <Flame size={10} />
            {task.streak_current ?? 0}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t border-border space-y-2">
          {task.type === "daily" && (
            <div
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              Sacred days:
              <div className="flex flex-wrap gap-1 mt-1">
                {DOW_LABELS.map((lb, dow) => (
                  <button
                    key={dow}
                    type="button"
                    onClick={() => patchSacred(dow)}
                    className={`px-1.5 py-0.5 border ${((task.sacred_days ?? 127) >> dow) & 1 ? "border-primary bg-primary/15 text-primary" : "border-border opacity-50"}`}
                  >
                    {lb}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(task.type === "todo" || task.type === "daily") && (
            <div className="space-y-1">
              <div className="text-[10px] text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                QUEST STEPS
              </div>
              {(task.checklist ?? []).map((c) => (
                <div key={c.id} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={c.done}
                    onChange={(e) =>
                      patchCl.mutate({ id: c.id, patch: { done: e.target.checked } })
                    }
                  />
                  <span className="flex-1">{c.title}</span>
                  <button
                    type="button"
                    className="text-destructive text-[10px]"
                    onClick={() => delCl.mutate(c.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!clTitle.trim()) return;
                  addCl.mutate({ taskId: task.id, title: clTitle });
                  setClTitle("");
                }}
              >
                <input
                  value={clTitle}
                  onChange={(e) => setClTitle(e.target.value)}
                  placeholder="Add step..."
                  className="flex-1 px-1 py-0.5 bg-input border border-border text-xs"
                />
                <button type="submit" className="px-1 bg-primary text-primary-foreground text-xs">
                  +
                </button>
              </form>
            </div>
          )}

          <div className="flex flex-wrap gap-1">
            {(task.tags ?? []).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => rmTag.mutate({ taskId: task.id, tagId: g.id })}
                className="text-[9px] px-1 border border-accent text-accent hover:bg-destructive/20"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                {g.name} ×
              </button>
            ))}
          </div>
          <form
            className="flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (!tagInput.trim()) return;
              addTag.mutate({ taskId: task.id, name: tagInput });
              setTagInput("");
            }}
          >
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add sigil..."
              className="flex-1 px-1 py-0.5 bg-input border border-border text-xs"
            />
            <button type="submit" className="px-1 border border-border text-xs">
              TAG
            </button>
          </form>

          {linkedNote && (
            <div
              className="flex items-center justify-between"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
            >
              <span className="text-accent truncate">↗ {linkedNote.title}</span>
              <button
                onClick={() => navigate({ to: "/archives", search: { id: linkedNote.id } })}
                className="flex items-center gap-1 text-muted-foreground hover:text-primary ml-2 shrink-0"
              >
                <ExternalLink size={10} /> VIEW FULL NOTE
              </button>
            </div>
          )}
          <textarea
            placeholder="Notes..."
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            onBlur={(e) => saveNotes(e.target.value)}
            className="w-full bg-input border border-border px-2 py-1 text-xs min-h-[60px]"
          />
          <div className="flex gap-1">
            {!linkedNote && (
              <button
                onClick={convertToNote}
                className="flex-1 text-sm px-2 py-1 bg-accent text-accent-foreground flex items-center justify-center gap-1"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              >
                <FileDown size={10} /> SAVE TO ARCHIVES
              </button>
            )}
            <button
              onClick={() => del.mutate(task.id)}
              className="px-2 py-1 bg-destructive/20 text-destructive border border-destructive"
            >
              <Trash2 size={12} />
            </button>
            <button onClick={() => setOpen(false)} className="px-2 py-1 border border-border">
              <X size={12} />
            </button>
          </div>
          {task.type === "habit" && (
            <div className="text-xs text-muted-foreground">
              +{task.positive_count} / -{task.negative_count}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
