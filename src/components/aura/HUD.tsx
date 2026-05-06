import { useProfile } from "@/hooks/useProfile";
import { usePomodoro } from "./PomodoroContext";
import { useNotifications } from "./NotificationsContext";
import { PetSprite } from "./PetSprite";
import { xpForLevel } from "@/lib/aura/types";
import { Coins, Swords, Brain, Heart, Bell, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";

function useTheme() {
  const [dark, setDark] = useState(() => !document.documentElement.classList.contains("light"));

  const toggle = () => {
    setDark((d) => {
      const nowDark = !d;
      document.documentElement.classList.toggle("light", !nowDark);
      localStorage.setItem("theme", nowDark ? "dark" : "light");
      return nowDark;
    });
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved ? saved === "dark" : !window.matchMedia("(prefers-color-scheme: light)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("light", !isDark);
  }, []);

  return { dark, toggle };
}

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center border-2 border-border hover:border-primary transition-colors"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}

function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] mb-0.5" style={{ fontFamily: "var(--font-pixel)" }}>
        <span className="text-muted-foreground">{label}</span>
        <span>{value}/{max}</span>
      </div>
      <div className="h-3 w-full bg-muted border-2 border-border relative overflow-hidden">
        <div className="h-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function NotificationsBell() {
  const { notifications, unread, markAllRead, clear } = useNotifications();
  const [open, setOpen] = useState(false);

  const toggle = () => {
    if (!open) markAllRead();
    setOpen((o) => !o);
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="relative w-8 h-8 flex items-center justify-center border-2 border-border hover:border-primary transition-colors"
        title="Notifications"
      >
        <Bell size={14} />
        {unread > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-destructive text-destructive-foreground flex items-center justify-center text-[9px]"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 pixel-panel p-2 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-primary" style={{ fontFamily: "var(--font-pixel)" }}>NOTIFICATIONS</span>
            {notifications.length > 0 && (
              <button
                onClick={clear}
                className="text-[8px] text-muted-foreground hover:text-destructive"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CLEAR
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-3">No notifications.</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-2 py-1.5 border-l-2 text-xs ${
                    n.type === "success" ? "border-primary text-primary" :
                    n.type === "warning" ? "border-[color:var(--color-gold)] text-[color:var(--color-gold)]" :
                    "border-accent text-foreground"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {n.message}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(n.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function HUD() {
  const { data: profile } = useProfile();
  const { petState } = usePomodoro();
  if (!profile) return null;
  const xpMax = xpForLevel(profile.level);

  return (
    <header className="border-b-2 border-border bg-card/80 backdrop-blur px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Avatar + Pet */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 pixel-panel flex items-center justify-center bg-secondary">
            <span style={{ fontFamily: "var(--font-pixel)" }} className="text-primary text-lg">
              {profile.display_name[0]?.toUpperCase()}
            </span>
          </div>
          <div className="w-14 h-14 flex items-center justify-center">
            <PetSprite state={petState} size={56} />
          </div>
        </div>

        {/* Identity + Bars */}
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm" style={{ fontFamily: "var(--font-pixel)" }}>{profile.display_name}</h2>
            <span className="text-xs px-1.5 py-0.5 bg-primary text-primary-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
              LV {profile.level}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <Bar value={profile.hp} max={profile.max_hp} color="var(--color-hp)" label="HP" />
            <Bar value={profile.xp} max={xpMax} color="var(--color-xp)" label="XP" />
          </div>
        </div>

        {/* Stats + Gold + Notifications */}
        <div className="flex items-center gap-3 text-lg" style={{ fontFamily: "var(--font-display)" }}>
          <NotificationsBell />
          <div className="flex items-center gap-1 text-[color:var(--color-gold)]">
            <Coins size={16} /> <span className="text-base">{profile.gold}</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex items-center gap-2" title="Strength"><Swords size={18} className="text-destructive" /> {profile.strength}</div>
          <div className="flex items-center gap-2" title="Intelligence"><Brain size={18} className="text-accent" /> {profile.intelligence}</div>
          <div className="flex items-center gap-2" title="Constitution"><Heart size={18} className="text-primary" /> {profile.constitution}</div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
