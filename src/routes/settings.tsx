import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bell, Clock3, Save, ShieldCheck, UserRound } from "lucide-react";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useNotifications } from "@/components/aura/NotificationsContext";
import { usePomodoro } from "@/components/aura/PomodoroContext";
import { xpForLevel, type AuraPath } from "@/lib/aura/types";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Aura" }] }),
  component: SettingsPage,
});

const DESKTOP_NOTIF_KEY = "aura:desktop-notifications";
const SOUND_NOTIF_KEY = "aura:sound-notifications";

function SettingsPage() {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { notifications, unread, markAllRead, clear } = useNotifications();
  const { focusMinutes, breakMinutes, updateDurations } = usePomodoro();

  const [displayName, setDisplayName] = useState("");
  const [petName, setPetName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [auraPath, setAuraPath] = useState<string>("");
  const [desktopNotifs, setDesktopNotifs] = useState(false);
  const [soundNotifs, setSoundNotifs] = useState(true);
  const [nextFocusMinutes, setNextFocusMinutes] = useState(focusMinutes);
  const [nextBreakMinutes, setNextBreakMinutes] = useState(breakMinutes);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setPetName(profile.pet_name);
    setTimezone(profile.timezone || "UTC");
    setAuraPath(profile.aura_path || "");
  }, [profile?.display_name, profile?.pet_name]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDesktopNotifs(window.localStorage.getItem(DESKTOP_NOTIF_KEY) === "true");
    const soundPref = window.localStorage.getItem(SOUND_NOTIF_KEY);
    setSoundNotifs(soundPref === null ? true : soundPref === "true");
  }, []);

  useEffect(() => {
    setNextFocusMinutes(focusMinutes);
    setNextBreakMinutes(breakMinutes);
  }, [focusMinutes, breakMinutes]);

  const xpToNextLevel = useMemo(() => {
    if (!profile) return 0;
    return Math.max(0, xpForLevel(profile.level) - profile.xp);
  }, [profile?.level, profile?.xp]);

  if (!profile) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }

  const saveProfile = async () => {
    const nextDisplayName = displayName.trim();
    const nextPetName = petName.trim();
    if (!nextDisplayName || !nextPetName) {
      toast.error("Display name and pet name cannot be empty.");
      return;
    }
    await updateProfile.mutateAsync({
      display_name: nextDisplayName,
      pet_name: nextPetName,
      timezone: timezone.trim() || "UTC",
      aura_path: auraPath ? (auraPath as AuraPath) : null,
    });
    toast.success("Profile updated.");
  };

  const saveNotificationPrefs = () => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DESKTOP_NOTIF_KEY, String(desktopNotifs));
    window.localStorage.setItem(SOUND_NOTIF_KEY, String(soundNotifs));
    toast.success("Notification preferences saved.");
  };

  const savePomodoro = () => {
    updateDurations({
      focusMinutes: nextFocusMinutes,
      breakMinutes: nextBreakMinutes,
    });
    toast.success("Pomodoro settings updated.");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <h1 className="text-2xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
        SETTINGS
      </h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="pixel-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <UserRound size={18} className="text-primary" />
            <h2 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              PROFILE
            </h2>
          </div>
          <label className="block text-sm text-muted-foreground">Display name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
            placeholder="Your adventurer name"
          />
          <label className="block text-sm text-muted-foreground">Pet name</label>
          <input
            value={petName}
            onChange={(e) => setPetName(e.target.value)}
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
            placeholder="Your companion name"
          />
          <label className="block text-sm text-muted-foreground">Timezone (IANA)</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
            placeholder="e.g. America/New_York"
          />
          <label className="block text-sm text-muted-foreground">Aura path (class)</label>
          <select
            value={auraPath}
            onChange={(e) => setAuraPath(e.target.value)}
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
          >
            <option value="">Not chosen</option>
            <option value="warden">Warden — Focus Ward</option>
            <option value="scholar">Scholar — Party Mend</option>
            <option value="strider">Strider — Shadow Strike</option>
            <option value="keeper">Keeper — Second Wind</option>
          </select>
          <button
            onClick={saveProfile}
            disabled={updateProfile.isPending}
            className="px-4 py-2.5 bg-primary text-primary-foreground flex items-center gap-2 disabled:opacity-60"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
          >
            <Save size={14} /> {updateProfile.isPending ? "SAVING..." : "SAVE PROFILE"}
          </button>
        </section>

        <section className="pixel-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-primary" />
            <h2 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              NOTIFICATIONS
            </h2>
          </div>
          <label className="flex items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={desktopNotifs}
              onChange={(e) => setDesktopNotifs(e.target.checked)}
            />
            Enable desktop notifications
          </label>
          <label className="flex items-center gap-2 text-base">
            <input
              type="checkbox"
              checked={soundNotifs}
              onChange={(e) => setSoundNotifs(e.target.checked)}
            />
            Enable notification sounds
          </label>
          <div className="text-sm text-muted-foreground">
            {notifications.length} total notifications, {unread} unread.
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={markAllRead}
                className="px-3 py-2.5 border-2 border-border hover:border-primary text-sm"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 13 }}
              >
                MARK ALL READ
              </button>
              <button
                onClick={clear}
                className="px-3 py-2.5 border-2 border-border hover:border-destructive text-sm"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 13 }}
              >
                CLEAR ALL
              </button>
            </div>
            <button
              onClick={saveNotificationPrefs}
              className="px-3 py-2.5 bg-primary text-primary-foreground text-sm"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 13 }}
            >
              SAVE PREFS
            </button>
          </div>
        </section>

        <section className="pixel-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" />
            <h2 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              PLAYER STATS
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-base">
            <Stat label="Level" value={profile.level} />
            <Stat label="Gold" value={profile.gold} />
            <Stat label="HP" value={`${profile.hp}/${profile.max_hp}`} />
            <Stat label="Stamina" value={`${profile.stamina}/${profile.max_stamina}`} />
            <Stat label="XP" value={`${profile.xp}/${xpForLevel(profile.level)}`} />
            <Stat label="Strength" value={profile.strength} />
            <Stat label="Intelligence" value={profile.intelligence} />
            <Stat label="Constitution" value={profile.constitution} />
            <Stat label="XP to next level" value={xpToNextLevel} />
          </div>
        </section>

        <section className="pixel-panel p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Clock3 size={18} className="text-primary" />
            <h2 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              POMODORO
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Focus minutes</label>
              <input
                type="number"
                value={nextFocusMinutes}
                onChange={(e) => setNextFocusMinutes(Number(e.target.value || focusMinutes))}
                className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
              />
            </div>
            <div>
              <label className="block text-sm text-muted-foreground mb-1">Break minutes</label>
              <input
                type="number"
                value={nextBreakMinutes}
                onChange={(e) => setNextBreakMinutes(Number(e.target.value || breakMinutes))}
                className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Changes apply to the current timer when paused, and to new cycles right away.
          </p>
          <button
            onClick={savePomodoro}
            className="px-4 py-2.5 bg-primary text-primary-foreground"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
          >
            APPLY TIMER SETTINGS
          </button>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-2 border-border bg-secondary/40 px-3 py-2.5">
      <div className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
        {label}
      </div>
      <div className="text-lg text-foreground">{value}</div>
    </div>
  );
}
