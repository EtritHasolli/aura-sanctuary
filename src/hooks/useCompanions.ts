import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface CompanionRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  rarity: string;
  can_mount: boolean;
  sprite_key: string;
}

export interface UserCompanionRow {
  id: string;
  user_id: string;
  companion_id: string;
  bond_xp: number;
  equipped_as: "none" | "pet" | "mount";
  hatched_at: string;
  companions: CompanionRow;
}

export function useCompanionsCatalog() {
  return useQuery({
    queryKey: ["companionsCatalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companions").select("*").order("name");
      if (error) throw error;
      return data as CompanionRow[];
    },
  });
}

export function useUserCompanions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["userCompanions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_companions")
        .select("*, companions(*)")
        .eq("user_id", user!.id)
        .order("hatched_at", { ascending: false });
      if (error) throw error;
      return data as UserCompanionRow[];
    },
  });
}

export function useHatchCompanionEgg() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("hatch_companion_egg");
      if (error) throw error;
      return data as { duplicate?: boolean; slug?: string; name?: string; bond_bonus?: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userCompanions", user?.id] });
      qc.invalidateQueries({ queryKey: ["userItems", user?.id] });
    },
  });
}

export function useSetCompanionEquip() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      equipped_as,
    }: {
      id: string;
      equipped_as: "none" | "pet" | "mount";
    }) => {
      const { error } = await supabase.from("user_companions").update({ equipped_as }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userCompanions", user?.id] });
    },
  });
}
