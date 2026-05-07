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
