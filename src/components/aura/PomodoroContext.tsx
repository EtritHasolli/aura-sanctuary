import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Mode = "focus" | "break";

interface Ctx {
  running: boolean;
  mode: Mode;
  secondsLeft: number;
  focusMinutes: number;
  breakMinutes: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  updateDurations: (durations: { focusMinutes: number; breakMinutes: number }) => void;
  petState: "idle" | "working" | "sleeping";
  onCycleComplete?: (cb: () => void) => void;
}

const PomodoroCtx = createContext<Ctx | null>(null);

const FOCUS_SECS = 25 * 60;
const BREAK_SECS = 5 * 60;
const MIN_MINUTES = 1;
const FOCUS_STORAGE_KEY = "aura:pomodoro-focus-minutes";
const BREAK_STORAGE_KEY = "aura:pomodoro-break-minutes";

function sanitizeMinutes(v: number, fallback: number) {
  if (!Number.isFinite(v)) return fallback;
  const rounded = Math.round(v);
  return Math.max(MIN_MINUTES, rounded);
}

function readStoredMinutes(key: string, fallback: number) {
  if (typeof window === "undefined") return fallback;
  const value = Number(window.localStorage.getItem(key));
  return sanitizeMinutes(value, fallback);
}

export function PomodoroProvider({ children, onFocusComplete }: { children: ReactNode; onFocusComplete?: () => void }) {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("focus");
  const [focusMinutes, setFocusMinutes] = useState(() => readStoredMinutes(FOCUS_STORAGE_KEY, FOCUS_SECS / 60));
  const [breakMinutes, setBreakMinutes] = useState(() => readStoredMinutes(BREAK_STORAGE_KEY, BREAK_SECS / 60));
  const [secondsLeft, setSecondsLeft] = useState(() => readStoredMinutes(FOCUS_STORAGE_KEY, FOCUS_SECS / 60) * 60);
  const [idleTicks, setIdleTicks] = useState(0);
  const cbRef = useRef(onFocusComplete);
  cbRef.current = onFocusComplete;

  useEffect(() => {
    if (!running) {
      const t = setInterval(() => setIdleTicks(x => x + 1), 1000);
      return () => clearInterval(t);
    }
    setIdleTicks(0);
    const t = setInterval(() => {
      setSecondsLeft(s => {
        if (s > 1) return s - 1;
        // cycle complete
        if (mode === "focus") {
          cbRef.current?.();
          if (typeof window !== "undefined") window.dispatchEvent(new Event("aura:focus-complete"));
          setMode("break");
          return breakMinutes * 60;
        } else {
          setMode("focus");
          return focusMinutes * 60;
        }
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, mode, focusMinutes, breakMinutes]);

  const petState: Ctx["petState"] =
    running && mode === "focus" ? "working" :
    idleTicks > 60 ? "sleeping" : "idle";

  // toggle the focused theme on the html element when working
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-focused", petState === "working");
  }, [petState]);

  const updateDurations: Ctx["updateDurations"] = ({ focusMinutes, breakMinutes }) => {
    const nextFocus = sanitizeMinutes(focusMinutes, FOCUS_SECS / 60);
    const nextBreak = sanitizeMinutes(breakMinutes, BREAK_SECS / 60);
    setFocusMinutes(nextFocus);
    setBreakMinutes(nextBreak);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, String(nextFocus));
      window.localStorage.setItem(BREAK_STORAGE_KEY, String(nextBreak));
    }

    // Keep the active timer in sync with updated settings.
    setSecondsLeft((current) => {
      if (running) return current;
      return mode === "focus" ? nextFocus * 60 : nextBreak * 60;
    });
  };

  const value: Ctx = {
    running, mode, secondsLeft, focusMinutes, breakMinutes,
    start: () => setRunning(true),
    pause: () => setRunning(false),
    reset: () => { setRunning(false); setMode("focus"); setSecondsLeft(focusMinutes * 60); },
    updateDurations,
    petState,
  };
  return <PomodoroCtx.Provider value={value}>{children}</PomodoroCtx.Provider>;
}

export function usePomodoro() {
  const ctx = useContext(PomodoroCtx);
  if (!ctx) throw new Error("usePomodoro outside provider");
  return ctx;
}
