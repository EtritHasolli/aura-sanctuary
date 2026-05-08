import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type Mode = "focus" | "break";

export interface PomodoroSession {
  focusMinutes: number;
  breakMinutes: number;
}

interface Ctx {
  running: boolean;
  mode: Mode;
  secondsLeft: number;
  focusMinutes: number;
  breakMinutes: number;
  sessionPlan: PomodoroSession[];
  activeSessionIndex: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
  updateDurations: (durations: { focusMinutes: number; breakMinutes: number }) => void;
  updateSessionPlan: (sessions: PomodoroSession[]) => void;
  characterState: "idle" | "working" | "sleeping";
  onCycleComplete?: (cb: () => void) => void;
}

const PomodoroCtx = createContext<Ctx | null>(null);

const FOCUS_SECS = 25 * 60;
const BREAK_SECS = 5 * 60;
const MIN_MINUTES = 1;
const FOCUS_STORAGE_KEY = "aura:pomodoro-focus-minutes";
const BREAK_STORAGE_KEY = "aura:pomodoro-break-minutes";
const SESSION_PLAN_STORAGE_KEY = "aura:pomodoro-session-plan";

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

function sanitizeSessionPlan(
  sessions: PomodoroSession[],
  fallbackFocusMinutes: number,
  fallbackBreakMinutes: number,
): PomodoroSession[] {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [{ focusMinutes: fallbackFocusMinutes, breakMinutes: fallbackBreakMinutes }];
  }
  return sessions.map((session) => ({
    focusMinutes: sanitizeMinutes(session.focusMinutes, fallbackFocusMinutes),
    breakMinutes: sanitizeMinutes(session.breakMinutes, fallbackBreakMinutes),
  }));
}

function readStoredSessionPlan(fallbackFocusMinutes: number, fallbackBreakMinutes: number) {
  if (typeof window === "undefined") {
    return [{ focusMinutes: fallbackFocusMinutes, breakMinutes: fallbackBreakMinutes }];
  }
  try {
    const raw = window.localStorage.getItem(SESSION_PLAN_STORAGE_KEY);
    if (!raw) {
      return [{ focusMinutes: fallbackFocusMinutes, breakMinutes: fallbackBreakMinutes }];
    }
    const parsed = JSON.parse(raw) as PomodoroSession[];
    return sanitizeSessionPlan(parsed, fallbackFocusMinutes, fallbackBreakMinutes);
  } catch {
    return [{ focusMinutes: fallbackFocusMinutes, breakMinutes: fallbackBreakMinutes }];
  }
}

export function PomodoroProvider({ children, onFocusComplete }: { children: ReactNode; onFocusComplete?: () => void }) {
  const initialFocusMinutes = readStoredMinutes(FOCUS_STORAGE_KEY, FOCUS_SECS / 60);
  const initialBreakMinutes = readStoredMinutes(BREAK_STORAGE_KEY, BREAK_SECS / 60);
  const initialSessionPlan = readStoredSessionPlan(initialFocusMinutes, initialBreakMinutes);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("focus");
  const [focusMinutes, setFocusMinutes] = useState(initialFocusMinutes);
  const [breakMinutes, setBreakMinutes] = useState(initialBreakMinutes);
  const [sessionPlan, setSessionPlan] = useState<PomodoroSession[]>(initialSessionPlan);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(initialSessionPlan[0].focusMinutes * 60);
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
        const activeSession =
          sessionPlan[activeSessionIndex] ??
          ({ focusMinutes, breakMinutes } satisfies PomodoroSession);
        // cycle complete
        if (mode === "focus") {
          cbRef.current?.();
          if (typeof window !== "undefined") window.dispatchEvent(new Event("aura:focus-complete"));
          setMode("break");
          return activeSession.breakMinutes * 60;
        } else {
          const nextSessionIndex = (activeSessionIndex + 1) % sessionPlan.length;
          const nextSession = sessionPlan[nextSessionIndex] ?? activeSession;
          setActiveSessionIndex(nextSessionIndex);
          setMode("focus");
          return nextSession.focusMinutes * 60;
        }
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, mode, focusMinutes, breakMinutes, sessionPlan, activeSessionIndex]);

  const characterState: Ctx["characterState"] =
    running && mode === "focus" ? "working" :
    idleTicks > 60 ? "sleeping" : "idle";

  // toggle the focused theme on the html element when working
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-focused", characterState === "working");
  }, [characterState]);

  const updateDurations: Ctx["updateDurations"] = ({ focusMinutes, breakMinutes }) => {
    const nextFocus = sanitizeMinutes(focusMinutes, FOCUS_SECS / 60);
    const nextBreak = sanitizeMinutes(breakMinutes, BREAK_SECS / 60);
    setFocusMinutes(nextFocus);
    setBreakMinutes(nextBreak);
    const nextPlan = [{ focusMinutes: nextFocus, breakMinutes: nextBreak }];
    setSessionPlan(nextPlan);
    setActiveSessionIndex(0);
    setMode("focus");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, String(nextFocus));
      window.localStorage.setItem(BREAK_STORAGE_KEY, String(nextBreak));
      window.localStorage.setItem(SESSION_PLAN_STORAGE_KEY, JSON.stringify(nextPlan));
    }

    // Keep the active timer in sync with updated settings.
    setSecondsLeft((current) => {
      if (running) return current;
      return nextFocus * 60;
    });
  };

  const updateSessionPlan: Ctx["updateSessionPlan"] = (sessions) => {
    const nextPlan = sanitizeSessionPlan(sessions, focusMinutes, breakMinutes);
    const first = nextPlan[0];
    setSessionPlan(nextPlan);
    setFocusMinutes(first.focusMinutes);
    setBreakMinutes(first.breakMinutes);
    setActiveSessionIndex(0);
    setMode("focus");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FOCUS_STORAGE_KEY, String(first.focusMinutes));
      window.localStorage.setItem(BREAK_STORAGE_KEY, String(first.breakMinutes));
      window.localStorage.setItem(SESSION_PLAN_STORAGE_KEY, JSON.stringify(nextPlan));
    }
    setSecondsLeft((current) => (running ? current : first.focusMinutes * 60));
  };

  const value: Ctx = {
    running, mode, secondsLeft, focusMinutes, breakMinutes, sessionPlan, activeSessionIndex,
    start: () => setRunning(true),
    pause: () => setRunning(false),
    reset: () => {
      const first = sessionPlan[0] ?? { focusMinutes, breakMinutes };
      setRunning(false);
      setMode("focus");
      setActiveSessionIndex(0);
      setSecondsLeft(first.focusMinutes * 60);
    },
    updateDurations,
    updateSessionPlan,
    characterState,
  };
  return <PomodoroCtx.Provider value={value}>{children}</PomodoroCtx.Provider>;
}

export function usePomodoro() {
  const ctx = useContext(PomodoroCtx);
  if (!ctx) throw new Error("usePomodoro outside provider");
  return ctx;
}
