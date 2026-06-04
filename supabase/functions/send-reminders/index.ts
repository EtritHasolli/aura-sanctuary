// @ts-nocheck
// send-reminders — called on a cron schedule (every minute via pg_cron or
// Supabase scheduled functions). Finds all tasks whose reminder_time falls
// within the current minute and sends a push notification to the task owner.
//
// reminder_time formats:
//   "HH:MM"               → habits/dailies: fire daily at that local time
//   "YYYY-MM-DDTHH:MM"    → todos: fire once at that local datetime
//
// The function compares against the user's stored timezone so the fire time
// is correct regardless of where the server runs.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push`;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toHHMM(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function toLocalDatetime(date: Date, timeZone: string): string {
  // Returns "YYYY-MM-DDTHH:MM" in the given timezone
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const timePart = toHHMM(date, timeZone);
  return `${datePart}T${timePart}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    // Fetch all tasks that have a reminder_time set and are not completed.
    // Join profiles to get the user's timezone.
    const { data: tasks, error } = await admin
      .from("tasks")
      .select("id, user_id, title, type, reminder_time, completed, profiles!inner(timezone)")
      .not("reminder_time", "is", null)
      .eq("completed", false);

    if (error) {
      console.error("Failed to fetch tasks:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const due: { user_id: string; title: string; task_id: string }[] = [];

    for (const task of tasks ?? []) {
      const tz: string = (task.profiles as { timezone?: string })?.timezone || "UTC";
      const reminderTime: string = task.reminder_time;

      let shouldFire = false;

      if (task.type === "todo") {
        // "YYYY-MM-DDTHH:MM" — fire once at this exact local datetime
        const localNow = toLocalDatetime(now, tz);
        // Match on minute precision (first 16 chars)
        shouldFire = reminderTime.slice(0, 16) === localNow.slice(0, 16);
      } else {
        // "HH:MM" — fire daily at this local time
        const localHHMM = toHHMM(now, tz);
        shouldFire = reminderTime.slice(0, 5) === localHHMM;
      }

      if (shouldFire) {
        due.push({ user_id: task.user_id, title: task.title, task_id: task.id });
      }
    }

    console.log(`send-reminders: ${due.length} due out of ${(tasks ?? []).length} tasks at ${now.toISOString()}`);

    // Fire push for each due task. Group by user so one user with many due
    // tasks doesn't spam — send one push per task (distinct tag prevents
    // Android collapsing them before the user sees them).
    const results = await Promise.allSettled(
      due.map(({ user_id, title, task_id }) =>
        fetch(SEND_PUSH_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            user_id,
            title: "⚔️ Quest Reminder",
            message: title,
            tag: `quest-${task_id}`,
            url: "/quests",
          }),
        })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ checked: (tasks ?? []).length, due: due.length, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-reminders error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
