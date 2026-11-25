import { useMemo, useState } from "react";
import { FileText, Folder, RotateCcw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TRASH_RETENTION_DAYS } from "@/hooks/useNotes";
import type { Note } from "@/lib/aura/types";

/** A note trashed together with its sub-pages (they share one deleted_at). */
export interface TrashBatch {
  top: Note;
  ids: string[];
  /** The note's original parent no longer exists as an active note. */
  detach: boolean;
}

export function trashBatches(trashed: Note[], activeIds: Set<string>): TrashBatch[] {
  const byId = new Map(trashed.map((n) => [n.id, n]));
  const childrenOf = new Map<string, Note[]>();
  for (const n of trashed) {
    if (!n.parent_id) continue;
    const list = childrenOf.get(n.parent_id) ?? [];
    list.push(n);
    childrenOf.set(n.parent_id, list);
  }
  const isTop = (n: Note) => {
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    return !(parent && parent.deleted_at === n.deleted_at);
  };
  return trashed.filter(isTop).map((top) => {
    const ids = [top.id];
    const stack = [top];
    while (stack.length) {
      for (const child of childrenOf.get(stack.pop()!.id) ?? []) {
        if (child.deleted_at === top.deleted_at) {
          ids.push(child.id);
          stack.push(child);
        }
      }
    }
    return { top, ids, detach: !!top.parent_id && !activeIds.has(top.parent_id) };
  });
}

function daysLeft(deletedAt: string) {
  const elapsed = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

export function TrashView({
  trashed,
  activeIds,
  busy,
  onRestore,
  onDeleteForever,
  onClose,
}: {
  trashed: Note[];
  activeIds: Set<string>;
  busy: boolean;
  onRestore: (batch: TrashBatch) => void;
  onDeleteForever: (ids: string[]) => void;
  onClose: () => void;
}) {
  const batches = useMemo(() => trashBatches(trashed, activeIds), [trashed, activeIds]);
  const [confirm, setConfirm] = useState<{ ids: string[]; label: string } | null>(null);
  const pixel = { fontFamily: "var(--font-pixel)" } as const;

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="px-4 pt-3 pb-2 border-b border-border flex items-center gap-2 flex-wrap shrink-0">
        <Trash2 size={14} className="text-destructive" />
        <span className="text-foreground" style={{ ...pixel, fontSize: "0.75rem" }}>
          TRASH
        </span>
        <div className="ml-auto flex items-center gap-1">
          {trashed.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm({ ids: trashed.map((n) => n.id), label: "everything in the trash" })}
              className="h-6 px-2 border-2 border-destructive/50 text-destructive hover:bg-destructive/10 disabled:opacity-50"
              style={{ ...pixel, fontSize: "0.5rem" }}
            >
              EMPTY TRASH
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-6 px-2 border-2 border-border hover:border-primary text-muted-foreground hover:text-foreground"
            style={{ ...pixel, fontSize: "0.5rem" }}
          >
            BACK TO NOTES
          </button>
        </div>
      </div>
      <p className="px-4 pt-2 text-[11px] text-muted-foreground">
        Notes are deleted forever {TRASH_RETENTION_DAYS} days after being trashed. Trashed notes still count
        toward your note limit until they are deleted.
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-1.5">
        {batches.length === 0 && (
          <p className="text-muted-foreground/60 text-sm italic text-center mt-6">The trash is empty.</p>
        )}
        {batches.map((batch) => (
          <div key={batch.top.id} className="flex items-center gap-2 px-3 py-2 border-2 border-border">
            {batch.top.is_folder ? (
              <Folder size={13} className="shrink-0 text-primary/70" />
            ) : (
              <FileText size={13} className="shrink-0 text-muted-foreground" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{batch.top.title || "Untitled"}</div>
              <div className="text-[10px] text-muted-foreground">
                Trashed {formatDistanceToNow(new Date(batch.top.deleted_at!), { addSuffix: true })}
                {batch.ids.length > 1 ? ` · with ${batch.ids.length - 1} sub-page${batch.ids.length > 2 ? "s" : ""}` : ""}
                {` · ${daysLeft(batch.top.deleted_at!)}d left`}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => onRestore(batch)}
              className="h-7 px-2 flex items-center gap-1 border-2 border-border hover:border-primary disabled:opacity-50"
              style={{ ...pixel, fontSize: "0.5rem" }}
              title={batch.detach ? "Its folder is gone, so it will be restored to the top level" : "Restore"}
            >
              <RotateCcw size={11} /> RESTORE
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm({ ids: batch.ids, label: `“${batch.top.title || "Untitled"}”` })}
              className="h-7 w-7 flex items-center justify-center border-2 border-border hover:border-destructive text-destructive disabled:opacity-50"
              title="Delete forever"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <Dialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={pixel}>Delete forever?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirm?.label} will be permanently deleted. This can&apos;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirm(null)} className="px-3 py-1.5 border-2 border-border">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm) onDeleteForever(confirm.ids);
                setConfirm(null);
              }}
              className="px-3 py-1.5 bg-destructive text-destructive-foreground"
            >
              Delete forever
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
