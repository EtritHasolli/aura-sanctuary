import { useEffect, useState } from "react";
import { Minus, Maximize2, Minimize2, X } from "lucide-react";
import { APP_LOGO_URL } from "@/lib/branding";

export function TitleBar() {
  const controls = window.electronAPI?.windowControls;
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!controls) return;
    void controls.isMaximized().then(setIsMaximized);
    return controls.onMaximizeChange(setIsMaximized);
  }, [controls]);

  if (!controls) return null;

  return (
    <div
      className="h-8 flex items-center shrink-0 bg-background border-b border-border/40 select-none"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Logo + name */}
      <div
        className="flex items-center gap-1.5 px-3 h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <img
          src={APP_LOGO_URL}
          alt=""
          className="h-4 w-4 object-contain"
          style={{ imageRendering: "pixelated" }}
        />
        <span
          className="text-[10px] text-primary/80 tracking-widest"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          AURA
        </span>
      </div>

      {/* Draggable centre — double-click to toggle maximise */}
      <div
        className="flex-1 h-full"
        onDoubleClick={() => void controls.toggleMaximize()}
      />

      {/* Window control buttons */}
      <div
        className="flex items-center h-full"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          onClick={() => void controls.minimize()}
          className="h-full w-11 flex items-center justify-center text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          aria-label="Minimise"
        >
          <Minus size={11} />
        </button>
        <button
          onClick={() => void controls.toggleMaximize()}
          className="h-full w-11 flex items-center justify-center text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
          aria-label={isMaximized ? "Restore" : "Maximise"}
        >
          {isMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
        </button>
        <button
          onClick={() => void controls.close()}
          className="h-full w-11 flex items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}
