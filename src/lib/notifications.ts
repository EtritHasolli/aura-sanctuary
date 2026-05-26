const DESKTOP_NOTIF_KEY = "aura:desktop-notifications";

export function desktopNotifsEnabled() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(DESKTOP_NOTIF_KEY) !== "true") return false;
  // Electron delivers notifications via native IPC — no browser permission needed
  if (window.electronAPI) return true;
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export async function fireLocalNotification(title: string, body: string, options?: { tag?: string; url?: string }) {
  if (!desktopNotifsEnabled()) return;
  if (typeof window !== "undefined" && window.electronAPI?.showNotification) {
    await window.electronAPI.showNotification(title, body);
    return;
  }
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
