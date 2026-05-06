import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Play, Pause, RotateCcw, Music, Volume2, VolumeX } from "lucide-react";
import { useState } from "react";
import { usePomodoro } from "@/components/aura/PomodoroContext";
import { PetSprite } from "@/components/aura/PetSprite";
import { useProfile } from "@/hooks/useProfile";

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

function SanctuaryPage() {
  const { running, mode, secondsLeft, start, pause, reset, petState } = usePomodoro();
  const { data: profile } = useProfile();
  const [muted, setMuted] = useState(true);

  const focused = petState === "working";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* The Sanctuary room */}
        <div className="lg:col-span-2">
          <div className="relative aspect-[16/10] pixel-panel overflow-hidden scanlines"
            style={{
              background: focused
                ? "linear-gradient(180deg, oklch(0.22 0.07 235), oklch(0.15 0.06 240))"
                : "linear-gradient(180deg, oklch(0.25 0.06 240), oklch(0.18 0.05 240))",
              transition: "background 1.2s ease",
            }}
          >
            {/* floor */}
            <div className="absolute bottom-0 left-0 right-0 h-1/3"
              style={{ background: "linear-gradient(180deg, transparent, var(--sanctuary-floor))" }}
            />
            {/* glow */}
            <motion.div
              className="absolute inset-0"
              animate={{ opacity: focused ? [0.3, 0.55, 0.3] : [0.15, 0.3, 0.15] }}
              transition={{ duration: 4, repeat: Infinity }}
              style={{
                background: `radial-gradient(circle at 50% 60%, var(--sanctuary-glow), transparent 65%)`,
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
          <div className="pixel-panel p-4">
            <div className="flex items-center gap-2 mb-2">
              <Music size={14} className="text-primary" />
              <span className="text-xs" style={{ fontFamily: "var(--font-pixel)" }}>Lo-fi Tavern</span>
              <button onClick={() => setMuted(m => !m)} className="ml-auto text-muted-foreground hover:text-primary">
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-display)" }}>
              {muted ? "Silence." : "♪ chillhop fireplace.wav"}
            </p>
            <div className="mt-2 flex gap-1">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 bg-primary"
                  animate={{ height: muted ? 4 : [4, 8 + Math.random() * 16, 4] }}
                  transition={{ duration: 0.6 + Math.random(), repeat: Infinity }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
