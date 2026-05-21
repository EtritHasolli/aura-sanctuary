const DESKTOP_NOTIF_KEY = "aura:desktop-notifications";

export function desktopNotifsEnabled() {
  return (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    window.localStorage.getItem(DESKTOP_NOTIF_KEY) === "true"
  );
}

export async function fireLocalNotification(title: string, body: string, options?: { tag?: string; url?: string }) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      await reg.showNotification(title, {
        body,
        icon: "/aura-logo-full.png",
        badge: "/aura-logo.png",
        tag: options?.tag ?? "aura",
        data: { url: options?.url ?? "/" },
      });
      return;
    }
  }
  new Notification(title, { body, icon: "/aura-logo-full.png" });
}
