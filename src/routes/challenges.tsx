import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trophy, Info, X, Check } from "lucide-react";
import {
  useChallengeTemplates,
  useCreateChallengeTemplate,
  useUpdateChallengeTemplate,
  useStartChallengeRun,
  useMyRuns,
  useChallengeRunTasks,
  type BlueprintTask,
  type ChallengeTemplate,
  type MyRun,
} from "@/hooks/useChallenges";
import { useTasks } from "@/hooks/useTasks";
import { toast } from "sonner";

export const Route = createFileRoute("/challenges")({
  head: () => ({ meta: [{ title: "Challenges — Aura" }] }),
  component: ChallengesPage,
});

const DIFF_LABEL: Record<string, string> = { trivial: "Trivial", easy: "Easy", medium: "Medium", hard: "Hard" };
const DOW_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

type OverrideMap = Record<string, {
  type: "habit" | "daily" | "todo";
  difficulty: "trivial" | "easy" | "medium" | "hard";
  sacred_days: number;
}>;

// ── shared quest-picker hook ──────────────────────────────────────────────────
function useQuestPicker(allTasks: ReturnType<typeof useTasks>["data"] & object) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [taskOverrides, setTaskOverrides] = useState<OverrideMap>({});

  const filteredTasks = (allTasks ?? []).filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () =>
    setSelectedIds(selectedIds.size === filteredTasks.length
      ? new Set()
      : new Set(filteredTasks.map((t) => t.id)));

  const getOv = (id: string, task: { type: string; difficulty: string }) => ({
    type: (taskOverrides[id]?.type ?? task.type) as "habit" | "daily" | "todo",
    difficulty: (taskOverrides[id]?.difficulty ?? task.difficulty) as "trivial" | "easy" | "medium" | "hard",
    sacred_days: taskOverrides[id]?.sacred_days ?? 127,
  });

  const patchOv = (
    id: string,
    task: { type: string; difficulty: string },
    patch: Partial<{ type: "habit" | "daily" | "todo"; difficulty: "trivial" | "easy" | "medium" | "hard"; sacred_days: number }>,
  ) => setTaskOverrides((prev) => ({ ...prev, [id]: { ...getOv(id, task), ...patch } }));

  const reset = () => { setSelectedIds(new Set()); setTaskOverrides({}); setSearch(""); };

  const loadFromBlueprint = (blueprint: BlueprintTask[], tasks: NonNullable<typeof allTasks>) => {
    const byTitle = new Map(blueprint.map((b) => [b.title, b]));
    const ids = new Set<string>();
    const overrides: OverrideMap = {};
    tasks.forEach((task) => {
      const bp = byTitle.get(task.title);
      if (bp) {
        ids.add(task.id);
        overrides[task.id] = { type: bp.type, difficulty: bp.difficulty, sacred_days: bp.sacred_days ?? 127 };
      }
    });
    setSelectedIds(ids);
    setTaskOverrides(overrides);
  };

  const selectedTasks = (allTasks ?? []).filter((t) => selectedIds.has(t.id));

  const buildBlueprint = (): BlueprintTask[] =>
    selectedTasks.map((t) => {
      const ov = getOv(t.id, t);
      return { title: t.title, type: ov.type, difficulty: ov.difficulty, sacred_days: ov.sacred_days };
    });

  return {
    pickerOpen, setPickerOpen,
    selectedIds, search, setSearch,
    filteredTasks, toggle, toggleAll,
    getOv, patchOv, reset, loadFromBlueprint,
    selectedTasks, buildBlueprint,
  };
}

function ChallengesPage() {
  const { data: templates = [], isLoading } = useChallengeTemplates();
  const { data: allTasks = [] } = useTasks();
  const { data: myRuns = [] } = useMyRuns();
  const start = useStartChallengeRun();
  const create = useCreateChallengeTemplate();
  const update = useUpdateChallengeTemplate();

  const activeRunByTemplate = new Map(myRuns.map((r) => [r.template_id, r]));

  const [showInfo, setShowInfo] = useState(false);

  // Create form state
  const [cName, setCName] = useState("");
  const [cDesc, setCDesc] = useState("");
  const [cDur, setCDur] = useState(7);
  const createPicker = useQuestPicker(allTasks);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<ChallengeTemplate | null>(null);
  const [eName, setEName] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eDur, setEDur] = useState(7);
  const [editPickerOpen, setEditPickerOpen] = useState(false);
  const editPicker = useQuestPicker(allTasks);

  const openEdit = (t: ChallengeTemplate) => {
    setEditTarget(t);
    setEName(t.name);
    setEDesc(t.description ?? "");
    setEDur(t.duration_days);
    const blueprint = Array.isArray(t.task_blueprint) ? (t.task_blueprint as BlueprintTask[]) : [];
    editPicker.loadFromBlueprint(blueprint, allTasks);
  };

  const closeEdit = () => { setEditTarget(null); editPicker.reset(); setEditPickerOpen(false); };

  const onStart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await start.mutateAsync(id);
      toast.success("Challenge started — your existing quests are now being tracked.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not start challenge");
    }
  };

  const onCreate = async () => {
    if (!cName.trim()) { toast.error("Challenge name is required."); return; }
    if (createPicker.selectedIds.size === 0) { toast.error("Select at least one quest."); return; }
    try {
      await create.mutateAsync({ name: cName, description: cDesc, duration_days: Math.max(1, Math.min(90, cDur)), tasks: createPicker.buildBlueprint() });
      toast.success("Custom challenge created.");
      setCName(""); setCDesc(""); setCDur(7); createPicker.reset();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not create challenge");
    }
  };

  const onUpdate = async () => {
    if (!editTarget) return;
    if (!eName.trim()) { toast.error("Challenge name is required."); return; }
    if (editPicker.selectedIds.size === 0) { toast.error("Select at least one quest."); return; }
    try {
      await update.mutateAsync({ id: editTarget.id, name: eName, description: eDesc, duration_days: Math.max(1, Math.min(90, eDur)), tasks: editPicker.buildBlueprint() });
      toast.success("Challenge updated.");
      closeEdit();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update challenge");
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Trophy className="text-primary" size={28} />
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>CHALLENGES</h1>
            <button type="button" onClick={() => setShowInfo(true)} className="text-muted-foreground hover:text-primary">
              <Info size={16} />
            </button>
          </div>
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
            Join a timed arc — tasks copy into your Quest Log and score as you finish to-dos.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Left — challenge list */}
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-muted-foreground">Loading templates...</p>
          ) : templates.map((t) => {
            const activeRun = activeRunByTemplate.get(t.id);
            return (
              <div
                key={t.id}
                className="pixel-panel p-4 flex flex-col sm:flex-row sm:items-center gap-3 cursor-pointer hover:border-primary transition-colors"
                onClick={() => openEdit(t)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>{t.name}</h2>
                    {activeRun && (
                      <span
                        className="px-1.5 py-0.5 bg-green-500/15 border border-green-500 text-green-400 text-[9px] shrink-0"
                        style={{ fontFamily: "var(--font-pixel)" }}
                      >
                        ACTIVE · ends {activeRun.ends_on}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-2" style={{ fontFamily: "var(--font-pixel)" }}>
                    {t.duration_days} days · tracks your existing quests
                  </p>
                  {activeRun && <ChallengeProgress run={activeRun} totalDays={t.duration_days} />}
                  {activeRun && <ChallengeStats runId={activeRun.run_id} run={activeRun} totalDays={t.duration_days} />}
                </div>
                {!activeRun && (
                  <button
                    onClick={(e) => void onStart(t.id, e)}
                    disabled={start.isPending}
                    className="px-4 py-2 bg-primary text-primary-foreground shrink-0 disabled:opacity-50"
                    style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                  >
                    {start.isPending ? "STARTING..." : "BEGIN"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Right — create form */}
        <div className="lg:sticky lg:top-4 space-y-3">
          <div className="pixel-panel p-4 space-y-3">
            <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>CREATE CUSTOM CHALLENGE</h2>
            <div className="flex flex-col gap-2">
              <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Challenge name"
                className="px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm" />
              <input value={cDesc} onChange={(e) => setCDesc(e.target.value)} placeholder="Description"
                className="px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm" />
              <input type="number" min={1} max={90} value={cDur} onChange={(e) => setCDur(Number(e.target.value || 7))}
                className="px-2 py-1.5 bg-input border-2 border-border text-sm" placeholder="Duration (days)" />

              <button type="button" onClick={() => createPicker.setPickerOpen(true)}
                className="px-2 py-1.5 border-2 border-border hover:border-primary text-left text-sm flex items-center justify-between gap-2">
                <span className={createPicker.selectedIds.size === 0 ? "text-muted-foreground" : "text-foreground"}>
                  {createPicker.selectedIds.size === 0 ? "Select tracked quests…" : `${createPicker.selectedIds.size} quest${createPicker.selectedIds.size > 1 ? "s" : ""} selected`}
                </span>
                <Check size={14} className={createPicker.selectedIds.size > 0 ? "text-primary" : "text-muted-foreground"} />
              </button>
            </div>

            <button onClick={() => void onCreate()} disabled={create.isPending}
              className="px-3 py-2 bg-primary text-primary-foreground disabled:opacity-50"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
              {create.isPending ? "CREATING..." : "CREATE TRIAL"}
            </button>
          </div>

        </div>
      </div>

      {/* ── Quest picker modal for CREATE ── */}
      <QuestPickerModal
        open={createPicker.pickerOpen}
        onClose={() => createPicker.setPickerOpen(false)}
        filteredTasks={createPicker.filteredTasks}
        selectedIds={createPicker.selectedIds}
        search={createPicker.search}
        onSearch={createPicker.setSearch}
        onToggle={createPicker.toggle}
        onToggleAll={createPicker.toggleAll}
        getOv={createPicker.getOv}
        patchOv={createPicker.patchOv}
      />

      {/* ── Edit modal ── */}
      {editTarget && (
        <div className="fixed inset-0 z-130 bg-black/50 flex items-center justify-center p-4" onClick={closeEdit}>
          <div className="pixel-panel w-full max-w-lg bg-card flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b-2 border-border shrink-0">
              <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>EDIT CHALLENGE</h3>
              <button type="button" onClick={closeEdit} className="hover:text-destructive"><X size={16} /></button>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              <div className="flex flex-col gap-2">
                <input value={eName} onChange={(e) => setEName(e.target.value)} placeholder="Challenge name"
                  className="px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm" />
                <input value={eDesc} onChange={(e) => setEDesc(e.target.value)} placeholder="Description"
                  className="px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm" />
                <input type="number" min={1} max={90} value={eDur} onChange={(e) => setEDur(Number(e.target.value || 7))}
                  className="px-2 py-1.5 bg-input border-2 border-border text-sm" placeholder="Duration (days)" />

                <button type="button" onClick={() => setEditPickerOpen(true)}
                  className="px-2 py-1.5 border-2 border-border hover:border-primary text-left text-sm flex items-center justify-between gap-2">
                  <span className={editPicker.selectedIds.size === 0 ? "text-muted-foreground" : "text-foreground"}>
                    {editPicker.selectedIds.size === 0 ? "Select tracked quests…" : `${editPicker.selectedIds.size} quest${editPicker.selectedIds.size > 1 ? "s" : ""} selected`}
                  </span>
                  <Check size={14} className={editPicker.selectedIds.size > 0 ? "text-primary" : "text-muted-foreground"} />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t-2 border-border flex justify-end gap-2 shrink-0">
              <button type="button" onClick={closeEdit}
                className="px-3 py-2 border-2 border-border hover:border-primary text-sm"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                CANCEL
              </button>
              <button onClick={() => void onUpdate()} disabled={update.isPending}
                className="px-3 py-2 bg-primary text-primary-foreground disabled:opacity-50"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                {update.isPending ? "SAVING..." : "SAVE CHANGES"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Quest picker modal for EDIT ── */}
      <QuestPickerModal
        open={editPickerOpen}
        onClose={() => setEditPickerOpen(false)}
        filteredTasks={editPicker.filteredTasks}
        selectedIds={editPicker.selectedIds}
        search={editPicker.search}
        onSearch={editPicker.setSearch}
        onToggle={editPicker.toggle}
        onToggleAll={editPicker.toggleAll}
        getOv={editPicker.getOv}
        patchOv={editPicker.patchOv}
      />

      {/* Info modal */}
      {showInfo && (
        <div className="fixed inset-0 z-130 bg-black/50 p-4 flex items-center justify-center" onClick={() => setShowInfo(false)}>
          <div className="pixel-panel w-full max-w-xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>CHALLENGES GUIDE</h3>
              <button type="button" onClick={() => setShowInfo(false)}
                className="px-2 py-0.5 border border-border hover:border-primary text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}>CLOSE</button>
            </div>
            <ul className="list-disc pl-5 space-y-2 text-base text-muted-foreground">
              <li><strong className="text-foreground">Create challenge:</strong> Pick quests from your log to track, set duration and difficulty per quest.</li>
              <li><strong className="text-foreground">Edit challenge:</strong> Click any challenge card to open the edit modal.</li>
              <li><strong className="text-foreground">Start run:</strong> Starting a challenge copies tasks into your Quest Log.</li>
              <li><strong className="text-foreground">Scoring:</strong> Progress and leaderboard scores increase as you complete challenge tasks.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Challenge stats ───────────────────────────────────────────────────────────
function ChallengeStats({ runId, run, totalDays }: { runId: string; run: MyRun; totalDays: number }) {
  const { data: tasks = [] } = useChallengeRunTasks(runId);

  if (tasks.length === 0) return null;

  const habits  = tasks.filter((t) => t.type === "habit");
  const dailies = tasks.filter((t) => t.type === "daily");
  const todos   = tasks.filter((t) => t.type === "todo");

  const start = new Date(run.starts_on);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.max(1, Math.min(totalDays, Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1));

  const completedTodos = todos.filter((t) => t.completed).length;
  const totalTodos = todos.length;

  const bestDailyStreak = dailies.reduce((max, t) => Math.max(max, t.streak_best ?? 0), 0);
  const currentDailyStreak = dailies.reduce((max, t) => Math.max(max, t.streak_current ?? 0), 0);
  const totalHabitTaps = habits.reduce((sum, t) => sum + (t.positive_count ?? 0), 0);

  // Dailies completed today
  const todayStr = today.toISOString().slice(0, 10);
  const dailiesHitToday = dailies.filter((t) => t.last_completed_local_date === todayStr).length;

  const statItems = [
    ...(dailies.length > 0 ? [
      { label: "CURRENT STREAK", value: `${currentDailyStreak}d`, sub: "dailies" },
      { label: "BEST STREAK", value: `${bestDailyStreak}d`, sub: "dailies" },
      { label: "TODAY", value: `${dailiesHitToday}/${dailies.length}`, sub: "dailies done" },
    ] : []),
    ...(todos.length > 0 ? [
      { label: "TO-DOS DONE", value: `${completedTodos}/${totalTodos}`, sub: "completed" },
    ] : []),
    ...(habits.length > 0 ? [
      { label: "HABIT TAPS", value: String(totalHabitTaps), sub: `over ${elapsed} days` },
    ] : []),
    { label: "SCORE", value: String(run.score), sub: "total points" },
  ];

  // Mini bar chart: daily completions heat — use streak_current as proxy for recent activity
  const dailyCompletionPct = dailies.length > 0
    ? Math.round((dailies.filter((t) => (t.streak_current ?? 0) > 0).length / dailies.length) * 100)
    : null;

  return (
    <div className="mt-4 pt-3 border-t border-border space-y-3">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-pixel)" }}>STATS</p>

      {/* Stat grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {statItems.map((s) => (
          <div key={s.label} className="bg-secondary/40 border border-border px-2 py-2 space-y-0.5">
            <p className="text-[8px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>{s.label}</p>
            <p className="text-base text-primary leading-none" style={{ fontFamily: "var(--font-pixel)" }}>{s.value}</p>
            <p className="text-[8px] text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Dailies on-streak bar */}
      {dailies.length > 0 && dailyCompletionPct !== null && (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[8px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>DAILIES ON STREAK</span>
            <span className="text-[8px] text-primary" style={{ fontFamily: "var(--font-pixel)" }}>{dailyCompletionPct}%</span>
          </div>
          <div className="w-full h-1.5 bg-secondary border border-border overflow-hidden">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${dailyCompletionPct}%` }} />
          </div>
        </div>
      )}

      {/* To-do completion bar */}
      {todos.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[8px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>TO-DO PROGRESS</span>
            <span className="text-[8px] text-primary" style={{ fontFamily: "var(--font-pixel)" }}>{completedTodos}/{totalTodos}</span>
          </div>
          <div className="w-full h-1.5 bg-secondary border border-border overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: totalTodos > 0 ? `${Math.round((completedTodos / totalTodos) * 100)}%` : "0%" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Challenge progress bar ────────────────────────────────────────────────────
function ChallengeProgress({ run, totalDays }: { run: MyRun; totalDays: number }) {
  const start = new Date(run.starts_on);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const elapsed = Math.max(0, Math.min(totalDays, Math.floor((today.getTime() - start.getTime()) / 86_400_000) + 1));
  const pct = Math.round((elapsed / totalDays) * 100);

  return (
    <div className="mt-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
          DAY {elapsed}/{totalDays}
        </span>
        <span className="text-[9px] text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          SCORE: {run.score}
        </span>
      </div>
      <div className="w-full h-2 bg-secondary border border-border overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Shared quest-picker modal ─────────────────────────────────────────────────
type Task = { id: string; title: string; type: string; difficulty: string };

function QuestPickerModal({
  open, onClose,
  filteredTasks, selectedIds, search, onSearch,
  onToggle, onToggleAll, getOv, patchOv,
}: {
  open: boolean;
  onClose: () => void;
  filteredTasks: Task[];
  selectedIds: Set<string>;
  search: string;
  onSearch: (v: string) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  getOv: (id: string, task: { type: string; difficulty: string }) => { type: "habit" | "daily" | "todo"; difficulty: "trivial" | "easy" | "medium" | "hard"; sacred_days: number };
  patchOv: (id: string, task: { type: string; difficulty: string }, patch: Partial<{ type: "habit" | "daily" | "todo"; difficulty: "trivial" | "easy" | "medium" | "hard"; sacred_days: number }>) => void;
}) {
  if (!open) return null;

  const habits  = filteredTasks.filter((t) => t.type === "habit");
  const dailies = filteredTasks.filter((t) => t.type === "daily");
  const todos   = filteredTasks.filter((t) => t.type === "todo");

  const Section = ({ label, tasks }: { label: string; tasks: Task[] }) => {
    if (tasks.length === 0) return null;
    return (
      <div>
        <div className="px-3 py-1.5 bg-secondary/60 border-b border-border">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider" style={{ fontFamily: "var(--font-pixel)" }}>{label}</span>
        </div>
        {tasks.map((task) => {
          const selected = selectedIds.has(task.id);
          const ov = getOv(task.id, task);
          return (
            <div key={task.id} className={`p-3 space-y-2 border-b border-border last:border-b-0 ${selected ? "bg-primary/5" : ""}`}>
              <button type="button" onClick={() => onToggle(task.id)} className="w-full flex items-center gap-3 text-left">
                <div className={`w-4 h-4 border-2 shrink-0 flex items-center justify-center ${selected ? "border-primary bg-primary" : "border-border"}`}>
                  {selected && <Check size={10} className="text-primary-foreground" />}
                </div>
                <span className="text-sm flex-1 min-w-0 truncate">{task.title}</span>
              </button>

              {selected && (
                <div className="ml-7 flex flex-wrap gap-2">
                  <select value={ov.type} onChange={(e) => patchOv(task.id, task, { type: e.target.value as "habit" | "daily" | "todo" })}
                    className="px-1.5 py-0.5 bg-input border border-border text-[11px]">
                    <option value="habit">Habit</option>
                    <option value="daily">Daily</option>
                    <option value="todo">To-do</option>
                  </select>
                  <select value={ov.difficulty} onChange={(e) => patchOv(task.id, task, { difficulty: e.target.value as "trivial" | "easy" | "medium" | "hard" })}
                    className="px-1.5 py-0.5 bg-input border border-border text-[11px]">
                    {Object.entries(DIFF_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {ov.type === "daily" && (
                    <div className="flex gap-0.5">
                      {DOW_LABELS.map((lb, dow) => (
                        <button key={lb} type="button"
                          onClick={() => patchOv(task.id, task, { sacred_days: ov.sacred_days ^ (1 << dow) })}
                          className={`px-1 py-0.5 border text-[9px] ${(ov.sacred_days >> dow) & 1 ? "border-primary bg-primary/15 text-primary" : "border-border opacity-50"}`}>
                          {lb}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-140 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="pixel-panel w-full max-w-xl bg-card flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b-2 border-border shrink-0">
          <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>SELECT QUESTS</h3>
          <button type="button" onClick={onClose} className="hover:text-destructive"><X size={16} /></button>
        </div>

        <div className="p-3 border-b-2 border-border space-y-2 shrink-0">
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search quests…"
            className="w-full px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm" />
          <button type="button" onClick={onToggleAll}
            className="text-[10px] text-primary hover:underline" style={{ fontFamily: "var(--font-pixel)" }}>
            {selectedIds.size === filteredTasks.length && filteredTasks.length > 0 ? "Deselect all" : "Select all"}
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {filteredTasks.length === 0
            ? <p className="p-4 text-sm text-muted-foreground">No quests found.</p>
            : <><Section label="Habits" tasks={habits} /><Section label="Dailies" tasks={dailies} /><Section label="To-dos" tasks={todos} /></>
          }
        </div>

        <div className="p-3 border-t-2 border-border flex justify-between items-center shrink-0">
          <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>{selectedIds.size} selected</span>
          <button type="button" onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground text-[11px]" style={{ fontFamily: "var(--font-pixel)" }}>
            CONFIRM
          </button>
        </div>
      </div>
    </div>
  );
}
