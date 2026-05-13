import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Mode = "focus" | "break";

export interface PomodoroSession {
  focusMinutes: number;
  breakMinutes: number;
}

interface PomodoroSettings {
  focusMinutes: number;
  breakMinutes: number;
  sessionPlan: PomodoroSession[];
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
  settingsLoaded: boolean;
}

const PomodoroCtx = createContext<Ctx | null>(null);

const DEFAULT_FOCUS = 25;
const DEFAULT_BREAK = 5;
const MIN_MINUTES = 1;

// localStorage keys kept as fast-read cache so the UI doesn't flash on load
const FOCUS_STORAGE_KEY = "aura:pomodoro-focus-minutes";
const BREAK_STORAGE_KEY = "aura:pomodoro-break-minutes";
const SESSION_PLAN_STORAGE_KEY = "aura:pomodoro-session-plan";

function sanitizeMinutes(v: number, fallback: number) {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(MIN_MINUTES, Math.round(v));
}

function sanitizeSessionPlan(
  sessions: PomodoroSession[],
  fallbackFocus: number,
  fallbackBreak: number,
): PomodoroSession[] {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return [{ focusMinutes: fallbackFocus, breakMinutes: fallbackBreak }];
  }
  return sessions.map((s) => ({
    focusMinutes: sanitizeMinutes(s.focusMinutes, fallbackFocus),
    breakMinutes: sanitizeMinutes(s.breakMinutes, fallbackBreak),
  }));
}

function readLocalSettings(): PomodoroSettings {
  const focusMinutes =
    sanitizeMinutes(Number(localStorage.getItem(FOCUS_STORAGE_KEY)), DEFAULT_FOCUS);
  const breakMinutes =
    sanitizeMinutes(Number(localStorage.getItem(BREAK_STORAGE_KEY)), DEFAULT_BREAK);
  try {
    const raw = localStorage.getItem(SESSION_PLAN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as PomodoroSession[]) : [];
    return { focusMinutes, breakMinutes, sessionPlan: sanitizeSessionPlan(parsed, focusMinutes, breakMinutes) };
  } catch {
    return { focusMinutes, breakMinutes, sessionPlan: [{ focusMinutes, breakMinutes }] };
  }
}

function writeLocalSettings(s: PomodoroSettings) {
  localStorage.setItem(FOCUS_STORAGE_KEY, String(s.focusMinutes));
  localStorage.setItem(BREAK_STORAGE_KEY, String(s.breakMinutes));
  localStorage.setItem(SESSION_PLAN_STORAGE_KEY, JSON.stringify(s.sessionPlan));
}

async function loadDbSettings(userId: string): Promise<PomodoroSettings | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("pomodoro_settings")
    .eq("id", userId)
    .single();
  if (error || !data?.pomodoro_settings) return null;
  const raw = data.pomodoro_settings as Record<string, unknown>;
  const focus = sanitizeMinutes(Number(raw.focusMinutes), DEFAULT_FOCUS);
  const brk = sanitizeMinutes(Number(raw.breakMinutes), DEFAULT_BREAK);
  const plan = sanitizeSessionPlan(
    Array.isArray(raw.sessionPlan) ? (raw.sessionPlan as PomodoroSession[]) : [],
    focus,
    brk,
  );
  return { focusMinutes: focus, breakMinutes: brk, sessionPlan: plan };
}

async function saveDbSettings(userId: string, settings: PomodoroSettings) {
  await supabase
    .from("profiles")
    .update({ pomodoro_settings: settings as unknown as Record<string, unknown> })
    .eq("id", userId);
}

export function PomodoroProvider({
  children,
  onFocusComplete,
}: {
  children: ReactNode;
  onFocusComplete?: () => void;
}) {
  const { user } = useAuth();

  // Boot from localStorage immediately so the UI never flashes defaults
  const local = readLocalSettings();
  const [focusMinutes, setFocusMinutes] = useState(local.focusMinutes);
  const [breakMinutes, setBreakMinutes] = useState(local.breakMinutes);
  const [sessionPlan, setSessionPlan] = useState<PomodoroSession[]>(local.sessionPlan);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(local.sessionPlan[0].focusMinutes * 60);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState<Mode>("focus");
  const idleTicksRef = useRef(0);
  const [isSleeping, setIsSleeping] = useState(false);
  const cbRef = useRef(onFocusComplete);
  cbRef.current = onFocusComplete;

  // Debounce timer for DB writes — avoid hammering on every keystroke in settings
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistSettings = (settings: PomodoroSettings) => {
    writeLocalSettings(settings);
    if (!user) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveDbSettings(user.id, settings);
    }, 800);
  };

  // On login, pull from DB and override local state if DB has data
  useEffect(() => {
    if (!user) {
      setSettingsLoaded(true);
      return;
    }
    let cancelled = false;
    void loadDbSettings(user.id).then((db) => {
      if (cancelled) return;
      if (db) {
        setFocusMinutes(db.focusMinutes);
        setBreakMinutes(db.breakMinutes);
        setSessionPlan(db.sessionPlan);
        setSecondsLeft(db.sessionPlan[0].focusMinutes * 60);
        writeLocalSettings(db); // keep local cache in sync
      }
      setSettingsLoaded(true);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Idle / sleep detection
  useEffect(() => {
    if (!running) {
      idleTicksRef.current = 0;
      setIsSleeping(false);
      const t = setInterval(() => {
        idleTicksRef.current += 1;
        if (idleTicksRef.current > 60) {
          setIsSleeping(true);
          clearInterval(t);
        }
      }, 1000);
      return () => clearInterval(t);
    }
    idleTicksRef.current = 0;
    setIsSleeping(false);
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        const activeSession =
          sessionPlan[activeSessionIndex] ?? { focusMinutes, breakMinutes };
        if (mode === "focus") {
          cbRef.current?.();
          if (typeof window !== "undefined") window.dispatchEvent(new Event("aura:focus-complete"));
          setMode("break");
          return activeSession.breakMinutes * 60;
        } else {
          const nextIdx = (activeSessionIndex + 1) % sessionPlan.length;
          const nextSession = sessionPlan[nextIdx] ?? activeSession;
          setActiveSessionIndex(nextIdx);
          setMode("focus");
          return nextSession.focusMinutes * 60;
        }
      });
    }, 1000);
    return () => clearInterval(t);
  }, [running, mode, focusMinutes, breakMinutes, sessionPlan, activeSessionIndex]);

  const characterState: Ctx["characterState"] =
    running && mode === "focus" ? "working" : isSleeping ? "sleeping" : "idle";

  useEffect(() => {
    document.documentElement.classList.toggle("theme-focused", characterState === "working");
  }, [characterState]);

  const updateDurations: Ctx["updateDurations"] = ({ focusMinutes: f, breakMinutes: b }) => {
    const nextFocus = sanitizeMinutes(f, DEFAULT_FOCUS);
    const nextBreak = sanitizeMinutes(b, DEFAULT_BREAK);
    const nextPlan = [{ focusMinutes: nextFocus, breakMinutes: nextBreak }];
    setFocusMinutes(nextFocus);
    setBreakMinutes(nextBreak);
    setSessionPlan(nextPlan);
    setActiveSessionIndex(0);
    setMode("focus");
    setSecondsLeft((current) => (running ? current : nextFocus * 60));
    persistSettings({ focusMinutes: nextFocus, breakMinutes: nextBreak, sessionPlan: nextPlan });
  };

  const updateSessionPlan: Ctx["updateSessionPlan"] = (sessions) => {
    const nextPlan = sanitizeSessionPlan(sessions, focusMinutes, breakMinutes);
    const first = nextPlan[0];
    setSessionPlan(nextPlan);
    setFocusMinutes(first.focusMinutes);
    setBreakMinutes(first.breakMinutes);
    setActiveSessionIndex(0);
    setMode("focus");
    setSecondsLeft((current) => (running ? current : first.focusMinutes * 60));
    persistSettings({ focusMinutes: first.focusMinutes, breakMinutes: first.breakMinutes, sessionPlan: nextPlan });
  };

  const value: Ctx = {
    running,
    mode,
    secondsLeft,
    focusMinutes,
    breakMinutes,
    sessionPlan,
    activeSessionIndex,
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
    settingsLoaded,
  };

  return <PomodoroCtx.Provider value={value}>{children}</PomodoroCtx.Provider>;
}

export function usePomodoro() {
  const ctx = useContext(PomodoroCtx);
  if (!ctx) throw new Error("usePomodoro outside provider");
  return ctx;
}
