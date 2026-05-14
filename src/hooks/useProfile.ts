import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/lib/aura/types";
import { profileFromDbRow, profilePatchToDb, xpForLevel } from "@/lib/aura/types";
import {
  effectiveMaxStamina,
  withGoldEquipBonus,
  withXpEquipBonus,
} from "@/lib/aura/equipmentBonuses";
import { useAuth } from "./useAuth";

export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is_admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)("is_admin", {});
      if (error) return false;
      return data === true;
    },
    staleTime: 5 * 60_000,
  });
}

const STAMINA_ON_LEVEL_UP = 50;
const MAX_HP_PER_LEVEL_UP = 10;
const HP_REGEN_PER_LEVEL_UP = 10;
/** Must match profiles.max_hp default for level 1 in the database. */
const BASE_MAX_HP = 50;
const CON_HP_BONUS_DIVISOR = 5;
const PATH_LEVEL_GROWTH = {
  swordsman:     { strength: 2, constitution: 1, intelligence: 0, dexterity: 0 },
  evilswordsman: { strength: 2, constitution: 1, intelligence: 0, dexterity: 0 },
  mage:          { strength: 0, constitution: 0, intelligence: 2, dexterity: 1 },
  evilmage:      { strength: 0, constitution: 0, intelligence: 2, dexterity: 1 },
  tank:          { strength: 1, constitution: 2, intelligence: 0, dexterity: 0 },
  evilpaladin:   { strength: 1, constitution: 2, intelligence: 0, dexterity: 0 },
  rogue:         { strength: 0, constitution: 0, intelligence: 1, dexterity: 2 },
  evilrogue:     { strength: 0, constitution: 0, intelligence: 1, dexterity: 2 },
} as const;

export function canonicalMaxHpForLevel(level: number, constitution = 0) {
  const conBonus = Math.max(0, Math.floor(constitution / CON_HP_BONUS_DIVISOR));
  return BASE_MAX_HP + (level - 1) * MAX_HP_PER_LEVEL_UP + conBonus;
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
      const canonical = canonicalMaxHpForLevel(data.level, data.constitution);
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
      return profileFromDbRow(data);
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
        .update(profilePatchToDb(patch))
        .eq("id", user!.id)
        .select()
        .single();
      if (error) throw error;
      return profileFromDbRow(data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile"] }),
  });
}

export interface RewardDelta {
  xp?: number;
  gold?: number;
  hp?: number;
  stamina?: number;
  stat?: "strength" | "intelligence" | "constitution" | "dexterity";
  statAmount?: number;
}

export function useApplyReward() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    onMutate: async (delta: RewardDelta) => {
      const key = ["profile", user?.id] as const;
      await qc.cancelQueries({ queryKey: ["profile"] });
      const prev = qc.getQueryData<Profile | null>(key);
      if (!prev) return { prev };

      const effMaxSta = effectiveMaxStamina(prev);
      const next: Profile = {
        ...prev,
        hp: Math.max(0, Math.min(prev.max_hp, prev.hp + (delta.hp ?? 0))),
        stamina: Math.max(0, prev.stamina + (delta.stamina ?? 0)),
        xp: Math.max(0, prev.xp + (delta.xp ?? 0)),
        gold: Math.max(0, prev.gold + (delta.gold ?? 0)),
      };
      const statAmount = delta.statAmount ?? 1;
      if (delta.stat === "strength") next.strength = Math.max(0, prev.strength + statAmount);
      else if (delta.stat === "intelligence")
        next.intelligence = Math.max(0, prev.intelligence + statAmount);
      else if (delta.stat === "constitution")
        next.constitution = Math.max(0, prev.constitution + statAmount);
      else if (delta.stat === "dexterity")
        next.dexterity = Math.max(0, prev.dexterity + statAmount);
      // Keep optimistic preview bounded when this is not a level-up flow.
      if ((delta.xp ?? 0) <= 0) next.stamina = Math.min(effMaxSta, next.stamina);
      qc.setQueryData(key, next);
      return { prev };
    },
    mutationFn: async (delta: RewardDelta) => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (!prof) throw new Error("no profile");
      const p = profileFromDbRow(prof);

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
      let xp = Math.max(0, p.xp + xpDelta);
      let level = p.level;
      let max_hp = Math.max(p.max_hp, canonicalMaxHpForLevel(p.level, p.constitution));
      let hp = Math.min(max_hp, p.hp + (delta.hp ?? 0));
      let stamina = Math.max(0, p.stamina + (delta.stamina ?? 0));
      let gold = Math.max(0, p.gold + goldDelta);
      let leveledUp = false;
      let strength = p.strength;
      let intelligence = p.intelligence;
      let constitution = p.constitution;
      let dexterity = p.dexterity;

      // Level up
      while (xp >= xpForLevel(level)) {
        leveledUp = true;
        xp -= xpForLevel(level);
        level += 1;
        hp += HP_REGEN_PER_LEVEL_UP;
        // Intentional level-up overflow: make level moments impactful.
        stamina += STAMINA_ON_LEVEL_UP;
        const growth =
          (p.aura_path && PATH_LEVEL_GROWTH[p.aura_path]) ?? PATH_LEVEL_GROWTH.swordsman;
        strength += growth.strength;
        intelligence += growth.intelligence;
        constitution += growth.constitution;
        dexterity += growth.dexterity;
      }

      // Death loop
      if (hp <= 0) {
        const effCon = p.constitution + (p.equip_con_bonus ?? 0);
        const loseLevel = effCon < 30;
        const goldPenaltyPct = Math.max(5, 20 - Math.floor(effCon / 2));
        const lostGold = gold - Math.floor((gold * (100 - goldPenaltyPct)) / 100);
        const lostXp = xp;
        if (loseLevel) level = Math.max(1, level - 1);
        gold = Math.floor((gold * (100 - goldPenaltyPct)) / 100);
        hp = max_hp;
        xp = 0;
        await supabase.from("profile_buffs").upsert({
          user_id: user!.id,
          buff_key: "ghost_mercy",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          meta: {
            lost_gold: Math.max(0, lostGold),
            lost_xp: Math.max(0, lostXp),
            lose_level: loseLevel,
          },
        });
      }

      max_hp = Math.max(max_hp, canonicalMaxHpForLevel(level, constitution));
      hp = Math.min(max_hp, hp);
      stamina = Math.max(0, stamina);
      // Overflow should only happen during level-up moments.
      if (!leveledUp) stamina = Math.min(effMaxSta, stamina);

      const patch: Partial<Profile> = {
        xp,
        level,
        max_hp,
        hp,
        stamina,
        gold,
        strength,
        intelligence,
        constitution,
        dexterity,
      };
      const statAmount = delta.statAmount ?? 1;
      if (delta.stat === "strength") patch.strength = Math.max(0, strength + statAmount);
      else if (delta.stat === "intelligence")
        patch.intelligence = Math.max(0, intelligence + statAmount);
      else if (delta.stat === "constitution")
        patch.constitution = Math.max(0, constitution + statAmount);
      else if (delta.stat === "dexterity")
        patch.dexterity = Math.max(0, dexterity + statAmount);

      const { error } = await supabase.from("profiles").update(profilePatchToDb(patch)).eq("id", user!.id);
      if (error) throw error;
      let achievementMoonshards = 0;
      let levelMoonshards = 0;
      try {
        const { data } = await supabase.rpc("try_unlock_achievements");
        const row = data as { moonshards_awarded?: number } | null;
        achievementMoonshards = row?.moonshards_awarded ?? 0;
      } catch {
        // non-blocking side effect; ignore unlock check errors here
      }
      if (leveledUp) {
        try {
          const { data } = await supabase.rpc("claim_level_moonshards");
          const row = data as { moonshards_awarded?: number } | null;
          levelMoonshards = row?.moonshards_awarded ?? 0;
        } catch {
          // non-blocking — server is source of truth and the next applyReward retries
        }
      }
      const totalMoonshards = achievementMoonshards + levelMoonshards;
      if (totalMoonshards > 0) {
        window.dispatchEvent(
          new CustomEvent("aura:moonshards-awarded", {
            detail: {
              amount: totalMoonshards,
              reasons: [
                achievementMoonshards > 0 ? "achievement" : null,
                levelMoonshards > 0 ? "level_milestone" : null,
              ].filter((x): x is string => !!x),
            },
          }),
        );
      }
      return patch;
    },
    onError: (_err, _delta, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(["profile", user?.id], ctx.prev);
      }
    },
    onSuccess: (patch) => {
      const key = ["profile", user?.id] as const;
      qc.setQueryData<Profile | null>(key, (prev) => (prev ? { ...prev, ...patch } : prev));
      qc.invalidateQueries({ queryKey: ["achievements"] });
      // Server may have granted moonshards (achievement/level/quest-arc/boss);
      // refetch so HUD balance is accurate.
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
