import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";
import { RotateCcw, Music, SkipBack, SkipForward, Play, Pause, Square, ListMusic, Volume2, VolumeX, FolderOpen } from "lucide-react";
import { LocalMusicModal } from "@/components/aura/LocalMusicModal";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePomodoro } from "@/components/aura/PomodoroContext";
import { useProfile } from "@/hooks/useProfile";
import { useTasks, useUpdateTask, useUpdateChecklistItem } from "@/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  pathCharacterFallingSpriteSrc,
  pathCharacterSpriteSrc,
  pathCharacterWalkSpriteSrc,
  pathCharacterBedSpriteSrc,
} from "@/lib/aura/pathCharacterSprites";
import {
  SANCTUARY_CHARACTER_WALK_SPEED_PX_PER_SEC,
  SANCTUARY_WANDER_MIN_STEP_PX,
} from "@/lib/aura/sanctuaryCharacterWander";
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

// Bundled music — web fallback via Vite glob (empty in Electron builds; Electron uses IPC instead)
const _lofiGlob = import.meta.glob<string>(
  "/src/assets/music/lofi/*.{mp3,flac,wav,ogg,m4a,aac,opus,wma}",
  { eager: true, query: "?url", import: "default" },
);
const _ambientGlob = import.meta.glob<string>(
  "/src/assets/music/ambient/*.{mp3,flac,wav,ogg,m4a,aac,opus,wma}",
  { eager: true, query: "?url", import: "default" },
);
function _assetName(path: string) {
  const file = path.split("/").pop() ?? path;
  const dot = file.lastIndexOf(".");
  return dot > 0 ? file.slice(0, dot) : file;
}
const BUNDLED_LOFI_WEB = Object.entries(_lofiGlob)
  .map(([p, url]) => ({ name: _assetName(p), url }))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
const BUNDLED_AMBIENT_WEB = Object.entries(_ambientGlob)
  .map(([p, url]) => ({ name: _assetName(p), url }))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));

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

function ScrollingName({ name }: { name: string }) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [dist, setDist] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const d = inner.scrollWidth - outer.clientWidth;
    setDist(d > 4 ? d : 0);
  }, [name]);

  const scrollTime = dist > 0 ? Math.max(dist / 40, 0.8) : 0;
  const total = 4 + 2 * scrollTime;

  return (
    <span ref={outerRef} className="flex-1 min-w-0 overflow-hidden">
      {dist > 0 ? (
        <motion.span
          ref={innerRef}
          className="inline-block whitespace-nowrap"
          animate={{ x: [0, 0, -dist, -dist, 0] }}
          transition={{
            duration: total,
            times: [0, 2 / total, (2 + scrollTime) / total, (4 + scrollTime) / total, 1],
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {name}
        </motion.span>
      ) : (
        <span ref={innerRef} className="block truncate">{name}</span>
      )}
    </span>
  );
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
  const [isBackOrientation, setIsBackOrientation] = useState(false);
  const [isWalkingToBed, setIsWalkingToBed] = useState(false);

  const triggerSleepTransition = useCallback(() => {
    if (profile?.aura_path == null) return;
    if (!pathCharacterFallingSpriteSrc(profile.aura_path, isBackOrientation)) return;
    if (sleepTransitionTimeoutRef.current != null) {
      window.clearTimeout(sleepTransitionTimeoutRef.current);
      sleepTransitionTimeoutRef.current = null;
    }
    setShowFallingSleepTransition(true);
    sleepTransitionTimeoutRef.current = window.setTimeout(() => {
      sleepTransitionTimeoutRef.current = null;
      setShowFallingSleepTransition(false);
    }, FALL_ASLEEP_TRANSITION_MS);
  }, [profile?.aura_path, isBackOrientation]);

  const roamSanctuaryIdle =
    pathCharacterClickable && characterState === "idle" && !sanctuaryTapAcknowledge;
  const roamSanctuaryIdleRef = useRef(roamSanctuaryIdle);
  roamSanctuaryIdleRef.current = roamSanctuaryIdle;

  const idleWander = useSanctuaryIdleWander({
    roaming: roamSanctuaryIdle,
    resetHomeWhenRoamingEnds: characterState === "sleeping" || !pathCharacterClickable,
  });

  const prevWalkDirectionRef = useRef(idleWander.walkDirection);

  const xPan = useMotionValue(0);
  const sanctuaryPanCtlRef = useRef<ReturnType<typeof animate> | null>(null);
  const sanctuaryTapTimeoutRef = useRef<number | null>(null);
  const sanctuaryPausedStrideRef = useRef<{ endX: number; dir: "left" | "right" } | null>(null);
  const prevCharacterStateForPanRef = useRef(characterState);

  const sanctuarySpriteUrl = useMemo(() => {
    if (profile?.aura_path == null) return null;
    const path = profile.aura_path;

    // Working (stance) and tap acknowledgements always face front
    if (sanctuaryTapAcknowledge) return pathCharacterSpriteSrc(path, "working");

    if (isWalkingToBed) {
      return pathCharacterWalkSpriteSrc(path, xPan.get() > -60 ? "left" : "right");
    }

    if (characterState === "sleeping" && showFallingSleepTransition) {
      return (
        pathCharacterFallingSpriteSrc(path, isBackOrientation) ??
        pathCharacterSpriteSrc(path, "sleeping", isBackOrientation)
      );
    }
    if (characterState === "sleeping")
      return pathCharacterSpriteSrc(path, "sleeping", isBackOrientation);
    if (characterState === "working") return pathCharacterSpriteSrc(path, "working");

    if (idleWander.walkDirection === "left" || idleWander.walkDirection === "right") {
      return pathCharacterWalkSpriteSrc(path, idleWander.walkDirection);
    }

    return pathCharacterSpriteSrc(path, "idle", isBackOrientation);
  }, [
    profile?.aura_path,
    characterState,
    showFallingSleepTransition,
    idleWander.walkDirection,
    sanctuaryTapAcknowledge,
    isBackOrientation,
    isWalkingToBed,
    xPan,
  ]);

  useEffect(() => {
    if (idleWander.walkDirection === null) {
      // If we just stopped walking, 50/50 chance to face back
      if (prevWalkDirectionRef.current !== null) {
        setIsBackOrientation(Math.random() > 0.5);
      }
    } else {
      // While walking, always face front/side
      setIsBackOrientation(false);
    }
    prevWalkDirectionRef.current = idleWander.walkDirection;
  }, [idleWander.walkDirection]);

  useEffect(() => {
    const prev = previousCharacterStateRef.current;
    previousCharacterStateRef.current = characterState;

    if (prev !== "sleeping") {
      setIsWalkingToBed(true);
      setIsBackOrientation(false);
    }
  }, [characterState, profile?.aura_path]);

  useEffect(() => {
    if (characterState !== "sleeping") {
      setIsWalkingToBed(false);
      if (sleepTransitionTimeoutRef.current != null) {
        window.clearTimeout(sleepTransitionTimeoutRef.current);
        sleepTransitionTimeoutRef.current = null;
      }
      setShowFallingSleepTransition(false);
    }
  }, [characterState]);

  useEffect(() => {
    if (!isWalkingToBed) return;

    const from = xPan.get();
    const to = -130;
    const walkSpeed = SANCTUARY_CHARACTER_WALK_SPEED_PX_PER_SEC;
    const dur = Math.max(0.05, Math.abs(to - from) / walkSpeed);

      const ctl = animate(xPan, to, {
        duration: dur,
        ease: "linear",
        onComplete: () => {
          setIsWalkingToBed(false);
          // Stay in idle for 1s before falling asleep
          setTimeout(() => {
            if (characterStateRef.current === "sleeping") {
              triggerSleepTransition();
            }
          }, 1000);
        },
      });

    return () => ctl.stop();
  }, [isWalkingToBed, xPan, triggerSleepTransition]);

  useEffect(() => {
    if (isWalkingToBed) return;
    sanctuaryPanCtlRef.current?.stop();
    const pathOk = pathCharacterClickable;
    const panSpeed = idleWander.strideSpeedPxPerSec;

    const prevChar = prevCharacterStateForPanRef.current;
    prevCharacterStateForPanRef.current = characterState;

    if (sanctuaryTapAcknowledge && characterState === "idle" && pathOk) {
      return () => sanctuaryPanCtlRef.current?.stop();
    }

    if (!pathOk || (characterState === "sleeping" && !isWalkingToBed)) {
      // If we are sleeping and not currently walking to the bed,
      // we should be at the target position.
      // (The initial transition to sleeping state triggers isWalkingToBed=true).
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
      if (sleepTransitionTimeoutRef.current != null) window.clearTimeout(sleepTransitionTimeoutRef.current);
      if (volHideTimerRef.current != null) window.clearTimeout(volHideTimerRef.current);
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
  const [trackLabel, setTrackLabel] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [localModalOpen, setLocalModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"lofi" | "ambient" | "file">("lofi");

  // User file library (desktop only)
  type UserTrack = { name: string; url: string };
  const [fileFolder, setFileFolder] = useState<string | null>(
    () => (typeof window !== "undefined" ? localStorage.getItem("aura:file-folder") : null),
  );
  const [fileTracks, setFileTracks] = useState<UserTrack[]>([]);
  const [sharedMusicFolder, setSharedMusicFolder] = useState<string | null>(
    () => typeof window !== "undefined" ? localStorage.getItem("aura:local-music-folder") : null,
  );
  const [bundledLofi, setBundledLofi] = useState<UserTrack[]>(BUNDLED_LOFI_WEB);
  const [bundledAmbient, setBundledAmbient] = useState<UserTrack[]>(BUNDLED_AMBIENT_WEB);
  const [lofiLibTracks, setLofiLibTracks] = useState<UserTrack[]>([]);
  const [ambientLibTracks, setAmbientLibTracks] = useState<UserTrack[]>([]);
  const [playingUserUrl, setPlayingUserUrl] = useState<string | null>(null);
  const [volumeMuted, setVolumeMuted] = useState(false);
  const [volume, setVolume] = useState(0.35);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const volHideTimerRef = useRef<number | null>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [dropdownMaxH, setDropdownMaxH] = useState(480);
  const [youtubeUrlInput, setYoutubeUrlInput] = useState("");
  const [youtubeEmbedUrl, setYoutubeEmbedUrl] = useState<string | null>(null);
  const todos = tasks.filter((t) => t.type === "todo").slice(0, 8);

  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0.35;
    audio.preload = "auto";

    const onTimeUpdate = () => {
      setAudioProgress(audio.currentTime);
      // Fallback: grab duration on every tick in case loadedmetadata was missed
      if (isFinite(audio.duration) && audio.duration > 0) setAudioDuration(audio.duration);
    };
    const onDuration = () => {
      if (isFinite(audio.duration) && audio.duration > 0) setAudioDuration(audio.duration);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onDuration);
    audio.addEventListener("durationchange", onDuration);
    audio.addEventListener("canplay", onDuration);

    audioRef.current = audio;
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onDuration);
      audio.removeEventListener("durationchange", onDuration);
      audio.removeEventListener("canplay", onDuration);
      audio.pause();
      audioRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (window.electronAPI) return; // YouTube not supported in desktop app
    const saved = window.localStorage.getItem("aura:youtube-embed-url");
    if (saved) {
      setYoutubeEmbedUrl(saved);
      setTrackLabel("youtube");
      setMuted(false);
    }
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    void supabase.rpc("ensure_quest_arc_started" as any, { p_arc_slug: "shadow-cleansing" });
  }, [profile?.id]);

  useEffect(() => {
    if (!menuOpen || !menuContainerRef.current) return;
    const rect = menuContainerRef.current.getBoundingClientRect();
    const available = window.innerHeight - rect.top - 12;
    setDropdownMaxH(Math.min(480, Math.max(200, available)));
  }, [menuOpen]);

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

  // When the local music modal starts playing, pause audio/YouTube
  useEffect(() => {
    const onLocalStart = (e: Event) => {
      const name = (e as CustomEvent<{ name: string }>).detail?.name ?? "local track";
      audioRef.current?.pause();
      window.dispatchEvent(new Event("aura:clear-youtube-audio"));
      setTrackLabel(name);
      setMuted(false);
    };
    window.addEventListener("aura:local-start", onLocalStart);
    return () => window.removeEventListener("aura:local-start", onLocalStart);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-read shared folder when the local music modal closes (user may have just picked one)
  useEffect(() => {
    if (localModalOpen) return;
    const stored = localStorage.getItem("aura:local-music-folder");
    setSharedMusicFolder(stored);
  }, [localModalOpen]);

  // Desktop: scan shared music folder and populate My Music tab
  useEffect(() => {
    if (!window.electronAPI || !sharedMusicFolder) return;
    void window.electronAPI.scanMusicFolder(sharedMusicFolder).then((tracks) => {
      const mapped = tracks.map((t) => ({ name: t.name, url: window.electronAPI!.fileToUrl(t.path) }));
      setFileTracks(mapped);
    });
  }, [sharedMusicFolder]);

  useEffect(() => {
    if (!window.electronAPI) return;
    void window.electronAPI.getBundledTracks().then(({ lofi, ambient }) => {
      setBundledLofi(lofi.map((t) => ({ name: t.name, url: window.electronAPI!.fileToUrl(t.path) })));
      setBundledAmbient(ambient.map((t) => ({ name: t.name, url: window.electronAPI!.fileToUrl(t.path) })));
    });
  }, []);

  const lofiTracks = useMemo(() => [...bundledLofi, ...lofiLibTracks], [bundledLofi, lofiLibTracks]);
  const ambientTracks = useMemo(() => [...bundledAmbient, ...ambientLibTracks], [bundledAmbient, ambientLibTracks]);

  const playUserTrack = async (track: UserTrack, name: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    setYoutubeEmbedUrl(null);
    window.dispatchEvent(new Event("aura:clear-youtube-audio"));
    window.dispatchEvent(new Event("aura:stream-start"));
    audio.src = track.url;
    audio.load();
    await audio.play().catch(() => {});
    audio.muted = volumeMuted;
    setTrackLabel(name);
    setPlayingUserUrl(track.url);
    setMuted(false);
    window.dispatchEvent(new CustomEvent("aura:music-playing", { detail: { playing: true, label: name } }));
  };

  const pickFileFolder = async () => {
    const picked = await window.electronAPI?.pickMusicFolder();
    if (!picked) return;
    setFileFolder(picked);
    localStorage.setItem("aura:file-folder", picked);
    const tracks = await window.electronAPI!.scanMusicFolder(picked);
    setFileTracks(tracks.map((t) => ({ name: t.name, url: window.electronAPI!.fileToUrl(t.path) })));
  };

  const toggleMute = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (muted) {
      if (playingUserUrl) {
        try {
          await audio.play();
          audio.muted = volumeMuted;
          setMuted(false);
        } catch (err) {
          const errName = err instanceof DOMException ? err.name : "UnknownError";
          if (errName === "NotAllowedError") {
            toast.error("Browser blocked autoplay. Click again after interacting with the page.");
          } else {
            toast.error("Could not resume track.");
          }
        }
      } else {
        const tracks = activeCategory === "lofi" ? lofiTracks : activeCategory === "ambient" ? ambientTracks : fileTracks;
        if (tracks.length > 0) await playUserTrack(tracks[0], tracks[0].name);
      }
      return;
    }

    audio.pause();
    setMuted(true);
    window.dispatchEvent(new CustomEvent("aura:music-playing", { detail: { playing: false } }));
  };

  const toggleVolume = () => {
    const next = !volumeMuted;
    setVolumeMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  };

  const setAudioVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
      if (clamped > 0 && volumeMuted) {
        setVolumeMuted(false);
        audioRef.current.muted = false;
      }
    }
  };

  const onVolEnter = () => {
    if (volHideTimerRef.current) { clearTimeout(volHideTimerRef.current); volHideTimerRef.current = null; }
    setShowVolumeSlider(true);
  };
  const onVolLeave = () => {
    volHideTimerRef.current = window.setTimeout(() => setShowVolumeSlider(false), 150);
  };

  const prevTrack = async () => {
    const tracks = activeCategory === "lofi" ? lofiTracks : activeCategory === "ambient" ? ambientTracks : fileTracks;
    if (tracks.length === 0) return;
    const idx = playingUserUrl ? tracks.findIndex((t) => t.url === playingUserUrl) : -1;
    const newIdx = idx <= 0 ? tracks.length - 1 : idx - 1;
    await playUserTrack(tracks[newIdx], tracks[newIdx].name);
  };

  const nextTrack = async () => {
    const tracks = activeCategory === "lofi" ? lofiTracks : activeCategory === "ambient" ? ambientTracks : fileTracks;
    if (tracks.length === 0) return;
    const idx = playingUserUrl ? tracks.findIndex((t) => t.url === playingUserUrl) : -1;
    const newIdx = idx < 0 || idx >= tracks.length - 1 ? 0 : idx + 1;
    await playUserTrack(tracks[newIdx], tracks[newIdx].name);
  };

  const stopTrack = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    setYoutubeEmbedUrl(null);
    window.dispatchEvent(new Event("aura:clear-youtube-audio"));
    window.dispatchEvent(new CustomEvent("aura:music-playing", { detail: { playing: false } }));
    setPlayingUserUrl(null);
    setTrackLabel("");
    setAudioProgress(0);
    setAudioDuration(0);
    setMuted(true);
  };

  const loadYouTubeTrack = () => {
    const videoId = getYouTubeVideoId(youtubeUrlInput);
    if (!videoId) {
      toast.error("Invalid YouTube URL.");
      return;
    }

    audioRef.current?.pause();
    setMuted(false);
    setMenuOpen(false);
    setTrackLabel("youtube");
    const embed = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&playsinline=1`;
    setYoutubeEmbedUrl(embed);
    window.dispatchEvent(
      new CustomEvent("aura:set-youtube-audio", { detail: { embedUrl: embed } }),
    );
    toast.success("YouTube track loaded.");
  };

  return (
    <>
    <div className="p-3 md:p-6 max-w-6xl mx-auto">
      <div className="mb-3 flex items-center justify-end">
        <div className="px-2 py-1 border border-border bg-secondary/30 text-xs text-muted-foreground capitalize">
          Path: {profile?.aura_path ? pathLabel : "unbound"}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* The Sanctuary room */}
        <div className="lg:col-span-2 hidden md:block">
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
            {/* character bed — replaces glowing square */}
            {profile?.aura_path && pathCharacterBedSpriteSrc(profile.aura_path) ? (
              <div className="absolute left-[2%] top-[37%] w-[58%] h-[45%] pointer-events-none">
                <img
                  src={pathCharacterBedSpriteSrc(profile.aura_path)!}
                  alt="Character bed"
                  className="w-full h-full object-contain"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            ) : (
              <motion.div
                className="absolute left-[27.8%] top-[55.5%] w-[2.4%] h-[4.5%]"
                animate={{ opacity: [0.45, 0.95, 0.45], y: [0, -1, 0] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                style={{ background: "var(--color-primary)" }}
              />
            )}

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

            {/* Path character — hidden on mobile, visible on md+ */}
            <div className="absolute bottom-[21%] left-1/2 -translate-x-1/2 overflow-visible px-10 hidden md:block">
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
                      className="h-22.5 md:h-35 w-auto object-contain"
                      style={{ imageRendering: "pixelated" }}
                    />
                  ) : (
                    <motion.img
                      key={sanctuarySpriteUrl}
                      src={sanctuarySpriteUrl}
                      alt={`${pathLabel} character`}
                      className="h-22.5 md:h-35 w-auto object-contain"
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
                ) : null}
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
          <div className="pixel-panel p-4 md:p-6 text-center">
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
                  className="px-4 py-2 bg-primary text-primary-foreground"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                >
                  START
                </button>
              ) : (
                <button
                  onClick={pause}
                  className="px-4 py-2 bg-secondary border-2 border-border"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                >
                  PAUSE
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
            {/* Title row */}
            <div className="flex items-center gap-2 mb-2">
              <Music size={14} className="text-primary" />
              <span className="text-sm flex-1" style={{ fontFamily: "var(--font-pixel)" }}>
                Lo-fi Tavern
              </span>
              {window.electronAPI && (
                <button
                  onClick={() => setLocalModalOpen(true)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Local music library"
                >
                  <FolderOpen size={14} />
                </button>
              )}
            </div>
            {/* Controls row: [ListMusic] [Prev/Play/Next] [Volume] */}
            <div className="flex items-center justify-between mb-2">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="text-muted-foreground hover:text-primary"
                title="Song menu"
              >
                <ListMusic size={16} />
              </button>
              <div className="flex items-center gap-3">
                <button onClick={prevTrack} className="text-muted-foreground hover:text-primary" title="Previous">
                  <SkipBack size={16} />
                </button>
                <button onClick={stopTrack} className="text-muted-foreground hover:text-destructive" title="Stop">
                  <Square size={13} fill="currentColor" />
                </button>
                <button onClick={toggleMute} className="text-muted-foreground hover:text-primary" title={muted ? "Play" : "Pause"}>
                  {muted ? <Play size={16} fill="currentColor" /> : <Pause size={16} />}
                </button>
                <button onClick={nextTrack} className="text-muted-foreground hover:text-primary" title="Next">
                  <SkipForward size={16} />
                </button>
              </div>
              <button onClick={() => setShowVolumeSlider((v) => !v)} className="text-muted-foreground hover:text-primary" title="Volume">
                {volumeMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
            {/* Volume popup — floating on desktop, full-overlay on mobile */}
            <AnimatePresence>
            {showVolumeSlider && (
              <motion.div
                className={[
                  "absolute z-80 pixel-panel bg-card shadow-xl",
                  // mobile: full-panel overlay
                  "inset-0 flex flex-col items-center justify-center gap-3",
                  // sm+: vertical slider popup to the RIGHT of the panel
                  "sm:inset-auto sm:top-0 sm:left-[calc(100%+8px)] sm:px-2 sm:py-2.5 sm:flex-col sm:items-center sm:gap-1.5",
                ].join(" ")}
                style={{ transformOrigin: "left top" }}
                initial={{ opacity: 0, scale: 0.88, x: -8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.88, x: -8 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                onClick={() => setShowVolumeSlider(false)}
              >
                {/* Mobile header row with mute toggle */}
                <div className="flex items-center gap-2 sm:hidden">
                  <button onClick={(e) => { e.stopPropagation(); toggleVolume(); }} className="text-muted-foreground hover:text-primary">
                    {volumeMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <span className="text-muted-foreground/60 tabular-nums" style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}>
                    VOLUME — {volumeMuted ? "0" : Math.round(volume * 100)}%
                  </span>
                </div>
                {/* Desktop: compact percentage label */}
                <span className="hidden sm:block text-muted-foreground/60 tabular-nums" style={{ fontFamily: "var(--font-pixel)", fontSize: 7 }}>
                  {volumeMuted ? "0" : Math.round(volume * 100)}
                </span>
                {/* Slider — horizontal on mobile, vertical on desktop */}
                <div
                  className="relative cursor-pointer group/vol sm:hidden"
                  style={{ width: 160, height: 10 }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const seek = (x: number) => setAudioVolume((x - rect.left) / rect.width);
                    seek(e.clientX);
                    const onMove = (ev: MouseEvent) => seek(ev.clientX);
                    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                >
                  <div className="absolute inset-0 bg-border/40" />
                  <div className="absolute left-0 top-0 bottom-0 bg-primary" style={{ width: `${volumeMuted ? 0 : volume * 100}%` }} />
                  <div className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-primary opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none" style={{ left: `calc(${volumeMuted ? 0 : volume * 100}% - 2px)` }} />
                </div>
                {/* Vertical slider — desktop only */}
                <div
                  className="relative cursor-pointer group/vol hidden sm:block"
                  style={{ width: 8, height: 72 }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    const rect = e.currentTarget.getBoundingClientRect();
                    const seek = (y: number) => setAudioVolume((rect.bottom - y) / rect.height);
                    seek(e.clientY);
                    const onMove = (ev: MouseEvent) => seek(ev.clientY);
                    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
                    document.addEventListener("mousemove", onMove);
                    document.addEventListener("mouseup", onUp);
                  }}
                >
                  <div className="absolute inset-0 bg-border/40" />
                  <div className="absolute bottom-0 left-0 right-0 bg-primary" style={{ height: `${volumeMuted ? 0 : volume * 100}%` }} />
                  <div className="absolute left-1/2 -translate-x-1/2 w-3 h-1 bg-primary opacity-0 group-hover/vol:opacity-100 transition-opacity pointer-events-none" style={{ bottom: `calc(${volumeMuted ? 0 : volume * 100}% - 2px)` }} />
                </div>
                <span className="sm:hidden text-muted-foreground/40" style={{ fontFamily: "var(--font-pixel)", fontSize: 7 }}>
                  tap anywhere to close
                </span>
              </motion.div>
            )}
            </AnimatePresence>
            {/* Song list — floating dropdown on desktop, full-overlay on mobile */}
            <AnimatePresence>
            {menuOpen && (
              <motion.div
                className={[
                  "absolute z-80 pixel-panel bg-card shadow-xl flex flex-col",
                  // mobile: full-panel overlay
                  "inset-0",
                  // sm+: floating panel to the LEFT of the Lo-fi Tavern card
                  "sm:inset-auto sm:w-72 sm:right-[calc(100%+8px)] sm:top-0",
                ].join(" ")}
                style={{ transformOrigin: "right top", maxHeight: dropdownMaxH }}
                initial={{ opacity: 0, scale: 0.92, x: 8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.92, x: 8 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
              >
                {/* Now playing header */}
                <div className="px-3 py-2 bg-muted/20 border-b border-border flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-muted-foreground mb-0.5" style={{ fontFamily: "var(--font-pixel)", fontSize: 7 }}>
                      NOW PLAYING
                    </div>
                    <div className="text-primary truncate" style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                      {muted ? "—" : trackLabel}
                    </div>
                  </div>
                  {!muted && (
                    <div className="flex items-end gap-px h-3.5 shrink-0">
                      {[0, 1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          className="w-0.5 bg-primary"
                          animate={{ height: ["25%", "100%", "55%", "80%", "25%"] }}
                          transition={{ duration: 0.85, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" }}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="ml-2 shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                    style={{ fontFamily: "var(--font-pixel)", fontSize: 12, lineHeight: 1 }}
                    title="Close"
                  >
                    ×
                  </button>
                </div>

                {/* Category tabs */}
                <div className="flex border-b border-border">
                  <button
                    onClick={() => setActiveCategory("lofi")}
                    className={`flex-1 py-1.5 text-center transition-colors ${
                      activeCategory === "lofi"
                        ? "bg-primary/15 text-primary border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
                    }`}
                    style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}
                  >
                    LO-FI
                  </button>
                  <button
                    onClick={() => setActiveCategory("ambient")}
                    className={`flex-1 py-1.5 text-center transition-colors ${
                      activeCategory === "ambient"
                        ? "bg-primary/15 text-primary border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
                    }`}
                    style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}
                  >
                    AMBIENT
                  </button>
                  {(fileTracks.length > 0 || sharedMusicFolder) && (
                    <button
                      onClick={() => setActiveCategory("file")}
                      className={`flex-1 py-1.5 text-center transition-colors ${
                        activeCategory === "file"
                          ? "bg-primary/15 text-primary border-b-2 border-primary"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/10"
                      }`}
                      style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}
                    >
                      MY MUSIC
                    </button>
                  )}
                </div>

                {/* Tab content */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {activeCategory === "lofi" && (
                    <div className="px-1.5 pt-1.5 pb-1.5">
                      {lofiTracks.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-5 px-3 text-center">
                          <p className="text-muted-foreground/60" style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}>
                            No audio files found
                          </p>
                        </div>
                      ) : (
                        <>
                          {lofiTracks.map((t) => {
                            const active = !muted && playingUserUrl === t.url;
                            return (
                              <button key={t.url} onClick={() => void playUserTrack(t, t.name)}
                                className={`w-full text-left px-2 py-1.5 flex items-center gap-2 border-l-2 transition-colors ${active ? "border-l-primary text-primary bg-primary/10" : "border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20 hover:border-l-primary/40"}`}
                                style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                                <span className={active ? "text-primary" : "opacity-40"}>♪</span>
                                <ScrollingName name={t.name} />
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}

                  {activeCategory === "ambient" && (
                    <div className="px-1.5 pt-1.5 pb-1.5">
                      {ambientTracks.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-5 px-3 text-center">
                          <p className="text-muted-foreground/60" style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}>
                            No audio files found
                          </p>
                        </div>
                      ) : (
                        <>
                          {ambientTracks.map((t) => {
                            const active = !muted && playingUserUrl === t.url;
                            return (
                              <button key={t.url} onClick={() => void playUserTrack(t, t.name)}
                                className={`w-full text-left px-2 py-1.5 flex items-center gap-2 border-l-2 transition-colors ${active ? "border-l-primary text-primary bg-primary/10" : "border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20 hover:border-l-primary/40"}`}
                                style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                                <span className={active ? "text-primary" : "opacity-40"}>≋</span>
                                <ScrollingName name={t.name} />
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}

                  {activeCategory === "file" && (
                    <div className="px-1.5 pt-1.5 pb-1.5">
                      {fileTracks.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 py-5 px-3 text-center">
                          <p className="text-muted-foreground/60" style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}>
                            {sharedMusicFolder ? "No audio files found" : "Use the folder icon above to pick your music library"}
                          </p>
                        </div>
                      ) : (
                        <>
                          {fileTracks.map((t) => {
                            const active = !muted && playingUserUrl === t.url;
                            return (
                              <button key={t.url} onClick={() => void playUserTrack(t, t.name)}
                                className={`w-full text-left px-2 py-1.5 flex items-center gap-2 border-l-2 transition-colors ${active ? "border-l-primary text-primary bg-primary/10" : "border-l-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20 hover:border-l-primary/40"}`}
                                style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}>
                                <span className={active ? "text-primary" : "opacity-40"}>♫</span>
                                <ScrollingName name={t.name} />
                              </button>
                            );
                          })}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
            </AnimatePresence>
            <div className="flex items-center gap-2 min-w-0">
              <p
                className="text-sm text-muted-foreground flex-1 min-w-0 truncate"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {muted ? "Silence." : `♪ ${trackLabel}`}
              </p>
              {!muted && playingUserUrl && (
                <span
                  className="shrink-0 tabular-nums text-muted-foreground/60"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 8 }}
                >
                  {audioDuration > 0
                    ? `${fmt(Math.floor(audioProgress))} / ${fmt(Math.floor(audioDuration))}`
                    : fmt(Math.floor(audioProgress))}
                </span>
              )}
            </div>
            {!muted && playingUserUrl && (
              <div
                className="mt-1.5 mb-0.5 relative cursor-pointer group"
                style={{ padding: "5px 0" }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const seek = (clientX: number) => {
                    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
                    const audio = audioRef.current;
                    if (audio && isFinite(audio.duration) && audio.duration > 0) {
                      audio.currentTime = ratio * audio.duration;
                    }
                  };
                  seek(e.clientX);
                  const onMove = (ev: MouseEvent) => seek(ev.clientX);
                  const onUp = () => {
                    document.removeEventListener("mousemove", onMove);
                    document.removeEventListener("mouseup", onUp);
                  };
                  document.addEventListener("mousemove", onMove);
                  document.addEventListener("mouseup", onUp);
                }}
              >
                <div className="h-1 bg-border/40 relative overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: audioDuration > 0 ? `${(audioProgress / audioDuration) * 100}%` : "0%" }}
                  />
                </div>
                <div
                  className="absolute w-2.5 h-2.5 rounded-full bg-primary shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{ left: `${audioDuration > 0 ? (audioProgress / audioDuration) * 100 : 0}%`, top: "50%", transform: "translate(-50%, -50%)" }}
                />
              </div>
            )}
            {!window.electronAPI && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-col gap-1">
                  <input
                    value={youtubeUrlInput}
                    onChange={(e) => setYoutubeUrlInput(e.target.value)}
                    placeholder="Paste YouTube URL..."
                    className="w-full bg-input border-2 border-border px-3 py-2 text-sm focus:border-primary outline-none"
                  />
                  <button
                    onClick={loadYouTubeTrack}
                    className="w-full px-3 py-2 bg-primary text-primary-foreground text-sm"
                    style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
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
            )}
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

    {window.electronAPI && (
      <LocalMusicModal isOpen={localModalOpen} onClose={() => setLocalModalOpen(false)} />
    )}
    </>
  );
}
