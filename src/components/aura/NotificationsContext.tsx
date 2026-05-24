import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fireLocalNotification } from "@/lib/notifications";

export interface AppNotification {
  id: string;
  message: string;
  type: "info" | "success" | "warning";
  at: number;
  read: boolean;
}

interface NotificationsCtx {
  notifications: AppNotification[];
  unread: number;
  push: (message: string, type?: AppNotification["type"]) => void;
  markAllRead: () => void;
  markTavernPartyRead: (partyId: string) => void;
  markFriendMessagesRead: (friendId: string) => void;
  deleteOne: (id: string) => void;
  clear: () => void;
}

interface NotificationRow {
  id: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

const Ctx = createContext<NotificationsCtx | null>(null);
const notificationsTable = "notifications" as never;
const fallbackCtx: NotificationsCtx = {
  notifications: [],
  unread: 0,
  push: () => undefined,
  markAllRead: () => undefined,
  markTavernPartyRead: () => undefined,
  markFriendMessagesRead: () => undefined,
  deleteOne: () => undefined,
  clear: () => undefined,
};

function toAppNotif(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    message: row.message,
    type: (row.type as AppNotification["type"]) ?? "info",
    at: new Date(row.created_at).getTime(),
    read: row.read,
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const electronWinFocused = useRef(true);

  useEffect(() => {
    if (!window.electronAPI) return;
    const offBlur = window.electronAPI.onWindowMinimize(() => { electronWinFocused.current = false; });
    const offFocus = window.electronAPI.onWindowRestore(() => { electronWinFocused.current = true; });
    return () => { offBlur(); offFocus(); };
  }, []);

  // Load existing notifications on mount.
  useEffect(() => {
    if (!userId) return;
    supabase
      .from(notificationsTable)
      .select("*")
      .eq("user_id" as never, userId)
      .order("created_at" as never, { ascending: false })
      .then(({ data }) => {
        if (data) setNotifications((data as unknown as NotificationRow[]).map(toAppNotif));
      });
  }, [userId]);

  // Realtime: insert new rows as they arrive.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const notif = toAppNotif(payload.new as NotificationRow);
          setNotifications((prev) => [notif, ...prev].slice(0, 50));
          const isBackgrounded = window.electronAPI
            ? !electronWinFocused.current
            : document.visibilityState !== "visible";
          if (isBackgrounded) {
            const displayMsg = notif.message.replace(/\s*\/\S+\?\S+\s*$/, "").trim();
            void fireLocalNotification("Aura", displayMsg, { tag: notif.id });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const push = useCallback(
    async (message: string, type: AppNotification["type"] = "info") => {
      if (!userId) return;
      await supabase.from(notificationsTable).insert({ user_id: userId, message, type } as never);
    },
    [userId],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase
      .from(notificationsTable)
      .update({ read: true } as never)
      .eq("user_id" as never, userId)
      .eq("read" as never, false);
  }, [userId]);

  const markMatchingRead = useCallback(
    async (matcher: (message: string) => boolean, dbPattern: string) => {
      if (!userId) return;
      setNotifications((prev) => {
        let changed = false;
        const next = prev.map((n) => {
          if (!n.read && matcher(n.message)) {
            changed = true;
            return { ...n, read: true };
          }
          return n;
        });
        return changed ? next : prev;
      });
      await supabase
        .from(notificationsTable)
        .update({ read: true } as never)
        .eq("user_id" as never, userId)
        .eq("read" as never, false)
        .ilike("message" as never, dbPattern as never);
    },
    [userId],
  );

  const markTavernPartyRead = useCallback(
    (partyId: string) => {
      void markMatchingRead((message) => {
        const match = message.match(/\/tavern\?([^\s]+)/i);
        if (!match) return false;
        const params = new URLSearchParams(match[1]);
        return params.get("party") === partyId || params.get("invite") === partyId;
      }, `%/tavern?%${partyId}%`);
    },
    [markMatchingRead],
  );

  const markFriendMessagesRead = useCallback(
    (friendId: string) => {
      void markMatchingRead((message) => {
        const match = message.match(/\/friends\?([^\s]+)/i);
        return match ? new URLSearchParams(match[1]).get("friend") === friendId : false;
      }, `%/friends?%friend=${friendId}%`);
    },
    [markMatchingRead],
  );

  const clear = useCallback(async () => {
    if (!userId) return;
    setNotifications([]);
    await supabase
      .from(notificationsTable)
      .delete()
      .eq("user_id" as never, userId);
  }, [userId]);

  const deleteOne = useCallback(
    async (id: string) => {
      if (!userId) return;
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      await supabase
        .from(notificationsTable)
        .delete()
        .eq("user_id" as never, userId)
        .eq("id" as never, id);
    },
    [userId],
  );

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Ctx.Provider
      value={{
        notifications,
        unread,
        push,
        markAllRead,
        markTavernPartyRead,
        markFriendMessagesRead,
        deleteOne,
        clear,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  return ctx ?? fallbackCtx;
}
