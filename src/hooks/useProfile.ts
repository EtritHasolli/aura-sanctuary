import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/aura/types";
import { xpForLevel } from "@/lib/aura/types";
import { useAuth } from "./useAuth";

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { data, error } = await supabase.from("profiles").update(patch).eq("id", user!.id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export interface RewardDelta {
  xp?: number; gold?: number; hp?: number;
  stat?: "strength" | "intelligence" | "constitution";
}

export function useApplyReward() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (delta: RewardDelta) => {
      const { data: prof } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      if (!prof) throw new Error("no profile");
      const p = prof as Profile;

      let xp = p.xp + (delta.xp ?? 0);
      let level = p.level;
      let max_hp = p.max_hp;
      let hp = Math.min(p.max_hp, p.hp + (delta.hp ?? 0));
      let gold = Math.max(0, p.gold + (delta.gold ?? 0));

      // Level up
      while (xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level += 1;
        max_hp += 5;
        hp = max_hp;
      }

      // Death loop
      if (hp <= 0) {
        level = Math.max(1, level - 1);
        gold = Math.floor(gold * 0.8);
        hp = max_hp;
        xp = 0;
      }

      const patch: Partial<Profile> = { xp, level, max_hp, hp, gold };
      if (delta.stat) (patch as any)[delta.stat] = (p as any)[delta.stat] + 1;

      const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}
