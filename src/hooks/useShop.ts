import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { deriveEquippedPetGear } from "@/lib/aura/petEquipmentLayers";

export interface ShopItemRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  rarity: string;
  price: number;
  is_active: boolean;
  forge_exclusive?: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface UserItemRow {
  id: string;
  user_id: string;
  item_id: string;
  quantity: number;
  equipped: boolean;
  acquired_at: string;
  updated_at: string;
  shop_items: ShopItemRow;
}

export interface PurchaseResult {
  item_slug: string;
  quantity_purchased: number;
  new_quantity: number;
  gold_left: number;
}

export interface ConsumeResult {
  item_slug: string;
  consumed_quantity: number;
  quantity_left: number;
  stamina_after: number;
  hp_after: number;
}

export function useShopItems() {
  return useQuery({
    queryKey: ["shopItems"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_items")
        .select("*")
        .eq("is_active", true)
        .eq("forge_exclusive", false)
        .order("price", { ascending: true });
      if (error) throw error;
      return data as ShopItemRow[];
    },
  });
}

export function useUserItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["userItems", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_items")
        .select("*, shop_items(*)")
        .eq("user_id", user!.id)
        .gt("quantity", 0)
        .order("acquired_at", { ascending: false });
      if (error) throw error;
      return data as UserItemRow[];
    },
  });
}

/** Equipped shop equipment that defines a pet sprite layer (see `PET_EQUIPMENT_LAYER_BY_SLUG`). */
export function useEquippedPetGear() {
  const { data } = useUserItems();
  return useMemo(() => deriveEquippedPetGear(data), [data]);
}

export function usePurchaseShopItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ slug, quantity = 1 }: { slug: string; quantity?: number }) => {
      const { data, error } = await supabase.rpc("purchase_shop_item", {
        p_item_slug: slug,
        p_quantity: quantity,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : data != null ? [data] : [];
      const row = rows[0] as PurchaseResult | undefined;
      if (!row) throw new Error("Purchase returned no row");
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userItems", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}

export function useEquipUserItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (userItemId: string) => {
      const { error } = await supabase.rpc("equip_user_item", { p_user_item_id: userItemId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userItems", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}

export interface ForgeResult {
  slug: string;
  name: string;
  rarity: string;
  from_rarity?: string;
}

export function useForgeThreeEquipment() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (ids: readonly [string, string, string]) => {
      const { data, error } = await supabase.rpc("forge_three_equipment", {
        p_user_item_id_a: ids[0],
        p_user_item_id_b: ids[1],
        p_user_item_id_c: ids[2],
      });
      if (error) throw error;
      const row = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
      if (!row || typeof row.slug !== "string") throw new Error("Forge returned no result");
      return {
        slug: row.slug,
        name: typeof row.name === "string" ? row.name : "",
        rarity: typeof row.rarity === "string" ? row.rarity : "",
        from_rarity: typeof row.from_rarity === "string" ? row.from_rarity : undefined,
      } satisfies ForgeResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userItems", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}

export function useUnequipUserItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (userItemId: string) => {
      const { error } = await supabase.rpc("unequip_user_item", { p_user_item_id: userItemId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userItems", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}

export function useConsumeUserItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ slug, quantity = 1 }: { slug: string; quantity?: number }) => {
      const { data, error } = await supabase.rpc("consume_user_item", {
        p_item_slug: slug,
        p_quantity: quantity,
      });
      if (error) throw error;
      const rows = Array.isArray(data) ? data : data != null ? [data] : [];
      const row = rows[0] as ConsumeResult | undefined;
      if (!row) throw new Error("Consume returned no row");
      return row;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userItems", user?.id] });
      qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });
}
