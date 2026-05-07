import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/aura/types";
import { xpForLevel } from "@/lib/aura/types";
import {
  effectiveMaxStamina,
  withGoldEquipBonus,
  withXpEquipBonus,
} from "@/lib/aura/equipmentBonuses";
import { useAuth } from "./useAuth";

const STAMINA_ON_LEVEL_UP = 50;
const MAX_HP_PER_LEVEL_UP = 10;
const HP_REGEN_PER_LEVEL_UP = 10;
/** Must match profiles.max_hp default for level 1 in the database. */
const BASE_MAX_HP = 50;

export function canonicalMaxHpForLevel(level: number) {
  return BASE_MAX_HP + (level - 1) * MAX_HP_PER_LEVEL_UP;
}

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: initialData, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      let data = initialData;
      if (!data) return null as Profile | null;
      const canonical = canonicalMaxHpForLevel(data.level);
      if (data.max_hp < canonical) {
        const hp = Math.min(canonical, data.hp);
        const { error: upErr } = await supabase
          .from("profiles")
          .update({ max_hp: canonical, hp })
          .eq("id", user!.id);
        if (!upErr) {
          const again = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user!.id)
            .maybeSingle();
          if (!again.error && again.data) data = again.data;
        }
      }
      return data as Profile | null;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { data, error } = await supabase
        .from("profiles")
        .update(patch)
        .eq("id", user!.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export interface RewardDelta {
  xp?: number;
  gold?: number;
  hp?: number;
  stamina?: number;
  stat?: "strength" | "intelligence" | "constitution";
}

export function useApplyReward() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (delta: RewardDelta) => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (!prof) throw new Error("no profile");
      const p = prof as Profile;

      const effMaxSta = effectiveMaxStamina(p);
      let xpGain = delta.xp ?? 0;
      if (xpGain > 0) {
        const { data: buff } = await supabase
          .from("profile_buffs")
          .select("meta")
          .eq("user_id", user!.id)
          .eq("buff_key", "xp_focus_bonus")
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        const meta = buff?.meta as { pct?: number } | null | undefined;
        const pct = meta && typeof meta.pct === "number" ? meta.pct : 0;
        if (pct > 0) xpGain = Math.round(xpGain * (1 + pct / 100));
      }

      const xpDelta = withXpEquipBonus(xpGain, p);
      const goldDelta = withGoldEquipBonus(delta.gold ?? 0, p);
      let xp = p.xp + xpDelta;
      let level = p.level;
      let max_hp = Math.max(p.max_hp, canonicalMaxHpForLevel(p.level));
      let hp = Math.min(max_hp, p.hp + (delta.hp ?? 0));
      let stamina = Math.max(0, Math.min(effMaxSta, p.stamina + (delta.stamina ?? 0)));
      const max_stamina = p.max_stamina;
      let gold = Math.max(0, p.gold + goldDelta);

      // Level up
      while (xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level += 1;
        hp += HP_REGEN_PER_LEVEL_UP;
        stamina = Math.min(effMaxSta, stamina + STAMINA_ON_LEVEL_UP);
      }

      // Death loop
      if (hp <= 0) {
        level = Math.max(1, level - 1);
        gold = Math.floor(gold * 0.8);
        hp = max_hp;
        xp = 0;
      }

      max_hp = Math.max(max_hp, canonicalMaxHpForLevel(level));
      hp = Math.min(max_hp, hp);

      const patch: Partial<Profile> = { xp, level, max_hp, hp, stamina, gold };
      if (delta.stat === "strength") patch.strength = p.strength + 1;
      else if (delta.stat === "intelligence") patch.intelligence = p.intelligence + 1;
      else if (delta.stat === "constitution") patch.constitution = p.constitution + 1;

      const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
      if (error) throw error;
      await supabase.rpc("try_unlock_achievements").catch(() => undefined);
      return patch;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["achievements"] });
    },
  });
}
