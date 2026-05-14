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
  MoreHorizontal,
  Flame,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMessageUnreadCounts } from "@/hooks/useMessageUnreadCounts";
import { useNotifications } from "@/components/aura/NotificationsContext";
import { useState } from "react";

const items = [
  { to: "/", icon: Home, label: "Sanctuary", short: "Home" },
  { to: "/quests", icon: Swords, label: "Quests", short: "Quests" },
  { to: "/archives", icon: BookOpen, label: "Archives", short: "Archives" },
  { to: "/challenges", icon: Trophy, label: "Challenges", short: "Challenges" },
  { to: "/friends", icon: Users, label: "Friends", short: "Friends" },
  { to: "/shop", icon: ShoppingBag, label: "Shop", short: "Shop" },
  { to: "/equipment", icon: Shirt, label: "Gear", short: "Gear" },
  { to: "/forge", icon: Hammer, label: "Forge", short: "Forge" },
  { to: "/tavern", icon: Beer, label: "Tavern", short: "Tavern" },
  { to: "/battle", icon: Flame, label: "Battle", short: "Battle" },
  { to: "/subscription", icon: Crown, label: "Subscription", short: "Sub" },
  { to: "/minigames", icon: Gamepad2, label: "Minigames", short: "Games" },
  { to: "/settings", icon: Settings, label: "Settings", short: "Settings" },
] as const;

/** Items shown directly in the bottom tab bar; the rest live in the "More" drawer. */
const BOTTOM_PRIMARY = ["/", "/quests", "/tavern", "/friends"] as const;

function useUnreadCounts() {
  const { data: unreadCounts } = useMessageUnreadCounts();
  const { notifications } = useNotifications();
  const sectionNotifs = notifications.reduce(
    (acc, n) => {
      if (n.read) return acc;
      const msg = n.message.toLowerCase();
      if (msg.includes("/tavern?") || msg.includes("tavern") || msg.includes("party")) acc.tavern += 1;
      else if (msg.includes("/friends?") || msg.includes("friend")) acc.friends += 1;
      return acc;
    },
    { friends: 0, tavern: 0 },
  );
  return (to: string) =>
    to === "/friends"
      ? Math.max(unreadCounts?.friendsTotal ?? 0, sectionNotifs.friends)
      : to === "/tavern"
        ? Math.max(unreadCounts?.tavernTotal ?? 0, sectionNotifs.tavern)
        : 0;
}

export function SideNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const getUnread = useUnreadCounts();
  const [moreOpen, setMoreOpen] = useState(false);

  const primaryItems = items.filter((it) => (BOTTOM_PRIMARY as readonly string[]).includes(it.to));
  const secondaryItems = items.filter((it) => !(BOTTOM_PRIMARY as readonly string[]).includes(it.to));

  return (
    <>
      {/* ── Desktop sidebar (md and up — unchanged) ── */}
      <nav className="hidden md:flex w-16 md:w-24 lg:w-56 bg-card border-r-2 border-border flex-col shrink-0 overflow-hidden h-full">
        {/* Brand */}
        <div className="px-3 pt-4 pb-2 hidden lg:block lg:[@media(max-height:720px)]:hidden shrink-0">
          <h1 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            AURA
          </h1>
          <p className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
            Sanctuary
          </p>
        </div>

        {/* Scrollable nav items */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden py-2 flex flex-col gap-1">
          {items.map((it) => {
            const active = path === it.to;
            const Icon = it.icon;
            const unread = getUnread(it.to);
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
                  <span className="absolute -right-1 -top-1 min-w-4.5 h-4.5 px-1 bg-destructive text-destructive-foreground border-2 border-card flex items-center justify-center text-[9px]">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Logout */}
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

      {/* ── Mobile bottom tab bar (below md) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-200 bg-card border-t-2 border-border flex items-stretch h-14 shrink-0">
        {primaryItems.map((it) => {
          const active = path === it.to;
          const Icon = it.icon;
          const unread = getUnread(it.to);
          return (
            <Link
              key={it.to}
              to={it.to}
              title={it.label}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
              style={{ fontFamily: "var(--font-pixel)", fontSize: "7px" }}
            >
              <Icon size={20} />
              <span>{it.short}</span>
              {unread > 0 && (
                <span className="absolute right-2 top-1 min-w-3.5 h-3.5 px-0.5 bg-destructive text-destructive-foreground flex items-center justify-center text-[8px]">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          );
        })}

        {/* More button */}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
            moreOpen ? "text-primary" : "text-muted-foreground"
          }`}
          style={{ fontFamily: "var(--font-pixel)", fontSize: "7px" }}
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

      {/* ── Mobile "More" drawer ── */}
      {moreOpen && (
        <>
          {/* backdrop */}
          <div
            className="md:hidden fixed inset-0 z-190 bg-background/60 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          {/* sheet */}
          <div className="md:hidden fixed bottom-14 left-0 right-0 z-195 bg-card border-t-2 border-border max-h-[60vh] overflow-y-auto">
            <div className="grid grid-cols-3 gap-px p-3">
              {secondaryItems.map((it) => {
                const active = path === it.to;
                const Icon = it.icon;
                const unread = getUnread(it.to);
                return (
                  <Link
                    key={it.to}
                    to={it.to}
                    title={it.label}
                    onClick={() => setMoreOpen(false)}
                    className={`relative flex flex-col items-center justify-center gap-1 py-3 px-1 border-2 transition-colors overflow-hidden ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border bg-secondary/40 text-foreground"
                    }`}
                    style={{ fontFamily: "var(--font-pixel)", fontSize: "7px" }}
                  >
                    <Icon size={18} />
                    <span className="text-center leading-tight">{it.short}</span>
                    {unread > 0 && (
                      <span className="absolute right-1 top-1 min-w-3.5 h-3.5 px-0.5 bg-destructive text-destructive-foreground flex items-center justify-center text-[8px]">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
                );
              })}
              {/* Logout tile */}
              <button
                onClick={() => { setMoreOpen(false); void supabase.auth.signOut(); }}
                className="flex flex-col items-center justify-center gap-1 py-3 border-2 border-border bg-secondary/40 text-destructive hover:bg-destructive/10 transition-colors"
                style={{ fontFamily: "var(--font-pixel)", fontSize: "8px" }}
              >
                <LogOut size={20} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
