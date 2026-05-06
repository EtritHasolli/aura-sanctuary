import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Mode = "focus" | "break";

interface Ctx {
  running: boolean;
  mode: Mode;
  secondsLeft: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  petState: "idle" | "working" | "sleeping";
  onCycleComplete?: (cb: () => void) => void;
}

const PomodoroCtx = createContext<Ctx | null>(null);

const FOCUS_SECS = 25 * 60;
const BREAK_SECS = 5 * 60;

export function PomodoroProvider({ children, onFocusComplete }: { children: ReactNode; onFocusComplete?: () => void }) {
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECS);
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
          return BREAK_SECS;
        } else {
          setMode("focus");
          return FOCUS_SECS;
        }
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, mode]);

  const petState: Ctx["petState"] =
    running && mode === "focus" ? "working" :
    idleTicks > 60 ? "sleeping" : "idle";

  // toggle the focused theme on the html element when working
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-focused", petState === "working");
  }, [petState]);

  const value: Ctx = {
    running, mode, secondsLeft,
    start: () => setRunning(true),
    pause: () => setRunning(false),
    reset: () => { setRunning(false); setMode("focus"); setSecondsLeft(FOCUS_SECS); },
    petState,
  };
  return <PomodoroCtx.Provider value={value}>{children}</PomodoroCtx.Provider>;
}

export function usePomodoro() {
  const ctx = useContext(PomodoroCtx);
  if (!ctx) throw new Error("usePomodoro outside provider");
  return ctx;
}
