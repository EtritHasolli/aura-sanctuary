import { createFileRoute } from "@tanstack/react-router";
import { animate, motion, useMotionValue } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  Music,
  SkipForward,
  ListMusic,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePomodoro } from "@/components/aura/PomodoroContext";
import { useProfile } from "@/hooks/useProfile";
import { useTasks, useUpdateTask, useUpdateChecklistItem } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  pathCharacterFallingSpriteSrc,
  pathCharacterSpriteSrc,
  pathCharacterWalkSpriteSrc,
} from "@/lib/aura/pathCharacterSprites";
import { SANCTUARY_WANDER_MIN_STEP_PX } from "@/lib/aura/sanctuaryCharacterWander";
import { useSanctuaryIdleWander } from "@/hooks/useSanctuaryIdleWander";
import { AURA_PATHS } from "@/lib/aura/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sanctuary — Aura" },
      { name: "description", content: "Your peaceful focus room with your character and companion." },
    ],
  }),
  component: SanctuaryPage,
});

const FALL_ASLEEP_TRANSITION_MS = 1300;

function fmt(s: number) {
  const m = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function getYouTubeVideoId(raw: string) {
  try {
    const value = raw.trim();
    if (!value) return null;
    const url = new URL(value);

    if (url.hostname === "youtu.be") {
      return url.pathname.slice(1) || null;
    }
    if (url.pathname === "/watch") {
      return url.searchParams.get("v");
    }
    if (url.pathname.startsWith("/shorts/")) {
      return url.pathname.split("/")[2] || null;
    }
    if (url.pathname.startsWith("/embed/")) {
      return url.pathname.split("/")[2] || null;
    }
    return null;
  } catch {
    return null;
  }
}

function SanctuaryPage() {
  const { running, mode, secondsLeft, start, pause, reset, characterState } = usePomodoro();
  const characterStateRef = useRef(characterState);
  characterStateRef.current = characterState;
  const { data: profile } = useProfile();
  const { data: tasks = [] } = useTasks();
  const updateTask = useUpdateTask();
  const updateChecklist = useUpdateChecklistItem();
  const [muted, setMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopGeneratedRef = useRef<(() => void) | null>(null);

  const focused = characterState === "working";
  const pathLabel = useMemo(
    () =>
      profile?.aura_path != null
        ? (AURA_PATHS.find((p) => p.id === profile.aura_path)?.label ?? profile.aura_path)
        : "No path",
    [profile?.aura_path],
  );
  const pathCharacterClickable = Boolean(profile?.aura_path);
  const [sanctuaryTapAcknowledge, setSanctuaryTapAcknowledge] = useState(false);
  const [sleepGifRestartKey, setSleepGifRestartKey] = useState(0);
  const [showFallingSleepTransition, setShowFallingSleepTransition] = useState(false);
  const sleepTransitionTimeoutRef = useRef<number | null>(null);
  const previousCharacterStateRef = useRef(characterState);

  const triggerSleepTransition = useCallback(() => {
    if (profile?.aura_path == null) return;
    if (!pathCharacterFallingSpriteSrc(profile.aura_path)) return;
    if (sleepTransitionTimeoutRef.current != null) {
      window.clearTimeout(sleepTransitionTimeoutRef.current);
      sleepTransitionTimeoutRef.current = null;
    }
    setShowFallingSleepTransition(true);
    sleepTransitionTimeoutRef.current = window.setTimeout(() => {
      sleepTransitionTimeoutRef.current = null;
      setShowFallingSleepTransition(false);
    }, FALL_ASLEEP_TRANSITION_MS);
  }, [profile?.aura_path]);

  const roamSanctuaryIdle =
    pathCharacterClickable && characterState === "idle" && !sanctuaryTapAcknowledge;
  const roamSanctuaryIdleRef = useRef(roamSanctuaryIdle);
  roamSanctuaryIdleRef.current = roamSanctuaryIdle;

  const idleWander = useSanctuaryIdleWander({
    roaming: roamSanctuaryIdle,
    resetHomeWhenRoamingEnds: characterState === "sleeping" || !pathCharacterClickable,
  });

  const xPan = useMotionValue(0);
  const sanctuaryPanCtlRef = useRef<ReturnType<typeof animate> | null>(null);
  const sanctuaryTapTimeoutRef = useRef<number | null>(null);
  const sanctuaryPausedStrideRef = useRef<{ endX: number; dir: "left" | "right" } | null>(null);
  const prevCharacterStateForPanRef = useRef(characterState);

  const sanctuarySpriteUrl = useMemo(() => {
    if (profile?.aura_path == null) return null;
    const path = profile.aura_path;
    if (sanctuaryTapAcknowledge) return pathCharacterSpriteSrc(path, "working");
    if (characterState === "sleeping" && showFallingSleepTransition) {
      return pathCharacterFallingSpriteSrc(path) ?? pathCharacterSpriteSrc(path, "sleeping");
    }
    if (characterState === "sleeping") return pathCharacterSpriteSrc(path, "sleeping");
    if (characterState === "working") return pathCharacterSpriteSrc(path, "working");
    if (idleWander.walkDirection === "left" || idleWander.walkDirection === "right") {
      return pathCharacterWalkSpriteSrc(path, idleWander.walkDirection);
    }
    return pathCharacterSpriteSrc(path, "idle");
  }, [
    profile?.aura_path,
    characterState,
    showFallingSleepTransition,
    idleWander.walkDirection,
    sanctuaryTapAcknowledge,
  ]);

  useEffect(() => {
    const prev = previousCharacterStateRef.current;
    previousCharacterStateRef.current = characterState;

    if (profile?.aura_path == null || characterState !== "sleeping") {
      if (sleepTransitionTimeoutRef.current != null) {
        window.clearTimeout(sleepTransitionTimeoutRef.current);
        sleepTransitionTimeoutRef.current = null;
      }
      setShowFallingSleepTransition(false);
      return;
    }

    if (prev !== "sleeping") {
      triggerSleepTransition();
    }
  }, [characterState, profile?.aura_path, triggerSleepTransition]);

  useEffect(() => {
    sanctuaryPanCtlRef.current?.stop();
    const pathOk = pathCharacterClickable;
    const panSpeed = idleWander.strideSpeedPxPerSec;

    const prevChar = prevCharacterStateForPanRef.current;
    prevCharacterStateForPanRef.current = characterState;

    if (sanctuaryTapAcknowledge && characterState === "idle" && pathOk) {
      return () => sanctuaryPanCtlRef.current?.stop();
    }

    if (!pathOk || characterState === "sleeping") {
      sanctuaryPanCtlRef.current = animate(xPan, 0, { duration: 0, ease: "linear" });
      return () => sanctuaryPanCtlRef.current?.stop();
    }

    if (characterState === "working") {
      if (prevChar !== "working") {
        idleWander.syncPanSnapshot(xPan.get());
      }
      return () => sanctuaryPanCtlRef.current?.stop();
    }

    const from = xPan.get();
    const to = idleWander.targetX;
    const dur = Math.max(0.05, Math.abs(to - from) / panSpeed);
    sanctuaryPanCtlRef.current = animate(xPan, to, {
      duration: dur,
      ease: "linear",
      onComplete: () => {
        if (!roamSanctuaryIdleRef.current) return;
        idleWander.onWalkStrideComplete();
      },
    });

    return () => sanctuaryPanCtlRef.current?.stop();
  }, [
    characterState,
    pathCharacterClickable,
    sanctuaryTapAcknowledge,
    idleWander.targetX,
    idleWander.strideSpeedPxPerSec,
    idleWander.syncPanSnapshot,
    idleWander.onWalkStrideComplete,
    xPan,
  ]);

  useEffect(() => {
    return () => {
      sanctuaryPanCtlRef.current?.stop();
      if (sanctuaryTapTimeoutRef.current != null) window.clearTimeout(sanctuaryTapTimeoutRef.current);
      if (sleepTransitionTimeoutRef.current != null) {
        window.clearTimeout(sleepTransitionTimeoutRef.current);
      }
    };
  }, []);

  const showNativeSleepSprite = characterState === "sleeping" && !sanctuaryTapAcknowledge;
  const useSanctuaryStageFocusBob = characterState === "working" || sanctuaryTapAcknowledge;

  const onSanctuaryPathCharacterTap = () => {
    if (!pathCharacterClickable) return;
    if (sanctuaryTapAcknowledge) return;
    const dir = idleWander.walkDirection;
    sanctuaryPausedStrideRef.current =
      dir === "left" || dir === "right" ? { endX: idleWander.targetX, dir } : null;
    sanctuaryPanCtlRef.current?.stop();
    idleWander.clearStrideExpectation();
    setSanctuaryTapAcknowledge(true);
    // If we're currently sleeping, ensure the sleeping GIF restarts from the beginning after the
    // 2s "stance" acknowledgement finishes (by forcing a remount via key).
    if (characterStateRef.current === "sleeping") {
      setSleepGifRestartKey((k) => k + 1);
    }
    if (sanctuaryTapTimeoutRef.current != null) window.clearTimeout(sanctuaryTapTimeoutRef.current);
    sanctuaryTapTimeoutRef.current = window.setTimeout(() => {
      sanctuaryTapTimeoutRef.current = null;
      if (characterStateRef.current === "idle") {
        const px = xPan.get();
        const saved = sanctuaryPausedStrideRef.current;
        sanctuaryPausedStrideRef.current = null;
        if (
          saved &&
          Math.abs(saved.endX - px) >= SANCTUARY_WANDER_MIN_STEP_PX * 0.5
        ) {
          idleWander.resumeInterruptedStride(px, saved.endX, saved.dir);
        } else {
          idleWander.syncPanSnapshot(px);
        }
      }
      setSanctuaryTapAcknowledge(false);
      if (characterStateRef.current === "sleeping") {
        triggerSleepTransition();
      }
    }, 2000);
  };
  const [trackLabel, setTrackLabel] = useState("chillhop stream");
  const [trackIdx, setTrackIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const [youtubeEmbedUrl, setYoutubeEmbedUrl] = useState<string | null>(null);
  const trackSources = [
    {
      label: "chillhop stream",
      kind: "stream" as const,
      url: "https://cdn.pixabay.com/download/audio/2022/05/16/audio_c1c3fd27f2.mp3?filename=lofi-study-112191.mp3",
    },
    {
      label: "ambient groove",
      kind: "stream" as const,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    },
    {
      label: "night vibe",
      kind: "stream" as const,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    },
    {
      label: "calm drift",
      kind: "stream" as const,
      url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    },
    {
      label: "rain ambience",
      kind: "generated" as const,
      generator: "rain" as const,
    },
    {
      label: "forest birds",
      kind: "stream" as const,
      url: "https://www.soundjay.com/nature/birds-01.mp3",
    },
    {
      label: "wood burning",
      kind: "generated" as const,
      generator: "fire" as const,
    },
  ] as const;
  const todos = tasks.filter((t) => t.type === "todo").slice(0, 8);

  useEffect(() => {
    const audio = new Audio(trackSources[0].url);
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
      stopGeneratedRef.current?.();
      stopGeneratedRef.current = null;
      audioCtxRef.current?.close();
      audioCtxRef.current = null;
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("aura:youtube-embed-url");
    if (saved) {
      setYoutubeEmbedUrl(saved);
      setTrackLabel("youtube");
      setMuted(false);
    }
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    void supabase.rpc("ensure_quest_arc_started", { p_arc_slug: "shadow-cleansing" });
  }, [profile?.id]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!menuContainerRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [menuOpen]);

  const stopGenerated = () => {
    stopGeneratedRef.current?.();
    stopGeneratedRef.current = null;
  };

  const getAudioContext = async () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playGenerated = async (mode: "rain" | "fire") => {
    const ctx = await getAudioContext();
    stopGenerated();
    const durationSec = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * durationSec, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * 0.7;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const gain = ctx.createGain();
    const filterA = ctx.createBiquadFilter();
    const filterB = ctx.createBiquadFilter();

    if (mode === "rain") {
      filterA.type = "lowpass";
      filterA.frequency.value = 1300;
      filterB.type = "highpass";
      filterB.frequency.value = 120;
      gain.gain.value = 0.18;
    } else {
      filterA.type = "bandpass";
      filterA.frequency.value = 900;
      filterB.type = "highpass";
      filterB.frequency.value = 250;
      gain.gain.value = 0.14;
    }

    src.connect(filterA);
    filterA.connect(filterB);
    filterB.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    let crackleTimer: number | null = null;
    if (mode === "fire") {
      crackleTimer = window.setInterval(() => {
        const now = ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0.1 + Math.random() * 0.08, now);
        gain.gain.exponentialRampToValueAtTime(
          0.03 + Math.random() * 0.05,
          now + 0.09 + Math.random() * 0.12,
        );
      }, 110);
    }

    stopGeneratedRef.current = () => {
      if (crackleTimer) window.clearInterval(crackleTimer);
      try {
        src.stop();
      } catch {
        /* no-op */
      }
      src.disconnect();
      filterA.disconnect();
      filterB.disconnect();
      gain.disconnect();
    };
  };

  const playSelectedTrack = async (idx: number) => {
    const selected = trackSources[idx];
    const audio = audioRef.current;
    if (!audio) return;
    setYoutubeEmbedUrl(null);
    window.dispatchEvent(new Event("aura:clear-youtube-audio"));
    if (selected.kind === "generated") {
      audio.pause();
      await playGenerated(selected.generator);
      return;
    }

    stopGenerated();
    audio.src = selected.url;
    audio.load();
    await audio.play();
  };

  const toggleMute = async () => {
    if (muted) {
      try {
        await playSelectedTrack(trackIdx);
        setMuted(false);
      } catch (err) {
        const name = err instanceof DOMException ? err.name : "UnknownError";
        if (name === "NotAllowedError") {
          setMuted(true);
          toast.error("Browser blocked autoplay. Click again after interacting with the page.");
          return;
        }
        setMuted(true);
        toast.error("Could not start this sound. Please pick another track.");
      }
      return;
    }

    audioRef.current?.pause();
    stopGenerated();
    setMuted(true);
  };

  const nextTrack = async () => {
    const nextIdx = (trackIdx + 1) % trackSources.length;
    setTrackIdx(nextIdx);
    setTrackLabel(trackSources[nextIdx].label);

    if (!muted) {
      try {
        await playSelectedTrack(nextIdx);
      } catch {
        setMuted(true);
        toast.error("Switched track, but playback was blocked. Tap volume to play.");
        return;
      }
    }
    toast.success(`Now playing: ${trackSources[nextIdx].label}`);
  };

  const selectTrack = async (idx: number) => {
    setTrackIdx(idx);
    setTrackLabel(trackSources[idx].label);
    setMenuOpen(false);

    if (!muted) {
      try {
        await playSelectedTrack(idx);
      } catch {
        setMuted(true);
        toast.error("Track selected, but playback was blocked. Tap volume to play.");
        return;
      }
    }
    toast.success(`Selected: ${trackSources[idx].label}`);
  };

  const loadYouTubeTrack = () => {
    const videoId = getYouTubeVideoId(youtubeUrlInput);
    if (!videoId) {
      toast.error("Invalid YouTube URL.");
      return;
    }

    audioRef.current?.pause();
    stopGenerated();
    setMuted(false);
    setMenuOpen(false);
    setTrackLabel("youtube");
    const embed = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1`;
    setYoutubeEmbedUrl(embed);
    window.dispatchEvent(
      new CustomEvent("aura:set-youtube-audio", { detail: { embedUrl: embed } }),
    );
    toast.success("YouTube track loaded.");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-3 flex items-center justify-end">
        <div className="px-2 py-1 border border-border bg-secondary/30 text-xs text-muted-foreground capitalize">
          Path: {profile?.aura_path ? `${profile.aura_path}` : "unbound"}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* The Sanctuary room */}
        <div className="lg:col-span-2">
          <div
            className="relative aspect-[16/10] pixel-panel overflow-hidden scanlines"
            style={{
              background: focused
                ? "linear-gradient(180deg, color-mix(in oklab, var(--sanctuary-wall) 70%, var(--color-primary)) 0%, color-mix(in oklab, var(--sanctuary-wall) 88%, black) 60%, color-mix(in oklab, var(--sanctuary-wall) 75%, var(--sanctuary-floor)) 100%)"
                : "linear-gradient(180deg, color-mix(in oklab, var(--sanctuary-wall) 80%, var(--color-primary)) 0%, color-mix(in oklab, var(--sanctuary-wall) 92%, black) 55%, color-mix(in oklab, var(--sanctuary-floor) 85%, black) 100%)",
              transition: "background 1.4s ease",
            }}
          >
            {/* rainy outside ambience */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: focused
                  ? "linear-gradient(180deg, color-mix(in oklab, var(--color-background) 10%, transparent), color-mix(in oklab, var(--sanctuary-wall) 35%, transparent))"
                  : "linear-gradient(180deg, color-mix(in oklab, var(--color-background) 20%, transparent), color-mix(in oklab, var(--sanctuary-wall) 45%, transparent))",
              }}
            />
            <div
              className="absolute inset-0 pointer-events-none opacity-25"
              style={{
                background:
                  "repeating-linear-gradient(105deg, transparent 0 10px, color-mix(in oklab, var(--color-foreground) 20%, transparent) 10px 12px)",
              }}
            />

            {/* Isometric room shell */}
            <div
              className="absolute left-[18%] right-[18%] top-[14%] h-[48%] border-2 border-border/70"
              style={{
                background: "color-mix(in oklab, var(--sanctuary-wall) 95%, var(--color-primary))",
                clipPath: "polygon(50% 0%, 100% 28%, 100% 100%, 0% 100%, 0% 28%)",
              }}
            />
            <div
              className="absolute left-[16%] right-[16%] bottom-[10%] h-[38%] border-2 border-border/70"
              style={{
                background: "color-mix(in oklab, var(--sanctuary-floor) 92%, var(--color-primary))",
                clipPath: "polygon(50% 0%, 100% 35%, 50% 100%, 0% 35%)",
              }}
            />

            {/* left fireplace block */}
            <div className="absolute left-[23%] top-[45%] w-[12%] h-[24%] border-2 border-border/70 bg-card/80" />
            <div className="absolute left-[25.2%] top-[53%] w-[7.6%] h-[9%] border border-border/70 bg-secondary/80" />
            <motion.div
              className="absolute left-[27.8%] top-[55.5%] w-[2.4%] h-[4.5%]"
              animate={{ opacity: [0.45, 0.95, 0.45], y: [0, -1, 0] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
              style={{ background: "var(--color-primary)" }}
            />

            {/* desk + task tablet */}
            <div
              className="absolute left-[39%] top-[64%] w-[22%] h-[11%] border-2 border-border/70"
              style={{
                background:
                  "color-mix(in oklab, var(--sanctuary-floor) 85%, var(--color-background))",
                clipPath: "polygon(10% 0%, 92% 0%, 100% 25%, 8% 25%)",
              }}
            />
            <div className="absolute left-[46%] top-[67%] w-[7%] h-[5%] border border-border/70 bg-muted/80" />

            {/* garden bed */}
            <div
              className="absolute right-[20%] top-[58%] w-[19%] h-[21%] border-2 border-border/70"
              style={{
                background: "color-mix(in oklab, var(--sanctuary-floor) 70%, #3b2a1f)",
                clipPath: "polygon(8% 0%, 100% 12%, 92% 100%, 0% 88%)",
              }}
            />
            <div className="absolute right-[29%] top-[56%] w-[1.2%] h-[8%] bg-[color:var(--color-hp)]" />
            <div className="absolute right-[24.5%] top-[53%] w-[1.2%] h-[11%] bg-[color:var(--color-hp)]" />
            <div className="absolute right-[20.5%] top-[57%] w-[1.2%] h-[7%] bg-[color:var(--color-hp)]" />

            {/* shelf + rewards */}
            <div className="absolute right-[25%] top-[35%] w-[18%] h-[2.5%] border border-border/70 bg-secondary/90" />
            <div className="absolute right-[37%] top-[30%] w-[3.2%] h-[4.7%] border border-border/70 bg-muted" />
            <div className="absolute right-[32%] top-[30.5%] w-[3.2%] h-[4.2%] border border-border/70 bg-[color:var(--color-accent)]/80" />
            <div className="absolute right-[27%] top-[30.5%] w-[3.2%] h-[4.2%] border border-border/70 bg-[color:var(--color-primary)]/80" />

            {/* glow */}
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: focused ? [0.35, 0.6, 0.35] : [0.12, 0.25, 0.12] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{
                background: focused
                  ? `radial-gradient(ellipse at 50% 70%, color-mix(in oklab, var(--sanctuary-glow) 72%, var(--color-accent)), transparent 62%)`
                  : `radial-gradient(ellipse at 50% 65%, color-mix(in oklab, var(--sanctuary-glow) 55%, var(--sanctuary-wall)), transparent 62%)`,
              }}
            />

            {/* Path character — idle stroll via pan MV; tap = 2s stance (motion stops), then resume */}
            <div className="absolute bottom-[21%] left-1/2 -translate-x-1/2 overflow-visible px-10">
              <motion.div
                className={`flex flex-col items-center rounded-sm outline-none ${
                  pathCharacterClickable
                    ? "cursor-pointer select-none focus-visible:ring-2 focus-visible:ring-primary"
                    : ""
                }`}
                style={{ x: xPan }}
                initial={false}
                role={pathCharacterClickable ? "button" : undefined}
                tabIndex={pathCharacterClickable ? 0 : undefined}
                title={pathCharacterClickable ? "Tap for a quick acknowledgement" : undefined}
                onClick={pathCharacterClickable ? onSanctuaryPathCharacterTap : undefined}
                onKeyDown={
                  pathCharacterClickable
                    ? (e) => {
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        onSanctuaryPathCharacterTap();
                      }
                    : undefined
                }
              >
                {profile?.aura_path && sanctuarySpriteUrl ? (
                  showNativeSleepSprite ? (
                    <img
                      key={`${sanctuarySpriteUrl}-sleep-${sleepGifRestartKey}`}
                      src={sanctuarySpriteUrl}
                      alt={
                        showFallingSleepTransition
                          ? `${pathLabel} falling asleep`
                          : `${pathLabel} sleeping`
                      }
                      className="h-[140px] w-auto object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <motion.img
                      key={sanctuarySpriteUrl}
                      src={sanctuarySpriteUrl}
                      alt={`${pathLabel} character`}
                      className="h-[140px] w-auto object-contain"
                      style={{ imageRendering: "pixelated" }}
                      initial={false}
                      animate={
                        useSanctuaryStageFocusBob
                          ? { y: [0, -2, 0] }
                          : idleWander.walkDirection
                            ? { y: 0 }
                            : { y: [0, -1, 0] }
                      }
                      transition={{
                        duration: useSanctuaryStageFocusBob
                          ? 0.6
                          : idleWander.walkDirection
                            ? 0.2
                            : 1.6,
                        repeat:
                          useSanctuaryStageFocusBob ||
                          (!idleWander.walkDirection && characterState === "idle")
                            ? Infinity
                            : 0,
                        ease: "easeInOut",
                      }}
                    />
                  )
                ) : (
                  <div className="h-[140px] w-[120px] border-2 border-border bg-secondary/30 flex items-center justify-center text-sm text-muted-foreground">
                    Choose path
                  </div>
                )}
                <p
                  className="text-center mt-2 text-primary whitespace-nowrap"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
                >
                  {profile?.character_name ?? "Sprig"} ·{" "}
                  <span className="text-muted-foreground">{characterState}</span>
                </p>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Pomodoro */}
        <div className="space-y-4">
          <div className="pixel-panel p-6 text-center">
            <p
              className="text-xs text-muted-foreground mb-2"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {mode === "focus" ? "FOCUS" : "BREAK"}
            </p>
            <div
              className="text-5xl my-4"
              style={{
                fontFamily: "var(--font-pixel)",
                color: focused ? "var(--color-focus)" : "var(--color-primary)",
              }}
            >
              {fmt(secondsLeft)}
            </div>
            <div className="flex justify-center gap-2 mt-4">
              {!running ? (
                <button
                  onClick={start}
                  className="px-4 py-2 bg-primary text-primary-foreground flex items-center gap-2"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                >
                  <Play size={14} /> START
                </button>
              ) : (
                <button
                  onClick={pause}
                  className="px-4 py-2 bg-secondary border-2 border-border flex items-center gap-2"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                >
                  <Pause size={14} /> PAUSE
                </button>
              )}
              <button
                onClick={reset}
                className="px-4 py-2 bg-secondary border-2 border-border"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          <div className="pixel-panel p-4">
            <h3 className="text-sm text-primary mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
              TO-DO LIST
            </h3>
            {todos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No to-dos right now.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {todos.map((t) => (
                  <div key={t.id} className="border border-border p-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={t.completed}
                        onChange={(e) =>
                          updateTask.mutate({
                            id: t.id,
                            patch: {
                              completed: e.target.checked,
                              last_completed_at: new Date().toISOString(),
                            },
                          })
                        }
                      />
                      <span className={t.completed ? "line-through text-muted-foreground" : ""}>
                        {t.title}
                      </span>
                    </label>
                    {(t.checklist ?? []).length > 0 && (
                      <div className="mt-1 pl-5 space-y-1">
                        {(t.checklist ?? []).map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={c.done}
                              onChange={(e) =>
                                updateChecklist.mutate({
                                  id: c.id,
                                  patch: { done: e.target.checked },
                                })
                              }
                            />
                            <span className={c.done ? "line-through text-muted-foreground" : ""}>
                              {c.title}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Lo-fi music */}
          <div ref={menuContainerRef} className="pixel-panel p-4 relative">
            <div className="flex items-center gap-2 mb-2">
              <Music size={14} className="text-primary" />
              <span className="text-sm" style={{ fontFamily: "var(--font-pixel)" }}>
                Lo-fi Tavern
              </span>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="ml-auto text-muted-foreground hover:text-primary"
                title="Song menu"
              >
                <ListMusic size={16} />
              </button>
              <button
                onClick={nextTrack}
                className="text-muted-foreground hover:text-primary"
                title="Next sound"
              >
                <SkipForward size={16} />
              </button>
              <button onClick={toggleMute} className="text-muted-foreground hover:text-primary">
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
            {menuOpen && (
              <div className="absolute right-2 top-10 z-[80] w-48 pixel-panel p-2 space-y-1 bg-card">
                {trackSources.map((track, idx) => (
                  <button
                    key={track.label}
                    onClick={() => selectTrack(idx)}
                    className={`w-full text-left px-2 py-1.5 text-xs border ${
                      idx === trackIdx
                        ? "border-primary text-primary"
                        : "border-border hover:border-primary"
                    }`}
                    style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}
                  >
                    {track.label}
                  </button>
                ))}
              </div>
            )}
            <p
              className="text-sm text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {muted ? "Silence." : `♪ ${trackLabel}`}
            </p>
            <div className="mt-2 space-y-2">
              <div className="flex gap-1">
                <input
                  value={youtubeUrlInput}
                  onChange={(e) => setYoutubeUrlInput(e.target.value)}
                  placeholder="Paste YouTube URL..."
                  className="flex-1 bg-input border-2 border-border px-3 py-2 text-sm focus:border-primary outline-none"
                />
                <button
                  onClick={loadYouTubeTrack}
                  className="px-3 py-2 bg-primary text-primary-foreground text-sm"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  LOAD
                </button>
              </div>
              {youtubeEmbedUrl && (
                <div
                  id="aura-youtube-slot"
                  className="w-full h-40 border-2 border-border bg-black/60"
                />
              )}
            </div>
            <div className="mt-2 h-7 flex items-start gap-1 w-full overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="flex-1 h-full bg-primary origin-top"
                  animate={{ scaleY: muted ? 0.2 : [0.25, 0.9 - (i % 5) * 0.08, 0.35, 0.8, 0.25] }}
                  transition={{
                    duration: 1.2 + (i % 4) * 0.15,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.03,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
