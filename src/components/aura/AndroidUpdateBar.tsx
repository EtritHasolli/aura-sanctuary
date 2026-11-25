import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * Updates for the Android app.
 *
 * The app is a native shell that loads the live website, so ordinary changes reach phones
 * on the next launch with no download at all. Only the shell itself (icon, permissions,
 * native plugins) needs a new APK. When the published APK is newer than the installed one,
 * this bar offers it. On builds that include ApkUpdaterPlugin (1.1.0+) the update downloads
 * in the app and opens Android's installer — one tap. Older builds open the download page.
 */

const RELEASE_API =
  "https://api.github.com/repos/EtritHasolli/aura-sanctuary/releases/tags/android-latest";
const APK_URL =
  "https://github.com/EtritHasolli/aura-sanctuary/releases/download/android-latest/Aura-Sanctuary.apk";
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface ApkUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<void>;
  addListener(
    event: "progress",
    cb: (data: { percent: number }) => void,
  ): Promise<PluginListenerHandle>;
}

const ApkUpdater = registerPlugin<ApkUpdaterPlugin>("ApkUpdater");

interface PublishedApk {
  build: number;
  version: string;
  url: string;
}

/**
 * Reads the build number from the android-latest release, which the Android workflow only
 * updates after the APK has been uploaded — so we never offer an APK that isn't there yet.
 * The workflow writes "(build N)" into the release notes; keep that format.
 */
async function fetchPublishedApk(): Promise<PublishedApk | null> {
  const res = await fetch(RELEASE_API, { cache: "no-store" });
  if (!res.ok) return null;
  const release = (await res.json()) as {
    name?: string;
    body?: string;
    assets?: { name: string; browser_download_url: string }[];
  };
  const build = Number(release.body?.match(/\(build (\d+)\)/)?.[1]);
  if (!Number.isFinite(build) || build <= 0) return null;
  const asset = release.assets?.find((a) => a.name.endsWith(".apk"));
  return {
    build,
    version: release.name?.replace(/^Android app\s*/i, "") ?? "",
    url: asset?.browser_download_url ?? APK_URL,
  };
}

type Phase = "idle" | "needs-permission" | "downloading" | "installing" | "error";

export function AndroidUpdateBar() {
  const [update, setUpdate] = useState<PublishedApk | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const lastCheckRef = useRef(0);
  const inAppUpdates = Capacitor.isPluginAvailable("ApkUpdater");

  const check = useCallback(async () => {
    if (Date.now() - lastCheckRef.current < CHECK_INTERVAL_MS) return;
    lastCheckRef.current = Date.now();
    try {
      const { App } = await import("@capacitor/app");
      const [info, published] = await Promise.all([App.getInfo(), fetchPublishedApk()]);
      if (published && Number(info.build) < published.build) setUpdate(published);
    } catch {
      // Offline or GitHub rate limit — try again on the next resume.
      lastCheckRef.current = 0;
    }
  }, []);

  // Check on launch and whenever the app comes back to the foreground.
  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    void check();
    let handle: PluginListenerHandle | undefined;
    void import("@capacitor/app").then(({ App }) =>
      App.addListener("resume", () => {
        void check();
        // Returning from Android's "install unknown apps" screen.
        setPhase((p) => (p === "needs-permission" ? "idle" : p));
      }).then((h) => (handle = h)),
    );
    return () => void handle?.remove();
  }, [check]);

  const install = async () => {
    if (!update) return;
    if (!inAppUpdates) {
      // Pre-1.1.0 builds: navigating off-site makes Capacitor open the system browser,
      // which downloads the APK.
      window.location.assign(update.url);
      return;
    }
    setError("");
    try {
      const { allowed } = await ApkUpdater.canInstall();
      if (!allowed) {
        setPhase("needs-permission");
        return;
      }
      setPercent(0);
      setPhase("downloading");
      const progress = await ApkUpdater.addListener("progress", ({ percent: p }) => setPercent(p));
      try {
        await ApkUpdater.downloadAndInstall({ url: update.url });
        setPhase("installing");
      } finally {
        void progress.remove();
      }
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  if (!update || dismissed) return null;

  const pixel = { fontFamily: "var(--font-pixel)" } as const;
  const button =
    "px-2 py-0.5 bg-primary-foreground text-primary hover:opacity-80 transition-opacity";

  return (
    <div
      className="w-full shrink-0 flex items-center justify-between gap-2 px-4 py-1.5 bg-primary text-primary-foreground text-[10px]"
      style={pixel}
    >
      <span className="min-w-0 truncate">
        {phase === "downloading"
          ? `Downloading update… ${percent}%`
          : phase === "installing"
            ? "Tap UPDATE on the Android screen to finish"
            : phase === "needs-permission"
              ? "Allow Aura to install updates, then come back"
              : phase === "error"
                ? `Update failed: ${error}`
                : `App update ${update.version} available`}
      </span>
      <div className="flex items-center gap-2 shrink-0">
        {phase === "needs-permission" ? (
          <button
            type="button"
            className={button}
            onClick={() => void ApkUpdater.openInstallPermissionSettings()}
          >
            Allow
          </button>
        ) : phase !== "downloading" && phase !== "installing" ? (
          <button type="button" className={button} onClick={() => void install()}>
            {phase === "error" ? "Retry" : "Update"}
          </button>
        ) : null}
        {phase !== "downloading" && (
          <button
            onClick={() => setDismissed(true)}
            className="px-1 hover:opacity-80"
            aria-label="Dismiss"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
