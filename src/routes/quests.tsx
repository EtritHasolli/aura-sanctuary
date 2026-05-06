import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Minus, Check, Trash2, FileDown, X } from "lucide-react";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { useApplyReward } from "@/hooks/useProfile";
import { useCreateNote } from "@/hooks/useNotes";
import type { Task, TaskType, Difficulty } from "@/lib/aura/types";
import { DIFFICULTY_GOLD, DIFFICULTY_HP_LOSS, DIFFICULTY_XP } from "@/lib/aura/types";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export const Route = createFileRoute("/quests")({
  head: () => ({ meta: [{ title: "Quests — Aura" }] }),
  component: QuestsPage,
});

const COLUMNS: { type: TaskType; label: string; stat: "strength" | "constitution" | "intelligence"; hint: string }[] = [
  { type: "habit", label: "HABITS", stat: "strength", hint: "+/- repeated actions" },
  { type: "daily", label: "DAILIES", stat: "constitution", hint: "Must complete each day" },
  { type: "todo", label: "TO-DOS", stat: "intelligence", hint: "One-time quests" },
];

function QuestsPage() {
  const { data: tasks = [] } = useTasks();
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-lg text-primary mb-4" style={{ fontFamily: "var(--font-pixel)" }}>QUEST LOG</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <Column
            key={col.type}
            type={col.type}
            label={col.label}
            stat={col.stat}
            hint={col.hint}
            tasks={tasks.filter((t) => t.type === col.type)}
          />
        ))}
      </div>
    </div>
  );
}

function Column({ type, label, stat, hint, tasks }: { type: TaskType; label: string; stat: any; hint: string; tasks: Task[] }) {
  const [title, setTitle] = useState("");
  const [diff, setDiff] = useState<Difficulty>("easy");
  const create = useCreateTask();

  return (
    <div className="pixel-panel p-3 flex flex-col">
      <div className="mb-3">
        <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>{label}</h2>
        <p className="text-[10px] text-muted-foreground">{hint}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          create.mutate({ type, title: title.trim(), difficulty: diff });
          setTitle("");
        }}
        className="flex gap-1 mb-3"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New quest..."
          className="flex-1 px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-xs"
        />
        <select
          value={diff} onChange={(e) => setDiff(e.target.value as Difficulty)}
          className="bg-input border-2 border-border text-xs px-1"
        >
          <option value="trivial">○</option>
          <option value="easy">◐</option>
          <option value="medium">●</option>
          <option value="hard">★</option>
        </select>
        <button className="px-2 bg-primary text-primary-foreground"><Plus size={14} /></button>
      </form>

      <div className="space-y-2 overflow-y-auto">
        <AnimatePresence>
          {tasks.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">No quests yet.</p>
          )}
          {tasks.map((t) => (
            <motion.div key={t.id} layout
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 20 }}>
              <TaskRow task={t} stat={stat} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TaskRow({ task, stat }: { task: Task; stat: "strength" | "intelligence" | "constitution" }) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const reward = useApplyReward();
  const createNote = useCreateNote();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const completePositive = () => {
    reward.mutate({
      xp: DIFFICULTY_XP[task.difficulty],
      gold: DIFFICULTY_GOLD[task.difficulty],
      stat,
    });
    if (task.type === "habit") {
      update.mutate({ id: task.id, patch: { positive_count: task.positive_count + 1 } });
    } else {
      update.mutate({ id: task.id, patch: { completed: true } });
    }
    toast.success(`+${DIFFICULTY_XP[task.difficulty]} XP`);
  };

  const negative = () => {
    reward.mutate({ hp: -DIFFICULTY_HP_LOSS[task.difficulty] });
    update.mutate({ id: task.id, patch: { negative_count: task.negative_count + 1 } });
    toast.error(`-${DIFFICULTY_HP_LOSS[task.difficulty]} HP`);
  };

  const convertToNote = async () => {
    const note = await createNote.mutateAsync({
      title: task.title,
      content: task.notes || `*Converted from quest.*`,
      source_task_id: task.id,
    });
    toast.success("Saved to Archives");
    navigate({ to: "/archives", search: { id: note.id } as any });
  };

  return (
    <div className={`border-2 border-border bg-secondary/50 p-2 ${task.completed ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        {task.type === "habit" ? (
          <>
            <button onClick={completePositive} className="w-7 h-7 bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground border border-primary flex items-center justify-center">
              <Plus size={14} />
            </button>
            <button onClick={negative} className="w-7 h-7 bg-destructive/20 hover:bg-destructive text-destructive hover:text-destructive-foreground border border-destructive flex items-center justify-center">
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
        <span className="text-[10px] text-muted-foreground">{task.difficulty[0].toUpperCase()}</span>
      </div>

      {open && (
        <div className="mt-2 pt-2 border-t border-border space-y-2">
          <textarea
            placeholder="Notes..."
            defaultValue={task.notes ?? ""}
            onBlur={(e) => update.mutate({ id: task.id, patch: { notes: e.target.value } })}
            className="w-full bg-input border border-border px-2 py-1 text-xs min-h-[60px]"
          />
          <div className="flex gap-1">
            <button onClick={convertToNote} className="flex-1 text-xs px-2 py-1 bg-accent text-accent-foreground flex items-center justify-center gap-1" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
              <FileDown size={10} /> CONVERT TO NOTE
            </button>
            <button onClick={() => del.mutate(task.id)} className="px-2 py-1 bg-destructive/20 text-destructive border border-destructive">
              <Trash2 size={12} />
            </button>
            <button onClick={() => setOpen(false)} className="px-2 py-1 border border-border">
              <X size={12} />
            </button>
          </div>
          {task.type === "habit" && (
            <div className="text-[10px] text-muted-foreground">+{task.positive_count} / -{task.negative_count}</div>
          )}
        </div>
      )}
    </div>
  );
}
