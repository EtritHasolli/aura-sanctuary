import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Profile } from "@/lib/aura/types";

export interface FriendCard {
  id: string;
  profile: Pick<
    Profile,
    | "id"
    | "display_name"
    | "level"
    | "hp"
    | "max_hp"
    | "xp"
    | "stamina"
    | "max_stamina"
    | "avatar_url"
    | "pet_state"
  >;
  petSpriteKey?: string | null;
  petLabel?: string | null;
}

export interface FriendDetail {
  profile: Pick<
    Profile,
    | "id"
    | "display_name"
    | "level"
    | "hp"
    | "max_hp"
    | "xp"
    | "stamina"
    | "max_stamina"
    | "avatar_url"
    | "pet_state"
    | "strength"
    | "intelligence"
    | "constitution"
    | "equip_str_bonus"
    | "equip_int_bonus"
    | "equip_con_bonus"
    | "aura_path"
  >;
  equippedItems: Array<{ id: string; name: string; category: string; rarity: string }>;
  sharedParty: { id: string; name: string } | null;
  myParty: { id: string; name: string } | null;
}

export interface PendingFriendRequest {
  requesterId: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
  createdAt: string;
}

export function useFriends() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["friends", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: edges, error: edgeErr } = await supabase
        .from("friendships")
        .select("user_id, friend_id, status")
        .eq("status", "accepted")
        .or(`user_id.eq.${user!.id},friend_id.eq.${user!.id}`);
      if (edgeErr) throw edgeErr;

      const friendIds = Array.from(
        new Set(
          (edges ?? [])
            .map((e) => (e.user_id === user!.id ? e.friend_id : e.user_id))
            .filter((id): id is string => !!id),
        ),
      );
      if (friendIds.length === 0) return [] as FriendCard[];

      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select(
          "id, display_name, level, hp, max_hp, xp, stamina, max_stamina, avatar_url, pet_state",
        )
        .in("id", friendIds);
      if (profErr) throw profErr;

      const { data: pets } = await supabase
        .from("user_companions")
        .select("user_id, companions(name, sprite_key)")
        .in("user_id", friendIds)
        .eq("equipped_as", "pet");

      const petByUid = new Map<
        string,
        {
          sprite_key?: string | null;
          name?: string | null;
        }
      >();
      for (const row of (pets ?? []) as Array<{
        user_id: string;
        companions?: { name?: string | null; sprite_key?: string | null } | null;
      }>) {
        petByUid.set(row.user_id, {
          sprite_key: row.companions?.sprite_key ?? null,
          name: row.companions?.name ?? null,
        });
      }

      return ((profiles ?? []) as FriendCard["profile"][]).map((profile) => ({
        id: profile.id,
        profile,
        petSpriteKey: petByUid.get(profile.id)?.sprite_key ?? null,
        petLabel: petByUid.get(profile.id)?.name ?? null,
      }));
    },
  });
}

export function useSendFriendRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (friendId: string) => {
      const { data, error } = await supabase.rpc("send_friend_request", { p_friend_id: friendId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends", user?.id] });
    },
  });
}

export function useSendFriendRequestByEmail() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error } = await supabase.rpc("send_friend_request_by_email", {
        p_email: email,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends", user?.id] });
      qc.invalidateQueries({ queryKey: ["friendRequests", user?.id] });
    },
  });
}

export function usePendingFriendRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["friendRequests", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const rpc = await supabase.rpc("list_pending_friend_requests");
      if (!rpc.error) {
        const rows = (rpc.data ?? []) as Array<{
          requester_id: string;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
        }>;
        return rows.map((r) => ({
          requesterId: r.requester_id,
          displayName: r.display_name?.trim() || "Unknown",
          email: r.email?.trim() || "unknown@email",
          avatarUrl: r.avatar_url ?? null,
          createdAt: r.created_at,
        }));
      }

      // Fallback path when RPC migration is not applied yet.
      const { data: rows, error } = await supabase
        .from("friendships")
        .select("user_id, created_at, requester_name, requester_email, requester_avatar_url")
        .eq("friend_id", user!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (
        (rows ?? []) as Array<{
          user_id: string;
          created_at: string;
          requester_name: string | null;
          requester_email: string | null;
          requester_avatar_url: string | null;
        }>
      ).map((r) => ({
        requesterId: r.user_id,
        displayName: r.requester_name?.trim() || r.requester_email?.split("@")[0] || "Unknown",
        email: r.requester_email?.trim() || "unknown@email",
        avatarUrl: r.requester_avatar_url ?? null,
        createdAt: r.created_at,
      }));
    },
    retry: 1,
  });
}

export function useAcceptFriendRequest() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (requesterId: string) => {
      const { data, error } = await supabase.rpc("accept_friend_request", {
        p_user_id: requesterId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["friends", user?.id] });
      qc.invalidateQueries({ queryKey: ["friendRequests", user?.id] });
    },
  });
}

export function useFriendDetail(friendId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["friendDetail", user?.id, friendId],
    enabled: !!user && !!friendId,
    queryFn: async () => {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select(
          "id, display_name, level, hp, max_hp, xp, stamina, max_stamina, avatar_url, pet_state, strength, intelligence, constitution, equip_str_bonus, equip_int_bonus, equip_con_bonus, aura_path",
        )
        .eq("id", friendId!)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile) throw new Error("Friend profile not found");

      const { data: equippedRows } = await supabase
        .from("user_items")
        .select("item_id, shop_items(name, category, rarity)")
        .eq("user_id", friendId!)
        .eq("equipped", true);
      const equippedItems = (
        (equippedRows ?? []) as Array<{
          item_id: string;
          shop_items?: {
            name?: string | null;
            category?: string | null;
            rarity?: string | null;
          } | null;
        }>
      )
        .filter((r) => !!r.item_id)
        .map((r) => ({
          id: r.item_id,
          name: r.shop_items?.name ?? "Item",
          category: r.shop_items?.category ?? "misc",
          rarity: r.shop_items?.rarity ?? "common",
        }));

      const { data: myMemberRows, error: myMemberErr } = await supabase
        .from("party_members")
        .select("party_id")
        .eq("user_id", user!.id);
      if (myMemberErr) throw myMemberErr;

      const { data: friendMemberRows, error: friendMemberErr } = await supabase
        .from("party_members")
        .select("party_id")
        .eq("user_id", friendId!);
      if (friendMemberErr) throw friendMemberErr;

      const myPartyIds = Array.from(new Set((myMemberRows ?? []).map((r) => r.party_id)));
      const friendPartyIds = new Set((friendMemberRows ?? []).map((r) => r.party_id));
      const sharedPartyId = myPartyIds.find((id) => friendPartyIds.has(id)) ?? null;

      const { data: myPartyRows } = myPartyIds.length
        ? await supabase.from("parties").select("id, name").in("id", myPartyIds).limit(10)
        : { data: [] as Array<{ id: string; name: string }> };
      const myParty = (myPartyRows ?? [])[0] ?? null;
      const sharedParty = (myPartyRows ?? []).find((p) => p.id === sharedPartyId) ?? null;

      return {
        profile: profile as FriendDetail["profile"],
        equippedItems,
        sharedParty,
        myParty,
      } as FriendDetail;
    },
  });
}

export function useInviteFriendToParty() {
  return useMutation({
    mutationFn: async ({ friendId, partyId }: { friendId: string; partyId: string }) => {
      const { data, error } = await supabase.rpc("send_party_invite_notification", {
        p_friend_id: friendId,
        p_party_id: partyId,
      });
      if (error) throw error;
      return data;
    },
  });
}
