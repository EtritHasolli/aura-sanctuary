import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

// The Android app loads this website live, so ordinary changes reach it without a
// new APK. Only the native shell (icon, permissions, plugins) needs reinstalling;
// when public/android-version.json is ahead of the installed build, offer the APK.
const APK_URL =
  "https://github.com/EtritHasolli/aura-sanctuary/releases/download/android-latest/Aura-Sanctuary.apk";

export function AndroidUpdateBar() {
  const [outdated, setOutdated] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const [info, res] = await Promise.all([
          App.getInfo(),
          fetch("/android-version.json", { cache: "no-store" }),
        ]);
        const latest = (await res.json()) as { versionCode: number };
        if (!cancelled && Number(info.build) < latest.versionCode) setOutdated(true);
      } catch {
        // Offline or the file is missing — not worth bothering the user about.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!outdated || dismissed) return null;

  return (
    <div
      className="w-full shrink-0 flex items-center justify-between gap-2 px-4 py-1.5 bg-primary text-primary-foreground text-[10px]"
      style={{ fontFamily: "var(--font-pixel)" }}
    >
      <span>New app version available</span>
      <div className="flex items-center gap-2">
        <a
          href={APK_URL}
          className="px-2 py-0.5 bg-primary-foreground text-primary hover:opacity-80 transition-opacity"
        >
          Download
        </a>
        <button
          onClick={() => setDismissed(true)}
          className="px-1 hover:opacity-80"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
