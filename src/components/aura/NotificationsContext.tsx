import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fireLocalNotification, playNotificationSound } from "@/lib/notifications";
import {
  notificationDisplayText,
  notificationLink,
  studyCallCode,
} from "@/lib/notificationLinks";

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
  markRead: (id: string) => void;
  markAllRead: () => void;
  markTavernPartyRead: (partyId: string) => void;
  markFriendMessagesRead: (friendId: string) => void;
  markMatchingRead: (matcher: (message: string) => boolean) => void;
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

/** Fired on window for every notification that arrives in realtime. */
export const NOTIFICATION_RECEIVED_EVENT = "aura:notification-received";
export interface NotificationReceivedDetail {
  notification: AppNotification;
  /** True when this client inserted it via push() (it already showed its own toast). */
  local: boolean;
}

const MAX_NOTIFICATIONS = 100;
const Ctx = createContext<NotificationsCtx | null>(null);
const notificationsTable = "notifications" as never;
const fallbackCtx: NotificationsCtx = {
  notifications: [],
  unread: 0,
  push: () => undefined,
  markRead: () => undefined,
  markAllRead: () => undefined,
  markTavernPartyRead: () => undefined,
  markFriendMessagesRead: () => undefined,
  markMatchingRead: () => undefined,
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

function appIsBackgrounded(electronFocused: boolean) {
  if (typeof document === "undefined") return false;
  if (window.electronAPI && !electronFocused) return true;
  return document.visibilityState !== "visible" || !document.hasFocus();
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;
  const electronWinFocused = useRef(true);
  /** Messages this client inserted itself, so the realtime echo doesn't toast twice. */
  const localPushesRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!window.electronAPI) return;
    const offBlur = window.electronAPI.onWindowMinimize(() => { electronWinFocused.current = false; });
    const offFocus = window.electronAPI.onWindowRestore(() => { electronWinFocused.current = true; });
    return () => { offBlur(); offFocus(); };
  }, []);

  // Load existing notifications on login.
  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    let cancelled = false;
    supabase
      .from(notificationsTable)
      .select("*")
      .eq("user_id" as never, userId)
      .order("created_at" as never, { ascending: false })
      .limit(MAX_NOTIFICATIONS)
      .then(({ data }) => {
        if (!cancelled && data) setNotifications((data as unknown as NotificationRow[]).map(toAppNotif));
      });
    return () => { cancelled = true; };
  }, [userId]);

  // Realtime: new rows, plus read-state changes made on this user's other devices.
  useEffect(() => {
    if (!userId) return;
    const filter = `user_id=eq.${userId}`;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter },
        (payload) => {
          const notif = toAppNotif(payload.new as NotificationRow);
          setNotifications((prev) =>
            prev.some((n) => n.id === notif.id) ? prev : [notif, ...prev].slice(0, MAX_NOTIFICATIONS),
          );

          const pending = localPushesRef.current.get(notif.message) ?? 0;
          const local = pending > 0;
          if (local) {
            if (pending === 1) localPushesRef.current.delete(notif.message);
            else localPushesRef.current.set(notif.message, pending - 1);
          }

          window.dispatchEvent(
            new CustomEvent<NotificationReceivedDetail>(NOTIFICATION_RECEIVED_EVENT, {
              detail: { notification: notif, local },
            }),
          );

          const link = notificationLink(notif.message);
          const displayMsg = notificationDisplayText(notif.message);
          if (appIsBackgrounded(electronWinFocused.current)) {
            void fireLocalNotification("Aura", displayMsg, {
              tag: notif.id,
              url: link?.href ?? "/",
              skipIfPushSubscribed: true,
            });
            return;
          }
          if (local) return;

          playNotificationSound();
          // Study-call invites get their own toast with a JOIN button (StudyCallProvider).
          if (studyCallCode(notif.message)) return;
          // Already looking at the page this notification points to.
          if (link && window.location.pathname === link.path) return;
          toast(displayMsg, {
            action: link
              ? { label: "OPEN", onClick: () => void router.history.push(link.href) }
              : undefined,
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((prev) =>
            prev.map((n) => (n.id === row.id && n.read !== row.read ? { ...n, read: row.read } : n)),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, router]);

  const push = useCallback(
    async (message: string, type: AppNotification["type"] = "info") => {
      if (!userId) return;
      const pending = localPushesRef.current;
      pending.set(message, (pending.get(message) ?? 0) + 1);
      const { error } = await supabase
        .from(notificationsTable)
        .insert({ user_id: userId, message, type } as never);
      if (error) pending.delete(message);
    },
    [userId],
  );

  const markIdsRead = useCallback(
    async (ids: string[]) => {
      if (!userId || ids.length === 0) return;
      const idSet = new Set(ids);
      setNotifications((prev) => prev.map((n) => (idSet.has(n.id) ? { ...n, read: true } : n)));
      await supabase
        .from(notificationsTable)
        .update({ read: true } as never)
        .eq("user_id" as never, userId)
        .in("id" as never, ids as never);
    },
    [userId],
  );

  const markRead = useCallback(
    (id: string) => {
      const target = notificationsRef.current.find((n) => n.id === id);
      if (target && !target.read) void markIdsRead([id]);
    },
    [markIdsRead],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    setNotifications((prev) => (prev.some((n) => !n.read) ? prev.map((n) => ({ ...n, read: true })) : prev));
    await supabase
      .from(notificationsTable)
      .update({ read: true } as never)
      .eq("user_id" as never, userId)
      .eq("read" as never, false);
  }, [userId]);

  /** Marks loaded unread notifications matching `matcher` as read. No-op (no request) when none match. */
  const markMatchingRead = useCallback(
    (matcher: (message: string) => boolean) => {
      const ids = notificationsRef.current
        .filter((n) => !n.read && matcher(n.message))
        .map((n) => n.id);
      void markIdsRead(ids);
    },
    [markIdsRead],
  );

  const markTavernPartyRead = useCallback(
    (partyId: string) => {
      markMatchingRead((message) => {
        const link = notificationLink(message);
        if (link?.path !== "/tavern") return false;
        return link.params.get("party") === partyId || link.params.get("invite") === partyId;
      });
    },
    [markMatchingRead],
  );

  const markFriendMessagesRead = useCallback(
    (friendId: string) => {
      markMatchingRead((message) => {
        const link = notificationLink(message);
        return link?.path === "/friends" && link.params.get("friend") === friendId;
      });
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
        markRead,
        markAllRead,
        markTavernPartyRead,
        markFriendMessagesRead,
        markMatchingRead,
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
