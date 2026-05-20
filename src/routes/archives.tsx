import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { ChevronRight, ChevronLeft, ChevronDown, MoreVertical, Info, Pencil, Minus, Folder, FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/hooks/useNotes";
import { BugLoader } from "@/components/aura/BugLoader";
import { useCreateTask, useCreateChecklistItem } from "@/hooks/useTasks";
import { toast } from "sonner";
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

function ChecklistContent({ content, onChange }: { content: string; onChange: (next: string) => void }) {
  const lines = content.split("\n");

  const toggleLine = (i: number, checked: boolean) => {
    const next = lines.map((l, idx) => {
      if (idx !== i) return l;
      return checked ? l.replace(/^(\s*)-\s*\[ \]/, "$1- [x]") : l.replace(/^(\s*)-\s*\[x\]/i, "$1- [ ]");
    });
    onChange(next.join("\n"));
  };

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const unchecked = /^\s*-\s*\[ \]/.test(line);
        const checked = /^\s*-\s*\[x\]/i.test(line);

        if (unchecked || checked) {
          const label = line.replace(/^\s*-\s*\[[ x]\]\s*/i, "");
          return (
            <div key={i} className="flex items-center gap-2 group py-0.5">
              <button
                type="button"
                onClick={() => toggleLine(i, !checked)}
                className={`shrink-0 w-4 h-4 border-2 flex items-center justify-center transition-colors ${
                  checked ? "border-primary bg-primary/20 text-primary" : "border-border bg-input hover:border-primary"
                }`}
              >
                {checked && <span style={{ fontFamily: "var(--font-pixel)", fontSize: "0.5rem", lineHeight: 1 }}>✓</span>}
              </button>
              <span className={`flex-1 ${checked ? "line-through text-muted-foreground" : ""}`} style={{ fontSize: "clamp(0.95rem, 2.5vw, 1.1rem)" }}>{label}</span>
            </div>
          );
        }

        if (/^### /.test(line)) return (
          <h3 key={i} className="font-bold text-foreground mt-3 mb-0.5 wrap-break-word" style={{ fontFamily: "var(--font-pixel)", fontSize: "clamp(0.6rem, 2.5vw, 0.85rem)" }}>
            {line.replace(/^### /, "")}
          </h3>
        );
        if (/^## /.test(line)) return (
          <h2 key={i} className="font-bold text-foreground mt-4 mb-1 wrap-break-word" style={{ fontFamily: "var(--font-pixel)", fontSize: "clamp(0.7rem, 3vw, 1rem)" }}>
            {line.replace(/^## /, "")}
          </h2>
        );
        if (/^# /.test(line)) return (
          <h1 key={i} className="font-bold text-primary mt-5 mb-1 wrap-break-word" style={{ fontFamily: "var(--font-pixel)", fontSize: "clamp(0.8rem, 3.5vw, 1.15rem)" }}>
            {line.replace(/^# /, "")}
          </h1>
        );

        if (/^\s*- /.test(line) && !/^\s*-\s*\[/.test(line)) return (
          <div key={i} className="flex items-center gap-2 py-0.5" style={{ fontSize: "clamp(0.95rem, 2.5vw, 1.1rem)" }}>
            <Minus size={14} strokeWidth={3} className="text-primary shrink-0" />
            <span>{line.replace(/^\s*- /, "")}</span>
          </div>
        );

        if (line.trim() === "") return <div key={i} className="h-2" />;
        return (
          <div key={i} className="prose prose-invert max-w-none leading-relaxed" style={{ fontSize: "clamp(0.95rem, 2.5vw, 1.1rem)" }}>
            <ReactMarkdown>{line}</ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

type NoteTree = { note: Note; children: NoteTree[] };

function buildTree(notes: Note[]): NoteTree[] {
  const map = new Map<string, NoteTree>();
  for (const n of notes) map.set(n.id, { note: n, children: [] });
  const roots: NoteTree[] = [];
  for (const n of notes) {
    const node = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
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
        <div className="absolute right-0 top-full mt-1 z-50 bg-card border-2 border-border w-72 p-3 flex flex-col gap-2">
          <p className="text-primary" style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}>HOW ARCHIVES WORK</p>
          <div className="space-y-1.5 text-muted-foreground" style={{ fontFamily: "var(--font-display)", fontSize: "0.9rem" }}>
            <p><span className="text-foreground">Folders</span> — group notes by subject (e.g. Biology). Click the arrow to expand/collapse.</p>
            <p><span className="text-foreground">Sub-pages</span> — use ⋮ → Add sub-page to nest a note inside another.</p>
            <p><span className="text-foreground">To-Dos link</span> — use ⋮ → Convert to task to send a note as a quest. The task keeps a link back to this note.</p>
            <hr className="border-border" />
            <p className="text-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: "0.55rem" }}>MARKDOWN SHORTCUTS</p>
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

function SidebarNode({
  node, depth, selectedId, onSelect, onUpdateColor,
}: {
  node: NoteTree; depth: number; selectedId: string | null;
  onSelect: (id: string) => void; onUpdateColor: (id: string, color: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const active = selectedId === node.note.id;
  const color = COLORS.find((c) => c.value === (node.note.color ?? "")) ?? COLORS[0];

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-1 cursor-pointer rounded-sm group ${
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
        style={{
          paddingLeft: `${4 + depth * 14}px`,
          background: active
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
        <span className="text-[10px] text-muted-foreground/60 shrink-0 hidden group-hover:block">
          {formatDistanceToNow(new Date(node.note.updated_at), { addSuffix: true })}
        </span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <SidebarNode key={child.note.id} node={child} depth={depth + 1}
              selectedId={selectedId} onSelect={onSelect} onUpdateColor={onUpdateColor} />
          ))}
        </div>
      )}
    </div>
  );
}

function ArchivesPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const { data: notes = [] } = useNotes();
  const create = useCreateNote();
  const update = useUpdateNote();
  const del = useDeleteNote();
  const createTask = useCreateTask();
  const createChecklistItem = useCreateChecklistItem();

  const [selectedId, setSelectedId] = useState<string | null>(id ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [titleModalOpen, setTitleModalOpen] = useState(false);
  const [titleModalValue, setTitleModalValue] = useState("");
  const [titleModalColor, setTitleModalColor] = useState<string>("");
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

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
  }, [selected?.id]);

  const save = useCallback((t: string, c: string) => {
    if (!selected) return;
    update.mutate({ id: selected.id, patch: { title: t, content: c } });
  }, [selected, update]);

  const scheduleAutoSave = useCallback((t: string, c: string) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => save(t, c), 1000);
  }, [save]);

  useEffect(() => () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); }, []);

  const handleTitleChange = (val: string) => { setTitle(val); scheduleAutoSave(val, content); };
  const handleContentChange = (val: string) => { setContent(val); scheduleAutoSave(title, val); };

  const tree = useMemo(() => buildTree(notes), [notes]);

  const selectNote = (nid: string) => {
    setSelectedId(nid);
    navigate({ to: "/archives", search: { id: nid } });
  };

  const newNote = async (parentId?: string) => {
    const n = await create.mutateAsync({ title: "Untitled", content: "", parent_id: parentId ?? null });
    selectNote(n.id);
  };

  const newFolder = async () => {
    const n = await create.mutateAsync({ title: "New Folder", content: "", parent_id: null, is_folder: true });
    selectNote(n.id);
  };

  const updateColor = (nid: string, color: string) => {
    update.mutate({ id: nid, patch: { color } });
  };

  const breadcrumb = useMemo(() => {
    if (!selected) return [];
    const crumbs: typeof notes = [];
    let cur = selected;
    while (cur.parent_id) {
      const parent = notes.find((n) => n.id === cur.parent_id);
      if (!parent) break;
      crumbs.unshift(parent);
      cur = parent;
    }
    return crumbs;
  }, [selected, notes]);

  const selectedColor = COLORS.find((c) => c.value === (selected?.color ?? "")) ?? COLORS[0];

  const sidebarContent = (
    <>
      <div className="flex gap-1 p-2 border-b border-border shrink-0">
        <button
          onClick={() => newNote()}
          className="flex-1 flex items-center justify-center py-1.5 bg-primary text-primary-foreground hover:opacity-90"
          style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
        >
          NOTE
        </button>
        <button
          onClick={newFolder}
          className="flex-1 flex items-center justify-center py-1.5 border-2 border-border hover:border-primary"
          style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
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
      <div className="overflow-y-auto flex-1 p-1">
        {notes.length === 0 && (
          <p className="text-xs text-muted-foreground italic text-center mt-4">Your archives are empty.</p>
        )}
        {tree.map((node) => (
          <SidebarNode key={node.note.id} node={node} depth={0}
            selectedId={selectedId} onSelect={selectNote} onUpdateColor={updateColor} />
        ))}
      </div>
    </>
  );

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto h-full flex flex-col">
      {/* Header row — title + mobile toggle */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>ARCHIVES</h1>
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
          style={{ width: "75vw", maxWidth: "260px" }}
        >
          {create.isPending && <BugLoader overlay size="sm" label="CREATING..." />}
          {sidebarContent}
        </div>

        {/* Desktop sidebar — on the left, width animated */}
        <div
          className="hidden md:flex flex-col min-h-0 shrink-0 pixel-panel overflow-hidden transition-all duration-300 ease-in-out relative"
          style={{ width: sidebarOpen ? "260px" : "2rem" }}
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
          style={selectedColor.value ? { borderColor: selectedColor.border, boxShadow: `inset 0 0 0 1px ${selectedColor.border}22` } : undefined}
        >
          {converting && <BugLoader overlay label="CONVERTING..." />}
          {del.isPending && <BugLoader overlay label="DELETING..." />}
          {!selected ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-3">
              <p className="text-muted-foreground text-sm">Select or create a note.</p>
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden h-7 px-3 border-2 border-border text-muted-foreground hover:border-primary hover:text-foreground flex items-center gap-1"
                style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
              >
                <ChevronRight size={12} /> OPEN NOTES
              </button>
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              {breadcrumb.length > 0 && (
                <div className="flex items-center gap-1 px-4 pt-3 shrink-0">
                  {breadcrumb.map((crumb, i) => (
                    <span key={crumb.id} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight size={10} className="text-muted-foreground" />}
                      <button
                        type="button"
                        onClick={() => selectNote(crumb.id)}
                        className="text-muted-foreground hover:text-foreground"
                        style={{ fontFamily: "var(--font-pixel)", fontSize: "0.55rem" }}
                      >
                        {crumb.title}
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
                    <p className="text-primary" style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}>EDIT TITLE</p>
                    <input
                      autoFocus
                      value={titleModalValue}
                      onChange={(e) => setTitleModalValue(e.target.value)}
                      placeholder="Untitled"
                      className="w-full bg-input border-2 border-border focus:border-primary outline-none px-2 py-1.5 font-bold text-foreground"
                      style={{ fontFamily: "var(--font-pixel)", fontSize: "clamp(0.75rem, 3vw, 1rem)" }}
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: "0.55rem" }}>COLOR</span>
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
                        style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
                      >
                        SAVE
                      </button>
                      <button
                        onClick={() => setTitleModalOpen(false)}
                        className="flex-1 py-1.5 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground"
                        style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
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
                    style={{ fontFamily: "var(--font-pixel)", fontSize: "clamp(0.75rem, 3vw, 1.1rem)", color: selectedColor.value || undefined }}
                  />
                  {/* Mobile: tappable title that opens modal */}
                  <button
                    type="button"
                    onClick={() => { setTitleModalValue(title); setTitleModalColor(selected.color ?? ""); setTitleModalOpen(true); }}
                    className="md:hidden flex-1 min-w-0 text-left font-bold text-foreground truncate bg-transparent border-none"
                    style={{ fontFamily: "var(--font-pixel)", fontSize: "clamp(0.75rem, 3vw, 1.1rem)", color: selectedColor.value || undefined }}
                  >
                    {title || "Untitled"}
                  </button>
                  {/* Consistent action buttons */}
                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    {!selected.is_folder && (
                      <button
                        onClick={() => setPreview((p) => !p)}
                        className="h-6 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground flex items-center justify-center md:px-2 w-6 md:w-auto"
                        style={{ fontFamily: "var(--font-pixel)", fontSize: "0.55rem" }}
                        title={preview ? "Edit" : "Preview"}
                      >
                        <span className="hidden md:inline">{preview ? "EDIT" : "PREVIEW"}</span>
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
                        <div className="absolute right-0 top-full mt-1 z-50 bg-card border-2 border-border min-w-44 flex flex-col">
                          <button
                            onClick={() => { newNote(selected.id); setMoreOpen(false); }}
                            className="text-left px-3 py-2 text-xs hover:bg-secondary"
                            style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
                          >
                            Add sub-page
                          </button>
                          {!selected.is_folder && (
                            <button
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
                                } finally {
                                  setConverting(false);
                                }
                              }}
                              className="text-left px-3 py-2 text-xs hover:bg-secondary"
                              style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
                            >
                              Convert to task
                            </button>
                          )}
                          <button
                            onClick={() => { del.mutate(selected.id); setSelectedId(null); setMoreOpen(false); }}
                            className="text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10"
                            style={{ fontFamily: "var(--font-pixel)", fontSize: "0.6rem" }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Info button */}
                    <InfoPopover />
                  </div>
                </div>
                <p className="text-muted-foreground/50" style={{ fontFamily: "var(--font-pixel)", fontSize: "0.5rem" }}>
                  Last edited {formatDistanceToNow(new Date(selected.updated_at), { addSuffix: true })}
                </p>
              </div>

              {/* Content */}
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
                {selected.is_folder ? (
                  <div className="space-y-1">
                    {tree.find(n => n.note.id === selected.id)?.children.length === 0 && (
                      <p className="text-muted-foreground/50 text-sm italic">This folder is empty. Add notes using the sidebar.</p>
                    )}
                    {(tree.find(n => n.note.id === selected.id)?.children ?? []).map((child) => (
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
                  </div>
                ) : preview ? (
                  <ChecklistContent
                    content={content || "*Empty page.*"}
                    onChange={(next) => { setContent(next); save(title, next); }}
                  />
                ) : (
                  <textarea
                    value={content}
                    onChange={(e) => handleContentChange(e.target.value)}
                    placeholder={"Start writing...\n\n# Heading   ## Section   ### Sub\n- bullet point\n- [ ] checklist item"}
                    className="w-full h-full bg-transparent border-none outline-none text-sm font-mono resize-none text-foreground placeholder:text-muted-foreground/40 leading-relaxed"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
