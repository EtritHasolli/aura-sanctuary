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
  /** Archives note the user is focusing on during this Pomodoro run (cleared on reset). */
  focusNoteId: string | null;
  setFocusNoteId: (noteId: string | null) => void;
}

const PomodoroCtx = createContext<Ctx | null>(null);

const DEFAULT_FOCUS = 25;
const DEFAULT_BREAK = 5;
const MIN_MINUTES = 1;

// localStorage keys kept as fast-read cache so the UI doesn't flash on load
const FOCUS_STORAGE_KEY = "aura:pomodoro-focus-minutes";
const BREAK_STORAGE_KEY = "aura:pomodoro-break-minutes";
const SESSION_PLAN_STORAGE_KEY = "aura:pomodoro-session-plan";
const FOCUS_NOTE_STORAGE_KEY = "aura:pomodoro-focus-note";

function sanitizeMinutes(v: number, fallback: number) {
  // A missing localStorage key reads as Number(null) === 0; treat that (and any
  // non-positive value) as "not set" instead of clamping it to a 1-minute session.
  if (!Number.isFinite(v) || v <= 0) return fallback;
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
  const [focusNoteId, setFocusNoteIdState] = useState<string | null>(() =>
    typeof window === "undefined" ? null : localStorage.getItem(FOCUS_NOTE_STORAGE_KEY),
  );
  const setFocusNoteId = (noteId: string | null) => {
    setFocusNoteIdState(noteId);
    if (noteId) localStorage.setItem(FOCUS_NOTE_STORAGE_KEY, noteId);
    else localStorage.removeItem(FOCUS_NOTE_STORAGE_KEY);
  };
  const idleTicksRef = useRef(0);
  const [isSleeping, setIsSleeping] = useState(false);
  const cbRef = useRef(onFocusComplete);
  cbRef.current = onFocusComplete;
  /** Wall-clock end of the current phase while running. Background tabs throttle
   *  setInterval heavily, so the countdown is derived from this, not from tick counts. */
  const phaseEndsAtRef = useRef<number | null>(null);
  const secondsLeftRef = useRef(secondsLeft);
  secondsLeftRef.current = secondsLeft;
  // The ticking interval reads the phase from refs, so a phase change is seen by the very
  // next tick even before React re-renders (a stale closure could fire focus-complete twice).
  const modeRef = useRef<Mode>("focus");
  const activeIndexRef = useRef(0);
  const sessionPlanRef = useRef(sessionPlan);

  const setPhase = (nextMode: Mode, nextIndex: number) => {
    modeRef.current = nextMode;
    activeIndexRef.current = nextIndex;
    setMode(nextMode);
    setActiveSessionIndex(nextIndex);
  };

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
        sessionPlanRef.current = db.sessionPlan;
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
      phaseEndsAtRef.current = null;
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
    phaseEndsAtRef.current ??= Date.now() + secondsLeftRef.current * 1000;

    const tick = () => {
      const endsAt = phaseEndsAtRef.current;
      if (endsAt == null) return;
      const remaining = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      if (remaining > 0) {
        setSecondsLeft(remaining);
        return;
      }
      const plan = sessionPlanRef.current;
      const index = Math.min(activeIndexRef.current, plan.length - 1);
      let nextSeconds: number;
      if (modeRef.current === "focus") {
        cbRef.current?.();
        window.dispatchEvent(new Event("aura:focus-complete"));
        setPhase("break", index);
        nextSeconds = plan[index].breakMinutes * 60;
      } else {
        const nextIdx = (index + 1) % plan.length;
        setPhase("focus", nextIdx);
        nextSeconds = plan[nextIdx].focusMinutes * 60;
      }
      phaseEndsAtRef.current = Date.now() + nextSeconds * 1000;
      setSecondsLeft(nextSeconds);
    };

    const t = setInterval(tick, 1000);
    // Catch up immediately when a throttled/hidden tab becomes visible again.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // Phase state is read through refs, so only starting/stopping re-arms the interval.
  }, [running]);

  const characterState: Ctx["characterState"] =
    running && mode === "focus" ? "working" : isSleeping ? "sleeping" : "idle";

  useEffect(() => {
    document.documentElement.classList.toggle("theme-focused", characterState === "working");
  }, [characterState]);

  /**
   * Stopped: the timer resets to the new plan's first focus session.
   * Running: the current phase finishes untouched and the new plan applies afterwards
   * (resetting mode mid-phase used to show "FOCUS" while break time was counting down).
   */
  const applyPlan = (nextPlan: PomodoroSession[]) => {
    const first = nextPlan[0];
    sessionPlanRef.current = nextPlan;
    setSessionPlan(nextPlan);
    setFocusMinutes(first.focusMinutes);
    setBreakMinutes(first.breakMinutes);
    if (running) {
      setPhase(modeRef.current, Math.min(activeIndexRef.current, nextPlan.length - 1));
    } else {
      setPhase("focus", 0);
      setSecondsLeft(first.focusMinutes * 60);
    }
    persistSettings({ focusMinutes: first.focusMinutes, breakMinutes: first.breakMinutes, sessionPlan: nextPlan });
  };

  const updateDurations: Ctx["updateDurations"] = ({ focusMinutes: f, breakMinutes: b }) => {
    applyPlan([
      { focusMinutes: sanitizeMinutes(f, DEFAULT_FOCUS), breakMinutes: sanitizeMinutes(b, DEFAULT_BREAK) },
    ]);
  };

  const updateSessionPlan: Ctx["updateSessionPlan"] = (sessions) => {
    applyPlan(sanitizeSessionPlan(sessions, focusMinutes, breakMinutes));
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
      phaseEndsAtRef.current = null;
      setPhase("focus", 0);
      setSecondsLeft(first.focusMinutes * 60);
      setFocusNoteId(null);
    },
    updateDurations,
    updateSessionPlan,
    characterState,
    settingsLoaded,
    focusNoteId,
    setFocusNoteId,
  };

  return <PomodoroCtx.Provider value={value}>{children}</PomodoroCtx.Provider>;
}

export function usePomodoro() {
  const ctx = useContext(PomodoroCtx);
  if (!ctx) throw new Error("usePomodoro outside provider");
  return ctx;
}
