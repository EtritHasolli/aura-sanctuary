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
  return (
    <QueryClientProvider client={queryClient}>
      <NotificationsProvider>
        <div className="h-screen flex flex-col overflow-hidden">
          <TitleBar />
          <UpdateBar />
          <div className="flex-1 min-h-0 relative">
            <CustomCursorOverlay />
            <PersistentYouTubeAudio />
            <MiniPlayerManager />
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
  useEffect(() => {
    if (!api?.onWindowMinimize) return;

    const offMinimize = api.onWindowMinimize(() => {
      const hasAudio = !!window.localStorage.getItem("aura:youtube-embed-url");
      if (!hasAudio) return;
      void api.showMiniPlayer();
    });

    const offRestore = api.onWindowRestore(() => {
      void api.hideMiniPlayer();
    });

    const offClosed = api.onMiniPlayerClosed(() => {
      window.dispatchEvent(new CustomEvent("aura:clear-youtube-audio"));
    });

    return () => {
      offMinimize();
      offRestore();
      offClosed();
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
      el.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
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
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [slotRect, setSlotRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const onSet = (event: Event) => {
      const custom = event as CustomEvent<{ embedUrl?: string }>;
      const url = custom.detail?.embedUrl ?? null;
      setEmbedUrl(url);
      if (url) window.localStorage.setItem("aura:youtube-embed-url", url);
    };
    const onClear = () => {
      setEmbedUrl(null);
      window.localStorage.removeItem("aura:youtube-embed-url");
    };

    window.addEventListener("aura:set-youtube-audio", onSet as EventListener);
    window.addEventListener("aura:clear-youtube-audio", onClear);

    const saved = window.localStorage.getItem("aura:youtube-embed-url");
    if (saved) {
      // Migrate old youtube.com embeds to youtube-nocookie.com
      const migrated = saved.replace("https://www.youtube.com/embed/", "https://www.youtube-nocookie.com/embed/");
      if (migrated !== saved) window.localStorage.setItem("aura:youtube-embed-url", migrated);
      setEmbedUrl(migrated);
    }

    return () => {
      window.removeEventListener("aura:set-youtube-audio", onSet as EventListener);
      window.removeEventListener("aura:clear-youtube-audio", onClear);
    };
  }, []);

  useEffect(() => {
    if (path !== "/") {
      setSlotRect(null);
      return;
    }

    const setRectIfChanged = (newRect: DOMRect | null) => {
      setSlotRect((prev) => {
        if (!newRect && !prev) return prev;
        if (!newRect || !prev) return newRect;
        if (
          prev.left === newRect.left &&
          prev.top === newRect.top &&
          prev.width === newRect.width &&
          prev.height === newRect.height
        )
          return prev;
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
      if (slot) {
        mo.disconnect();
        ro.observe(slot);
        updateRect();
      }
    });

    const slot = document.getElementById("aura-youtube-slot");
    if (slot) {
      ro.observe(slot);
    } else {
      mo.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [path]);

  if (!embedUrl) return null;

  const className =
    path === "/" && slotRect
      ? "fixed z-50 border-2 border-border bg-black shadow-xl"
      : "fixed bottom-16 right-2 z-50 w-[min(420px,calc(100vw-1rem))] h-[min(236px,calc((100vw-1rem)*9/16))] md:bottom-4 md:right-4 border-2 border-border bg-black shadow-xl";

  const style =
    path === "/" && slotRect
      ? {
          left: `${slotRect.left}px`,
          top: `${slotRect.top}px`,
          width: `${slotRect.width}px`,
          height: `${slotRect.height}px`,
        }
      : undefined;

  return (
    <iframe
      title="Persistent YouTube audio"
      src={embedUrl}
      className={className}
      style={style}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      referrerPolicy="no-referrer-when-downgrade"
    />
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
          <div className="h-full flex flex-col bg-background overflow-hidden">
            <HUD />
            <div className="flex-1 flex overflow-hidden">
              <SideNav />
              <main className="flex-1 overflow-auto pb-14 md:pb-0">
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
