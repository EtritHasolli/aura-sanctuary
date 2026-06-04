import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useApplyReward } from "@/hooks/useProfile";
import { useTaskReminders } from "@/hooks/useTaskReminders";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { desktopNotifsEnabled } from "@/lib/notifications";
import { HUD } from "@/components/aura/HUD";
import { SideNav } from "@/components/aura/SideNav";
import { AiAssistant } from "@/components/aura/AiAssistant";
import { UpdateBar } from "@/components/aura/UpdateBar";
import { TitleBar } from "@/components/aura/TitleBar";
import { PomodoroProvider } from "@/components/aura/PomodoroContext";
import { NotificationsProvider, useNotifications } from "@/components/aura/NotificationsContext";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { publicAsset } from "@/lib/utils";
import { RoamingBug } from "@/components/aura/BugLoader";
import { HabiticaDayCronModal } from "@/components/aura/HabiticaDayCronModal";
import { NewDayModal } from "@/components/aura/NewDayModal";

const FOCUS_STAMINA_RESTORE = 15;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-4xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          404
        </h1>
        <p className="mt-4 text-muted-foreground">Lost in the void.</p>
        <Link
          to="/"
          className="mt-6 inline-block px-4 py-2 bg-primary text-primary-foreground"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 12 }}
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const supportSubject = "A wild bug has Appeared";
  const supportBody = [
    "A wild bug has Appeared!",
    "",
    `Error message: ${error.message}`,
    error.stack ? `Stack: ${error.stack}` : "Stack: unavailable",
    "",
    `Path: ${typeof window !== "undefined" ? window.location.href : "unknown"}`,
    `Time: ${new Date().toISOString()}`,
  ].join("\n");
  return (
    <div className="relative min-h-screen bg-background overflow-hidden flex items-center justify-center px-4">
      <RoamingBug />
      <div className="relative z-10 max-w-md text-center">
        <h1 className="text-xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          A wild bug appeared!
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 px-4 py-2 bg-primary text-primary-foreground"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 12 }}
        >
          Retry
        </button>
        <a
          href={`mailto:etrithasolli5@gmail.com?subject=${encodeURIComponent(
            supportSubject,
          )}&body=${encodeURIComponent(supportBody)}`}
          className="mt-3 block text-xs text-muted-foreground hover:text-primary"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Contact support
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAuth = path === "/auth";
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        <div className="h-screen flex flex-col overflow-hidden">
          <TitleBar />
          <UpdateBar />
          <div className="flex-1 min-h-0 relative">
            <CustomCursorOverlay />
            {!isAuth && <PersistentYouTubeAudio />}
            {!isAuth && <MiniPlayerManager />}
            <AppGate />
            <Toaster offset="72px" />
          </div>
        </div>
      </NotificationsProvider>
    </QueryClientProvider>
  );
}

function MiniPlayerManager() {
  const api = window.electronAPI;
  const isMusicPlayingRef = useRef(false);

  useEffect(() => {
    const onMusicPlaying = (e: Event) => {
      isMusicPlayingRef.current = (e as CustomEvent<{ playing: boolean }>).detail.playing;
    };
    window.addEventListener("aura:music-playing", onMusicPlaying as EventListener);
    return () => window.removeEventListener("aura:music-playing", onMusicPlaying as EventListener);
  }, []);

  useEffect(() => {
    if (!api?.onWindowMinimize) return;

    const offMinimize = api.onWindowMinimize(() => {
      if (!isMusicPlayingRef.current) return;
      void api.showMiniPlayer();
    });

    const offRestore = api.onWindowRestore(() => {
      void api.hideMiniPlayer();
    });

    const offClosed = api.onMiniPlayerClosed(() => {
      // nothing to clear for music — audio element keeps playing
    });

    const offStop = api.onMiniPlayerStop?.(() => {
      window.dispatchEvent(new Event("aura:mini-player-stop"));
    }) ?? (() => {});

    return () => {
      offMinimize();
      offRestore();
      offClosed();
      offStop();
    };
  }, [api]);

  return null;
}

function CustomCursorOverlay() {
  const cursorRef = useRef<HTMLImageElement | null>(null);
  const isPressedRef = useRef(false);
  const isInteractiveRef = useRef(false);

  useEffect(() => {
    const canUseCustomCursor = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canUseCustomCursor) return;

    const preloadImage = (src: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
      });

    let active = false;
    const interactiveSelector =
      'button, a, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], select, label[for]';

    const updateCursorImage = () => {
      const el = cursorRef.current;
      if (!el || !active) return;
      if (isPressedRef.current) {
        el.src = publicAsset("click.png");
        return;
      }
      el.src = isInteractiveRef.current ? publicAsset("pointer.png") : publicAsset("cursor.png");
    };

    const move = (event: PointerEvent) => {
      const el = cursorRef.current;
      if (!el) return;
      const target = event.target as Element | null;
      isInteractiveRef.current = !!target?.closest(interactiveSelector);
      updateCursorImage();
      el.style.opacity = "1";
      el.style.transform = `translate(${event.clientX - 6}px, ${event.clientY - 6}px)`;
    };

    const down = (event: PointerEvent) => {
      move(event);
      isPressedRef.current = true;
      updateCursorImage();
    };

    const up = () => {
      isPressedRef.current = false;
      updateCursorImage();
    };

    const hide = () => {
      const el = cursorRef.current;
      if (!el) return;
      el.style.opacity = "0";
    };

    const enable = () => {
      if (active) return;
      active = true;
      document.documentElement.classList.add("custom-cursor-active");
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerdown", down);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
      window.addEventListener("blur", hide);
      document.addEventListener("mouseleave", hide);
    };

    void Promise.all([
      preloadImage(publicAsset("cursor.png")),
      preloadImage(publicAsset("pointer.png")),
      preloadImage(publicAsset("click.png")),
    ]).then(enable);

    return () => {
      active = false;
      document.documentElement.classList.remove("custom-cursor-active");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", hide);
      document.removeEventListener("mouseleave", hide);
    };
  }, []);

  return (
    <img
      ref={cursorRef}
      src={publicAsset("cursor.png")}
      alt=""
      aria-hidden="true"
      className="fixed left-0 top-0 z-[1000000000] w-8 h-8 pointer-events-none select-none opacity-0"
      style={{ transform: "translate(-100px, -100px)" }}
    />
  );
}

function PersistentYouTubeAudio() {
  // baseUrl — the clean canonical URL, never mutated with runtime params
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [slotRect, setSlotRect] = useState<DOMRect | null>(null);
  const [minimized, setMinimized] = useState(false);

  // Drag state — offset from bottom-right of #aura-main-content
  const [pos, setPos] = useState<{ right: number; bottom: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null);
  const badgeDragState = useRef<{ startX: number; startY: number; startRight: number; startBottom: number } | null>(null);
  const badgeDidDrag = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const savedTimestamp = useRef<number>(0);

  // activeStartParam — only non-zero after restoring from badge; reset to 0 after one use
  const [startParam, setStartParam] = useState<number>(0);

  useEffect(() => {
    const onSet = (event: Event) => {
      const custom = event as CustomEvent<{ embedUrl?: string }>;
      const url = custom.detail?.embedUrl ?? null;
      if (url) {
        setBaseUrl(url);
        setMinimized(false);
        setStartParam(0);
        window.localStorage.setItem("aura:youtube-embed-url", url);
      }
    };
    const onClear = () => {
      setBaseUrl(null);
      setStartParam(0);
      savedTimestamp.current = 0;
      window.localStorage.removeItem("aura:youtube-embed-url");
    };

    window.addEventListener("aura:set-youtube-audio", onSet as EventListener);
    window.addEventListener("aura:clear-youtube-audio", onClear);

    if (window.electronAPI) {
      window.localStorage.removeItem("aura:youtube-embed-url");
    } else {
      const saved = window.localStorage.getItem("aura:youtube-embed-url");
      if (saved) {
        const migrated = saved.replace("https://www.youtube.com/embed/", "https://www.youtube-nocookie.com/embed/");
        if (migrated !== saved) window.localStorage.setItem("aura:youtube-embed-url", migrated);
        setBaseUrl(migrated);
      }
    }

    return () => {
      window.removeEventListener("aura:set-youtube-audio", onSet as EventListener);
      window.removeEventListener("aura:clear-youtube-audio", onClear);
    };
  }, []);

  // Slot tracking for sanctuary page
  useEffect(() => {
    if (path !== "/") { setSlotRect(null); return; }

    const setRectIfChanged = (newRect: DOMRect | null) => {
      setSlotRect((prev) => {
        if (!newRect && !prev) return prev;
        if (!newRect || !prev) return newRect;
        if (prev.left === newRect.left && prev.top === newRect.top && prev.width === newRect.width && prev.height === newRect.height) return prev;
        return newRect;
      });
    };

    const updateRect = () => {
      const slot = document.getElementById("aura-youtube-slot");
      setRectIfChanged(slot ? slot.getBoundingClientRect() : null);
    };
    updateRect();

    const ro = new ResizeObserver(updateRect);
    const mo = new MutationObserver(() => {
      const slot = document.getElementById("aura-youtube-slot");
      if (slot) { mo.disconnect(); ro.observe(slot); updateRect(); }
    });
    const slot = document.getElementById("aura-youtube-slot");
    if (slot) { ro.observe(slot); } else { mo.observe(document.body, { childList: true, subtree: true }); }

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      ro.disconnect(); mo.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [path]);

  // Drag handlers — only the handle bar triggers drag
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const main = document.getElementById("aura-main-content");
    const wrapper = wrapperRef.current;
    if (!main || !wrapper) return;

    const mainRect = main.getBoundingClientRect();
    const wRect = wrapper.getBoundingClientRect();
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: mainRect.right - wRect.right,
      startBottom: mainRect.bottom - wRect.bottom,
    };
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const main = document.getElementById("aura-main-content");
    const wrapper = wrapperRef.current;
    if (!main || !wrapper) return;

    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const mainRect = main.getBoundingClientRect();
    const W = wrapper.offsetWidth;
    const H = wrapper.offsetHeight;
    setPos({
      right: Math.max(0, Math.min(mainRect.width - W, dragState.current.startRight - dx)),
      bottom: Math.max(0, Math.min(mainRect.height - H, dragState.current.startBottom - dy)),
    });
  };

  const onHandlePointerUp = () => { dragState.current = null; };

  // Badge drag handlers (separate from popup drag)
  const onBadgePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    badgeDidDrag.current = false;
    const main = document.getElementById("aura-main-content");
    const badge = badgeRef.current;
    if (!main || !badge) return;
    const mainRect = main.getBoundingClientRect();
    const bRect = badge.getBoundingClientRect();
    badgeDragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: mainRect.right - bRect.right,
      startBottom: mainRect.bottom - bRect.bottom,
    };
  };

  const onBadgePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!badgeDragState.current) return;
    const main = document.getElementById("aura-main-content");
    const badge = badgeRef.current;
    if (!main || !badge) return;
    const dx = e.clientX - badgeDragState.current.startX;
    const dy = e.clientY - badgeDragState.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) badgeDidDrag.current = true;
    const mainRect = main.getBoundingClientRect();
    const W = badge.offsetWidth;
    const H = badge.offsetHeight;
    setPos({
      right: Math.max(0, Math.min(mainRect.width - W, badgeDragState.current.startRight - dx)),
      bottom: Math.max(0, Math.min(mainRect.height - H, badgeDragState.current.startBottom - dy)),
    });
  };

  const onBadgePointerUp = () => { badgeDragState.current = null; };

  // Continuously sample the current time so we always have a fresh value
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (data?.event === "infoDelivery" && typeof data?.info?.currentTime === "number") {
          savedTimestamp.current = Math.floor(data.info.currentTime);
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Poll the iframe for current time every 2s so savedTimestamp stays fresh
  useEffect(() => {
    if (minimized || !iframeRef.current) return;
    const poll = () => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening" }), "*",
      );
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "getCurrentTime", args: [] }), "*",
      );
    };
    const id = window.setInterval(poll, 2000);
    return () => window.clearInterval(id);
  }, [minimized]);

  const handleMinimize = () => setMinimized(true);

  const handleClose = () => {
    window.dispatchEvent(new Event("aura:clear-youtube-audio"));
  };

  if (!baseUrl) return null;

  // Build the active iframe src from the clean baseUrl + runtime params
  // Never store derived URLs back into state to avoid URL corruption.
  const buildSrc = (extra: Record<string, string> = {}): string => {
    const u = new URL(baseUrl);
    // Always add enablejsapi so postMessage works
    u.searchParams.set("enablejsapi", "1");
    for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
    return u.toString();
  };

  // ── Sanctuary page: render inside the slot ───────────────────────────────
  if (path === "/" && slotRect) {
    const slotStyle: React.CSSProperties = {
      position: "fixed",
      left: `${slotRect.left}px`,
      top: `${slotRect.top}px`,
      width: `${slotRect.width}px`,
      height: `${slotRect.height}px`,
      zIndex: 50,
    };
    const slotSrc = buildSrc(startParam ? { start: String(startParam) } : {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const WebView = "webview" as any;
    if (window.electronAPI) return <WebView title="Persistent YouTube audio" src={slotSrc} style={slotStyle} className="border-2 border-border bg-black shadow-xl" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" allowpopups="false" />;
    return <iframe ref={iframeRef} title="Persistent YouTube audio" src={slotSrc} style={slotStyle} className="border-2 border-border bg-black shadow-xl" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="no-referrer-when-downgrade" />;
  }

  // Shared position anchor
  const defaultRight = 16;
  const defaultBottom = window.electronAPI ? 16 : 64;
  const { right: posRight, bottom: posBottom } = pos ?? { right: defaultRight, bottom: defaultBottom };
  const main = document.getElementById("aura-main-content");
  const mainRect = main?.getBoundingClientRect();

  const anchorStyle: React.CSSProperties = mainRect
    ? {
        position: "fixed",
        right: `${window.innerWidth - mainRect.right + posRight}px`,
        bottom: `${window.innerHeight - mainRect.bottom + posBottom}px`,
        zIndex: 50,
      }
    : { position: "fixed", right: `${defaultRight}px`, bottom: `${defaultBottom}px`, zIndex: 50 };

  // ── Minimized badge — matches Electron mini player style ─────────────────
  if (minimized) {
    return (
      <button
        ref={badgeRef}
        type="button"
        onClick={() => {
          if (badgeDidDrag.current) return;
          setStartParam(savedTimestamp.current);
          setMinimized(false);
        }}
        onPointerDown={onBadgePointerDown}
        onPointerMove={onBadgePointerMove}
        onPointerUp={onBadgePointerUp}
        onPointerCancel={onBadgePointerUp}
        style={{ ...anchorStyle, touchAction: "none" }}
        className="w-14 h-14 rounded-[14px] bg-[#1a1714] border-2 border-[#40362e] shadow-[0_4px_20px_rgba(0,0,0,0.85)] flex items-center justify-center relative select-none hover:border-primary transition-colors cursor-grab active:cursor-grabbing"
        aria-label="Restore YouTube player"
      >
        <img
          src={publicAsset("aura-logo.png")}
          alt=""
          className="w-8 h-8"
          style={{ imageRendering: "pixelated" }}
        />
        {/* Pulsing gold ring */}
        <span
          className="absolute -inset-1 rounded-[18px] border-2 border-primary pointer-events-none"
          style={{ animation: "pulse-ring 2s ease-in-out infinite" }}
        />
      </button>
    );
  }

  // ── Floating draggable popup ──────────────────────────────────────────────
  const VW = 420;
  const VH = Math.round(VW * 9 / 16);
  const floatStyle: React.CSSProperties = {
    ...anchorStyle,
    width: `${mainRect ? Math.min(VW, mainRect.width - 8) : VW}px`,
    height: `${mainRect ? Math.min(VH, mainRect.height - 44) + 36 : VH + 36}px`,
    touchAction: "none",
  };

  const popupSrc = buildSrc(startParam ? { start: String(startParam) } : {});

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebView = "webview" as any;
  const mediaEl = window.electronAPI
    ? <WebView title="Persistent YouTube audio" src={popupSrc} className="w-full h-full" useragent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" allowpopups="false" />
    : <iframe ref={iframeRef} title="Persistent YouTube audio" src={popupSrc} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerPolicy="no-referrer-when-downgrade" />;

  return (
    <div
      ref={wrapperRef}
      style={floatStyle}
      className="pixel-panel shadow-xl select-none flex flex-col bg-card"
    >
      {/* Handle bar — same style as AI chatbot */}
      <div
        className="px-3 py-2 border-b-2 border-border flex items-center justify-between shrink-0 cursor-move"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
      >
        <span className="text-xs text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          YOUTUBE (DRAG)
        </span>
        <div className="flex items-center gap-2">
          {/* — minimise to badge (audio keeps playing, timestamp saved) */}
          <button
            type="button"
            onClick={handleMinimize}
            title="Minimise"
            className="text-muted-foreground hover:text-primary transition-colors leading-none"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
          >
            —
          </button>
          {/* ✕ close — fully removes the popup */}
          <button
            type="button"
            onClick={handleClose}
            title="Close"
            className="text-muted-foreground hover:text-destructive transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Media — full pointer events for play/pause/seek */}
      <div className="flex-1 min-h-0">
        {mediaEl}
      </div>
    </div>
  );
}

/** Calls record_daily_login at most once per calendar day per user (per device). */
function useDailyLoginCheckIn(userId: string | null, push: (msg: string, type: "success") => void) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const storageKey = `aura:daily-login:${userId}`;
    const today = new Date().toISOString().slice(0, 10);
    if (typeof window !== "undefined" && window.localStorage.getItem(storageKey) === today) return;

    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.rpc("record_daily_login");
        if (cancelled) return;
        if (typeof window !== "undefined") window.localStorage.setItem(storageKey, today);
        const row = data as
          | {
              streak?: number;
              moonshards_awarded?: number;
            }
          | null;
        const award = row?.moonshards_awarded ?? 0;
        const streak = row?.streak ?? 0;
        if (award > 0) {
          toast.success(`+${award} Moonshard${award > 1 ? "s" : ""} — ${streak}-day login streak!`);
          push(`Login streak milestone! ${streak} days · +${award} Moonshards`, "success");
        }
        // Refetch profile so HUD shows updated moonshards/streak.
        qc.invalidateQueries({ queryKey: ["profile"] });
      } catch {
        // Silently ignore; the next session will retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, push, qc]);
}

/** Calls claim_monthly_moonshards at most once per day per user (server still
 *  enforces the 28-day cooldown — the client cap is just to avoid spamming). */
function useMonthlyStipendCheckIn(userId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const storageKey = `aura:monthly-stipend-check:${userId}`;
    const today = new Date().toISOString().slice(0, 10);
    if (typeof window !== "undefined" && window.localStorage.getItem(storageKey) === today) return;

    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.rpc("claim_monthly_moonshards");
        if (cancelled) return;
        if (typeof window !== "undefined") window.localStorage.setItem(storageKey, today);
        const row = data as { moonshards_awarded?: number; tier_slug?: string } | null;
        const award = row?.moonshards_awarded ?? 0;
        if (award > 0) {
          toast.success(`+${award} Moonshards — ${row?.tier_slug ?? "premium"} monthly stipend!`);
        }
        qc.invalidateQueries({ queryKey: ["profile"] });
        qc.invalidateQueries({ queryKey: ["subscription_limits"] });
      } catch {
        // Fail silently; next session retries.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, qc]);
}

/** Listens to the moonshard award event dispatched by useApplyReward. */
function useMoonshardAwardToasts(push: (msg: string, type: "success") => void) {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ amount?: number; reasons?: string[] }>).detail;
      const amount = detail?.amount ?? 0;
      if (amount <= 0) return;
      const reasons = detail?.reasons ?? [];
      const tag = reasons.includes("level_milestone")
        ? "Level milestone"
        : reasons.includes("achievement")
          ? "Achievement"
          : reasons.includes("quest_arc")
            ? "Quest arc complete"
            : reasons.includes("boss_kill")
              ? "Boss kill"
              : "Reward";
      toast.success(`+${amount} Moonshard${amount > 1 ? "s" : ""} — ${tag}!`);
      push(`+${amount} Moonshards — ${tag}`, "success");
    };
    window.addEventListener("aura:moonshards-awarded", handler as EventListener);
    return () => window.removeEventListener("aura:moonshards-awarded", handler as EventListener);
  }, [push]);
}

// Silently re-subscribes web users who had notifications enabled (via localStorage)
// but lost their push subscription (e.g. cleared browser data or registered before
// push subscriptions were added). Electron uses native notifications instead.
function PushAutoSubscribe() {
  const { subscribe, status } = usePushNotifications();
  useEffect(() => {
    if (window.electronAPI) return;
    if (!desktopNotifsEnabled()) return;
    if (status === "prompt") void subscribe();
  }, [status, subscribe]);
  return null;
}

function AppGate() {
  const { user, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { push } = useNotifications();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user && path !== "/auth") router.navigate({ to: "/auth" });
    if (user && path === "/auth") router.navigate({ to: "/" });
  }, [user, loading, path, router]);

  useEffect(() => {
    if (loading || !user || profileLoading) return;
    if (!profile) return;
    if (!profile.aura_path && path !== "/settings") {
      router.navigate({ to: "/settings" });
    }
  }, [loading, user, profileLoading, profile, path, router]);

  useEffect(() => {
    const shieldDefaultPaths = new Set(["/friends", "/forge", "/equipment"]);
    document.body.dataset.cursorDefault = shieldDefaultPaths.has(path) ? "shield" : "sword";
    return () => {
      delete document.body.dataset.cursorDefault;
    };
  }, [path]);

  // Handle notification click → navigate (fired by Electron main process or SW notificationclick)
  useEffect(() => {
    const handler = (event: Event) => {
      const url = (event as CustomEvent<{ url: string }>).detail?.url;
      if (url) void router.navigate({ to: url as "/" });
    };
    window.addEventListener("aura:navigate", handler);
    return () => window.removeEventListener("aura:navigate", handler);
  }, [router]);

  useDailyLoginCheckIn(user?.id ?? null, push);
  useMoonshardAwardToasts(push);
  useMonthlyStipendCheckIn(user?.id ?? null);
  useTaskReminders();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          LOADING...
        </div>
      </div>
    );
  }

  // PomodoroProvider wraps everything so usePomodoro() is always available,
  // even during the brief render before the redirect to /auth fires.
  return (
    <PomodoroProvider
      onFocusComplete={() => {
        const focusStatLabel =
          profile?.aura_path === "swordsman"
            ? "STR"
            : profile?.aura_path === "tank"
              ? "CON"
              : profile?.aura_path === "rogue"
                ? "DEX"
                : "INT";
        toast.success(`+10 ${focusStatLabel} — focus complete!`);
        push(
          `Focus session complete! +10 ${focusStatLabel} +3 gold +${FOCUS_STAMINA_RESTORE} stamina`,
          "success",
        );
      }}
    >
      {!user ? (
        path === "/auth" ? (
          <Outlet />
        ) : null
      ) : (
        <>
          <FocusReward />
          <StaminaRecoveryLoop />
          <HabiticaDayCronModal />
          <NewDayModal />
          <PushAutoSubscribe />
          <div className="h-full flex flex-col bg-background overflow-hidden">
            <HUD />
            <div className="flex-1 flex overflow-hidden">
              <SideNav />
              <main id="aura-main-content" className="flex-1 overflow-auto pb-14 md:pb-0">
                <Outlet />
              </main>
            </div>
            <AiAssistant />
          </div>
        </>
      )}
    </PomodoroProvider>
  );
}

// Awards INT + XP whenever a focus cycle completes
function FocusReward() {
  const reward = useApplyReward();
  const { data: profile } = useProfile();
  // capture function via state-less effect: re-mount provider would call onFocusComplete prop;
  // simpler: subscribe via a tiny event
  useEffect(() => {
    const statByPath =
      profile?.aura_path === "swordsman"
        ? "strength"
        : profile?.aura_path === "tank"
          ? "constitution"
          : profile?.aura_path === "rogue"
            ? "dexterity"
            : "intelligence";
    const handler = () =>
      reward.mutate({ xp: 10, gold: 3, stamina: FOCUS_STAMINA_RESTORE, stat: statByPath });
    window.addEventListener("aura:focus-complete", handler);
    return () => window.removeEventListener("aura:focus-complete", handler);
  }, [reward, profile?.aura_path]);
  return null;
}

function StaminaRecoveryLoop() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const tick = async () => {
      const { data, error } = await supabase.rpc("apply_stamina_regen");
      if (error) return;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return;
      if (row.reset_applied || row.regen_applied > 0) {
        qc.invalidateQueries({ queryKey: ["profile", user.id] });
      }
    };

    void tick();
    const timer = window.setInterval(
      () => {
        void tick();
      },
      60 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, [user, qc]);

  return null;
}
