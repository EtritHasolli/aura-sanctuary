import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter, HeadContent, Scripts, useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useApplyReward } from "@/hooks/useProfile";
import { HUD } from "@/components/aura/HUD";
import { SideNav } from "@/components/aura/SideNav";
import { PomodoroProvider } from "@/components/aura/PomodoroContext";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-4xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>404</h1>
        <p className="mt-4 text-muted-foreground">Lost in the void.</p>
        <Link to="/" className="mt-6 inline-block px-4 py-2 bg-primary text-primary-foreground" style={{ fontFamily: "var(--font-pixel)", fontSize: 12 }}>
          Return Home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>A wild bug appeared!</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 px-4 py-2 bg-primary text-primary-foreground"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 12 }}
        >Retry</button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Aura — The Desktop Sanctuary" },
      { name: "description", content: "A productivity RPG where your habits power your sanctuary." },
      { property: "og:title", content: "Aura — The Desktop Sanctuary" },
      { name: "twitter:title", content: "Aura — The Desktop Sanctuary" },
      { property: "og:description", content: "A productivity RPG where your habits power your sanctuary." },
      { name: "twitter:description", content: "A productivity RPG where your habits power your sanctuary." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5b90adb9-4ddd-48ed-b6e8-4a3024c6758a/id-preview-81d33f96--e9335d2c-6c11-4c04-81b3-3c8eee4b82ff.lovable.app-1778095997293.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5b90adb9-4ddd-48ed-b6e8-4a3024c6758a/id-preview-81d33f96--e9335d2c-6c11-4c04-81b3-3c8eee4b82ff.lovable.app-1778095997293.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AppGate />
      <Toaster />
    </QueryClientProvider>
  );
}

function AppGate() {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user && path !== "/auth") router.navigate({ to: "/auth" });
    if (user && path === "/auth") router.navigate({ to: "/" });
  }, [user, loading, path, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-primary" style={{ fontFamily: "var(--font-pixel)" }}>LOADING...</div>
      </div>
    );
  }

  if (!user) return <Outlet />;

  return (
    <PomodoroProvider onFocusComplete={() => toast.success("+10 INT — focus complete!")}>
      <FocusReward />
      <div className="h-screen flex flex-col bg-background overflow-hidden">
        <HUD />
        <div className="flex-1 flex overflow-hidden">
          <SideNav />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </PomodoroProvider>
  );
}

// Awards INT + XP whenever a focus cycle completes
function FocusReward() {
  const reward = useApplyReward();
  // capture function via state-less effect: re-mount provider would call onFocusComplete prop;
  // simpler: subscribe via a tiny event
  useEffect(() => {
    const handler = () => reward.mutate({ xp: 10, gold: 3, stat: "intelligence" });
    window.addEventListener("aura:focus-complete", handler);
    return () => window.removeEventListener("aura:focus-complete", handler);
  }, [reward]);
  return null;
}
