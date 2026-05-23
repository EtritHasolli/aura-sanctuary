import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface SubscriptionTier {
  slug: string;
  name: string;
  description: string;
  sort_order: number;
  price_usd: number;
  is_free: boolean;
  is_active: boolean;
  max_parties_owned: number;
  max_parties_joined: number;
  max_notes: number | null;
  max_tasks: number | null;
  monthly_moonshards: number;
  signup_bonus_moonshards: number;
  perks: Record<string, unknown>;
}

export interface SubscriptionLimits {
  tier_slug: string;
  tier_name: string;
  is_free: boolean;
  max_parties_owned: number;
  max_parties_joined: number;
  parties_owned: number;
  parties_joined: number;
  expires_at: string | null;
  monthly_moonshards: number;
  next_stipend_eligible_at: string | null;
}

export function useSubscriptionTiers() {
  return useQuery({
    queryKey: ["subscription_tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_tiers")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SubscriptionTier[];
    },
  });
}

export function useSubscriptionLimits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["subscription_limits", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("current_user_subscription_limits");
      if (error) throw error;
      const rows = (data ?? []) as SubscriptionLimits[];
      return rows[0] ?? null;
    },
  });
}

export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["is_admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useClaimMonthlyMoonshards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("claim_monthly_moonshards");
      if (error) throw error;
      return (data ?? null) as {
        moonshards_awarded: number;
        reason?: string;
        next_eligible_at?: string;
        tier_slug?: string;
      } | null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["subscription_limits"] });
    },
  });
}

export interface UpsertTierInput {
  slug: string;
  name: string;
  description?: string;
  sort_order?: number;
  price_usd?: number;
  max_parties_owned?: number;
  max_parties_joined?: number;
  max_notes?: number | null;
  max_tasks?: number | null;
  monthly_moonshards?: number;
  signup_bonus_moonshards?: number;
  perks?: Record<string, unknown>;
  is_active?: boolean;
}

export function useUpsertSubscriptionTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertTierInput) => {
      const { data, error } = await supabase.rpc("admin_upsert_subscription_tier", {
        p_slug: input.slug,
        p_name: input.name,
        p_description: input.description ?? "",
        p_sort_order: input.sort_order ?? 0,
        p_price_usd: input.price_usd ?? 0,
        p_max_parties_owned: input.max_parties_owned ?? 3,
        p_max_parties_joined: input.max_parties_joined ?? 5,
        p_max_notes: input.max_notes ?? null,
        p_max_tasks: input.max_tasks ?? null,
        p_monthly_moonshards: input.monthly_moonshards ?? 0,
        p_signup_bonus_moonshards: input.signup_bonus_moonshards ?? 0,
        p_perks: input.perks ?? {},
        p_is_active: input.is_active ?? true,
      });
      if (error) throw error;
      return data as SubscriptionTier;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription_tiers"] });
      qc.invalidateQueries({ queryKey: ["subscription_limits"] });
    },
  });
}

export function useDeleteSubscriptionTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (slug: string) => {
      const { error } = await supabase.rpc("admin_delete_subscription_tier", { p_slug: slug });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription_tiers"] });
      qc.invalidateQueries({ queryKey: ["subscription_limits"] });
    },
  });
}

export interface SetUserSubscriptionInput {
  user_id: string;
  tier_slug: string;
  expires_at?: string | null;
  grant_signup_bonus?: boolean;
}

export function useSetUserSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetUserSubscriptionInput) => {
      const { data, error } = await supabase.rpc("admin_set_user_subscription", {
        p_user_id: input.user_id,
        p_tier_slug: input.tier_slug,
        p_expires_at: input.expires_at ?? null,
        p_grant_signup_bonus: input.grant_signup_bonus ?? true,
      });
      if (error) throw error;
      return data as {
        user_id: string;
        tier_slug: string;
        expires_at: string | null;
        signup_bonus_awarded: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription_limits"] });
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
