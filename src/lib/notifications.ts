const DESKTOP_NOTIF_KEY = "aura:desktop-notifications";
export const SOUND_NOTIF_KEY = "aura:sound-notifications";

export function desktopNotifsEnabled() {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem(DESKTOP_NOTIF_KEY) !== "true") return false;
  // Electron delivers notifications via native IPC — no browser permission needed
  if (window.electronAPI) return true;
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

export function soundNotifsEnabled() {
  if (typeof window === "undefined") return false;
  // Defaults to on, matching the Settings toggle.
  return window.localStorage.getItem(SOUND_NOTIF_KEY) !== "false";
}

let audioCtx: AudioContext | null = null;

/** Short two-note chime, synthesized so no audio asset is needed. */
export function playNotificationSound() {
  if (!soundNotifsEnabled()) return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx ??= new Ctor();
    const ctx = audioCtx;
    // Browsers keep the context suspended until a user gesture; resume() is a no-op otherwise.
    void ctx.resume();
    const start = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      const t = start + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    });
  } catch {
    // Audio is best-effort.
  }
}

/** True when this browser already receives server web push, which shows its own OS notification. */
async function hasActivePushSubscription(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function fireLocalNotification(
  title: string,
  body: string,
  options?: { tag?: string; url?: string; skipIfPushSubscribed?: boolean },
) {
  if (!desktopNotifsEnabled()) return;
  if (typeof window !== "undefined" && window.electronAPI?.showNotification) {
    await window.electronAPI.showNotification(title, body, options?.url);
    return;
  }
  // Server push already delivers this notification to the OS — avoid showing it twice.
  if (options?.skipIfPushSubscribed && (await hasActivePushSubscription())) return;
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.getRegistration().catch(() => undefined);
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
