import { useProfile } from "@/hooks/useProfile";
import { useAchievements } from "@/hooks/useAchievements";
import { useNavigate } from "@tanstack/react-router";
import {
  effectiveConstitution,
  effectiveDexterity,
  effectiveIntelligence,
  effectiveMaxStamina,
  effectiveStrength,
} from "@/lib/aura/equipmentBonuses";
import { pathCharacterSpriteSrc } from "@/lib/aura/pathCharacterSprites";
import { useNotifications } from "./NotificationsContext";
import { xpForLevel } from "@/lib/aura/types";
import {
  Coins,
  Swords,
  Brain,
  Heart,
  Bell,
  Sun,
  Moon,
  Sparkles,
  Trophy,
  X,
  Footprints,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRef, useState, useEffect, useMemo } from "react";

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
    const isDark = saved
      ? saved === "dark"
      : !window.matchMedia("(prefers-color-scheme: light)").matches;
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
      className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function Bar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full">
      <div
        className="flex justify-between text-[10px] mb-0.5"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <span className="text-muted-foreground">{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-3 w-full bg-muted border-2 border-border relative overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function NotificationsBell() {
  const { notifications, unread, deleteOne, clear } = useNotifications();
  const [open, setOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const toggle = () => setOpen((o) => !o);

  const targetForMessage = (
    message: string,
  ): { to: string; search?: Record<string, string> } | null => {
    const lower = message.toLowerCase();
    const tavernMatch = message.match(/\/tavern\?([^\s]+)/i);
    if (tavernMatch) {
      const params = new URLSearchParams(tavernMatch[1]);
      const party = params.get("party") ?? undefined;
      const invite = params.get("invite") ?? undefined;
      const msg = params.get("message") ?? undefined;
      return {
        to: "/tavern",
        search: {
          ...(party ? { party } : {}),
          ...(invite ? { invite } : {}),
          ...(msg ? { message: msg } : {}),
        },
      };
    }
    const friendMatch = message.match(/\/friends\?([^\s]+)/i);
    if (friendMatch) {
      const params = new URLSearchParams(friendMatch[1]);
      const invite = params.get("invite") ?? undefined;
      const friend = params.get("friend") ?? undefined;
      const msg = params.get("message") ?? undefined;
      return {
        to: "/friends",
        search: {
          ...(invite ? { invite } : {}),
          ...(friend ? { friend } : {}),
          ...(msg ? { message: msg } : {}),
        },
      };
    }
    const inviteMatch = message.match(/\/tavern\?invite=([0-9a-f-]{36})/i);
    if (inviteMatch) {
      return { to: "/tavern", search: { invite: inviteMatch[1] } };
    }
    if (lower.includes("friend request") || lower.includes("accepted your friend request")) {
      return { to: "/friends" };
    }
    if (lower.includes("party")) {
      return { to: "/tavern" };
    }
    return null;
  };

  const displayMessage = (message: string) =>
    message.replace(/\s*\/(?:tavern|friends)\?[^\s]+/gi, "").trim();

  const onNotificationClick = (message: string) => {
    const target = targetForMessage(message);
    if (!target) return;
    setOpen(false);
    setAllOpen(false);
    void navigate({ to: target.to, search: target.search });
  };

  const notificationClass = (type: (typeof notifications)[number]["type"], clickable: boolean) =>
    `px-2 py-1.5 border-l-2 text-xs transition-colors ${
      type === "success"
        ? "border-primary text-primary"
        : type === "warning"
          ? "border-[color:var(--color-gold)] text-[color:var(--color-gold)]"
          : "border-accent text-foreground"
    } ${clickable ? "cursor-pointer hover:bg-secondary/50" : ""}`;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={toggle}
        className="relative w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
        title="Notifications"
      >
        <Bell size={18} />
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
        <div className="absolute right-0 top-10 z-[120] w-72 pixel-panel p-2 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              NOTIFICATIONS
            </span>
            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAllOpen(true);
                    setOpen(false);
                  }}
                  className="text-[8px] text-muted-foreground hover:text-primary"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  SEE ALL
                </button>
                <span className="h-3 border-l-2 border-border" aria-hidden="true" />
                <button
                  onClick={clear}
                  className="text-[8px] text-destructive hover:bg-destructive/10 px-1 py-0.5 border border-destructive/40"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  CLEAR ALL
                </button>
              </div>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground italic text-center py-3">
              No notifications.
            </p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={notificationClass(n.type, !!targetForMessage(n.message))}
                  style={{ fontFamily: "var(--font-display)" }}
                  onClick={() => onNotificationClick(n.message)}
                  title={targetForMessage(n.message) ? "Open related page" : undefined}
                >
                  {displayMessage(n.message)}
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(n.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>Notifications</DialogTitle>
          </DialogHeader>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground italic text-center py-6">
              No notifications.
            </p>
          ) : (
            <div className="max-h-[65vh] overflow-y-auto space-y-1 pr-1">
              {notifications.map((n) => {
                const target = targetForMessage(n.message);
                return (
                  <div
                    key={n.id}
                    className={`group relative pr-9 ${notificationClass(n.type, !!target)}`}
                    style={{ fontFamily: "var(--font-display)" }}
                    onClick={() => onNotificationClick(n.message)}
                    title={target ? "Open related page" : undefined}
                  >
                    {displayMessage(n.message)}
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(n.at).toLocaleString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteOne(n.id);
                      }}
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      title="Delete notification"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Header path portrait — larger than clip; tune for head-only crop. */
const HUD_PATH_IDLE_SCALE = 3.5;
/** Negative moves sprite up inside the clip (pixels). Aligns bust with avatar row. */
const HUD_PATH_IDLE_NUDGE_Y_PX = -24;

export function HUD() {
  const { data: profile } = useProfile();
  const { data: ach = [] } = useAchievements();
  /** Always idle in the HUD; full-body states stay on the Sanctuary screen. */
  const hudIdleCharacterSrc = useMemo(
    () =>
      profile?.aura_path != null ? pathCharacterSpriteSrc(profile.aura_path, "idle") : null,
    [profile?.aura_path],
  );
  if (!profile) return null;
  const xpMax = xpForLevel(profile.level);
  const staCap = effectiveMaxStamina(profile);
  const effStr = effectiveStrength(profile);
  const effInt = effectiveIntelligence(profile);
  const effCon = effectiveConstitution(profile);
  const effDex = effectiveDexterity(profile);

  return (
    <header className="relative z-[110] border-b-2 border-border bg-card/80 backdrop-blur px-4 py-3">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Avatar + path character */}
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 pixel-panel flex items-center justify-center bg-secondary overflow-hidden">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt="Profile avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <span style={{ fontFamily: "var(--font-pixel)" }} className="text-primary text-lg">
                {profile.display_name[0]?.toUpperCase()}
              </span>
            )}
          </div>
          <div className="relative h-14 w-14 shrink-0 overflow-hidden" title="Path character (idle)">
            {hudIdleCharacterSrc ? (
              <img
                key={hudIdleCharacterSrc}
                src={hudIdleCharacterSrc}
                alt=""
                className="pointer-events-none absolute left-1/2 top-0 block w-14 max-w-none h-auto"
                style={{
                  imageRendering: "pixelated",
                  transform: `translateX(-50%) translateY(${HUD_PATH_IDLE_NUDGE_Y_PX}px) scale(${HUD_PATH_IDLE_SCALE})`,
                  transformOrigin: "top center",
                }}
              />
            ) : (
              <div
                className="h-full w-full text-[9px] flex items-center justify-center text-muted-foreground opacity-70"
                title="Choose a path in Settings"
              >
                —
              </div>
            )}
          </div>
        </div>

        {/* Identity + Bars */}
        <div className="flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm" style={{ fontFamily: "var(--font-pixel)" }}>
              {profile.display_name}
            </h2>
            <span
              className="text-xs px-1.5 py-0.5 bg-primary text-primary-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              LV {profile.level}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 max-w-xl">
            <Bar value={profile.hp} max={profile.max_hp} color="var(--color-hp)" label="HP" />
            <Bar value={profile.xp} max={xpMax} color="var(--color-xp)" label="XP" />
            <Bar value={profile.stamina} max={staCap} color="var(--color-stamina)" label="STA" />
          </div>
        </div>

        {/* Stats + Gold + Notifications */}
        <div
          className="flex items-center gap-3 text-lg"
          style={{ fontFamily: "var(--font-display)" }}
        >
          <NotificationsBell />
          <div className="flex items-center gap-1 text-[color:var(--color-gold)]">
            <Coins size={16} /> <span className="text-base">{profile.gold}</span>
          </div>
          <div className="flex items-center gap-1 text-accent" title="Moonshards">
            <Sparkles size={15} /> <span className="text-base">{profile.moonshards ?? 0}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground" title="Achievements">
            <Trophy size={15} /> <span className="text-base">{ach.length}</span>
          </div>
          <div className="h-8 w-px bg-border" />
          <div className="flex items-center gap-2" title="Strength (gear included)">
            <Swords size={18} className="text-destructive" /> {effStr}
          </div>
          <div className="flex items-center gap-2" title="Intelligence (gear included)">
            <Brain size={18} className="text-accent" /> {effInt}
          </div>
          <div className="flex items-center gap-2" title="Constitution (gear included)">
            <Heart size={18} className="text-primary" /> {effCon}
          </div>
          <div className="flex items-center gap-2" title="Dexterity (gear included)">
            <Footprints size={18} className="text-[color:var(--color-focus)]" /> {effDex}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
