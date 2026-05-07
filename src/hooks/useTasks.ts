import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  Task,
  TaskType,
  Difficulty,
  RepeatUnit,
  TaskChecklistItem,
  Tag,
} from "@/lib/aura/types";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

function mergeTasks(
  tasks: Task[],
  checklistRows: TaskChecklistItem[],
  tagRows: { task_id: string; tag_id: string }[],
  tagsById: Map<string, Pick<Tag, "id" | "name">>,
): Task[] {
  const clMap = new Map<string, TaskChecklistItem[]>();
  for (const row of checklistRows) {
    const arr = clMap.get(row.task_id) ?? [];
    arr.push(row);
    clMap.set(row.task_id, arr);
  }
  for (const arr of clMap.values()) arr.sort((a, b) => a.position - b.position);

  const tagMap = new Map<string, Pick<Tag, "id" | "name">[]>();
  for (const row of tagRows) {
    const tag = tagsById.get(row.tag_id);
    if (!tag) continue;
    const arr = tagMap.get(row.task_id) ?? [];
    arr.push(tag);
    tagMap.set(row.task_id, arr);
  }

  return tasks.map((t) => ({
    ...t,
    sacred_days: t.sacred_days ?? 127,
    streak_current: t.streak_current ?? 0,
    streak_best: t.streak_best ?? 0,
    checklist: clMap.get(t.id) ?? [],
    tags: tagMap.get(t.id) ?? [],
  }));
}

export function useTasks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Keep task rendering resilient even when daily-maintenance RPC fails.
      try {
        await supabase.rpc("refresh_user_dailies");
      } catch {
        // no-op
      }
      try {
        await supabase.rpc("apply_party_shadow_from_missed_dailies");
      } catch {
        // no-op
      }
      try {
        await supabase.rpc("apply_due_party_adventure_damage_for_user");
      } catch {
        // no-op
      }

      const { data: tasks, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const base = (tasks ?? []) as Task[];
      const ids = base.map((t) => t.id);
      if (ids.length === 0) return base;

      const checklistReq = supabase
        .from("task_checklist_items")
        .select("*")
        .in("task_id", ids)
        .order("position");
      const tagJoinReq = supabase.from("task_tags").select("task_id, tag_id").in("task_id", ids);

      const [{ data: checklistRows, error: clErr }, { data: taskTagRows, error: ttErr }] =
        await Promise.all([checklistReq, tagJoinReq]);

      // Never block rendering core tasks due to optional relationships.
      const safeChecklist = clErr ? [] : ((checklistRows ?? []) as TaskChecklistItem[]);
      const safeTaskTags = ttErr
        ? []
        : ((taskTagRows ?? []) as { task_id: string; tag_id: string }[]);
      const tagIds = Array.from(new Set(safeTaskTags.map((r) => r.tag_id)));

      let tagsById = new Map<string, Pick<Tag, "id" | "name">>();
      if (tagIds.length > 0) {
        const { data: tagRows, error: tagsErr } = await supabase
          .from("tags")
          .select("id, name")
          .in("id", tagIds);
        if (!tagsErr) {
          tagsById = new Map(
            (tagRows ?? []).map((t) => [t.id as string, { id: t.id, name: t.name }]),
          );
        }
      }

      return mergeTasks(base, safeChecklist, safeTaskTags, tagsById);
    },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      type: TaskType;
      title: string;
      notes?: string;
      difficulty?: Difficulty;
      source_note_id?: string;
      sacred_days?: number;
      repeat_every?: number;
      repeat_unit?: RepeatUnit;
    }) => {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          user_id: user!.id,
          type: input.type,
          title: input.title,
          notes: input.notes ?? "",
          difficulty: input.difficulty ?? "easy",
          source_note_id: input.source_note_id ?? null,
          sacred_days: input.sacred_days ?? 127,
          repeat_every: input.repeat_every ?? 1,
          repeat_unit: input.repeat_unit ?? "day",
        })
        .select()
        .single();
      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (error) => {
      const msg = error instanceof Error ? error.message : "Failed to create quest";
      toast.error(msg);
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Task> }) => {
      const { data, error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useCreateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, title }: { taskId: string; title: string }) => {
      const { data: existing } = await supabase
        .from("task_checklist_items")
        .select("position")
        .eq("task_id", taskId)
        .order("position", { ascending: false })
        .limit(1);
      const nextPos = (existing?.[0]?.position ?? -1) + 1;
      const { error } = await supabase.from("task_checklist_items").insert({
        task_id: taskId,
        title: title.trim(),
        done: false,
        position: nextPos,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUpdateChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<TaskChecklistItem> }) => {
      const { error } = await supabase.from("task_checklist_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useUserTags() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["tags", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("user_id", user!.id)
        .order("name");
      if (error) throw error;
      return data as Tag[];
    },
  });
}

export function useCreateTagAndAssign() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ taskId, name }: { taskId: string; name: string }) => {
      const trimmed = name.trim().toLowerCase();
      if (!trimmed) throw new Error("empty tag");

      let tagId: string;
      const { data: existing } = await supabase
        .from("tags")
        .select("id")
        .eq("user_id", user!.id)
        .ilike("name", trimmed)
        .maybeSingle();
      if (existing?.id) {
        tagId = existing.id;
      } else {
        const { data: ins, error } = await supabase
          .from("tags")
          .insert({ user_id: user!.id, name: trimmed })
          .select("id")
          .single();
        if (error) throw error;
        tagId = ins.id;
      }

      const { error: jErr } = await supabase
        .from("task_tags")
        .insert({ task_id: taskId, tag_id: tagId });
      if (jErr && !String(jErr.message).toLowerCase().includes("duplicate")) throw jErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useRemoveTaskTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, tagId }: { taskId: string; tagId: string }) => {
      const { error } = await supabase
        .from("task_tags")
        .delete()
        .eq("task_id", taskId)
        .eq("tag_id", tagId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
