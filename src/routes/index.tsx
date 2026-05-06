import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw, Music, SkipForward, ListMusic, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePomodoro } from "@/components/aura/PomodoroContext";
import { PetSprite } from "@/components/aura/PetSprite";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sanctuary — Aura" },
      { name: "description", content: "Your peaceful focus room with your pet companion." },
    ],
  }),
  component: SanctuaryPage,
});

function fmt(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
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
  const { running, mode, secondsLeft, start, pause, reset, petState } = usePomodoro();
  const { data: profile } = useProfile();
  const [muted, setMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const stopGeneratedRef = useRef<(() => void) | null>(null);

  const focused = petState === "working";
  const [trackLabel, setTrackLabel] = useState("chillhop stream");
  const [trackIdx, setTrackIdx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
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
        gain.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.05, now + 0.09 + Math.random() * 0.12);
      }, 110);
    }

    stopGeneratedRef.current = () => {
      if (crackleTimer) window.clearInterval(crackleTimer);
      try { src.stop(); } catch { /* no-op */ }
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
    window.dispatchEvent(new CustomEvent("aura:set-youtube-audio", { detail: { embedUrl: embed } }));
    toast.success("YouTube track loaded.");
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* The Sanctuary room */}
        <div className="lg:col-span-2">
          <div className="relative aspect-[16/10] pixel-panel overflow-hidden scanlines"
            style={{
              background: focused
                ? "linear-gradient(180deg, oklch(0.18 0.09 42) 0%, oklch(0.12 0.07 38) 60%, oklch(0.09 0.04 35) 100%)"
                : "linear-gradient(180deg, oklch(0.17 0.05 260) 0%, oklch(0.12 0.04 255) 55%, oklch(0.09 0.02 250) 100%)",
              transition: "background 1.4s ease",
            }}
          >
            {/* floor */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3"
              style={{
                background: focused
                  ? "linear-gradient(180deg, transparent, oklch(0.14 0.05 40))"
                  : "linear-gradient(180deg, transparent, oklch(0.10 0.03 258))"
              }}
            />
            {/* glow */}
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: focused ? [0.35, 0.6, 0.35] : [0.12, 0.25, 0.12] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{
                background: focused
                  ? `radial-gradient(ellipse at 50% 70%, oklch(0.55 0.18 55), transparent 62%)`
                  : `radial-gradient(ellipse at 50% 65%, oklch(0.38 0.12 200), transparent 62%)`,
              }}
            />
            {/* window */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-24 h-16 border-2 border-border bg-card/40">
              <div className="grid grid-cols-2 grid-rows-2 h-full">
                <div className="border border-border/50" />
                <div className="border border-border/50" />
                <div className="border border-border/50" />
                <div className="border border-border/50" />
              </div>
            </div>
            {/* pet center stage */}
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
              <PetSprite state={petState} size={140} />
              <p className="text-center mt-2 text-primary" style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}>
                {profile?.pet_name ?? "Sprig"} · <span className="text-muted-foreground">{petState}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Pomodoro */}
        <div className="space-y-4">
          <div className="pixel-panel p-6 text-center">
            <p className="text-xs text-muted-foreground mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
              {mode === "focus" ? "FOCUS" : "BREAK"}
            </p>
            <div className="text-5xl my-4" style={{ fontFamily: "var(--font-pixel)", color: focused ? "var(--color-focus)" : "var(--color-primary)" }}>
              {fmt(secondsLeft)}
            </div>
            <div className="flex justify-center gap-2 mt-4">
              {!running ? (
                <button onClick={start} className="px-4 py-2 bg-primary text-primary-foreground flex items-center gap-2"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                  <Play size={14} /> START
                </button>
              ) : (
                <button onClick={pause} className="px-4 py-2 bg-secondary border-2 border-border flex items-center gap-2"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                  <Pause size={14} /> PAUSE
                </button>
              )}
              <button onClick={reset} className="px-4 py-2 bg-secondary border-2 border-border"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}>
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {/* Lo-fi music */}
          <div className="pixel-panel p-4 relative">
            <div className="flex items-center gap-2 mb-2">
              <Music size={14} className="text-primary" />
              <span className="text-sm" style={{ fontFamily: "var(--font-pixel)" }}>Lo-fi Tavern</span>
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
                      idx === trackIdx ? "border-primary text-primary" : "border-border hover:border-primary"
                    }`}
                    style={{ fontFamily: "var(--font-pixel)", fontSize: 9 }}
                  >
                    {track.label}
                  </button>
                ))}
              </div>
            )}
            <p className="text-sm text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
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
                <div id="aura-youtube-slot" className="w-full h-40 border-2 border-border bg-black/60" />
              )}
            </div>
            <div className="mt-2 h-7 flex items-start gap-1 w-full overflow-hidden">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="flex-1 h-full bg-primary origin-top"
                  animate={{ scaleY: muted ? 0.2 : [0.25, 0.9 - (i % 5) * 0.08, 0.35, 0.8, 0.25] }}
                  transition={{ duration: 1.2 + (i % 4) * 0.15, repeat: Infinity, ease: "easeInOut", delay: i * 0.03 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
