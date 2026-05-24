import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const VAPID_PUBLIC_KEY = "BLWRvRNGQtm0CjWnzQJ3BjLU_9wpOiqrORsNKlRQuCio11TOmRTq6lmMPnFrffLOO5f7RqQ4LT6kisYRC0jW_Rc";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type PushStatus = "unsupported" | "denied" | "prompt" | "subscribed" | "loading";

export function usePushNotifications() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");

  const checkStatus = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();

    if (!sub) {
      setStatus("prompt");
      return;
    }

    // Browser has a subscription — verify the DB also has it so the push trigger
    // can fire. Self-heals if a previous subscribe() wrote to the browser but
    // failed to write to the DB.
    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: dbSub } = await (supabase as any)
        .from("push_subscriptions")
        .select("endpoint")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!dbSub) {
        const json = sub.toJSON();
        const p256dh = json.keys?.p256dh;
        const auth = json.keys?.auth;
        if (json.endpoint && p256dh && auth) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("push_subscriptions").upsert(
            { user_id: user.id, endpoint: json.endpoint, p256dh, auth },
            { onConflict: "user_id,endpoint" }
          );
        }
      }
    }

    setStatus("subscribed");
  }, [user]);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setStatus("denied"); return false; }

      const reg = await navigator.serviceWorker.ready;

      // Clear any existing subscription first. A stale subscription registered
      // under a different VAPID key would cause subscribe() to throw, leaving
      // the browser holding a subscription that doesn't match the DB.
      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as ArrayBuffer,
      });

      const json = sub.toJSON();
      const endpoint = json.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;

      if (!endpoint || !p256dh || !auth) {
        console.error("Push subscription missing required fields", json);
        await sub.unsubscribe();
        setStatus("prompt");
        return false;
      }

      // Remove all old subscriptions for this user first, then insert fresh
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("push_subscriptions").delete().eq("user_id", user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("push_subscriptions").insert({
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
      });

      if (error) throw error;
      setStatus("subscribed");
      return true;
    } catch (e) {
      console.error("Push subscribe failed", e);
      setStatus("prompt");
      return false;
    }
  }, [user]);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setStatus("loading");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("push_subscriptions").delete().eq("user_id", user.id);
      if (sub) await sub.unsubscribe();
      setStatus("prompt");
      return true;
    } catch (e) {
      console.error("Push unsubscribe failed", e);
      setStatus("subscribed");
      return false;
    }
  }, [user]);

  return { status, subscribe, unsubscribe };
}
