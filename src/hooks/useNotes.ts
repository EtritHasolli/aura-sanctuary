import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Note } from "@/lib/aura/types";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

/** Trashed notes are deleted for good after this many days. */
export const TRASH_RETENTION_DAYS = 30;

/** True when the archives migration (pinned / deleted_at columns) hasn't been applied yet. */
function isMissingArchiveColumns(error: { message?: string } | null) {
  return !!error?.message && /(deleted_at|pinned)/.test(error.message);
}

/** Active (not trashed) notes, most recently edited first. */
export function useNotes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notes", user?.id, "active"],
    enabled: !!user,
    queryFn: async () => {
      const base = () =>
        supabase
          .from("notes")
          .select("*")
          .eq("user_id", user!.id)
          .order("updated_at", { ascending: false });
      let { data, error } = await base().is("deleted_at", null);
      // Frontend deployed before the migration: fall back to the old query.
      if (isMissingArchiveColumns(error)) ({ data, error } = await base());
      if (error) throw error;
      return data as Note[];
    },
  });
}

/** Notes in the trash, most recently trashed first. */
export function useTrashedNotes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["notes", user?.id, "trash"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("user_id", user!.id)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
      if (isMissingArchiveColumns(error)) return [] as Note[];
      if (error) throw error;
      return data as Note[];
    },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      title?: string;
      content?: string;
      source_task_id?: string;
      parent_id?: string | null;
      color?: string | null;
      is_folder?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("notes")
        .insert({
          user_id: user!.id,
          title: input.title ?? "Untitled",
          content: input.content ?? "",
          source_task_id: input.source_task_id ?? null,
          parent_id: input.parent_id ?? null,
          color: input.color ?? null,
          is_folder: input.is_folder ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Note;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Note> }) => {
      const { data, error } = await supabase
        .from("notes")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
    onError: (err: Error) => toast.error(`Could not save note: ${err.message}`),
  });
}

/** Moves notes to the trash. All ids share one timestamp so they restore together. */
export function useTrashNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const deletedAt = new Date().toISOString();
      const { error } = await supabase
        .from("notes")
        .update({ deleted_at: deletedAt, pinned: false })
        .in("id", ids);
      if (error) {
        if (isMissingArchiveColumns(error)) {
          throw new Error("The trash needs the latest database migration (supabase db push).");
        }
        throw error;
      }
      return deletedAt;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

/**
 * Restores notes from the trash. `detachIds` are moved to the top level because the
 * folder they lived in is still in the trash (otherwise they'd be invisible).
 */
export function useRestoreNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, detachIds = [] }: { ids: string[]; detachIds?: string[] }) => {
      const { error } = await supabase.from("notes").update({ deleted_at: null }).in("id", ids);
      if (error) throw error;
      if (detachIds.length > 0) {
        const { error: detachError } = await supabase
          .from("notes")
          .update({ parent_id: null })
          .in("id", detachIds);
        if (detachError) throw detachError;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteNotesForever() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from("notes").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
    onError: (err: Error) => toast.error(err.message),
  });
}

/** Permanently removes notes that have been in the trash longer than the retention period. */
export async function purgeExpiredTrash(userId: string) {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000).toISOString();
  await supabase
    .from("notes")
    .delete()
    .eq("user_id", userId)
    .lt("deleted_at", cutoff);
}
