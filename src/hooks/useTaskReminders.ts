import { useEffect, useRef } from "react";
import { useTasks } from "./useTasks";
import { useProfile } from "./useProfile";
import { calendarDateInTimeZone } from "@/lib/aura/dates";
import { desktopNotifsEnabled, fireLocalNotification } from "@/lib/notifications";

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
 * Schedules task reminder notifications.
 *
 * In Electron: delegates to the main process via IPC so timers fire even when
 * the window is minimized or hidden.
 *
 * In the browser: uses setTimeout + service worker showNotification. The
 * server-side send-reminders edge function handles the "app fully closed" case
 * for web/mobile via push notifications.
 */
export function useTaskReminders() {
  const { data: tasks = [] } = useTasks();
  const { data: profile } = useProfile();
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const firedToday = useRef<Set<string>>(new Set());

  // Wire Electron notification click → in-app navigation
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onNotificationNavigate) return;
    const off = api.onNotificationNavigate((url) => {
      // Dispatch a custom event; the router can listen for this
      window.dispatchEvent(new CustomEvent("aura:navigate", { detail: { url } }));
    });
    return off;
  }, []);

  useEffect(() => {
    if (!desktopNotifsEnabled()) return;

    const tz = profile?.timezone || "UTC";
    const todayKey = calendarDateInTimeZone(tz);

    // ── Electron path: delegate to main process ──────────────────────────────
    if (window.electronAPI?.scheduleReminders) {
      const toSchedule: Array<{ id: string; title: string; msUntil: number; url: string }> = [];

      for (const task of tasks) {
        if (!task.reminder_time || task.completed) continue;
        const target = resolveTarget(task.reminder_time, task.type ?? "todo");
        if (!target) continue;
        // For repeating tasks dedupe within the same calendar day
        if (task.type !== "todo") {
          const firedKey = `${task.id}:${todayKey}`;
          if (firedToday.current.has(firedKey)) continue;
        }
        toSchedule.push({
          id: task.type !== "todo" ? `${task.id}:${todayKey}` : task.id,
          title: task.title,
          msUntil: target.getTime() - Date.now(),
          url: "/quests",
        });
      }

      void window.electronAPI.scheduleReminders(toSchedule);

      return () => {
        // Don't clear on unmount — the main process holds the timers and
        // should keep firing them even if the renderer re-renders. We only
        // clear when the task list changes (effect re-runs with new schedule).
      };
    }

    // ── Browser path: setTimeout + service worker ─────────────────────────────
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();

    for (const task of tasks) {
      if (!task.reminder_time) continue;
      if (task.completed) continue;

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
        void fireLocalNotification("⚔️ Quest Reminder", task.title, {
          tag: `quest-${task.id}`,
          url: "/quests",
        });
      }, msUntil);

      timers.current.set(task.id, timer);
    }

    return () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
      timers.current.clear();
    };
  }, [tasks, profile?.timezone]);
}
