import { useMemo, useState, type ComponentType } from "react";
import { Brain, Footprints, Heart, Sparkles, Swords } from "lucide-react";
import type { LucideProps } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useHabiticaStatus,
  useRefreshHabitica,
  type HabiticaPublicProfile,
} from "@/hooks/useHabitica";

function classIcon(habiticaClass: string | null | undefined) {
  switch ((habiticaClass ?? "").toLowerCase()) {
    case "warrior":
      return { Icon: Swords, label: "Warrior", color: "text-destructive" };
    case "wizard":
    case "mage":
      return { Icon: Brain, label: "Mage", color: "text-accent" };
    case "healer":
      return { Icon: Heart, label: "Healer", color: "text-primary" };
    case "rogue":
      return { Icon: Footprints, label: "Rogue", color: "text-[color:var(--color-focus)]" };
    default:
      return { Icon: Sparkles, label: "Adventurer", color: "text-muted-foreground" };
  }
}

interface HabiticaAvatarImgProps {
  src: string | null;
  alt: string;
  fallbackIcon: ComponentType<LucideProps>;
  fallbackColor: string;
  fallbackSize: number;
}

/**
 * Renders the Habitica avatar PNG with graceful fallback. Habitica's
 * `/export/avatar-:id.png` endpoint can 404 or rate-limit, so on any error
 * we fall back to the class icon. We deliberately omit
 * `referrerPolicy="no-referrer"` because that empty-referrer signal trips
 * Habitica's hotlink protection in some deployments and is what was
 * blocking the image from loading.
 */
function HabiticaAvatarImg({
  src,
  alt,
  fallbackIcon: FallbackIcon,
  fallbackColor,
  fallbackSize,
}: HabiticaAvatarImgProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <FallbackIcon size={fallbackSize} className={fallbackColor} />;
  }
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      style={{ imageRendering: "pixelated" }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

interface HabiticaStatBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
}

function HabiticaStatBar({ label, value, max, color }: HabiticaStatBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div>
      <div
        className="flex justify-between text-[10px] mb-0.5 text-muted-foreground"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <span>{label}</span>
        <span>
          {Math.round(value)}/{Math.round(max)}
        </span>
      </div>
      <div className="h-2 border border-border bg-secondary/50">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

interface HabiticaProfileDetailsProps {
  profile: HabiticaPublicProfile;
}

export function HabiticaProfileDetails({ profile }: HabiticaProfileDetailsProps) {
  const cls = classIcon(profile.class);
  const equippedEntries = useMemo(
    () => Object.entries(profile.gear?.equipped ?? {}).filter(([, v]) => !!v),
    [profile.gear?.equipped],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 border-2 border-border bg-secondary/40 overflow-hidden flex items-center justify-center">
          <HabiticaAvatarImg
            src={profile.avatarPngUrl}
            alt={`${profile.displayName} Habitica avatar`}
            fallbackIcon={cls.Icon}
            fallbackColor={cls.color}
            fallbackSize={36}
          />
        </div>
        <div className="min-w-0">
          <div
            className="text-base text-foreground truncate"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {profile.displayName}
          </div>
          {profile.username && (
            <div className="text-xs text-muted-foreground">@{profile.username}</div>
          )}
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
            <cls.Icon size={12} className={cls.color} />
            <span>{cls.label}</span>
            <span className="text-border">·</span>
            <span>Lvl {profile.level}</span>
            {profile.sleeping && (
              <>
                <span className="text-border">·</span>
                <span className="text-accent">Resting</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <HabiticaStatBar
          label="HP"
          value={profile.hp}
          max={profile.maxHp}
          color="var(--color-hp)"
        />
        <HabiticaStatBar
          label="EXP"
          value={profile.exp}
          max={profile.expToNextLevel || 1}
          color="var(--color-xp)"
        />
        <HabiticaStatBar
          label="MP"
          value={profile.mp}
          max={profile.maxMp || 1}
          color="var(--color-focus)"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="border-2 border-border bg-secondary/40 px-2 py-1.5 min-w-0">
          <div
            className="text-[10px] text-muted-foreground break-words"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            GOLD
          </div>
          <div className="text-sm text-foreground">{profile.gold.toLocaleString()}</div>
        </div>
        <div className="border-2 border-border bg-secondary/40 px-2 py-1.5 min-w-0">
          <div
            className="text-[10px] text-muted-foreground break-words"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            LOGIN STREAK
          </div>
          <div className="text-sm text-foreground">{profile.loginStreak} day(s)</div>
        </div>
        <div className="border-2 border-border bg-secondary/40 px-2 py-1.5 min-w-0">
          <div
            className="text-[10px] text-muted-foreground break-words"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            BADGES
          </div>
          <div className="text-sm text-foreground">{profile.achievementsTotal}</div>
        </div>
      </div>

      {equippedEntries.length > 0 && (
        <div>
          <div
            className="text-[10px] text-muted-foreground mb-1.5"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            EQUIPPED GEAR
          </div>
          <div className="flex flex-wrap gap-1.5">
            {equippedEntries.map(([slot, key]) => (
              <span
                key={`${slot}-${key}`}
                className="text-[10px] border border-border bg-secondary/40 px-1.5 py-0.5 text-foreground/90"
                title={`${slot}: ${key}`}
              >
                <span className="text-muted-foreground">{slot}</span>{" "}
                <span className="text-primary">{key}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {profile.refreshedAt && (
        <div className="text-[10px] text-muted-foreground">
          Snapshot {new Date(profile.refreshedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}

/**
 * Compact Habitica indicator for the HUD: avatar + level. Clicking opens a
 * dialog with the full profile.
 */
export function HabiticaChip() {
  const { data: status } = useHabiticaStatus();
  const refresh = useRefreshHabitica();
  const [open, setOpen] = useState(false);

  if (!status?.connected || !status.publicProfile) return null;
  const profile = status.publicProfile;
  const cls = classIcon(profile.class);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 border-2 border-border bg-secondary/40 hover:border-primary px-1.5 py-1 text-xs"
        title="Open Habitica profile"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <div className="w-6 h-6 border border-border bg-background overflow-hidden flex items-center justify-center">
          <HabiticaAvatarImg
            src={profile.avatarPngUrl}
            alt=""
            fallbackIcon={cls.Icon}
            fallbackColor={cls.color}
            fallbackSize={14}
          />
        </div>
        <span className="text-foreground">LV {profile.level}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>Habitica Profile</DialogTitle>
          </DialogHeader>
          <HabiticaProfileDetails profile={profile} />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void refresh.mutate()}
              disabled={refresh.isPending}
              className="px-3 py-1.5 border-2 border-border hover:border-primary disabled:opacity-60 text-xs"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {refresh.isPending ? "REFRESHING..." : "REFRESH"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
