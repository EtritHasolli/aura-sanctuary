import { createContext, useContext, useEffect, useCallback, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
  clear: () => void;
}

const Ctx = createContext<NotificationsCtx | null>(null);

function toAppNotif(row: { id: string; message: string; type: string; read: boolean; created_at: string }): AppNotification {
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // Load existing notifications on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setNotifications(data.map(toAppNotif));
      });
  }, [user?.id]);

  // Realtime: insert new rows as they arrive
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [toAppNotif(payload.new as Parameters<typeof toAppNotif>[0]), ...prev].slice(0, 50));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  // Push: insert into DB (realtime will pick it up) or fall back to local-only
  const push = useCallback(async (message: string, type: AppNotification["type"] = "info") => {
    if (!user) return;
    await supabase.from("notifications").insert({ user_id: user.id, message, type });
    // Realtime subscription handles updating the state
  }, [user?.id]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
  }, [user?.id]);

  const clear = useCallback(async () => {
    if (!user) return;
    setNotifications([]);
    await supabase.from("notifications").delete().eq("user_id", user.id);
  }, [user?.id]);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <Ctx.Provider value={{ notifications, unread, push, markAllRead, clear }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications outside provider");
  return ctx;
}
