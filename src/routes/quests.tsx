import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Plus,
  Minus,
  Check,
  Trash2,
  FileDown,
  ExternalLink,
  Flame,
  Info,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { Task, TaskType, Difficulty, RepeatUnit } from "@/lib/aura/types";
import type { Note } from "@/lib/aura/types";
import { DIFFICULTY_GOLD, DIFFICULTY_HP_LOSS, DIFFICULTY_XP } from "@/lib/aura/types";
import { addCalendarDays, calendarDateInTimeZone, isDailyDueByRepeat } from "@/lib/aura/dates";
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

function QuestsPage() {
  const { data: tasks = [], error: tasksError } = useTasks();
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
      {tasksError && (
        <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 px-2 py-1">
          Failed to load quests:{" "}
          {tasksError instanceof Error ? tasksError.message : "Unknown error"}
        </div>
      )}

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
  const [showInfo, setShowInfo] = useState(false);
  const create = useCreateTask();

  return (
    <div className="pixel-panel p-3 flex flex-col relative">
      <div className="mb-3">
        <button
          type="button"
          onClick={() => setShowInfo(true)}
          className="absolute top-3 right-3 text-muted-foreground hover:text-primary"
          title={`${label} guide`}
        >
          <Info size={16} />
        </button>
        <h2 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          {label}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          try {
            await create.mutateAsync({
              type,
              title: title.trim(),
              difficulty: diff,
              sacred_days: 127,
              repeat_every: 1,
              repeat_unit: "day",
            });
            setTitle("");
          } catch {
            // toast handled in hook onError
          }
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
                {label} GUIDE
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
            {type === "habit" && (
              <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
                <li>
                  <strong className="text-foreground">Use often:</strong> Habits are repeatable and
                  can be completed multiple times.
                </li>
                <li>
                  <strong className="text-foreground">Two-way tracking:</strong> `+` rewards
                  progress, `-` applies penalties.
                </li>
                <li>
                  <strong className="text-foreground">Best for:</strong> Actions you want to build
                  consistency around.
                </li>
              </ul>
            )}
            {type === "daily" && (
              <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
                <li>
                  <strong className="text-foreground">Scheduled tasks:</strong> Dailies are due on
                  their repeat interval.
                </li>
                <li>
                  <strong className="text-foreground">Repeat control:</strong> Set every N
                  day/week/month/year.
                </li>
                <li>
                  <strong className="text-foreground">Missed days:</strong> Missing due dailies can
                  cost HP and affect party pressure systems.
                </li>
              </ul>
            )}
            {type === "todo" && (
              <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
                <li>
                  <strong className="text-foreground">One-time goals:</strong> Complete once, then
                  they are done.
                </li>
                <li>
                  <strong className="text-foreground">Great for projects:</strong> Use for tasks
                  with clear finish states.
                </li>
                <li>
                  <strong className="text-foreground">Boss synergy:</strong> Completions can
                  contribute to party adventure damage.
                </li>
              </ul>
            )}
          </div>
        </div>
      )}
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
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const linkedNote = notes.find((n) => n.id === task.source_note_id) ?? null;
  const [titleText, setTitleText] = useState(task.title);
  const [notesText, setNotesText] = useState(linkedNote?.content ?? task.notes ?? "");
  const todoCleanupStarted = useRef(false);
  const todayLocalDate = prof ? calendarDateInTimeZone(prof.timezone || "UTC") : null;
  const isDailyDoneToday =
    task.type === "daily" && !!todayLocalDate && task.last_completed_local_date === todayLocalDate;
  const isQuestChecked = task.type === "todo" ? task.completed : isDailyDoneToday;
  const isCheckDisabled = task.type === "todo" && task.completed;
  const dailyContentOpacity = isDailyDoneToday ? "opacity-50" : "";
  const habitStreak = task.type === "habit" ? (task.streak_current ?? 0) : 0;
  const showStreak = task.type === "daily" || habitStreak >= 3;

  useEffect(() => {
    setNotesText(linkedNote?.content ?? task.notes ?? "");
  }, [linkedNote?.content, task.notes, task.source_note_id]);

  useEffect(() => {
    setTitleText(task.title);
  }, [task.title]);

  const cleanupTodoAndLinkedNotes = useCallback(async () => {
    // Delete any note linked by source_task_id for full cleanup,
    // then remove the todo itself so it disappears from the list.
    await supabase.from("notes").delete().eq("source_task_id", task.id);
    await del.mutateAsync(task.id);
  }, [task.id, del]);

  useEffect(() => {
    if (task.type !== "todo" || !task.completed || todoCleanupStarted.current) return;
    todoCleanupStarted.current = true;
    void cleanupTodoAndLinkedNotes();
  }, [task.type, task.completed, task.id, cleanupTodoAndLinkedNotes]);

  const completePositive = async () => {
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
      const due = isDailyDueByRepeat(
        today,
        task.repeat_every ?? 1,
        (task.repeat_unit as RepeatUnit) ?? "day",
        task.repeat_anchor_date ?? task.created_at?.slice(0, 10) ?? today,
      );
      if (!due) {
        toast.error("This daily is not due yet.");
        return;
      }
    }

    const baseXp = DIFFICULTY_XP[task.difficulty];
    const baseGold = DIFFICULTY_GOLD[task.difficulty];
    await reward.mutateAsync({
      xp: baseXp,
      gold: baseGold,
      stat,
    });

    if (task.type === "habit") {
      update.mutate({
        id: task.id,
        patch: {
          positive_count: task.positive_count + 1,
          streak_current: habitStreak + 1,
          streak_best: Math.max(task.streak_best ?? 0, habitStreak + 1),
        },
      });
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
      await cleanupTodoAndLinkedNotes();
      if (task.difficulty === "hard") {
        const { data } = await supabase.rpc("redeem_ghost_mercy_if_eligible", {
          p_task_type: "todo",
          p_task_difficulty: "hard",
        });
        const mercy = data as {
          redeemed?: boolean;
          gold_refund?: number;
          xp_refund?: number;
        } | null;
        if (mercy?.redeemed) {
          toast.success(
            `Ghost mercy redeemed: +${mercy.xp_refund ?? 0} XP · +${mercy.gold_refund ?? 0}g`,
          );
        }
      }
    }

    const xpOut = prof ? withXpEquipBonus(baseXp, prof) : baseXp;
    const goldOut = prof ? withGoldEquipBonus(baseGold, prof) : baseGold;
    toast.success(`+${xpOut} XP · +${goldOut}g`);
  };

  const uncompleteDaily = async () => {
    if (!prof || task.type !== "daily" || !todayLocalDate) return;
    const previousStreak = Math.max(0, (task.streak_current ?? 0) - 1);
    const previousCompletionDate = previousStreak > 0 ? addCalendarDays(todayLocalDate, -1) : null;
    const baseXp = DIFFICULTY_XP[task.difficulty];
    const baseGold = DIFFICULTY_GOLD[task.difficulty];

    await update.mutateAsync({
      id: task.id,
      patch: {
        completed: false,
        last_completed_local_date: previousCompletionDate,
        streak_current: previousStreak,
        last_completed_at: null,
      },
    });
    await reward.mutateAsync({
      xp: -withXpEquipBonus(baseXp, prof),
      gold: -withGoldEquipBonus(baseGold, prof),
      stat,
      statAmount: -1,
    });
    toast.info("Daily unsealed.");
  };

  const negative = () => {
    reward.mutate({ hp: -DIFFICULTY_HP_LOSS[task.difficulty] });
    update.mutate({
      id: task.id,
      patch: { negative_count: task.negative_count + 1, streak_current: 0 },
    });
    toast.error(`-${DIFFICULTY_HP_LOSS[task.difficulty]} HP`);
  };

  const saveNotes = (val: string) => {
    update.mutate({ id: task.id, patch: { notes: val } });
    if (linkedNote) updateNote.mutate({ id: linkedNote.id, patch: { content: val } });
  };

  const saveTitle = (val: string) => {
    const title = val.trim();
    if (!title) {
      setTitleText(task.title);
      toast.error("Quest title cannot be empty.");
      return;
    }
    if (title === task.title) {
      setTitleText(title);
      return;
    }

    update.mutate({ id: task.id, patch: { title } });
    if (linkedNote && linkedNote.title === task.title) {
      updateNote.mutate({ id: linkedNote.id, patch: { title } });
    }
    setTitleText(title);
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

  const patchRepeat = (patch: { repeat_every?: number; repeat_unit?: RepeatUnit }) => {
    update.mutate({ id: task.id, patch: patch as Partial<Task> });
  };
  const patchDifficulty = (difficulty: Difficulty) => {
    update.mutate({ id: task.id, patch: { difficulty } });
  };
  const handleDeleteTask = async () => {
    if (task.type === "todo") await cleanupTodoAndLinkedNotes();
    else await del.mutateAsync(task.id);
    setConfirmDeleteOpen(false);
    setOpen(false);
  };

  return (
    <div className="border-2 border-border bg-secondary/50 p-2">
      <div className="flex items-center gap-2">
        {task.type === "habit" ? (
          <>
            <button
              onClick={() => void completePositive()}
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
            onClick={() => void (isDailyDoneToday ? uncompleteDaily() : completePositive())}
            disabled={isCheckDisabled}
            className={`w-7 h-7 border-2 ${isQuestChecked ? "bg-primary border-primary" : "border-border hover:border-primary"} flex items-center justify-center`}
            aria-pressed={isQuestChecked}
            title={isDailyDoneToday ? "Uncheck daily" : "Complete quest"}
          >
            {isQuestChecked && <Check size={14} className="text-primary-foreground" />}
          </button>
        )}
        <button
          className={`flex-1 text-left text-sm ${dailyContentOpacity}`}
          onClick={() => setOpen(true)}
        >
          {task.title}
        </button>
        <span className={`text-sm text-primary ${dailyContentOpacity}`} title={task.difficulty}>
          {DIFF_STARS[task.difficulty]}
        </span>
        {showStreak && (
          <span
            className={`text-sm text-[color:var(--color-gold)] flex items-center gap-1 ${dailyContentOpacity}`}
            title="Streak"
          >
            <Flame size={14} />
            {task.streak_current ?? 0}
          </span>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <input
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                onBlur={(e) => saveTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                className="w-full max-w-sm bg-input border border-border px-2 py-1 text-sm"
                aria-label="Quest title"
              />
              <button
                type="button"
                onClick={() => setConfirmDeleteOpen(true)}
                className="text-destructive hover:opacity-80"
                title="Delete task"
              >
                <Trash2 size={14} />
              </button>
            </DialogTitle>
            <DialogDescription>
              {task.type.toUpperCase()} · {DIFF_STARS[task.difficulty]}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <div
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              Difficulty:
              <div className="mt-1 relative w-fit">
                <select
                  value={task.difficulty}
                  onChange={(e) => patchDifficulty(e.target.value as Difficulty)}
                  className="h-8 min-w-[170px] px-2 pr-7 bg-input border border-border text-xs leading-none appearance-none"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  <option value="trivial">★ Trivial</option>
                  <option value="easy">★★ Easy</option>
                  <option value="medium">★★★ Medium</option>
                  <option value="hard">★★★★ Hard</option>
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </div>
            {task.type === "daily" && (
              <div
                className="text-[10px] text-muted-foreground"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                Repeat:
                <div className="flex gap-1 mt-1 items-center">
                  <span>Every</span>
                  <input
                    type="number"
                    min={1}
                    value={task.repeat_every ?? 1}
                    onChange={(e) =>
                      patchRepeat({ repeat_every: Math.max(1, Number(e.target.value || 1)) })
                    }
                    className="w-16 px-1 py-0.5 bg-input border border-border text-xs"
                  />
                  <select
                    value={(task.repeat_unit as RepeatUnit) ?? "day"}
                    onChange={(e) => patchRepeat({ repeat_unit: e.target.value as RepeatUnit })}
                    className="px-1 py-0.5 bg-input border border-border text-xs"
                  >
                    <option value="day">day(s)</option>
                    <option value="week">week(s)</option>
                    <option value="month">month(s)</option>
                    <option value="year">year(s)</option>
                  </select>
                </div>
              </div>
            )}

            {(task.type === "todo" || task.type === "daily") && (
              <div className="space-y-1">
                <div className="text-xs text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
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
                    className="flex-1 px-2 py-1 bg-input border border-border text-sm"
                  />
                  <button
                    type="submit"
                    className="w-10 h-10 bg-primary text-primary-foreground flex items-center justify-center"
                  >
                    <Plus size={16} />
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
                className="flex-1 px-2 py-1 bg-input border border-border text-sm"
              />
              <button type="submit" className="px-2 py-1 border border-border text-sm">
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
              className="w-full bg-input border border-border px-2 py-1.5 text-sm min-h-[90px]"
            />
            <div className="flex gap-1">
              {!linkedNote && task.type === "todo" && (
                <button
                  onClick={convertToNote}
                  className="flex-1 text-base px-2 py-1.5 bg-accent text-accent-foreground flex items-center justify-center gap-1"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                >
                  <FileDown size={10} /> SAVE TO ARCHIVES
                </button>
              )}
            </div>
            {task.type === "habit" && (
              <div className="text-xs text-muted-foreground">
                +{task.positive_count} / -{task.negative_count}
              </div>
            )}
          </div>
          <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>DELETE TASK?</DialogTitle>
                <DialogDescription>
                  This will permanently remove this quest
                  {task.type === "todo" ? " and any linked archive note." : "."}
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteOpen(false)}
                  className="px-3 py-1 border border-border"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  CANCEL
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteTask()}
                  className="px-3 py-1 bg-destructive/20 text-destructive border border-destructive"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  DELETE
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </div>
  );
}
