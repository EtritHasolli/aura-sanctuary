import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useNotes, useCreateNote, useUpdateNote, useDeleteNote } from "@/hooks/useNotes";
import { useCreateTask } from "@/hooks/useTasks";
import { toast } from "sonner";
import { z } from "zod";

const search = z.object({ id: z.string().optional() });

export const Route = createFileRoute("/archives")({
  head: () => ({ meta: [{ title: "Archives — Aura" }] }),
  validateSearch: (s) => search.parse(s),
  component: ArchivesPage,
});

function ArchivesPage() {
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const { data: notes = [] } = useNotes();
  const create = useCreateNote();
  const update = useUpdateNote();
  const del = useDeleteNote();
  const createTask = useCreateTask();

  const [selectedId, setSelectedId] = useState<string | null>(id ?? null);

  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) ?? null, [notes, selectedId]);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    setTitle(selected?.title ?? "");
    setContent(selected?.content ?? "");
  }, [selected?.id]);

  const save = () => {
    if (!selected) return;
    update.mutate({ id: selected.id, patch: { title, content } });
    toast.success("Archived.");
  };

  const newNote = async () => {
    const n = await create.mutateAsync({ title: "New entry", content: "" });
    setSelectedId(n.id);
    navigate({ to: "/archives", search: { id: n.id } });
  };

  const convertToTask = () => {
    if (!selected) return;
    createTask.mutate({ type: "todo", title: title || "Untitled", notes: content });
    toast.success("Quest added to To-Dos.");
  };

  return (
    <div className="p-6 max-w-7xl mx-auto h-full">
      <h1 className="text-lg text-primary mb-4" style={{ fontFamily: "var(--font-pixel)" }}>ARCHIVES</h1>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 h-[calc(100%-3rem)]">
        {/* List */}
        <div className="pixel-panel p-3 flex flex-col">
          <button onClick={newNote} className="w-full mb-3 px-2 py-2 bg-primary text-primary-foreground"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}>
            NEW SCROLL
          </button>
          <div className="space-y-1 overflow-y-auto">
            {notes.length === 0 && <p className="text-xs text-muted-foreground italic text-center">Your archives are empty.</p>}
            {notes.map((n) => (
              <button key={n.id}
                onClick={() => { setSelectedId(n.id); navigate({ to: "/archives", search: { id: n.id } }); }}
                className={`w-full text-left px-2 py-2 border-2 text-xs truncate ${selectedId === n.id ? "border-primary bg-primary/10" : "border-transparent hover:border-border"}`}
              >
                {n.title || "Untitled"}
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="pixel-panel p-4 flex flex-col">
          {!selected ? (
            <p className="text-muted-foreground text-sm m-auto">Select or create a scroll.</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title"
                  className="flex-1 min-w-[200px] bg-input border-2 border-border px-2 py-1.5 text-sm focus:border-primary outline-none"
                />
                <button onClick={() => setPreview((p) => !p)} className="text-xs px-2 py-1.5 border-2 border-border" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                  {preview ? "EDIT" : "PREVIEW"}
                </button>
                <button onClick={save} className="text-xs px-2 py-1.5 bg-primary text-primary-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                  SAVE
                </button>
                <button onClick={convertToTask} className="text-xs px-2 py-1.5 bg-accent text-accent-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                  CONVERT TO TASK
                </button>
                <button onClick={() => { del.mutate(selected.id); setSelectedId(null); }} className="text-xs px-2 py-1.5 bg-destructive/20 text-destructive border-2 border-destructive">
                  <Trash2 size={12} />
                </button>
              </div>
              {preview ? (
                <div className="flex-1 overflow-y-auto prose prose-invert max-w-none px-2 text-sm" style={{ fontFamily: "var(--font-display)" }}>
                  <ReactMarkdown>{content || "*Empty scroll.*"}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="# Markdown here..."
                  className="flex-1 bg-input border-2 border-border p-3 text-sm focus:border-primary outline-none font-mono resize-none"
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
