import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface UserAchievementRow {
  unlocked_at: string;
  achievements: { slug: string; name: string; description: string };
}

export function useAchievements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["achievements", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_achievements")
        .select("unlocked_at, achievements(slug, name, description)")
        .eq("user_id", user!.id)
        .order("unlocked_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserAchievementRow[];
    },
  });
}
