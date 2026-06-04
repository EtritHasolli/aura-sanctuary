import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useProfile } from "./useProfile";
import { useTasks } from "./useTasks";
import { useHabiticaStatus } from "./useHabitica";
import {
  addCalendarDays,
  calendarDateInTimeZone,
  isDailyDueByRepeat,
  isSacredToday,
} from "@/lib/aura/dates";
import type { Task, RepeatUnit } from "@/lib/aura/types";

export interface PendingYesterdayDaily {
  id: string;
  title: string;
}

function wasYesterdayDue(task: Task, yesterday: string, tz: string): boolean {
  if (task.type !== "daily") return false;
  // Skip tasks already counted as completed yesterday
  if (task.last_completed_local_date === yesterday) return false;

  const repeatUnit = (task.repeat_unit as RepeatUnit) ?? "day";
  const repeatEvery = task.repeat_every ?? 1;
  const anchor = task.repeat_anchor_date ?? task.created_at?.slice(0, 10) ?? yesterday;

  if (repeatUnit === "week" && repeatEvery === 1) {
    // Weekly with sacred_days bitmask — check if yesterday was a sacred day
    const yesterdayInstant = new Date(yesterday + "T12:00:00Z");
    return isSacredToday(task.sacred_days ?? 127, tz, yesterdayInstant);
  }

  return isDailyDueByRepeat(yesterday, repeatEvery, repeatUnit, anchor);
}

export function useNewDayModal() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: tasks } = useTasks();
  const { data: habiticaStatus, isPlaceholderData: habiticaStatusPending } = useHabiticaStatus();
  const qc = useQueryClient();
  const [pendingDailies, setPendingDailies] = useState<PendingYesterdayDaily[]>([]);
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (!user || !profile || !tasks) return;
    if (habiticaStatusPending) return; // Wait for real Habitica connection status
    if (checkedRef.current) return;
    checkedRef.current = true;

    const tz = profile.timezone || "UTC";
    const today = calendarDateInTimeZone(tz);

    // Already settled today on any platform/session — skip
    if (profile.new_day_settled_date === today) return;

    // Habitica handles the new day flow for linked accounts — suppress Aura's modal
    if (habiticaStatus?.connected) return;

    const yesterday = addCalendarDays(today, -1);
    const due = tasks.filter((t) => wasYesterdayDue(t, yesterday, tz));

    if (due.length === 0) return;

    // Mark settled in DB immediately — any other platform/session will see this and skip
    void supabase
      .from("profiles")
      .update({ new_day_settled_date: today })
      .eq("id", user.id);

    // Optimistically update cache so this session also skips on re-check
    qc.setQueryData(["profile", user.id], (old: typeof profile) =>
      old ? { ...old, new_day_settled_date: today } : old,
    );

    setPendingDailies(due.map((t) => ({ id: t.id, title: t.title })));
    setOpen(true);
  }, [user, profile, tasks, habiticaStatus, habiticaStatusPending, qc]);

  const markComplete = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const tz = profile?.timezone || "UTC";
      const today = calendarDateInTimeZone(tz);
      const yesterday = addCalendarDays(today, -1);

      await Promise.all(
        ids.map((id) => {
          const task = tasks?.find((t) => t.id === id);
          if (!task) return Promise.resolve();
          // Streak: only extend if the task was completed the day before yesterday
          const dayBeforeYesterday = addCalendarDays(yesterday, -1);
          const streak =
            task.last_completed_local_date === dayBeforeYesterday
              ? (task.streak_current ?? 0) + 1
              : 1;
          const best = Math.max(task.streak_best ?? 0, streak);
          return supabase.from("tasks").update({
            completed: true,
            last_completed_local_date: yesterday,
            last_completed_at: new Date().toISOString(),
            streak_current: streak,
            streak_best: best,
          }).eq("id", id);
        }),
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const confirm = useCallback(
    async (checkedIds: string[]) => {
      setIsSubmitting(true);
      try {
        await markComplete.mutateAsync(checkedIds);
      } finally {
        setIsSubmitting(false);
        setOpen(false);
      }
    },
    [markComplete],
  );

  const dismiss = useCallback(() => setOpen(false), []);

  return { open, pendingDailies, confirm, dismiss, isSubmitting };
}
