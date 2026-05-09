import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Swords,
  BookOpen,
  Trophy,
  Users,
  Beer,
  ShoppingBag,
  Shirt,
  Hammer,
  Settings,
  LogOut,
  Crown,
  Gamepad2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMessageUnreadCounts } from "@/hooks/useMessageUnreadCounts";
import { useNotifications } from "@/components/aura/NotificationsContext";

const items = [
  { to: "/", icon: Home, label: "Sanctuary" },
  { to: "/quests", icon: Swords, label: "Quests" },
  { to: "/archives", icon: BookOpen, label: "Archives" },
  { to: "/challenges", icon: Trophy, label: "Challenges" },
  { to: "/friends", icon: Users, label: "Friends" },
  { to: "/shop", icon: ShoppingBag, label: "Shop" },
  { to: "/equipment", icon: Shirt, label: "Gear" },
  { to: "/forge", icon: Hammer, label: "Forge" },
  { to: "/tavern", icon: Beer, label: "Tavern" },
  { to: "/subscription", icon: Crown, label: "Subscription" },
  { to: "/minigames", icon: Gamepad2, label: "Minigames" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function SideNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: unreadCounts } = useMessageUnreadCounts();
  const { notifications } = useNotifications();
  const unreadSectionNotifications = notifications.reduce(
    (acc, n) => {
      if (n.read) return acc;
      const msg = n.message.toLowerCase();
      if (msg.includes("/tavern?") || msg.includes("tavern") || msg.includes("party")) {
        acc.tavern += 1;
      } else if (msg.includes("/friends?") || msg.includes("friend")) {
        acc.friends += 1;
      }
      return acc;
    },
    { friends: 0, tavern: 0 },
  );
  return (
    <nav className="w-16 md:w-24 lg:w-56 bg-card border-r-2 border-border flex flex-col shrink-0 overflow-hidden h-full">
      {/* Brand — hidden when viewport is short to free vertical space */}
      <div className="px-3 pt-4 pb-2 hidden lg:block lg:[@media(max-height:720px)]:hidden shrink-0">
        <h1 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          AURA
        </h1>
        <p
          className="text-[10px] text-muted-foreground"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          Sanctuary
        </p>
      </div>

      {/* Scrollable nav items — prevents bottom items being cut off on short viewports */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 flex flex-col gap-1">
        {items.map((it) => {
          const active = path === it.to;
          const Icon = it.icon;
          const unread =
            it.to === "/friends"
              ? Math.max(unreadCounts?.friendsTotal ?? 0, unreadSectionNotifications.friends)
              : it.to === "/tavern"
                ? Math.max(unreadCounts?.tavernTotal ?? 0, unreadSectionNotifications.tavern)
                : 0;
          return (
            <Link
              key={it.to}
              to={it.to}
              title={it.label}
              className={`relative flex items-center justify-center lg:justify-start gap-3 px-2 md:px-4 py-2.5 mx-1.5 md:mx-2 transition-colors text-sm border-2 ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-transparent hover:border-border hover:bg-secondary"
              }`}
              style={{ fontFamily: "var(--font-pixel)", fontSize: "10px" }}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden lg:inline truncate">{it.label}</span>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[18px] h-[18px] px-1 bg-destructive text-destructive-foreground border-2 border-card flex items-center justify-center text-[9px]">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Logout — pinned to bottom, always visible */}
      <div className="shrink-0 border-t-2 border-border py-2">
        <button
          onClick={() => supabase.auth.signOut()}
          title="Logout"
          className="w-[calc(100%-0.75rem)] md:w-[calc(100%-1rem)] flex items-center justify-center lg:justify-start gap-3 px-2 md:px-4 py-2.5 mx-1.5 md:mx-2 hover:bg-destructive hover:text-destructive-foreground text-sm border-2 border-transparent hover:border-destructive"
          style={{ fontFamily: "var(--font-pixel)", fontSize: "10px" }}
        >
          <LogOut size={18} className="shrink-0" />
          <span className="hidden lg:inline truncate">Logout</span>
        </button>
      </div>
    </nav>
  );
}
