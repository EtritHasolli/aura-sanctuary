import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback, type DragEvent, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  MoreVertical,
  Info,
  Pencil,
  Folder,
  FileText,
  Search,
  X,
  Pin,
  Trash2,
  Layers,
  Timer,
  Play,
  Pause,
  Square,
  Plus,
} from "lucide-react";
import { MarkdownEditor } from "@/components/aura/MarkdownEditor";
import {
  useNotes,
  useTrashedNotes,
  useCreateNote,
  useUpdateNote,
  useTrashNotes,
  useRestoreNotes,
  useDeleteNotesForever,
  purgeExpiredTrash,
} from "@/hooks/useNotes";
import { useFlashcardDeck, type DeckCard } from "@/hooks/useFlashcards";
import { useAuth } from "@/hooks/useAuth";
import { BugLoader } from "@/components/aura/BugLoader";
import { usePomodoro } from "@/components/aura/PomodoroContext";
import { FlashcardReviewDialog } from "@/components/archives/FlashcardReviewDialog";
import { MoveNoteDialog, descendantIds, notePath } from "@/components/archives/MoveNoteDialog";
import { TrashView, type TrashBatch } from "@/components/archives/TrashView";
import { useCreateTask, useCreateChecklistItem } from "@/hooks/useTasks";
import { NOTE_TEMPLATES } from "@/lib/archives/templates";
import { downloadMarkdown, printNoteAsPdf } from "@/lib/archives/export";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import type { Note } from "@/lib/aura/types";

const search = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/archives")({
  head: () => ({ meta: [{ title: "Archives — Aura" }] }),
  validateSearch: (s) => search.parse(s),
  component: ArchivesPage,
});

const COLORS = [
  { label: "None",   value: "",        bg: "transparent",  border: "var(--border)" },
  { label: "Amber",  value: "#d99630", bg: "#d9963022",    border: "#d99630" },
  { label: "Red",    value: "#b24a35", bg: "#b24a3522",    border: "#b24a35" },
  { label: "Green",  value: "#5b7d56", bg: "#5b7d5622",    border: "#5b7d56" },
  { label: "Blue",   value: "#4f8cff", bg: "#4f8cff22",    border: "#4f8cff" },
  { label: "Purple", value: "#9b6dff", bg: "#9b6dff22",    border: "#9b6dff" },
  { label: "Sienna", value: "#bf651f", bg: "#bf651f22",    border: "#bf651f" },
];

const SORT_STORAGE_KEY = "aura:archives-sort";
type SortMode = "az" | "recent";

const pixel = { fontFamily: "var(--font-pixel)" } as const;

function ColorPicker({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = COLORS.find((c) => c.value === (value ?? "")) ?? COLORS[0];

  useEffect(() => {
    if (!open) return;
    const handle = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Highlight color"
        className="w-4 h-4 border-2 rounded-sm"
        style={{
          background: active.value ? active.bg : "var(--input)",
          borderColor: active.value ? active.border : "var(--border)",
        }}
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border-2 border-border p-1.5 flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c.value || "none"}
              type="button"
              onClick={() => { onChange(c.value); setOpen(false); }}
              title={c.label}
              className="w-5 h-5 border-2 rounded-sm hover:scale-110 transition-transform"
              style={{
                background: c.value ? c.bg : "var(--input)",
                borderColor: c.value ? c.border : "var(--border)",
                outline: active.value === c.value ? `2px solid ${c.value || "var(--border)"}` : "none",
                outlineOffset: "2px",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type NoteTree = { note: Note; children: NoteTree[] };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Folders first, then A–Z (or most recently edited). */
function compareNotes(a: Note, b: Note, sort: SortMode) {
  if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1;
  if (sort === "recent") return b.updated_at.localeCompare(a.updated_at);
  return collator.compare(a.title || "Untitled", b.title || "Untitled");
}

function buildTree(notes: Note[], sort: SortMode): NoteTree[] {
  const map = new Map<string, NoteTree>();
  for (const n of notes) map.set(n.id, { note: n, children: [] });
  const roots: NoteTree[] = [];
  for (const n of notes) {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(node);
    else roots.push(node);
  }
  const sortLevel = (level: NoteTree[]) => {
    level.sort((a, b) => compareNotes(a.note, b.note, sort));
    for (const node of level) sortLevel(node.children);
  };
  sortLevel(roots);
  return roots;
}

function fmtClock(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "ig"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-primary/30 text-foreground">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function makeSnippet(content: string, query: string) {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return "";
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + query.length + 70);
  return `${start > 0 ? "…" : ""}${content.slice(start, end).replace(/\s+/g, " ")}${end < content.length ? "…" : ""}`;
}

function InfoPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-6 w-6 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground flex items-center justify-center"
        title="How Archives work"
      >
        <Info size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-card border-2 border-border w-80 max-w-[calc(100vw-2rem)] p-3 flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
          <p className="text-primary" style={{ ...pixel, fontSize: "0.6rem" }}>HOW ARCHIVES WORK</p>
          <div className="space-y-1.5 text-muted-foreground" style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem" }}>
            <p><span className="text-foreground">Folders</span>: group notes by subject. New notes go into the folder you have open.</p>
            <p><span className="text-foreground">Moving</span>: drag a note onto another note or folder, or use ⋮ → Move to…</p>
            <p><span className="text-foreground">Search</span>: matches titles and note text (Ctrl+K).</p>
            <p><span className="text-foreground">Pin</span>: ⋮ → Pin keeps a note at the top of the sidebar.</p>
            <p><span className="text-foreground">Trash</span>: deleted notes can be restored for 30 days.</p>
            <p><span className="text-foreground">Focus</span>: starts the Pomodoro on this note with a timer right in the editor.</p>
            <p><span className="text-foreground">To-Dos link</span>: ⋮ → Convert to task sends a note to your quests.</p>
            <hr className="border-border" />
            <p className="text-foreground" style={{ ...pixel, fontSize: "0.55rem" }}>FLASHCARDS</p>
            <p>Write a line as <code className="text-primary">Question :: Answer</code> and it becomes a card. Review due cards for XP (up to 25 XP a day); cards you know come back less often.</p>
            <hr className="border-border" />
            <p className="text-foreground" style={{ ...pixel, fontSize: "0.55rem" }}>MARKDOWN SHORTCUTS</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              <code className="text-primary"># Title</code><span>Large header</span>
              <code className="text-primary">## Section</code><span>Section header</span>
              <code className="text-primary">### Sub</code><span>Sub-header</span>
              <code className="text-primary">- item</code><span>Bullet point</span>
              <code className="text-primary">- [ ] item</code><span>Checklist item</span>
              <code className="text-primary">- [x] item</code><span>Checked item</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface DragApi {
  draggingId: string | null;
  dropTargetId: string | null;
  canDropOn: (targetId: string) => boolean;
  onDragStart: (id: string, e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (targetId: string, e: DragEvent) => void;
  onDrop: (targetId: string, e: DragEvent) => void;
}

function SidebarNode({
  node, depth, selectedId, onSelect, onUpdateColor, drag,
}: {
  node: NoteTree; depth: number; selectedId: string | null;
  onSelect: (id: string) => void; onUpdateColor: (id: string, color: string) => void;
  drag: DragApi;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const active = selectedId === node.note.id;
  const color = COLORS.find((c) => c.value === (node.note.color ?? "")) ?? COLORS[0];
  const isDropTarget = drag.dropTargetId === node.note.id;

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => drag.onDragStart(node.note.id, e)}
        onDragEnd={drag.onDragEnd}
        onDragOver={(e) => drag.onDragOver(node.note.id, e)}
        onDrop={(e) => drag.onDrop(node.note.id, e)}
        className={`flex items-center gap-1 px-1 py-1 cursor-pointer rounded-sm group ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        } ${drag.draggingId === node.note.id ? "opacity-40" : ""} ${
          isDropTarget ? "outline outline-2 outline-primary bg-primary/10" : ""
        }`}
        style={{
          paddingLeft: `${4 + depth * 14}px`,
          background: active && !isDropTarget
            ? color.value ? color.bg : "color-mix(in oklab, var(--primary) 12%, transparent)"
            : undefined,
          borderLeft: active && color.value ? `2px solid ${color.border}` : undefined,
        }}
        onClick={() => onSelect(node.note.id)}
      >
        <button
          type="button"
          className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground"
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setExpanded((v) => !v); }}
        >
          {hasChildren ? (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : <span className="w-3" />}
        </button>
        {node.note.is_folder
          ? <Folder size={12} className="shrink-0 text-primary/70" />
          : <div onClick={(e) => e.stopPropagation()}>
              <ColorPicker value={node.note.color} onChange={(c) => onUpdateColor(node.note.id, c)} />
            </div>
        }
        <span className="flex-1 text-xs truncate ml-1">{node.note.title || "Untitled"}</span>
        {node.note.pinned && <Pin size={10} className="shrink-0 text-primary/70" />}
        <span className="text-[10px] text-muted-foreground/60 shrink-0 hidden group-hover:block">
          {formatDistanceToNow(new Date(node.note.updated_at), { addSuffix: true })}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <SidebarNode key={child.note.id} node={child} depth={depth + 1}
              selectedId={selectedId} onSelect={onSelect} onUpdateColor={onUpdateColor} drag={drag} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewNoteMenu({ disabled, onCreate }: { disabled: boolean; onCreate: (templateId: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative flex-1 flex">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onCreate("blank")}
        className="flex-1 flex items-center justify-center py-1.5 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        style={{ ...pixel, fontSize: "0.6rem" }}
      >
        NOTE
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="w-6 flex items-center justify-center bg-primary text-primary-foreground border-l border-primary-foreground/30 hover:opacity-90 disabled:opacity-50"
        title="New from template"
      >
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border-2 border-border w-60 flex flex-col">
          <p className="px-3 pt-2 pb-1 text-muted-foreground" style={{ ...pixel, fontSize: "0.5rem" }}>NEW FROM TEMPLATE</p>
          {NOTE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => { setOpen(false); onCreate(t.id); }}
              className="text-left px-3 py-2 hover:bg-secondary"
            >
              <div className="text-xs text-foreground">{t.label}</div>
              <div className="text-[10px] text-muted-foreground">{t.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivesPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: notes = [] } = useNotes();
  const { data: trashed = [] } = useTrashedNotes();
  const create = useCreateNote();
  const update = useUpdateNote();
  const trashNotes = useTrashNotes();
  const restoreNotes = useRestoreNotes();
  const deleteForever = useDeleteNotesForever();
  const createTask = useCreateTask();
  const createChecklistItem = useCreateChecklistItem();
  const pomodoro = usePomodoro();

  const [selectedId, setSelectedId] = useState<string | null>(id ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  const [titleModalValue, setTitleModalValue] = useState("");
  const [titleModalColor, setTitleModalColor] = useState<string>("");
  const [converting, setConverting] = useState(false);
  const [view, setView] = useState<"notes" | "trash">("notes");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>(() =>
    typeof window !== "undefined" && localStorage.getItem(SORT_STORAGE_KEY) === "recent" ? "recent" : "az",
  );
  const [moveOpen, setMoveOpen] = useState(false);
  const [review, setReview] = useState<{ title: string; noteId: string | null } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // Follow ?id= when another page links to a note while Archives is already open.
  useEffect(() => {
    if (id && id !== selectedId) {
      setSelectedId(id);
      setView("notes");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the URL changes
  }, [id]);

  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId((notes.find((n) => n.pinned) ?? notes[0]).id);
  }, [notes, selectedId]);

  // Clear out notes that have sat in the trash past the retention period.
  useEffect(() => {
    if (!user?.id) return;
    void purgeExpiredTrash(user.id).then(() =>
      qc.invalidateQueries({ queryKey: ["notes", user.id, "trash"] }),
    );
  }, [user?.id, qc]);

  // Ctrl/Cmd+K focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        setView("notes");
        setTimeout(() => searchRef.current?.focus(), 50);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handle = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [moreOpen]);

  useEffect(() => {
    setTitle(selected?.title ?? "");
    setContent(selected?.content ?? "");
    setPreview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when switching notes
  }, [selected?.id]);

  /** Unsaved edit waiting for the debounce, tied to the note it belongs to. */
  const pendingSaveRef = useRef<{ id: string; title: string; content: string } | null>(null);

  const flushPendingSave = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    // Plain request (not a mutation hook) so it still runs when the page is unmounting.
    void supabase
      .from("notes")
      .update({ title: pending.title, content: pending.content })
      .eq("id", pending.id)
      .then(({ error }) => {
        if (error) toast.error(`Could not save "${pending.title || "Untitled"}": ${error.message}`);
        void qc.invalidateQueries({ queryKey: ["notes"] });
      });
  }, [qc]);

  const scheduleAutoSave = useCallback((t: string, c: string) => {
    if (!selected) return;
    pendingSaveRef.current = { id: selected.id, title: t, content: c };
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(flushPendingSave, 1000);
  }, [selected, flushPendingSave]);

  // Save the last second of typing when switching notes or leaving the page.
  useEffect(() => () => flushPendingSave(), [selected?.id, flushPendingSave]);
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") flushPendingSave();
    };
    window.addEventListener("pagehide", flushPendingSave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushPendingSave);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [flushPendingSave]);

  const handleTitleChange = (val: string) => { setTitle(val); scheduleAutoSave(val, content); };
  const handleContentChange = (val: string) => { setContent(val); scheduleAutoSave(title, val); };

  /** Notes with the open note's unsaved edits applied, so search and flashcards are live. */
  const liveNotes = useMemo(
    () => notes.map((n) => (n.id === selected?.id ? { ...n, title, content } : n)),
    [notes, selected?.id, title, content],
  );
  const byId = useMemo(() => new Map(liveNotes.map((n) => [n.id, n])), [liveNotes]);
  const activeIds = useMemo(() => new Set(notes.map((n) => n.id)), [notes]);

  const tree = useMemo(() => buildTree(liveNotes, sort), [liveNotes, sort]);
  const nodeById = useMemo(() => {
    const map = new Map<string, NoteTree>();
    const walk = (nodes: NoteTree[]) => {
      for (const node of nodes) {
        map.set(node.note.id, node);
        walk(node.children);
      }
    };
    walk(tree);
    return map;
  }, [tree]);
  const selectedChildren = selected ? (nodeById.get(selected.id)?.children ?? []) : [];
  const pinned = useMemo(
    () => liveNotes.filter((n) => n.pinned).sort((a, b) => compareNotes(a, b, "az")),
    [liveNotes],
  );

  const deck = useFlashcardDeck(liveNotes);
  const dueCount = deck.filter((c) => c.due).length;
  const selectedCards = useMemo(() => deck.filter((c) => c.noteId === selected?.id), [deck, selected?.id]);
  const selectedDue = selectedCards.filter((c) => c.due).length;
  const reviewCards: DeckCard[] = review
    ? review.noteId ? deck.filter((c) => c.noteId === review.noteId) : deck
    : [];

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return liveNotes
      .map((n) => ({ note: n, inTitle: (n.title || "untitled").toLowerCase().includes(q) }))
      .filter(({ note, inTitle }) => inTitle || note.content.toLowerCase().includes(q))
      .sort((a, b) => Number(b.inTitle) - Number(a.inTitle) || b.note.updated_at.localeCompare(a.note.updated_at))
      .slice(0, 100);
  }, [liveNotes, query]);

  const selectNote = (nid: string) => {
    setSelectedId(nid);
    setView("notes");
    navigate({ to: "/archives", search: { id: nid } });
  };

  /** New notes and folders go inside the folder that's open, otherwise at the top level. */
  const newParentId = selected?.is_folder ? selected.id : null;

  const createFromTemplate = async (templateId: string, parentId: string | null = newParentId) => {
    const template = NOTE_TEMPLATES.find((t) => t.id === templateId) ?? NOTE_TEMPLATES[0];
    const { title: t, content: c } = template.build();
    const n = await create.mutateAsync({ title: t, content: c, parent_id: parentId });
    selectNote(n.id);
  };

  const newFolder = async () => {
    const n = await create.mutateAsync({ title: "New Folder", content: "", parent_id: newParentId, is_folder: true });
    selectNote(n.id);
  };

  const updateColor = (nid: string, color: string) => {
    update.mutate({ id: nid, patch: { color } });
  };

  const togglePin = (note: Note) => {
    update.mutate(
      { id: note.id, patch: { pinned: !note.pinned } },
      { onSuccess: () => toast.success(note.pinned ? "Unpinned." : "Pinned to the top.") },
    );
  };

  const moveNote = (noteId: string, parentId: string | null) => {
    const note = byId.get(noteId);
    if (!note || note.parent_id === parentId) return;
    if (parentId && descendantIds(noteId, notes).has(parentId)) {
      toast.error("A note can't be moved inside one of its own sub-pages.");
      return;
    }
    const target = parentId ? byId.get(parentId) : null;
    update.mutate(
      { id: noteId, patch: { parent_id: parentId } },
      { onSuccess: () => toast.success(`Moved to ${target ? `“${target.title || "Untitled"}”` : "the top level"}.`) },
    );
  };

  const trashNote = async (note: Note) => {
    const ids = [...descendantIds(note.id, notes)];
    if (pendingSaveRef.current && ids.includes(pendingSaveRef.current.id)) flushPendingSave();
    try {
      await trashNotes.mutateAsync(ids);
    } catch {
      return; // toast shown by the hook
    }
    if (ids.includes(pomodoro.focusNoteId ?? "")) pomodoro.setFocusNoteId(null);
    const next = notes.find((n) => !ids.includes(n.id)) ?? null;
    setSelectedId(next?.id ?? null);
    navigate({ to: "/archives", search: next ? { id: next.id } : {}, replace: true });
    toast(`Moved “${note.title || "Untitled"}” to the trash.`, {
      action: { label: "UNDO", onClick: () => restoreNotes.mutate({ ids }) },
    });
  };

  const restoreBatch = (batch: TrashBatch) => {
    restoreNotes.mutate(
      { ids: batch.ids, detachIds: batch.detach ? [batch.top.id] : [] },
      {
        onSuccess: () =>
          toast.success(`Restored “${batch.top.title || "Untitled"}”`, {
            action: { label: "OPEN", onClick: () => selectNote(batch.top.id) },
          }),
      },
    );
  };

  /** Folder export: every note inside it, in sidebar order, as one document. */
  const exportBody = (note: Note) => {
    if (!note.is_folder) return note.id === selected?.id ? content : note.content;
    const parts: string[] = [];
    const walk = (nodes: NoteTree[], level: number) => {
      for (const node of nodes) {
        const heading = "#".repeat(Math.min(level, 6));
        parts.push(`${heading} ${node.note.title || "Untitled"}\n\n${node.note.content}`.trim());
        walk(node.children, level + 1);
      }
    };
    walk(nodeById.get(note.id)?.children ?? [], 2);
    return parts.join("\n\n");
  };

  const startFocus = (note: Note) => {
    pomodoro.setFocusNoteId(note.id);
    if (!pomodoro.running) pomodoro.start();
    toast.success(`Focus started on “${note.title || "Untitled"}”.`);
  };

  // ── Drag & drop (desktop) ────────────────────────────────────────────────
  const dragBlocked = useMemo(
    () => (draggingId ? descendantIds(draggingId, notes) : new Set<string>()),
    [draggingId, notes],
  );
  const drag: DragApi = {
    draggingId,
    dropTargetId,
    canDropOn: (targetId) =>
      !!draggingId && !dragBlocked.has(targetId) && byId.get(draggingId)?.parent_id !== targetId,
    onDragStart: (nid, e) => {
      e.dataTransfer.setData("text/plain", nid);
      e.dataTransfer.effectAllowed = "move";
      setDraggingId(nid);
    },
    onDragEnd: () => {
      setDraggingId(null);
      setDropTargetId(null);
    },
    onDragOver: (targetId, e) => {
      if (!drag.canDropOn(targetId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dropTargetId !== targetId) setDropTargetId(targetId);
    },
    onDrop: (targetId, e) => {
      e.preventDefault();
      if (draggingId && drag.canDropOn(targetId)) moveNote(draggingId, targetId);
      setDraggingId(null);
      setDropTargetId(null);
    },
  };
  const draggingHasParent = !!draggingId && !!byId.get(draggingId)?.parent_id;

  const breadcrumb = useMemo(() => {
    if (!selected) return [];
    const crumbs: Note[] = [];
    let cur = selected;
    let guard = 0;
    while (cur.parent_id && guard++ < 50) {
      const parent = byId.get(cur.parent_id);
      if (!parent) break;
      crumbs.unshift(parent);
      cur = parent;
    }
    return crumbs;
  }, [selected, byId]);

  const selectedColor = COLORS.find((c) => c.value === (selected?.color ?? "")) ?? COLORS[0];
  const focusingHere = !!selected && pomodoro.focusNoteId === selected.id;

  const sectionLabel = (label: string, extra?: ReactNode) => (
    <div className="flex items-center justify-between px-1 pt-2 pb-1">
      <span className="text-muted-foreground/70" style={{ ...pixel, fontSize: "0.5rem" }}>{label}</span>
      {extra}
    </div>
  );

  const sidebarContent = (
    <>
      <div className="flex gap-1 p-2 border-b border-border shrink-0">
        <NewNoteMenu disabled={create.isPending} onCreate={(tid) => void createFromTemplate(tid)} />
        <button
          onClick={newFolder}
          disabled={create.isPending}
          className="flex-1 flex items-center justify-center py-1.5 border-2 border-border hover:border-primary disabled:opacity-50"
          style={{ ...pixel, fontSize: "0.6rem" }}
        >
          FOLDER
        </button>
        {/* Desktop-only collapse button */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="hidden md:flex w-7 shrink-0 items-center justify-center border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground"
          title="Collapse"
        >
          <ChevronLeft size={12} />
        </button>
      </div>

      <div className="px-2 pt-2 space-y-1.5 shrink-0">
        <div className="flex items-center gap-1 border-2 border-border focus-within:border-primary bg-input px-1.5">
          <Search size={12} className="text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search notes…"
            className="flex-1 min-w-0 bg-transparent outline-none py-1 text-xs"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground" title="Clear">
              <X size={12} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setReview({ title: "REVIEW ALL FLASHCARDS", noteId: null })}
            disabled={deck.length === 0}
            className={`flex-1 h-6 flex items-center justify-center gap-1 border-2 disabled:opacity-40 ${
              dueCount > 0 ? "border-primary text-primary hover:bg-primary/10" : "border-border text-muted-foreground hover:border-primary"
            }`}
            style={{ ...pixel, fontSize: "0.5rem" }}
            title={deck.length === 0 ? "Write Question :: Answer lines to make flashcards" : "Review flashcards"}
          >
            <Layers size={10} /> {dueCount > 0 ? `REVIEW · ${dueCount} DUE` : "FLASHCARDS"}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = sort === "az" ? "recent" : "az";
              setSort(next);
              localStorage.setItem(SORT_STORAGE_KEY, next);
            }}
            className="h-6 px-1.5 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground"
            style={{ ...pixel, fontSize: "0.5rem" }}
            title="Change sort order (folders always first)"
          >
            {sort === "az" ? "A–Z" : "RECENT"}
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-1">
        {searchResults ? (
          <>
            {sectionLabel(`${searchResults.length} RESULT${searchResults.length === 1 ? "" : "S"}`)}
            {searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center mt-3">Nothing matches “{query}”.</p>
            )}
            {searchResults.map(({ note }) => {
              const path = notePath(note, byId);
              const snip = makeSnippet(note.content, query.trim());
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => selectNote(note.id)}
                  className={`w-full text-left px-2 py-1.5 border-l-2 hover:bg-secondary/40 ${
                    note.id === selectedId ? "border-primary bg-primary/10" : "border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-1 text-xs text-foreground">
                    {note.is_folder ? <Folder size={11} className="shrink-0 text-primary/70" /> : <FileText size={11} className="shrink-0 text-muted-foreground" />}
                    <span className="truncate"><Highlight text={note.title || "Untitled"} query={query.trim()} /></span>
                  </div>
                  {path && <div className="text-[10px] text-muted-foreground/70 truncate pl-4">{path}</div>}
                  {snip && (
                    <div className="text-[10px] text-muted-foreground pl-4 line-clamp-2">
                      <Highlight text={snip} query={query.trim()} />
                    </div>
                  )}
                </button>
              );
            })}
          </>
        ) : (
          <>
            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center mt-4">Your archives are empty.</p>
            )}
            {pinned.length > 0 && (
              <>
                {sectionLabel("PINNED")}
                {pinned.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => selectNote(n.id)}
                    className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs text-left ${
                      n.id === selectedId ? "text-foreground bg-primary/10" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Pin size={10} className="shrink-0 text-primary/70" />
                    <span className="truncate">{n.title || "Untitled"}</span>
                  </button>
                ))}
                {sectionLabel("ALL NOTES")}
              </>
            )}
            {tree.map((node) => (
              <SidebarNode key={node.note.id} node={node} depth={0}
                selectedId={selectedId} onSelect={selectNote} onUpdateColor={updateColor} drag={drag} />
            ))}
            {draggingId && draggingHasParent && (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDropTargetId("__root__");
                }}
                onDragLeave={() => setDropTargetId(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  moveNote(draggingId, null);
                  setDraggingId(null);
                  setDropTargetId(null);
                }}
                className={`mt-2 mx-1 py-2 border-2 border-dashed text-center text-[10px] ${
                  dropTargetId === "__root__" ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground"
                }`}
              >
                Drop here to move to the top level
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-2 border-t border-border shrink-0">
        <button
          type="button"
          onClick={() => {
            setView((v) => (v === "trash" ? "notes" : "trash"));
            setSidebarOpen((open) => (window.innerWidth >= 768 ? open : false));
          }}
          className={`w-full h-7 flex items-center justify-center gap-1.5 border-2 ${
            view === "trash" ? "border-destructive text-destructive" : "border-border text-muted-foreground hover:text-foreground hover:border-primary"
          }`}
          style={{ ...pixel, fontSize: "0.55rem" }}
        >
          <Trash2 size={11} /> TRASH{trashed.length > 0 ? ` (${trashed.length})` : ""}
        </button>
      </div>
    </>
  );

  const menuItem = "w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2";

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto h-full flex flex-col">
      {/* Header row — title + mobile toggle */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h1 className="text-lg text-primary" style={pixel}>ARCHIVES</h1>
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          className="md:hidden h-7 w-7 border-2 border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary"
          title={sidebarOpen ? "Close notes" : "Open notes"}
        >
          {sidebarOpen ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      <div className="flex gap-4 flex-1 min-h-0 relative overflow-hidden">

        {/* Mobile drawer backdrop */}
        {sidebarOpen && (
          <div
            className="md:hidden absolute inset-0 z-30 bg-background/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Mobile drawer — slides in from the right */}
        <div
          className={`md:hidden absolute top-0 right-0 h-full z-40 pixel-panel flex flex-col transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "translate-x-full"}`}
          style={{ width: "80vw", maxWidth: "280px" }}
        >
          {create.isPending && <BugLoader overlay size="sm" label="CREATING..." />}
          {sidebarContent}
        </div>

        {/* Desktop sidebar — on the left, width animated */}
        <div
          className="hidden md:flex flex-col min-h-0 shrink-0 pixel-panel overflow-hidden transition-all duration-300 ease-in-out relative"
          style={{ width: sidebarOpen ? "280px" : "2rem" }}
        >
          {create.isPending && <BugLoader overlay size="sm" label="CREATING..." />}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex-1 flex items-center justify-center text-muted-foreground hover:text-primary"
              title="Expand sidebar"
            >
              <ChevronRight size={14} />
            </button>
          )}
          {sidebarOpen && sidebarContent}
        </div>

        {/* Editor */}
        <div
          className="pixel-panel flex flex-col min-h-0 relative transition-colors flex-1"
          style={view === "notes" && selectedColor.value ? { borderColor: selectedColor.border, boxShadow: `inset 0 0 0 1px ${selectedColor.border}22` } : undefined}
        >
          {converting && <BugLoader overlay label="CONVERTING..." />}
          {view === "trash" ? (
            <TrashView
              trashed={trashed}
              activeIds={activeIds}
              busy={restoreNotes.isPending || deleteForever.isPending}
              onRestore={restoreBatch}
              onDeleteForever={(ids) => deleteForever.mutate(ids, { onSuccess: () => toast.success("Deleted forever.") })}
              onClose={() => setView("notes")}
            />
          ) : !selected ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <p className="text-muted-foreground text-sm">Select or create a note.</p>
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden h-7 px-3 border-2 border-border text-muted-foreground hover:border-primary hover:text-foreground flex items-center gap-1"
                style={{ ...pixel, fontSize: "0.6rem" }}
              >
                <ChevronRight size={12} /> OPEN NOTES
              </button>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              {breadcrumb.length > 0 && (
                <div className="flex items-center gap-1 px-4 pt-3 shrink-0 flex-wrap">
                  {breadcrumb.map((crumb, i) => (
                    <span key={crumb.id} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight size={10} className="text-muted-foreground" />}
                      <button
                        type="button"
                        onClick={() => selectNote(crumb.id)}
                        className="text-muted-foreground hover:text-foreground"
                        style={{ ...pixel, fontSize: "0.55rem" }}
                      >
                        {crumb.title || "Untitled"}
                      </button>
                    </span>
                  ))}
                  <ChevronRight size={10} className="text-muted-foreground" />
                </div>
              )}

              {/* Title modal (mobile only) */}
              {titleModalOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                  <div className="pixel-panel w-full max-w-xs flex flex-col gap-3 p-4">
                    <p className="text-primary" style={{ ...pixel, fontSize: "0.6rem" }}>EDIT TITLE</p>
                    <input
                      autoFocus
                      value={titleModalValue}
                      onChange={(e) => setTitleModalValue(e.target.value)}
                      placeholder="Untitled"
                      className="w-full bg-input border-2 border-border focus:border-primary outline-none px-2 py-1.5 font-bold text-foreground"
                      style={{ ...pixel, fontSize: "clamp(0.75rem, 3vw, 1rem)" }}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground" style={{ ...pixel, fontSize: "0.55rem" }}>COLOR</span>
                      <ColorPicker value={titleModalColor} onChange={(c) => setTitleModalColor(c)} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          handleTitleChange(titleModalValue);
                          updateColor(selected.id, titleModalColor);
                          setTitleModalOpen(false);
                        }}
                        className="flex-1 py-1.5 bg-primary text-primary-foreground hover:opacity-90"
                        style={{ ...pixel, fontSize: "0.6rem" }}
                      >
                        SAVE
                      </button>
                      <button
                        onClick={() => setTitleModalOpen(false)}
                        className="flex-1 py-1.5 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground"
                        style={{ ...pixel, fontSize: "0.6rem" }}
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Page header */}
              <div
                className="px-4 pt-3 pb-2 border-b border-border shrink-0"
                style={selectedColor.value ? { borderBottomColor: `${selectedColor.border}44` } : undefined}
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {/* Desktop only: color picker inline */}
                  <div className="hidden md:block">
                    <ColorPicker value={selected.color} onChange={(c) => updateColor(selected.id, c)} />
                  </div>
                  {/* Desktop: editable title input */}
                  <input
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Untitled"
                    className="hidden md:block flex-1 min-w-0 bg-transparent border-none outline-none font-bold text-foreground placeholder:text-muted-foreground/40"
                    style={{ ...pixel, fontSize: "clamp(0.75rem, 3vw, 1.1rem)", color: selectedColor.value || undefined }}
                  />
                  {/* Mobile: tappable title that opens modal */}
                  <button
                    type="button"
                    onClick={() => { setTitleModalValue(title); setTitleModalColor(selected.color ?? ""); setTitleModalOpen(true); }}
                    className="md:hidden flex-1 min-w-0 text-left font-bold text-foreground truncate bg-transparent border-none"
                    style={{ ...pixel, fontSize: "clamp(0.75rem, 3vw, 1.1rem)", color: selectedColor.value || undefined }}
                  >
                    {title || "Untitled"}
                  </button>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    {selected.pinned && (
                      <button
                        type="button"
                        onClick={() => togglePin(selected)}
                        className="h-6 w-6 flex items-center justify-center text-primary"
                        title="Unpin"
                      >
                        <Pin size={12} />
                      </button>
                    )}
                    {selectedCards.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setReview({ title: `REVIEW · ${title || "Untitled"}`, noteId: selected.id })}
                        className={`h-6 px-1.5 flex items-center gap-1 border-2 ${
                          selectedDue > 0 ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary"
                        }`}
                        style={{ ...pixel, fontSize: "0.5rem" }}
                        title={`${selectedCards.length} flashcard${selectedCards.length === 1 ? "" : "s"} in this note`}
                      >
                        <Layers size={10} />
                        {selectedDue > 0 ? `${selectedDue} DUE` : selectedCards.length}
                      </button>
                    )}
                    {!selected.is_folder && !focusingHere && (
                      <button
                        type="button"
                        onClick={() => startFocus(selected)}
                        className="h-6 px-1.5 flex items-center gap-1 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground"
                        style={{ ...pixel, fontSize: "0.5rem" }}
                        title="Start the Pomodoro focused on this note"
                      >
                        <Timer size={10} /> <span className="hidden sm:inline">FOCUS</span>
                      </button>
                    )}
                    {!selected.is_folder && (
                      <button
                        onClick={() => setPreview((p) => !p)}
                        className="h-6 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground flex items-center justify-center md:px-2 w-6 md:w-auto"
                        style={{ ...pixel, fontSize: "0.55rem" }}
                        title={preview ? "Switch to raw editor" : "Switch to live editor"}
                      >
                        <span className="hidden md:inline">{preview ? "RAW" : "LIVE"}</span>
                        <span className="md:hidden"><Pencil size={11} /></span>
                      </button>
                    )}
                    <div ref={moreRef} className="relative">
                      <button
                        onClick={() => setMoreOpen((v) => !v)}
                        className="h-6 w-6 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground flex items-center justify-center"
                      >
                        <MoreVertical size={12} />
                      </button>
                      {moreOpen && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-card border-2 border-border min-w-52 flex flex-col" style={{ ...pixel, fontSize: "0.6rem" }}>
                          <button className={menuItem} onClick={() => { setMoreOpen(false); togglePin(selected); }}>
                            {selected.pinned ? "Unpin" : "Pin to top"}
                          </button>
                          <button
                            className={menuItem}
                            onClick={() => { setMoreOpen(false); void createFromTemplate("blank", selected.id); }}
                          >
                            Add sub-page
                          </button>
                          <button className={menuItem} onClick={() => { setMoreOpen(false); setMoveOpen(true); }}>
                            Move to…
                          </button>
                          {!selected.is_folder && (
                            <button
                              className={menuItem}
                              onClick={async () => {
                                setMoreOpen(false);
                                setConverting(true);
                                try {
                                  const task = await createTask.mutateAsync({ type: "todo", title: title || "Untitled", notes: content, source_note_id: selected.id });
                                  const checklistLines = content.split("\n").filter((l) => /^\s*-\s*\[[ x]\]/i.test(l));
                                  for (const line of checklistLines) {
                                    const itemTitle = line.replace(/^\s*-\s*\[[ x]\]\s*/i, "").trim();
                                    if (itemTitle) await createChecklistItem.mutateAsync({ taskId: task.id, title: itemTitle });
                                  }
                                  toast.success("Quest added to To-Dos.");
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : "Could not convert note to a quest.");
                                } finally {
                                  setConverting(false);
                                }
                              }}
                            >
                              Convert to task
                            </button>
                          )}
                          <div className="border-t border-border" />
                          <button
                            className={menuItem}
                            onClick={() => {
                              setMoreOpen(false);
                              downloadMarkdown(title || "Untitled", exportBody(selected));
                            }}
                          >
                            Export as Markdown{selected.is_folder ? " (whole folder)" : ""}
                          </button>
                          <button
                            className={menuItem}
                            onClick={() => {
                              setMoreOpen(false);
                              try {
                                printNoteAsPdf(title || "Untitled", exportBody(selected));
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : "Could not open the print dialog.");
                              }
                            }}
                          >
                            Export as PDF{selected.is_folder ? " (whole folder)" : ""}
                          </button>
                          <div className="border-t border-border" />
                          <button
                            className={`${menuItem} text-destructive hover:bg-destructive/10`}
                            onClick={() => { setMoreOpen(false); void trashNote(selected); }}
                          >
                            <Trash2 size={11} /> Move to trash
                          </button>
                        </div>
                      )}
                    </div>
                    <InfoPopover />
                  </div>
                </div>
                <p className="text-muted-foreground/50" style={{ ...pixel, fontSize: "0.5rem" }}>
                  Last edited {formatDistanceToNow(new Date(selected.updated_at), { addSuffix: true })}
                </p>
              </div>

              {/* Focus bar — Pomodoro running on this note */}
              {focusingHere && (
                <div className="px-4 py-1.5 border-b border-border bg-primary/10 flex items-center gap-2 shrink-0">
                  <Timer size={12} className="text-primary" />
                  <span className="text-primary" style={{ ...pixel, fontSize: "0.55rem" }}>
                    {pomodoro.mode === "focus" ? "FOCUS" : "BREAK"}
                  </span>
                  <span className="tabular-nums text-foreground" style={{ ...pixel, fontSize: "0.75rem" }}>
                    {fmtClock(pomodoro.secondsLeft)}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={pomodoro.running ? pomodoro.pause : pomodoro.start}
                      className="h-6 w-6 flex items-center justify-center border-2 border-border hover:border-primary"
                      title={pomodoro.running ? "Pause" : "Resume"}
                    >
                      {pomodoro.running ? <Pause size={11} /> : <Play size={11} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => pomodoro.reset()}
                      className="h-6 w-6 flex items-center justify-center border-2 border-border hover:border-destructive text-destructive"
                      title="Stop and reset the timer"
                    >
                      <Square size={10} fill="currentColor" />
                    </button>
                  </div>
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {selected.is_folder ? (
                  <div className="space-y-1">
                    {selectedChildren.length === 0 && (
                      <p className="text-muted-foreground/50 text-sm italic">This folder is empty.</p>
                    )}
                    {selectedChildren.map((child) => (
                      <button
                        key={child.note.id}
                        type="button"
                        onClick={() => selectNote(child.note.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 border-2 border-border hover:border-primary text-left group"
                      >
                        {child.note.is_folder
                          ? <Folder size={13} className="shrink-0 text-primary/70" />
                          : <FileText size={13} className="shrink-0 text-muted-foreground group-hover:text-foreground" />
                        }
                        <span className="flex-1 text-sm truncate">{child.note.title || "Untitled"}</span>
                        <span className="text-xs text-muted-foreground/50 shrink-0">
                          {formatDistanceToNow(new Date(child.note.updated_at), { addSuffix: true })}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => void createFromTemplate("blank", selected.id)}
                      disabled={create.isPending}
                      className="w-full flex items-center justify-center gap-1 px-3 py-2 border-2 border-dashed border-border hover:border-primary text-muted-foreground hover:text-foreground disabled:opacity-50"
                      style={{ ...pixel, fontSize: "0.55rem" }}
                    >
                      <Plus size={11} /> NEW NOTE IN THIS FOLDER
                    </button>
                  </div>
                ) : preview ? (
                  <MarkdownEditor
                    key={selected.id}
                    content={content}
                    onChange={handleContentChange}
                  />
                ) : (
                  <textarea
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder={"Start writing...\n\n# Heading   ## Section   ### Sub\n- bullet point\n- [ ] checklist item\nQuestion :: Answer  (flashcard)"}
                    className="w-full h-full bg-transparent border-none outline-none text-sm font-mono resize-none text-foreground placeholder:text-muted-foreground/40 leading-relaxed"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <MoveNoteDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        note={selected}
        notes={liveNotes}
        onMove={(parentId) => selected && moveNote(selected.id, parentId)}
      />

      <FlashcardReviewDialog
        open={!!review}
        onOpenChange={(open) => !open && setReview(null)}
        title={review?.title ?? ""}
        cards={reviewCards}
      />
    </div>
  );
}
