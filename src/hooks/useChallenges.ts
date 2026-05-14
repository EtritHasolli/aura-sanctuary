import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string;
  duration_days: number;
  task_blueprint: unknown;
}

export interface BlueprintTask {
  title: string;
  type: "habit" | "daily" | "todo";
  difficulty: "trivial" | "easy" | "medium" | "hard";
  sacred_days?: number;
}

export interface CustomChallengeInput {
  name: string;
  description: string;
  duration_days: number;
  tasks: BlueprintTask[];
}

export function useChallengeTemplates() {
  return useQuery({
    queryKey: ["challengeTemplates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("challenge_templates").select("*").order("name");
      if (error) throw error;
      return data as ChallengeTemplate[];
    },
  });
}

export interface MyRun {
  template_id: string;
  run_id: string;
  ends_on: string;
}

export function useMyRuns() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["myRuns", user?.id],
    enabled: !!user,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("get_my_challenge_runs");
      if (error) throw error;
      return ((data ?? []) as unknown) as MyRun[];
    },
  });
}

export function useStartChallengeRun() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await supabase.rpc("start_challenge_run", {
        p_template_id: templateId,
      });
      if (error) throw error;
      return data as { run_id?: string; ends_on?: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["myRuns", user?.id] });
    },
  });
}

export function useUpdateChallengeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomChallengeInput & { id: string }) => {
      const blueprint = input.tasks.map((t) => ({
        type: t.type,
        title: t.title,
        difficulty: t.difficulty,
        notes: "*Custom challenge quest*",
        sacred_days: t.type === "daily" ? (t.sacred_days ?? 127) : 127,
      }));
      const { error } = await supabase.rpc("update_custom_challenge_template", {
        p_id: input.id,
        p_name: input.name.trim(),
        p_description: input.description.trim(),
        p_duration: input.duration_days,
        p_blueprint: blueprint,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challengeTemplates"] });
    },
  });
}

export function useCreateChallengeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomChallengeInput) => {
      const blueprint = input.tasks.map((t) => ({
        type: t.type,
        title: t.title,
        difficulty: t.difficulty,
        notes: "*Custom challenge quest*",
        sacred_days: t.type === "daily" ? (t.sacred_days ?? 127) : 127,
      }));
      const { data, error } = await supabase.rpc("create_custom_challenge_template", {
        p_name: input.name.trim(),
        p_description: input.description.trim(),
        p_duration: input.duration_days,
        p_blueprint: blueprint,
      });
      if (error) throw error;
      return data as { template_id: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challengeTemplates"] });
    },
  });
}
