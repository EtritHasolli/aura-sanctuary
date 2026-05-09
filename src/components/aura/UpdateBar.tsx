import { useEffect, useState } from "react";

type Phase = "idle" | "downloading" | "ready";

export function UpdateBar() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const offAvailable = api.onUpdateAvailable(() => {
      setPhase("downloading");
      setPercent(0);
    });
    const offProgress = api.onDownloadProgress((p) => {
      setPercent(Math.round(p));
    });
    const offDownloaded = api.onUpdateDownloaded(() => {
      setPhase("ready");
      setPercent(100);
    });

    return () => {
      offAvailable();
      offProgress();
      offDownloaded();
    };
  }, []);

  if (phase === "idle") return null;

  if (phase === "ready") {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-[10000] flex items-center justify-between px-4 py-1.5 bg-primary text-primary-foreground text-[10px]"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <span>Update ready — restart to install</span>
        <button
          onClick={() => window.electronAPI?.installUpdate()}
          className="px-2 py-0.5 bg-primary-foreground text-primary hover:opacity-80 transition-opacity"
        >
          Restart now
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[10000] h-[3px] bg-muted">
      <div
        className="h-full bg-primary transition-all duration-500 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
