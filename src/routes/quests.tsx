import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Plus, Minus, Check, Flame, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
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
import {
  useHabiticaStatus,
  useScoreLinkedHabiticaTask,
  useSyncFromHabitica,
  useSyncTaskEditToHabitica,
} from "@/hooks/useHabitica";
import { useQueryClient } from "@tanstack/react-query";
import { HabiticaTaskBadge, HabiticaTaskDetails } from "@/components/aura/HabiticaTaskUI";
import { habiticaValueColor } from "@/lib/aura/habiticaTaskValue";
import { withGoldEquipBonus, withXpEquipBonus } from "@/lib/aura/equipmentBonuses";
import { useNotes, useCreateNote, useUpdateNote } from "@/hooks/useNotes";
import type { Task, TaskType, Difficulty, RepeatUnit } from "@/lib/aura/types";
import type { Note } from "@/lib/aura/types";
import { DIFFICULTY_GOLD, DIFFICULTY_HP_LOSS, DIFFICULTY_XP } from "@/lib/aura/types";
import { addCalendarDays, calendarDateInTimeZone, isDailyDueByRepeat } from "@/lib/aura/dates";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { BugLoader } from "@/components/aura/BugLoader";

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
  const { data: habiticaStatus } = useHabiticaStatus();
  const syncHabitica = useSyncFromHabitica();
  const qc = useQueryClient();
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!tagFilter) return tasks;
    return tasks.filter((t) => t.tags?.some((g) => g.id === tagFilter));
  }, [tasks, tagFilter]);

  const refreshing = syncHabitica.isPending;
  const handleRefresh = () => {
    if (refreshing) return;
    // Always refresh local quests; sync with Habitica only when connected.
    qc.invalidateQueries({ queryKey: ["tasks"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    if (habiticaStatus?.connected) {
      syncHabitica.mutate({ silent: false });
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          QUEST LOG
        </h1>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs px-2 py-1 border-2 border-border hover:border-primary text-foreground/90 hover:text-primary disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ fontFamily: "var(--font-pixel)" }}
          title={
            habiticaStatus?.connected ? "Refresh quests and sync from Habitica" : "Refresh quests"
          }
        >
          {refreshing ? "REFRESHING..." : "REFRESH"}
        </button>
      </div>
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
    <div className="pixel-panel p-3 flex flex-col relative overflow-hidden">
      {create.isPending && <BugLoader overlay label="CONJURING..." />}
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
        className="flex flex-col gap-1 mb-3"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New quest..."
          disabled={create.isPending}
          className="w-full px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm disabled:opacity-50"
        />
        <div className="flex gap-1">
          <select
            value={diff}
            onChange={(e) => setDiff(e.target.value as Difficulty)}
            disabled={create.isPending}
            className="flex-1 bg-input border-2 border-border text-sm px-1 py-2 disabled:opacity-50"
            title={diff}
          >
            <option value="trivial">★ Trivial</option>
            <option value="easy">★★ Easy</option>
            <option value="medium">★★★ Medium</option>
            <option value="hard">★★★★ Hard</option>
          </select>
          <button
            disabled={create.isPending}
            className="px-3 bg-primary text-primary-foreground disabled:opacity-60 disabled:cursor-not-allowed min-w-10 flex items-center justify-center"
          >
            {create.isPending ? (
              <span className="flex items-center gap-0.5">
                <span className="w-1 h-1 bg-primary-foreground rounded-none animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-primary-foreground rounded-none animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 bg-primary-foreground rounded-none animate-bounce [animation-delay:300ms]" />
              </span>
            ) : (
              <Plus size={14} />
            )}
          </button>
        </div>
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
  const scoreHabitica = useScoreLinkedHabiticaTask();
  const pushTaskEdit = useSyncTaskEditToHabitica();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const addCl = useCreateChecklistItem();
  const patchCl = useUpdateChecklistItem();
  const delCl = useDeleteChecklistItem();
  const addTag = useCreateTagAndAssign();
  const rmTag = useRemoveTaskTag();
  const [clTitle, setClTitle] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

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

    // Cache the Habitica id BEFORE any cleanup so todos (which we delete on
    // completion) can still score "up" against their remote counterpart.
    const linkedHabiticaId = task.habitica_task_id ?? null;

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

    // Todos are deleted on completion (locally and on Habitica via useDeleteTask).
    // Scoring a deleted Habitica task returns a 404, so skip it for todos.
    if (task.type !== "todo") {
      void scoreHabitica(task.id, "up", linkedHabiticaId);
    }
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

    // Remove the most recent battle completion for this task so the battle bar reverts.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latest } = await (supabase as any)
      .from("battle_completions")
      .select("id")
      .eq("task_id", task.id)
      .order("completed_at", { ascending: false })
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((latest as any)?.[0]?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("battle_completions").delete().eq("id", (latest as any)[0].id);
      void qc.invalidateQueries({ queryKey: ["battle_scores"] });
    }

    await reward.mutateAsync({
      xp: -withXpEquipBonus(baseXp, prof),
      gold: -withGoldEquipBonus(baseGold, prof),
      stat,
      statAmount: -1,
    });
    toast.info("Daily unsealed.");

    void scoreHabitica(task.id, "down");
  };

  const negative = () => {
    reward.mutate({ hp: -DIFFICULTY_HP_LOSS[task.difficulty] });
    update.mutate({
      id: task.id,
      patch: { negative_count: task.negative_count + 1, streak_current: 0 },
    });
    toast.error(`-${DIFFICULTY_HP_LOSS[task.difficulty]} HP`);

    void scoreHabitica(task.id, "down");
  };

  const saveNotes = (val: string) => {
    update.mutate(
      { id: task.id, patch: { notes: val } },
      {
        onSuccess: () => {
          if (task.habitica_task_id) void pushTaskEdit(task.id);
        },
      },
    );
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

    update.mutate(
      { id: task.id, patch: { title } },
      {
        onSuccess: () => {
          if (task.habitica_task_id) void pushTaskEdit(task.id);
        },
      },
    );
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
    update.mutate(
      { id: task.id, patch: patch as Partial<Task> },
      {
        onSuccess: () => {
          if (task.habitica_task_id) void pushTaskEdit(task.id);
        },
      },
    );
  };
  const patchDifficulty = (difficulty: Difficulty) => {
    update.mutate(
      { id: task.id, patch: { difficulty } },
      {
        onSuccess: () => {
          if (task.habitica_task_id) void pushTaskEdit(task.id);
        },
      },
    );
  };
  const handleDeleteTask = async () => {
    setConfirmDelete(false);
    if (task.type === "todo") await cleanupTodoAndLinkedNotes();
    else await del.mutateAsync(task.id);
    setOpen(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      saveTitle(titleText);
      saveNotes(notesText);
      // Give mutations a tick to fire before closing
      await new Promise((r) => setTimeout(r, 300));
    } finally {
      setSaving(false);
      setOpen(false);
    }
  };

  const habiticaTint = habiticaValueColor(task.habitica_meta?.value ?? null);

  return (
    <div
      className="border-2 border-border bg-secondary/50 p-2"
      style={habiticaTint ? { borderLeftColor: habiticaTint, borderLeftWidth: 4 } : undefined}
    >
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

      <Dialog open={open} onOpenChange={(v) => {
        if (del.isPending || saving) return;
        if (!v) { setConfirmDelete(false); setSaving(false); }
        setOpen(v);
      }}>
        <DialogContent
          className="max-w-2xl"
          hideClose
          aria-describedby={undefined}
          fullOverlay={
            (del.isPending || saving) ? (
              <BugLoader overlay label={del.isPending ? "BANISHING..." : "SAVING..."} />
            ) : confirmDelete ? (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-[2px]">
                <p className="text-sm text-primary text-center" style={{ fontFamily: "var(--font-pixel)" }}>
                  DELETE THIS QUEST?
                </p>
                <p className="text-xs text-muted-foreground text-center max-w-60">
                  This will permanently remove this quest
                  {task.type === "todo" ? " and any linked archive note." : "."}
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-4 py-1.5 border border-border text-xs hover:border-primary"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    CANCEL
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteTask()}
                    className="px-4 py-1.5 bg-destructive/20 text-destructive border border-destructive text-xs hover:bg-destructive/40"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    DELETE
                  </button>
                </div>
              </div>
            ) : null
          }
          stickyHeader={
            <div className="flex flex-col border-b border-border">
              <div className="flex items-center gap-2 px-3 py-1.5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={del.isPending || saving}
                  className="shrink-0 flex items-center justify-center w-7 h-7 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                  aria-label="Close without saving"
                  title="Back"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                    <polyline points="9,2 4,7 9,12" />
                  </svg>
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={del.isPending || saving}
                  className="shrink-0 text-destructive hover:opacity-80 text-[9px] px-2 py-1 border border-destructive disabled:opacity-40"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  DELETE
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={del.isPending || saving}
                  className="shrink-0 text-primary hover:opacity-80 text-[9px] px-2 py-1 border border-primary disabled:opacity-40"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  SAVE
                </button>
              </div>
              <div className="px-3 pb-2">
                <input
                  value={titleText}
                  onChange={(e) => setTitleText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  className="w-full bg-input border border-border px-2 py-1.5 text-sm"
                  style={{ fontFamily: "var(--font-pixel)" }}
                  aria-label="Quest title"
                />
              </div>
            </div>
          }
        >
          <VisuallyHidden.Root>
            <DialogTitle>{task.title}</DialogTitle>
          </VisuallyHidden.Root>
          <div className="space-y-2">
            <div
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              Difficulty:
              <div className="mt-1 grid grid-cols-2 gap-1">
                {(["trivial", "easy", "medium", "hard"] as Difficulty[]).map((d) => {
                  const labels: Record<Difficulty, { name: string; stars: string }> = {
                    trivial: { name: "Trivial", stars: "★" },
                    easy:    { name: "Easy",    stars: "★★" },
                    medium:  { name: "Medium",  stars: "★★★" },
                    hard:    { name: "Hard",    stars: "★★★★" },
                  };
                  const active = task.difficulty === d;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => patchDifficulty(d)}
                      className={`flex items-center justify-between px-2 py-2 border-2 text-left ${
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-input text-muted-foreground hover:border-primary/60"
                      }`}
                      style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
                    >
                      <span>{labels[d].name}</span>
                      <span style={{ color: "var(--color-gold)", fontSize: "0.85rem", lineHeight: 1 }}>{labels[d].stars}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              Reminder:
              {task.type === "todo" ? (
                // Todos get a one-shot datetime picker (stored as YYYY-MM-DDTHH:MM)
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <input
                    type="datetime-local"
                    value={task.reminder_time ?? ""}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      update.mutate({ id: task.id, patch: { reminder_time: val } });
                    }}
                    className="px-1 py-0.5 bg-input border border-border" style={{ fontSize: "0.6rem", fontFamily: "var(--font-pixel)" }}
                  />
                  {task.reminder_time && (
                    <button
                      type="button"
                      onClick={() => update.mutate({ id: task.id, patch: { reminder_time: null } })}
                      className="text-destructive hover:opacity-70"
                      style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
                    >
                      CLEAR
                    </button>
                  )}
                </div>
              ) : (
                // Habits & dailies repeat, so just a daily time is enough
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="time"
                    value={task.reminder_time ?? ""}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      update.mutate({ id: task.id, patch: { reminder_time: val } });
                    }}
                    className="px-1 py-0.5 bg-input border border-border" style={{ fontSize: "0.6rem", fontFamily: "var(--font-pixel)" }}
                  />
                  {task.reminder_time && (
                    <button
                      type="button"
                      onClick={() => update.mutate({ id: task.id, patch: { reminder_time: null } })}
                      className="text-destructive text-[10px] hover:opacity-70"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      CLEAR
                    </button>
                  )}
                  {task.habitica_task_id && task.reminder_time && (
                    <span className="text-accent text-[9px]" style={{ fontFamily: "var(--font-pixel)" }}>
                      ⚡ synced from Habitica
                    </span>
                  )}
                </div>
              )}
            </div>

            {task.type === "daily" && (
              <div
                className="text-[10px] text-muted-foreground"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                Repeat Every:
                <div className="flex gap-1 mt-1">
                  <input
                    type="number"
                    min={1}
                    value={task.repeat_every ?? 1}
                    onChange={(e) =>
                      patchRepeat({ repeat_every: Math.max(1, Number(e.target.value || 1)) })
                    }
                    className="w-16 shrink-0 px-1 py-0.5 bg-input border border-border text-xs"
                  />
                  <select
                    value={(task.repeat_unit as RepeatUnit) ?? "day"}
                    onChange={(e) => patchRepeat({ repeat_unit: e.target.value as RepeatUnit })}
                    className="flex-1 min-w-0 px-1 py-0.5 bg-input border border-border text-xs"
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
                <div className="text-base text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                  QUEST STEPS
                </div>
                {(task.checklist ?? []).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-base">
                    <button
                      type="button"
                      onClick={() => patchCl.mutate({ id: c.id, patch: { done: !c.done } })}
                      className={`shrink-0 w-4 h-4 border-2 flex items-center justify-center transition-colors ${
                        c.done
                          ? "border-primary bg-primary/20 text-primary"
                          : "border-border bg-input hover:border-primary"
                      }`}
                      style={{ imageRendering: "pixelated" }}
                    >
                      {c.done && <span style={{ fontFamily: "var(--font-pixel)", fontSize: "0.5rem", lineHeight: 1 }}>✓</span>}
                    </button>
                    <span className={`flex-1 ${c.done ? "line-through text-muted-foreground" : ""}`}>{c.title}</span>
                    <button
                      type="button"
                      className="text-destructive text-base font-bold leading-none"
                      onClick={() => delCl.mutate(c.id)}
                    >
                      Delete
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
                  onClick={() => rmTag.mutate({ taskId: task.id, tagId: g.id, tagName: g.name })}
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
                <span className="text-accent truncate">{linkedNote.title}</span>
                <button
                  onClick={() => navigate({ to: "/archives", search: { id: linkedNote.id } })}
                  className="text-muted-foreground hover:text-primary ml-2 shrink-0"
                >
                  VIEW FULL NOTE
                </button>
              </div>
            )}
            <HabiticaTaskDetails
              task={task}
              onCounterChange={(counterUp, counterDown) => {
                update.mutate({
                  id: task.id,
                  patch: {
                    habitica_meta: task.habitica_meta
                      ? { ...task.habitica_meta, counterUp, counterDown }
                      : null,
                  },
                });
              }}
            />
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
                  className="flex-1 text-base px-2 py-1.5 bg-accent text-accent-foreground"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                >
                  SAVE TO ARCHIVES
                </button>
              )}
            </div>
            {task.type === "habit" && (
              <div className="text-xs text-muted-foreground">
                +{task.positive_count} / -{task.negative_count}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
