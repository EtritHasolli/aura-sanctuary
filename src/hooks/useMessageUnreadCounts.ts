import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type MessageScope = "friend" | "party";

interface UnreadRow {
  scope_type: MessageScope;
  scope_id: string;
  unread_count: number;
}

export interface MessageUnreadCounts {
  friendsTotal: number;
  tavernTotal: number;
  friendUnreadById: Record<string, number>;
  partyUnreadById: Record<string, number>;
}

type RpcResult = Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc as unknown as (fn: string, args?: Record<string, unknown>) => RpcResult;

function toCounts(rows: UnreadRow[]): MessageUnreadCounts {
  const counts: MessageUnreadCounts = {
    friendsTotal: 0,
    tavernTotal: 0,
    friendUnreadById: {},
    partyUnreadById: {},
  };

  for (const row of rows) {
    const count = Number(row.unread_count ?? 0);
    if (row.scope_type === "friend") {
      counts.friendUnreadById[row.scope_id] = count;
      counts.friendsTotal += count;
    } else if (row.scope_type === "party") {
      counts.partyUnreadById[row.scope_id] = count;
      counts.tavernTotal += count;
    }
  }

  return counts;
}

export function useMessageUnreadCounts() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user?.id) return;
    const invalidate = () => {
      void qc.invalidateQueries({ queryKey: ["messageUnreadCounts", user.id] });
    };
    const channelName = `message-unreads:${user.id}:${crypto.randomUUID()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "friend_messages" },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_read_states",
          filter: `user_id=eq.${user.id}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, user?.id]);

  return useQuery({
    queryKey: ["messageUnreadCounts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await rpc("get_message_unread_counts");
      if (error) throw new Error(error.message);
      return toCounts((data ?? []) as UnreadRow[]);
    },
  });
}

export function useMarkMessageScopeRead() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    onMutate: async ({ scopeType, scopeId }: { scopeType: MessageScope; scopeId: string }) => {
      const key = ["messageUnreadCounts", user?.id] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<MessageUnreadCounts>(key);
      qc.setQueryData<MessageUnreadCounts>(key, (current) => {
        if (!current) return current;
        const next: MessageUnreadCounts = {
          friendsTotal: current.friendsTotal,
          tavernTotal: current.tavernTotal,
          friendUnreadById: { ...current.friendUnreadById },
          partyUnreadById: { ...current.partyUnreadById },
        };

        if (scopeType === "friend") {
          const previous = next.friendUnreadById[scopeId] ?? 0;
          next.friendsTotal = Math.max(0, next.friendsTotal - previous);
          delete next.friendUnreadById[scopeId];
        } else {
          const previous = next.partyUnreadById[scopeId] ?? 0;
          next.tavernTotal = Math.max(0, next.tavernTotal - previous);
          delete next.partyUnreadById[scopeId];
        }

        return next;
      });
      return { prev };
    },
    mutationFn: async ({ scopeType, scopeId }: { scopeType: MessageScope; scopeId: string }) => {
      const { error } = await rpc("mark_message_scope_read", {
        p_scope_type: scopeType,
        p_scope_id: scopeId,
      });
      if (error) throw new Error(error.message);
    },
    onError: (_error, _vars, ctx) => {
      if (ctx?.prev !== undefined) {
        qc.setQueryData(["messageUnreadCounts", user?.id], ctx.prev);
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messageUnreadCounts", user?.id] });
    },
  });
}
