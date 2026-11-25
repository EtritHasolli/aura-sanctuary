import { useMemo, useState } from "react";
import { FileText, Folder, CornerLeftUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Note } from "@/lib/aura/types";

/** Ids of `rootId` and everything nested under it. */
export function descendantIds(rootId: string, notes: Note[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of notes) {
    if (!n.parent_id) continue;
    const list = childrenOf.get(n.parent_id) ?? [];
    list.push(n.id);
    childrenOf.set(n.parent_id, list);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length) {
    for (const child of childrenOf.get(stack.pop()!) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

/** "Folder / Sub-folder" path of a note, for showing where a target lives. */
export function notePath(note: Note, byId: Map<string, Note>): string {
  const parts: string[] = [];
  let cur = note.parent_id ? byId.get(note.parent_id) : undefined;
  let guard = 0;
  while (cur && guard++ < 50) {
    parts.unshift(cur.title || "Untitled");
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" / ");
}

export function MoveNoteDialog({
  open,
  onOpenChange,
  note,
  notes,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: Note | null;
  notes: Note[];
  onMove: (parentId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  const targets = useMemo(() => {
    if (!note) return [];
    // A note can't move into itself or into one of its own sub-pages.
    const blocked = descendantIds(note.id, notes);
    const q = query.trim().toLowerCase();
    return notes
      .filter((n) => !blocked.has(n.id) && n.id !== note.parent_id)
      .filter((n) => !q || (n.title || "untitled").toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.is_folder) - Number(a.is_folder) ||
          a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }),
      );
  }, [note, notes, query]);

  const move = (parentId: string | null) => {
    onMove(parentId);
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-pixel)" }} className="text-sm">
            Move “{note?.title || "Untitled"}”
          </DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a folder or note…"
          className="w-full px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm"
        />
        <div className="max-h-[50vh] overflow-y-auto space-y-1">
          {note?.parent_id && (
            <button
              type="button"
              onClick={() => move(null)}
              className="w-full flex items-center gap-2 px-2 py-2 border-2 border-border hover:border-primary text-left text-sm"
            >
              <CornerLeftUp size={13} className="text-primary shrink-0" />
              Top level
            </button>
          )}
          {targets.map((t) => {
            const path = notePath(t, byId);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => move(t.id)}
                className="w-full flex items-center gap-2 px-2 py-2 border-2 border-border hover:border-primary text-left"
              >
                {t.is_folder ? (
                  <Folder size={13} className="text-primary/70 shrink-0" />
                ) : (
                  <FileText size={13} className="text-muted-foreground shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm truncate">{t.title || "Untitled"}</span>
                  {path && <span className="block text-[10px] text-muted-foreground truncate">{path}</span>}
                </span>
              </button>
            );
          })}
          {targets.length === 0 && !note?.parent_id && (
            <p className="text-xs text-muted-foreground italic py-3 text-center">
              No other notes or folders to move into.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
