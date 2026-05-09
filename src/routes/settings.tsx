import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Clock3, Plus, Save, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useProfile, useUpdateProfile } from "@/hooks/useProfile";
import { useNotifications } from "@/components/aura/NotificationsContext";
import { usePomodoro } from "@/components/aura/PomodoroContext";
import { AURA_PATHS, xpForLevel, type AuraPath } from "@/lib/aura/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import swordsmanIdle from "../../characters/swordsman/idle.gif";
import swordsmanStance from "../../characters/swordsman/stance.gif";
import mageIdle from "../../characters/mage/idle.gif";
import mageStance from "../../characters/mage/stance.gif";
import paladinIdle from "../../characters/paladin/idle.gif";
import paladinStance from "../../characters/paladin/stance.gif";
import rogueIdle from "../../characters/rogue/idle.gif";
import rogueStance from "../../characters/rogue/stance.gif";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Aura" }] }),
  component: SettingsPage,
});

const DESKTOP_NOTIF_KEY = "aura:desktop-notifications";
const SOUND_NOTIF_KEY = "aura:sound-notifications";
const SYSTEM_TIMEZONE_VALUE = "__SYSTEM__";
const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Athens",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

const PATH_GIFS: Record<AuraPath, { idle: string; stance: string }> = {
  swordsman: { idle: swordsmanIdle, stance: swordsmanStance },
  mage: { idle: mageIdle, stance: mageStance },
  tank: { idle: paladinIdle, stance: paladinStance },
  rogue: { idle: rogueIdle, stance: rogueStance },
};

async function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

async function cropAvatarToDataUrl(
  imageUrl: string,
  crop: { x: number; y: number; size: number },
  imageRect: { x: number; y: number; width: number; height: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas not supported"));
      const sx = ((crop.x - imageRect.x) / imageRect.width) * img.width;
      const sy = ((crop.y - imageRect.y) / imageRect.height) * img.height;
      const sw = (crop.size / imageRect.width) * img.width;
      const sh = (crop.size / imageRect.height) * img.height;
      ctx.imageSmoothingQuality = "high";
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = imageUrl;
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/jpeg";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function SettingsPage() {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { notifications, unread, markAllRead, clear } = useNotifications();
  const { focusMinutes, breakMinutes, updateDurations, sessionPlan, updateSessionPlan } = usePomodoro();

  const [displayName, setDisplayName] = useState("");
  const [characterName, setCharacterName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [auraPath, setAuraPath] = useState<AuraPath | "">("");
  const [desktopNotifs, setDesktopNotifs] = useState(false);
  const [soundNotifs, setSoundNotifs] = useState(true);
  const [pathTestingOverride, setPathTestingOverride] = useState(false);
  const [pathModalOpen, setPathModalOpen] = useState(false);
  const [settingsPathCardGifMode, setSettingsPathCardGifMode] = useState<"idle" | "stance">("idle");
  const [nextFocusMinutes, setNextFocusMinutes] = useState(focusMinutes);
  const [nextBreakMinutes, setNextBreakMinutes] = useState(breakMinutes);
  const [nextSessionPlan, setNextSessionPlan] = useState(sessionPlan);
  const [avatarDraft, setAvatarDraft] = useState<string | null>(null);
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [imageOffset, setImageOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [cropZoom, setCropZoom] = useState(1);
  const [imageNatural, setImageNatural] = useState<{ width: number; height: number } | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    imageX: number;
    imageY: number;
  } | null>(null);

  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.display_name);
    setCharacterName(profile.character_name);
    setTimezone(profile.timezone || "UTC");
    setAuraPath(profile.aura_path ?? "");
    setPathTestingOverride(!!profile.path_testing_override);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    if (!profile.aura_path) setPathModalOpen(true);
  }, [profile?.aura_path, profile?.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDesktopNotifs(window.localStorage.getItem(DESKTOP_NOTIF_KEY) === "true");
    const soundPref = window.localStorage.getItem(SOUND_NOTIF_KEY);
    setSoundNotifs(soundPref === null ? true : soundPref === "true");
  }, []);

  useEffect(() => {
    setNextFocusMinutes(focusMinutes);
    setNextBreakMinutes(breakMinutes);
    setNextSessionPlan(sessionPlan);
  }, [focusMinutes, breakMinutes, sessionPlan]);

  const xpToNextLevel = useMemo(() => {
    if (!profile) return 0;
    return Math.max(0, xpForLevel(profile.level) - profile.xp);
  }, [profile?.level, profile?.xp]);
  const timezoneOptions = useMemo(() => FALLBACK_TIMEZONES, []);

  const effectivePathIdForCard = (auraPath || profile?.aura_path || "") as AuraPath | "";

  useEffect(() => {
    if (!effectivePathIdForCard) return;
    setSettingsPathCardGifMode("idle");
  }, [effectivePathIdForCard]);

  useEffect(() => {
    if (!effectivePathIdForCard) return;
    const timer = window.setInterval(() => {
      setSettingsPathCardGifMode((m) => (m === "idle" ? "stance" : "idle"));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [effectivePathIdForCard]);

  const saveProfile = async () => {
    if (!profile) return;
    const nextDisplayName = displayName.trim();
    const nextCharacterName = characterName.trim();
    if (!nextDisplayName || !nextCharacterName) {
      toast.error("Display name and character name cannot be empty.");
      return;
    }
    let avatarUrlToSave = avatarDraft ?? profile.avatar_url ?? null;
    if (avatarBlob) {
      const ext = avatarBlob.type.includes("png")
        ? "png"
        : avatarBlob.type.includes("webp")
          ? "webp"
          : "jpg";
      const path = `${profile.id}/avatar.${ext}`;
      const upload = await supabase.storage
        .from("avatars")
        .upload(path, avatarBlob, { upsert: true, contentType: avatarBlob.type });
      if (upload.error) {
        toast.error(upload.error.message);
        return;
      }
      const pub = supabase.storage.from("avatars").getPublicUrl(path);
      avatarUrlToSave = `${pub.data.publicUrl}?v=${Date.now()}`;
    }

    if (!profile.aura_path && !auraPath) {
      toast.error("Choose a path before saving.");
      return;
    }
    await updateProfile.mutateAsync({
      display_name: nextDisplayName,
      character_name: nextCharacterName,
      timezone:
        timezone === SYSTEM_TIMEZONE_VALUE
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          : timezone.trim() || "UTC",
      ...(profile.aura_path && !pathTestingOverride ? {} : { aura_path: auraPath as AuraPath }),
      path_testing_override: pathTestingOverride,
      avatar_url: avatarUrlToSave,
    });
    setAvatarBlob(null);
    toast.success("Profile updated.");
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarDraft(dataUrl);
      setAvatarModalOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not load image.");
    }
  };

  const renderedImage = useMemo(() => {
    const box = previewRef.current?.getBoundingClientRect();
    if (!box || !imageNatural) {
      return {
        viewportWidth: 0,
        viewportHeight: 0,
        width: 0,
        height: 0,
        cropX: 0,
        cropY: 0,
        cropSize: 0,
      };
    }
    const baseScale = Math.min(box.width / imageNatural.width, box.height / imageNatural.height);
    const width = imageNatural.width * baseScale * cropZoom;
    const height = imageNatural.height * baseScale * cropZoom;
    const cropSize = Math.min(box.width, box.height) * 0.72;
    const cropX = (box.width - cropSize) / 2;
    const cropY = (box.height - cropSize) / 2;
    return {
      viewportWidth: box.width,
      viewportHeight: box.height,
      width,
      height,
      cropX,
      cropY,
      cropSize,
    };
  }, [imageNatural, cropZoom]);

  const clampOffsetForDims = useCallback(
    (nextX: number, nextY: number, width: number, height: number) => {
      const minX = renderedImage.cropX + renderedImage.cropSize - width;
      const maxX = renderedImage.cropX;
      const minY = renderedImage.cropY + renderedImage.cropSize - height;
      const maxY = renderedImage.cropY;
      return {
        x: Math.min(maxX, Math.max(minX, nextX)),
        y: Math.min(maxY, Math.max(minY, nextY)),
      };
    },
    [renderedImage.cropSize, renderedImage.cropX, renderedImage.cropY],
  );

  const clampImageOffset = useCallback(
    (nextX: number, nextY: number) =>
      clampOffsetForDims(nextX, nextY, renderedImage.width, renderedImage.height),
    [clampOffsetForDims, renderedImage.height, renderedImage.width],
  );

  useEffect(() => {
    if (!avatarDraft || !avatarModalOpen) return;
    const img = new Image();
    img.onload = () => {
      setImageNatural({ width: img.width, height: img.height });
      const box = previewRef.current?.getBoundingClientRect();
      if (!box) return;
      const scale = Math.min(box.width / img.width, box.height / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      const cropSize = Math.min(box.width, box.height) * 0.72;
      const cropX = (box.width - cropSize) / 2;
      const cropY = (box.height - cropSize) / 2;
      setCropZoom(1);
      setImageOffset({
        x: cropX + (cropSize - width) / 2,
        y: cropY + (cropSize - height) / 2,
      });
    };
    img.src = avatarDraft;
  }, [avatarDraft, avatarModalOpen]);

  useEffect(() => {
    setImageOffset((prev) => clampImageOffset(prev.x, prev.y));
  }, [clampImageOffset, renderedImage.height, renderedImage.width]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const nx = dragRef.current.imageX + (e.clientX - dragRef.current.startX);
      const ny = dragRef.current.imageY + (e.clientY - dragRef.current.startY);
      setImageOffset(clampImageOffset(nx, ny));
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [clampImageOffset, renderedImage.height, renderedImage.width]);

  const startCropDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !imageNatural) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      imageX: imageOffset.x,
      imageY: imageOffset.y,
    };
    e.preventDefault();
  };

  const onApplyCrop = async () => {
    if (!avatarDraft) return;
    try {
      const cropped = await cropAvatarToDataUrl(
        avatarDraft,
        {
          x: renderedImage.cropX,
          y: renderedImage.cropY,
          size: renderedImage.cropSize,
        },
        {
          x: imageOffset.x,
          y: imageOffset.y,
          width: renderedImage.width,
          height: renderedImage.height,
        },
      );
      if (!cropped) return;
      setAvatarDraft(cropped);
      setAvatarBlob(dataUrlToBlob(cropped));
      setAvatarModalOpen(false);
      toast.success("Avatar crop applied. Save profile to persist.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not crop image.");
    }
  };

  const onZoomChange = (value: number) => {
    const nextZoom = Math.max(1, Math.min(3, value));
    if (!imageNatural || renderedImage.width <= 0 || renderedImage.height <= 0) {
      setCropZoom(nextZoom);
      return;
    }
    const prevZoom = cropZoom;
    const nextWidth = (renderedImage.width / prevZoom) * nextZoom;
    const nextHeight = (renderedImage.height / prevZoom) * nextZoom;
    const centerX = renderedImage.cropX + renderedImage.cropSize / 2;
    const centerY = renderedImage.cropY + renderedImage.cropSize / 2;

    setImageOffset((prev) => {
      const relX = (centerX - prev.x) / renderedImage.width;
      const relY = (centerY - prev.y) / renderedImage.height;
      const next = {
        x: centerX - relX * nextWidth,
        y: centerY - relY * nextHeight,
      };
      return clampOffsetForDims(next.x, next.y, nextWidth, nextHeight);
    });
    setCropZoom(nextZoom);
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

  const updateDraftSessionAt = (
    index: number,
    patch: Partial<{ focusMinutes: number; breakMinutes: number }>,
  ) => {
    setNextSessionPlan((sessions) =>
      sessions.map((session, i) =>
        i === index
          ? {
              ...session,
              ...patch,
            }
          : session,
      ),
    );
  };

  const addSessionDraft = () => {
    setNextSessionPlan((sessions) => [
      ...sessions,
      { focusMinutes: nextFocusMinutes, breakMinutes: nextBreakMinutes },
    ]);
  };

  const removeSessionDraft = (index: number) => {
    setNextSessionPlan((sessions) => {
      if (sessions.length <= 1) return sessions;
      return sessions.filter((_, i) => i !== index);
    });
  };

  const saveSessionPlan = () => {
    updateSessionPlan(nextSessionPlan);
    toast.success("Pomodoro session queue saved.");
  };

  if (!profile) {
    return <div className="p-6 text-muted-foreground">Loading settings...</div>;
  }
  const pathLocked = !!profile.aura_path && !pathTestingOverride;
  const activePath = AURA_PATHS.find((p) => p.id === (auraPath || profile.aura_path || ""));
  const selectedPathId = (auraPath || profile.aura_path || "") as AuraPath | "";
  const dramaticByPath: Record<AuraPath, string> = {
    swordsman:
      "Steel sings in your hands. You break enemy lines and turn discipline into momentum.",
    mage:
      "Arcane equations bend in your favor. You mend the party and outthink the battlefield.",
    tank: "You are the wall that does not fall. Threat shatters on your guard and resolve.",
    rogue:
      "You strike from the blind angle. Precision, pace, and timing become your true weapons.",
  };

  return (
    <div className="p-3 lg:p-6 max-w-6xl mx-auto space-y-5">
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
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 pixel-panel overflow-hidden bg-secondary flex items-center justify-center">
              {avatarDraft || profile.avatar_url ? (
                <img
                  src={avatarDraft ?? profile.avatar_url ?? ""}
                  alt="Avatar preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-primary text-lg" style={{ fontFamily: "var(--font-pixel)" }}>
                  {profile.display_name[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 border-2 border-border hover:border-primary text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CHOOSE AVATAR
              </button>
              <button
                type="button"
                onClick={() => {
                  setAvatarDraft(null);
                  setAvatarBlob(null);
                }}
                className="px-3 py-1.5 border-2 border-border hover:border-destructive text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CLEAR AVATAR
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
            />
          </div>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
            placeholder="Your adventurer name"
          />
          <label className="block text-sm text-muted-foreground">Character name</label>
          <input
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
            placeholder="Your character name"
          />
          <label className="block text-sm text-muted-foreground">Timezone</label>
          <select
            value={timezoneOptions.includes(timezone) ? timezone : SYSTEM_TIMEZONE_VALUE}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-base"
          >
            <option value={SYSTEM_TIMEZONE_VALUE}>System default (browser)</option>
            {timezoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
          <label className="block text-sm text-muted-foreground">Path (class)</label>
          {activePath && (
            <button
              type="button"
              onClick={() => {
                if (pathTestingOverride || !profile.aura_path) setPathModalOpen(true);
              }}
              className={`relative w-full overflow-hidden border-2 border-border bg-secondary/40 p-3 text-sm text-left ${
                pathTestingOverride || !profile.aura_path
                  ? "hover:border-primary hover:shadow-[0_0_14px_rgba(217,150,48,0.35)]"
                  : "cursor-default"
              }`}
            >
              <motion.img
                key={`${activePath.id}-${settingsPathCardGifMode}`}
                aria-hidden
                alt=""
                src={PATH_GIFS[activePath.id][settingsPathCardGifMode]}
                className="pointer-events-none absolute right-2 top-2 z-0 h-[96px] w-auto max-w-[min(44%,140px)] object-contain object-top sm:h-[112px]"
                style={{ imageRendering: "pixelated" }}
                initial={false}
                animate={{ y: [0, -2, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              />
              <div className="relative z-[1] space-y-1 min-w-0 pr-[calc(96px+0.75rem)] sm:pr-[calc(112px+1rem)]">
                <div className="text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                  {activePath.label}
                </div>
                <p className="text-muted-foreground">{activePath.fantasy}</p>
                <p className="text-accent">{activePath.growth}</p>
                <p className="text-muted-foreground">Skill: {activePath.skill}</p>
                <p className="text-sm text-foreground/90 italic">{dramaticByPath[activePath.id]}</p>
              </div>
            </button>
          )}
          {!activePath && (
            <button
              type="button"
              onClick={() => setPathModalOpen(true)}
              className="w-full border-2 border-border bg-secondary/40 p-3 text-sm text-left hover:border-primary"
            >
              Choose your path
            </button>
          )}
          {pathLocked && (
            <p className="text-xs text-muted-foreground">
              Path is locked after your first choice.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={pathTestingOverride}
              onChange={(e) => setPathTestingOverride(e.target.checked)}
            />
            Testing override: allow changing path
          </label>
          <div className="flex justify-end">
            <button
              onClick={saveProfile}
              disabled={updateProfile.isPending}
              className="px-4 py-2.5 bg-primary text-primary-foreground flex items-center gap-2 disabled:opacity-60"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
            >
              <Save size={14} /> {updateProfile.isPending ? "SAVING..." : "SAVE PROFILE"}
            </button>
          </div>
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
          <div className="flex items-center justify-between gap-2 flex-nowrap">
            <div className="flex items-center gap-2 flex-nowrap">
              <button
                onClick={markAllRead}
                className="px-2.5 py-2 border-2 border-border hover:border-primary text-sm whitespace-nowrap"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 13 }}
              >
                MARK ALL READ
              </button>
              <button
                onClick={clear}
                className="px-2.5 py-2 border-2 border-border hover:border-destructive text-sm whitespace-nowrap"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 13 }}
              >
                CLEAR ALL
              </button>
            </div>
            <button
              onClick={saveNotificationPrefs}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm whitespace-nowrap shrink-0"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 13 }}
            >
              SAVE
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
            <Stat label="Dexterity" value={profile.dexterity} />
            <Stat label="XP to next level" value={xpToNextLevel} />
          </div>
          <div className="border-2 border-border bg-secondary/30 p-3 space-y-2">
            <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              HOW STATS WORK
            </h3>
            <p className="text-sm text-muted-foreground">
              STR boosts strike power, INT improves arcane utility and cooldown scaling, CON
              strengthens survival and recovery behavior, and DEX powers precision/rogue tempo.
            </p>
            <p className="text-sm text-muted-foreground">
              HP/STA are your combat resources, XP/Level drive growth, and Gold/Moonshards fuel gear
              progression that further modifies effective stats.
            </p>
          </div>
        </section>

        <section className="pixel-panel p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock3 size={18} className="text-primary" />
              <h2 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                POMODORO
              </h2>
            </div>
            <button
              type="button"
              onClick={addSessionDraft}
              className="px-2 py-1 border-2 border-border hover:border-primary text-[11px] flex items-center gap-1"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Plus size={12} /> ADD SESSION
            </button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {nextSessionPlan.map((session, index) => (
                <div key={`session-${index}`} className="border border-border p-2 space-y-2 bg-background/30">
                  <div
                    className="text-[11px] text-muted-foreground"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    Session {index + 1}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <label className="text-xs text-muted-foreground">
                      Focus (min)
                      <input
                        type="number"
                        min={1}
                        value={session.focusMinutes}
                        onChange={(e) =>
                          updateDraftSessionAt(index, {
                            focusMinutes: Number(e.target.value || session.focusMinutes),
                          })
                        }
                        className="mt-1 w-full px-2 py-1 bg-input border-2 border-border focus:border-primary outline-none text-sm"
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Break (min)
                      <input
                        type="number"
                        min={1}
                        value={session.breakMinutes}
                        onChange={(e) =>
                          updateDraftSessionAt(index, {
                            breakMinutes: Number(e.target.value || session.breakMinutes),
                          })
                        }
                        className="mt-1 w-full px-2 py-1 bg-input border-2 border-border focus:border-primary outline-none text-sm"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSessionDraft(index)}
                      disabled={nextSessionPlan.length <= 1}
                      className="h-9 px-2 border-2 border-border hover:border-destructive disabled:opacity-50 disabled:cursor-not-allowed text-destructive"
                      title="Remove session"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Start timer manually for Session 1 focus. After that, break and next sessions run
              automatically in order.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={saveSessionPlan}
                className="px-4 py-2.5 bg-primary text-primary-foreground"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
              >
                SAVE POMODORO SESSION
              </button>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={avatarModalOpen} onOpenChange={setAvatarModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>
              Crop Profile Picture
            </DialogTitle>
          </DialogHeader>
          {avatarDraft && (
            <div className="space-y-3">
              <div
                ref={previewRef}
                className="w-full h-[min(24rem,38dvh)] mx-auto border-2 border-border bg-secondary/20 relative overflow-hidden"
                onPointerDown={startCropDrag}
              >
                {imageNatural && (
                  <>
                    <img
                      src={avatarDraft}
                      alt="Avatar source"
                      className="absolute select-none cursor-move"
                      style={{
                        left: imageOffset.x,
                        top: imageOffset.y,
                        width: renderedImage.width,
                        height: renderedImage.height,
                      }}
                      draggable={false}
                    />
                    <div
                      className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                      style={{
                        left: renderedImage.cropX,
                        top: renderedImage.cropY,
                        width: renderedImage.cropSize,
                        height: renderedImage.cropSize,
                      }}
                    />
                  </>
                )}
              </div>
              <label className="block text-xs text-muted-foreground">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.01}
                  value={cropZoom}
                  onChange={(e) => onZoomChange(Number(e.target.value))}
                  className="w-full"
                />
              </label>
              <p className="text-xs text-muted-foreground">
                Drag the image to position it inside the selection square.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAvatarModalOpen(false)}
                  className="px-3 py-1.5 border-2 border-border"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void onApplyCrop()}
                  className="px-3 py-1.5 bg-primary text-primary-foreground"
                >
                  Apply Crop
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={pathModalOpen}
        onOpenChange={(next) => {
          if (!profile.aura_path && !next) return;
          setPathModalOpen(next);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>Choose Your Path</DialogTitle>
          </DialogHeader>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {profile.aura_path
              ? "Reshape your role for testing. Pick a path card, then save."
              : "You must choose one path to continue. This choice is permanent unless testing override is enabled."}
          </p>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
            {AURA_PATHS.map((path) => (
              <button
                key={path.id}
                type="button"
                onClick={() => setAuraPath(path.id)}
                aria-pressed={selectedPathId === path.id}
                className={`relative text-left pixel-panel p-2 sm:p-3 border-2 transition-all duration-150 ${
                  selectedPathId === path.id
                    ? "!border-primary !bg-primary/10 shadow-[0_0_0_2px_rgba(217,150,48,0.9),0_0_24px_rgba(217,150,48,0.55)]"
                    : "border-border hover:!border-primary hover:shadow-[0_0_16px_rgba(217,150,48,0.45)]"
                }`}
              >
                {selectedPathId === path.id && (
                  <span
                    className="absolute top-1.5 right-1.5 px-1 py-0.5 text-[8px] sm:text-[9px] bg-primary text-primary-foreground"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    SELECTED
                  </span>
                )}
                <div className="w-full h-24 sm:h-28 border-2 border-border bg-secondary/40 mb-2 flex items-center justify-center overflow-hidden">
                  <img
                    src={selectedPathId === path.id ? PATH_GIFS[path.id].stance : PATH_GIFS[path.id].idle}
                    alt={`${path.label} preview`}
                    className="h-full w-auto object-contain"
                  />
                </div>
                <div className="text-primary mb-1 text-xs sm:text-sm" style={{ fontFamily: "var(--font-pixel)" }}>
                  {path.label}
                </div>
                <p className="text-xs text-muted-foreground">{path.fantasy}</p>
                <p className="text-xs text-accent mt-0.5">{path.growth}</p>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Skill: {path.skill}</p>
                <p className="text-xs text-foreground/80 italic mt-1 hidden lg:block">{dramaticByPath[path.id]}</p>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            {profile.aura_path && (
              <button
                type="button"
                onClick={() => setPathModalOpen(false)}
                className="px-3 py-1.5 border-2 border-border"
              >
                Close
              </button>
            )}
            <button
              type="button"
              onClick={() => void saveProfile()}
              disabled={!auraPath || updateProfile.isPending}
              className="px-4 py-2.5 bg-primary text-primary-foreground disabled:opacity-60"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
            >
              {updateProfile.isPending ? "BINDING PATH..." : "CONFIRM PATH"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
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
