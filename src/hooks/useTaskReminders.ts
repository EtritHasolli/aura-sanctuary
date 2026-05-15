import { useEffect, useRef } from "react";
import { useTasks } from "./useTasks";
import { useProfile } from "./useProfile";
import { calendarDateInTimeZone } from "@/lib/aura/dates";

const DESKTOP_NOTIF_KEY = "aura:desktop-notifications";

function desktopNotifsEnabled() {
  return (
    typeof window !== "undefined" &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    window.localStorage.getItem(DESKTOP_NOTIF_KEY) === "true"
  );
}

function fireNotification(title: string, body: string) {
  if (!desktopNotifsEnabled()) return;
  new Notification(title, { body, icon: "/favicon.ico" });
}

/**
 * Resolves when a reminder should fire:
 *
 * - Habits/dailies: reminder_time is "HH:MM" → fires at that time today (repeats daily).
 * - Todos: reminder_time is "YYYY-MM-DDTHH:MM" (datetime-local) → fires once at that moment.
 *
 * Returns null if the target time has already passed or the format is unrecognised.
 */
function resolveTarget(reminderTime: string, taskType: string): Date | null {
  const now = new Date();

  if (taskType === "todo") {
    // datetime-local format: "YYYY-MM-DDTHH:MM"
    const dt = new Date(reminderTime);
    if (isNaN(dt.getTime())) return null;
    if (dt <= now) return null;
    return dt;
  }

  // habit / daily: "HH:MM" repeating daily
  const parts = reminderTime.split(":");
  if (parts.length < 2) return null;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (isNaN(hh) || isNaN(mm)) return null;

  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) return null; // already passed today
  return target;
}

/**
 * Schedules browser desktop notifications for tasks that have a reminder_time set.
 * Habits/dailies fire at a daily time; todos fire once at a specific datetime.
 */
export function useTaskReminders() {
  const { data: tasks = [] } = useTasks();
  const { data: profile } = useProfile();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const firedToday = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!desktopNotifsEnabled()) return;

    const tz = profile?.timezone || "UTC";
    const todayKey = calendarDateInTimeZone(tz);

    // Clear stale timers from the previous render.
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();

    for (const task of tasks) {
      if (!task.reminder_time) continue;
      if (task.completed) continue;

      // For repeating tasks, only fire once per calendar day.
      if (task.type !== "todo") {
        const firedKey = `${task.id}:${todayKey}`;
        if (firedToday.current.has(firedKey)) continue;
      }

      const target = resolveTarget(task.reminder_time, task.type ?? "todo");
      if (!target) continue;

      const msUntil = target.getTime() - Date.now();

      const timer = setTimeout(() => {
        timers.current.delete(task.id);
        if (task.type !== "todo") {
          firedToday.current.add(`${task.id}:${todayKey}`);
        }
        fireNotification("Quest Reminder", task.title);
      }, msUntil);

      timers.current.set(task.id, timer);
    }

    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, [tasks, profile?.timezone]);
}
