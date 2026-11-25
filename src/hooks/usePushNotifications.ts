import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * `navigator.serviceWorker.ready` never settles when no worker gets registered
 * (e.g. registration failed), which left the toggle stuck on "loading".
 */
async function getRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration | null> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pushSubs = () => (supabase as any).from("push_subscriptions");

export type PushStatus = "unsupported" | "denied" | "prompt" | "subscribed" | "loading";

/**
 * Web push for this browser. Each device keeps its own row in push_subscriptions
 * (unique per user + endpoint), so enabling or disabling here never touches the
 * user's other devices.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>("loading");

  const checkStatus = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") { setStatus("denied"); return; }

    const reg = await getRegistration();
    const sub = await reg?.pushManager.getSubscription();

    if (!sub) {
      setStatus("prompt");
      return;
    }

    // Browser has a subscription — make sure the DB has this exact endpoint so the
    // push trigger can reach it. Self-heals a subscribe() that failed half way.
    if (user) {
      const json = sub.toJSON();
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;
      if (json.endpoint && p256dh && auth) {
        const { data: dbSub } = await pushSubs()
          .select("endpoint")
          .eq("user_id", user.id)
          .eq("endpoint", json.endpoint)
          .maybeSingle();
        if (!dbSub) {
          await pushSubs().upsert(
            { user_id: user.id, endpoint: json.endpoint, p256dh, auth },
            { onConflict: "user_id,endpoint" },
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

      const reg = await getRegistration();
      if (!reg) throw new Error("Service worker not available");

      // Clear any existing subscription first. A stale subscription registered
      // under a different VAPID key would cause subscribe() to throw.
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await pushSubs().delete().eq("user_id", user.id).eq("endpoint", existing.endpoint);
        await existing.unsubscribe();
      }

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

      const { error } = await pushSubs().upsert(
        { user_id: user.id, endpoint, p256dh, auth },
        { onConflict: "user_id,endpoint" },
      );

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
      const reg = await getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await pushSubs().delete().eq("user_id", user.id).eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
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
