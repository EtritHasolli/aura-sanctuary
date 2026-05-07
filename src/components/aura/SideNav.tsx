import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Swords,
  BookOpen,
  Trophy,
  Beer,
  ShoppingBag,
  Shirt,
  Hammer,
  Settings,
  LogOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/", icon: Home, label: "Sanctuary" },
  { to: "/quests", icon: Swords, label: "Quests" },
  { to: "/archives", icon: BookOpen, label: "Archives" },
  { to: "/challenges", icon: Trophy, label: "Challenges" },
  { to: "/shop", icon: ShoppingBag, label: "Shop" },
  { to: "/equipment", icon: Shirt, label: "Gear" },
  { to: "/forge", icon: Hammer, label: "Forge" },
  { to: "/tavern", icon: Beer, label: "Tavern" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function SideNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="w-20 lg:w-44 bg-card border-r-2 border-border flex flex-col py-4 gap-1 shrink-0">
      <div className="px-3 mb-4 hidden lg:block">
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
      {items.map((it) => {
        const active = path === it.to;
        const Icon = it.icon;
        return (
          <Link
            key={it.to}
            to={it.to}
            className={`flex items-center gap-3 px-4 py-3 mx-2 transition-colors text-sm border-2 ${
              active
                ? "bg-primary text-primary-foreground border-primary"
                : "border-transparent hover:border-border hover:bg-secondary"
            }`}
            style={{ fontFamily: "var(--font-pixel)", fontSize: "10px" }}
          >
            <Icon size={18} className="shrink-0" />
            <span className="hidden lg:inline">{it.label}</span>
          </Link>
        );
      })}
      <div className="flex-1" />
      <button
        onClick={() => supabase.auth.signOut()}
        className="flex items-center gap-3 px-4 py-3 mx-2 hover:bg-destructive hover:text-destructive-foreground text-sm border-2 border-transparent hover:border-destructive"
        style={{ fontFamily: "var(--font-pixel)", fontSize: "10px" }}
      >
        <LogOut size={18} className="shrink-0" />
        <span className="hidden lg:inline">Logout</span>
      </button>
    </nav>
  );
}
