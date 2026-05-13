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

export interface CustomChallengeInput {
  name: string;
  description: string;
  duration_days: number;
  type: "habit" | "daily" | "todo";
  title: string;
  difficulty: "trivial" | "easy" | "medium" | "hard";
  sacred_days?: number;
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
      qc.invalidateQueries({ queryKey: ["tasks", user?.id] });
    },
  });
}

export function useCreateChallengeTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomChallengeInput) => {
      const blueprint = [
        {
          type: input.type,
          title: input.title,
          difficulty: input.difficulty,
          notes: "*Custom challenge quest*",
          sacred_days: input.type === "daily" ? (input.sacred_days ?? 127) : 127,
        },
      ];
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
