/* eslint-disable @typescript-eslint/no-explicit-any */
// Aura ↔ Habitica integration proxy.
//
// All client interactions with Habitica go through this function so the API
// token stays server-side. The function authenticates the caller via Supabase
// Auth, then uses the service-role key to read/write the `user_integrations`
// table (which is otherwise locked down by RLS).
//
// Actions are routed via `{ action: "..." }` in the request body.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HABITICA_BASE_URL = "https://habitica.com/api/v3";
const HABITICA_X_CLIENT = "aura-sanctuary";
const PROVIDER = "habitica";

interface HabiticaCreds {
  external_user_id: string;
  api_token: string;
}

interface IntegrationRow {
  user_id: string;
  provider: string;
  external_user_id: string;
  api_token: string;
  display_name: string | null;
  username: string | null;
  remote_level: number | null;
  settings: Record<string, unknown>;
  public_profile: Record<string, unknown>;
  last_synced_at: string | null;
}

interface SyncSettings {
  autoSyncOnComplete: boolean;
}

const DEFAULT_SETTINGS: SyncSettings = { autoSyncOnComplete: true };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function unauthorized() {
  return jsonResponse({ error: "Unauthorized" }, 401);
}

function badRequest(message: string) {
  return jsonResponse({ error: message }, 400);
}

function serverError(message: string) {
  return jsonResponse({ error: message }, 500);
}

function normalizeSettings(raw: unknown): SyncSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const obj = raw as Record<string, unknown>;
  return {
    autoSyncOnComplete:
      typeof obj.autoSyncOnComplete === "boolean"
        ? obj.autoSyncOnComplete
        : DEFAULT_SETTINGS.autoSyncOnComplete,
  };
}

async function callHabitica<T>(
  path: string,
  init: RequestInit & { creds: HabiticaCreds },
): Promise<T> {
  const { creds, headers, ...rest } = init;
  const merged: Record<string, string> = {
    "x-api-user": creds.external_user_id,
    "x-api-key": creds.api_token,
    "x-client": HABITICA_X_CLIENT,
    Accept: "application/json",
    ...(rest.body ? { "Content-Type": "application/json" } : {}),
    ...((headers as Record<string, string> | undefined) ?? {}),
  };

  const res = await fetch(`${HABITICA_BASE_URL}${path}`, { ...rest, headers: merged });
  const text = await res.text();
  let envelope: { success?: boolean; data?: T; error?: string; message?: string } | null = null;
  if (text) {
    try {
      envelope = JSON.parse(text);
    } catch {
      // non-JSON body
    }
  }
  if (!res.ok || !envelope?.success) {
    const message =
      envelope?.message || envelope?.error || `Habitica request failed (${res.status}).`;
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return envelope.data as T;
}

interface HabiticaUserDetailed {
  _id: string;
  profile?: { name?: string; imageUrl?: string };
  auth?: { local?: { username?: string } };
  stats?: {
    lvl?: number;
    exp?: number;
    toNextLevel?: number;
    gp?: number;
    hp?: number;
    maxHealth?: number;
    mp?: number;
    maxMP?: number;
    class?: string;
  };
  items?: {
    gear?: {
      equipped?: Record<string, string>;
      costume?: Record<string, string>;
    };
    currentMount?: string | null;
    currentPet?: string | null;
  };
  preferences?: {
    sleep?: boolean;
    dayStart?: number;
    timezoneOffset?: number;
    background?: string;
  };
  loginIncentives?: number;
  achievements?: Record<string, unknown>;
}

interface PublicProfile {
  externalUserId: string;
  displayName: string;
  username: string | null;
  level: number;
  class: string | null;
  exp: number;
  expToNextLevel: number;
  gold: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  gear: {
    equipped: Record<string, string>;
    costume: Record<string, string>;
    currentMount: string | null;
    currentPet: string | null;
  };
  avatarPngUrl: string | null;
  sleeping: boolean;
  loginStreak: number;
  achievementsTotal: number;
  refreshedAt: string;
}

function countTrueAchievements(achievements: Record<string, unknown> | undefined): number {
  if (!achievements) return 0;
  let n = 0;
  for (const v of Object.values(achievements)) {
    if (v === true) {
      n += 1;
    } else if (typeof v === "number" && v > 0) {
      n += 1;
    } else if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (obj.count && typeof obj.count === "number" && obj.count > 0) n += 1;
    }
  }
  return n;
}

function buildPublicProfile(data: HabiticaUserDetailed): PublicProfile {
  const username = data.auth?.local?.username ?? null;
  const displayName = data.profile?.name ?? username ?? "Adventurer";
  const stats = data.stats ?? {};
  const gearEquipped = data.items?.gear?.equipped ?? {};
  const gearCostume = data.items?.gear?.costume ?? {};
  return {
    externalUserId: data._id,
    displayName,
    username,
    level: stats.lvl ?? 1,
    class: stats.class ?? null,
    exp: stats.exp ?? 0,
    expToNextLevel: stats.toNextLevel ?? 0,
    gold: Math.floor(stats.gp ?? 0),
    hp: Math.round(stats.hp ?? 0),
    maxHp: stats.maxHealth ?? 50,
    mp: Math.round(stats.mp ?? 0),
    maxMp: stats.maxMP ?? 0,
    gear: {
      equipped: gearEquipped,
      costume: gearCostume,
      currentMount: data.items?.currentMount ?? null,
      currentPet: data.items?.currentPet ?? null,
    },
    // Habitica exposes a public PNG render at this URL for every user.
    avatarPngUrl: `https://habitica.com/export/avatar-${data._id}.png`,
    sleeping: !!data.preferences?.sleep,
    loginStreak: data.loginIncentives ?? 0,
    achievementsTotal: countTrueAchievements(data.achievements),
    refreshedAt: new Date().toISOString(),
  };
}

async function fetchHabiticaUser(creds: HabiticaCreds): Promise<HabiticaUserDetailed> {
  return callHabitica<HabiticaUserDetailed>(
    "/user?userFields=profile,auth,stats,items,preferences,loginIncentives,achievements",
    { method: "GET", creds },
  );
}

interface HabiticaTask {
  id: string;
  type: "habit" | "daily" | "todo" | "reward";
  text: string;
  notes?: string;
  priority?: number;
  completed?: boolean;
  streak?: number;
  value?: number;
  counterUp?: number;
  counterDown?: number;
  date?: string | null;
  startDate?: string | null;
  frequency?: string;
  everyX?: number;
  daysOfMonth?: number[];
  weeksOfMonth?: number[];
  repeat?: Record<string, boolean>;
  checklist?: { id: string; text: string; completed: boolean }[];
  tags?: string[];
  history?: { date: number; value?: number; scoredUp?: number; scoredDown?: number }[];
  reminders?: { id: string; time: string }[];
}

async function fetchHabiticaTasks(
  creds: HabiticaCreds,
  type?: "habits" | "dailys" | "todos",
): Promise<HabiticaTask[]> {
  const qs = type ? `?type=${type}` : "";
  return callHabitica<HabiticaTask[]>(`/tasks/user${qs}`, { method: "GET", creds });
}

/**
 * Habitica's score response. The endpoint runs the full reward engine
 * server-side and returns the user's post-score stats inline, plus any
 * one-shot rewards in `_tmp` (item drops, quest progress).
 */
interface HabiticaScoreResult {
  delta: number;
  hp?: number;
  mp?: number;
  exp?: number;
  gp?: number;
  lvl?: number;
  _tmp?: {
    drop?: {
      type?: string;
      key?: string;
      target?: string;
      dialog?: string;
    };
    quest?: {
      progressDelta?: number;
      collection?: Record<string, number>;
    };
    leveledUp?: boolean;
  };
}

async function scoreHabiticaTask(
  creds: HabiticaCreds,
  habiticaTaskId: string,
  direction: "up" | "down",
): Promise<HabiticaScoreResult> {
  return callHabitica<HabiticaScoreResult>(
    `/tasks/${encodeURIComponent(habiticaTaskId)}/score/${direction}`,
    {
      method: "POST",
      body: JSON.stringify({}),
      creds,
    },
  );
}

interface HabiticaTagRow {
  id: string;
  name: string;
}

async function fetchHabiticaTags(creds: HabiticaCreds): Promise<HabiticaTagRow[]> {
  return callHabitica<HabiticaTagRow[]>("/tags", { method: "GET", creds });
}

async function createHabiticaTag(creds: HabiticaCreds, name: string): Promise<HabiticaTagRow> {
  return callHabitica<HabiticaTagRow>("/tags", {
    method: "POST",
    body: JSON.stringify({ name }),
    creds,
  });
}

async function attachHabiticaTaskTag(
  creds: HabiticaCreds,
  habiticaTaskId: string,
  habiticaTagId: string,
): Promise<unknown> {
  return callHabitica(
    `/tasks/${encodeURIComponent(habiticaTaskId)}/tags/${encodeURIComponent(habiticaTagId)}`,
    { method: "POST", body: JSON.stringify({}), creds },
  );
}

async function detachHabiticaTaskTag(
  creds: HabiticaCreds,
  habiticaTaskId: string,
  habiticaTagId: string,
): Promise<unknown> {
  return callHabitica(
    `/tasks/${encodeURIComponent(habiticaTaskId)}/tags/${encodeURIComponent(habiticaTagId)}`,
    { method: "DELETE", creds },
  );
}

async function updateHabiticaTask(
  creds: HabiticaCreds,
  habiticaTaskId: string,
  payload: Record<string, unknown>,
): Promise<HabiticaTask> {
  return callHabitica<HabiticaTask>(`/tasks/${encodeURIComponent(habiticaTaskId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
    creds,
  });
}

async function createHabiticaTask(
  creds: HabiticaCreds,
  payload: Record<string, unknown>,
): Promise<HabiticaTask> {
  return callHabitica<HabiticaTask>("/tasks/user", {
    method: "POST",
    body: JSON.stringify(payload),
    creds,
  });
}

async function deleteHabiticaTask(
  creds: HabiticaCreds,
  habiticaTaskId: string,
): Promise<void> {
  await callHabitica(`/tasks/${encodeURIComponent(habiticaTaskId)}`, {
    method: "DELETE",
    creds,
  });
}

const DIFFICULTY_PRIORITY: Record<string, 0.1 | 1 | 1.5 | 2> = {
  trivial: 0.1,
  easy: 1,
  medium: 1.5,
  hard: 2,
};

const REPEAT_UNIT_TO_FREQUENCY: Record<string, string> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
  year: "yearly",
};

/**
 * Convert Aura's `sacred_days` weekday bitmap (bit0=Sun … bit6=Sat) into
 * Habitica's `repeat` object. 127 = all days = every key true.
 */
function sacredDaysToRepeat(sacredDays: number | null | undefined): Record<string, boolean> {
  const bits = typeof sacredDays === "number" ? sacredDays : 127;
  return {
    su: (bits & 1) !== 0,
    m: (bits & 2) !== 0,
    t: (bits & 4) !== 0,
    w: (bits & 8) !== 0,
    th: (bits & 16) !== 0,
    f: (bits & 32) !== 0,
    s: (bits & 64) !== 0,
  };
}

function priorityToDifficulty(p: number | undefined): "trivial" | "easy" | "medium" | "hard" {
  if (p == null) return "easy";
  const map: Record<string, "trivial" | "easy" | "medium" | "hard"> = {
    "0.1": "trivial",
    "1": "easy",
    "1.5": "medium",
    "2": "hard",
  };
  return map[String(p)] ?? "easy";
}

function buildTaskMeta(t: HabiticaTask): Record<string, unknown> {
  const history = Array.isArray(t.history)
    ? t.history.slice(-30).map((h) => ({
        date: h.date,
        value: typeof h.value === "number" ? h.value : null,
        scoredUp: typeof h.scoredUp === "number" ? h.scoredUp : null,
        scoredDown: typeof h.scoredDown === "number" ? h.scoredDown : null,
      }))
    : [];
  return {
    type: t.type,
    value: typeof t.value === "number" ? t.value : null,
    streak: typeof t.streak === "number" ? t.streak : null,
    counterUp: typeof t.counterUp === "number" ? t.counterUp : null,
    counterDown: typeof t.counterDown === "number" ? t.counterDown : null,
    completed: typeof t.completed === "boolean" ? t.completed : null,
    date: t.date ?? null,
    startDate: t.startDate ?? null,
    frequency: t.frequency ?? null,
    everyX: typeof t.everyX === "number" ? t.everyX : null,
    daysOfMonth: Array.isArray(t.daysOfMonth) ? t.daysOfMonth : [],
    weeksOfMonth: Array.isArray(t.weeksOfMonth) ? t.weeksOfMonth : [],
    repeat: t.repeat ?? {},
    checklist: Array.isArray(t.checklist)
      ? t.checklist.map((c) => ({
          id: c.id,
          text: c.text,
          completed: !!c.completed,
        }))
      : [],
    tags: Array.isArray(t.tags) ? t.tags : [],
    history,
    refreshedAt: new Date().toISOString(),
  };
}

function publicProfileSummary(row: IntegrationRow) {
  return {
    externalUserId: row.external_user_id,
    displayName: row.display_name ?? "Adventurer",
    username: row.username,
    level: row.remote_level ?? 1,
  };
}

interface Ctx {
  userId: string;
  adminClient: ReturnType<typeof createClient>;
}

async function loadIntegration(ctx: Ctx): Promise<IntegrationRow | null> {
  const { data, error } = await ctx.adminClient
    .from("user_integrations")
    .select("*")
    .eq("user_id", ctx.userId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntegrationRow | null) ?? null;
}

async function requireIntegration(ctx: Ctx): Promise<IntegrationRow> {
  const row = await loadIntegration(ctx);
  if (!row) {
    const err = new Error("Habitica not connected.");
    (err as any).code = "not_connected";
    throw err;
  }
  return row;
}

/** Persist a freshly-fetched profile + meta blobs. Returns the resulting public profile. */
async function persistRefresh(
  ctx: Ctx,
  creds: HabiticaCreds,
  options: { reconcileCompletions: boolean },
): Promise<{
  publicProfile: PublicProfile;
  habitsUpdated: number;
  dailiesUpdated: number;
  completionsApplied: number;
  newTasksImported: number;
  tasksUnlinked: number;
}> {
  const [user, habits, dailies, todos, tagCatalog] = await Promise.all([
    fetchHabiticaUser(creds),
    fetchHabiticaTasks(creds, "habits"),
    fetchHabiticaTasks(creds, "dailys"),
    fetchHabiticaTasks(creds, "todos"),
    fetchHabiticaTags(creds).catch(() => [] as HabiticaTagRow[]),
  ]);
  const tagNameById = new Map<string, string>();
  for (const t of tagCatalog) {
    if (t && t.id && t.name) tagNameById.set(t.id, t.name);
  }

  const publicProfile = buildPublicProfile(user);
  await ctx.adminClient
    .from("user_integrations")
    .update({
      display_name: publicProfile.displayName,
      username: publicProfile.username,
      remote_level: publicProfile.level,
      public_profile: publicProfile,
      last_synced_at: new Date().toISOString(),
    })
    .eq("user_id", ctx.userId)
    .eq("provider", PROVIDER);

  const byId = new Map<string, HabiticaTask>();
  for (const t of [...habits, ...dailies, ...todos]) byId.set(t.id, t);

  const { data: linked, error: linkedErr } = await ctx.adminClient
    .from("tasks")
    .select("id, type, habitica_task_id, last_completed_local_date")
    .eq("user_id", ctx.userId)
    .not("habitica_task_id", "is", null);
  if (linkedErr) throw new Error(linkedErr.message);

  type LinkedRow = {
    id: string;
    type: "habit" | "daily" | "todo";
    habitica_task_id: string;
    last_completed_local_date: string | null;
  };
  const linkedRows = (linked ?? []) as LinkedRow[];
  const todayUtc = new Date().toISOString().slice(0, 10);

  let habitsUpdated = 0;
  let dailiesUpdated = 0;
  let completionsApplied = 0;
  let newTasksImported = 0;
  let tasksUnlinked = 0;

  for (const localRow of linkedRows) {
    const remote = byId.get(localRow.habitica_task_id);
    if (!remote) continue;
    const patch: Record<string, unknown> = {
      habitica_meta: buildTaskMeta(remote),
    };

    // Sync the first Habitica reminder time → reminder_time (HH:MM).
    if (Array.isArray(remote.reminders) && remote.reminders.length > 0) {
      const rawTime = remote.reminders[0].time ?? "";
      // Habitica stores time as "HH:MM" or full ISO; extract HH:MM.
      const match = rawTime.match(/(\d{2}:\d{2})/);
      if (match) patch.reminder_time = match[1];
    }

    if (options.reconcileCompletions) {
      if (localRow.type === "habit" && remote.type === "habit") {
        if (typeof remote.counterUp === "number") patch.positive_count = remote.counterUp;
        if (typeof remote.counterDown === "number") patch.negative_count = remote.counterDown;
        habitsUpdated += 1;
      } else if (localRow.type === "daily" && remote.type === "daily") {
        if (typeof remote.streak === "number") {
          patch.streak_current = remote.streak;
          patch.streak_best = remote.streak;
        }
        const wasCompletedToday = localRow.last_completed_local_date === todayUtc;
        if (remote.completed === true && !wasCompletedToday) {
          patch.completed = true;
          patch.last_completed_local_date = todayUtc;
          patch.last_completed_at = new Date().toISOString();
          completionsApplied += 1;
        } else if (remote.completed === false && wasCompletedToday) {
          patch.completed = false;
          patch.last_completed_local_date = null;
          patch.last_completed_at = null;
        }
        dailiesUpdated += 1;
      }
    } else if (localRow.type === "habit" && remote.type === "habit") {
      habitsUpdated += 1;
    } else if (localRow.type === "daily" && remote.type === "daily") {
      dailiesUpdated += 1;
    }

    const { error } = await ctx.adminClient
      .from("tasks")
      .update(patch)
      .eq("user_id", ctx.userId)
      .eq("id", localRow.id);
    if (error) {
      // best-effort per row; keep going
      if (localRow.type === "habit") habitsUpdated = Math.max(0, habitsUpdated - 1);
      if (localRow.type === "daily") dailiesUpdated = Math.max(0, dailiesUpdated - 1);
    }

    // Mirror Habitica tags → Aura sigils for this linked task. Habitica wins on
    // refresh, so the local set is replaced. Aura → Habitica edits live-push
    // via `actionTagSync`.
    try {
      const remoteTagNames = Array.isArray(remote.tags)
        ? remote.tags
            .map((tid) => tagNameById.get(tid))
            .filter((v): v is string => !!v)
            .map((v) => v.trim().toLowerCase())
            .filter((v) => v.length > 0)
        : [];
      // Resolve / create Aura tag rows by lowercase name.
      const auraTagIds: string[] = [];
      for (const name of remoteTagNames) {
        const { data: existing } = await ctx.adminClient
          .from("tags")
          .select("id")
          .eq("user_id", ctx.userId)
          .ilike("name", name)
          .maybeSingle();
        let auraTagId = (existing as { id: string } | null)?.id ?? null;
        if (!auraTagId) {
          const { data: ins, error: insErr } = await ctx.adminClient
            .from("tags")
            .insert({ user_id: ctx.userId, name })
            .select("id")
            .single();
          if (!insErr && ins) auraTagId = (ins as { id: string }).id;
        }
        if (auraTagId) auraTagIds.push(auraTagId);
      }
      // Replace task_tags for this task with the Habitica-derived set.
      await ctx.adminClient.from("task_tags").delete().eq("task_id", localRow.id);
      if (auraTagIds.length > 0) {
        await ctx.adminClient
          .from("task_tags")
          .insert(auraTagIds.map((tid) => ({ task_id: localRow.id, tag_id: tid })));
      }
    } catch {
      // non-fatal: keep going with the next linked task
    }
  }

  // --- Delete tasks locally that were deleted on Habitica ---
  // A linked local task whose habitica_task_id no longer appears in the remote
  // set was deleted on Habitica — delete it here too so both sides stay in sync.
  for (const localRow of linkedRows) {
    if (!byId.has(localRow.habitica_task_id)) {
      await ctx.adminClient
        .from("tasks")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("id", localRow.id);
      tasksUnlinked += 1;
    }
  }

  // --- Detect new tasks on Habitica and import them ---
  // Any Habitica task whose id is not already mapped to an Aura task is new.
  const linkedHabiticaIds = new Set(linkedRows.map((r) => r.habitica_task_id));
  const activeTodos = todos.filter((t) => t.completed !== true);
  const remoteTasks = [...habits, ...dailies, ...activeTodos];

  for (const remote of remoteTasks) {
    if (linkedHabiticaIds.has(remote.id)) continue;
    const auraType =
      remote.type === "habit"
        ? "habit"
        : remote.type === "daily"
          ? "daily"
          : remote.type === "todo"
            ? "todo"
            : null;
    if (!auraType) continue;

    const { error: insErr } = await ctx.adminClient.from("tasks").insert({
      user_id: ctx.userId,
      type: auraType,
      title: remote.text || "Untitled (from Habitica)",
      notes: remote.notes ?? "",
      difficulty: priorityToDifficulty(remote.priority),
      habitica_task_id: remote.id,
      habitica_meta: buildTaskMeta(remote),
    });
    if (!insErr) newTasksImported += 1;
  }

  return { publicProfile, habitsUpdated, dailiesUpdated, completionsApplied, newTasksImported, tasksUnlinked };
}

async function actionStatus(ctx: Ctx) {
  let row = await loadIntegration(ctx);
  if (!row) {
    return jsonResponse({
      connected: false,
      profile: null,
      publicProfile: null,
      settings: { ...DEFAULT_SETTINGS },
      lastSyncedAt: null,
    });
  }

  // Backfill public_profile if it was never populated (e.g. user connected
  // before this column existed). Do it inline so friends can see the profile
  // immediately after the owner's next status call.
  const profileEmpty =
    !row.public_profile ||
    (typeof row.public_profile === "object" &&
      Object.keys(row.public_profile).length === 0);

  if (profileEmpty) {
    try {
      const creds: HabiticaCreds = {
        external_user_id: row.external_user_id,
        api_token: row.api_token,
      };
      const summary = await persistRefresh(ctx, creds, { reconcileCompletions: false });
      // Reload the row so we return the freshly-written public_profile.
      row = (await loadIntegration(ctx)) ?? row;
      return jsonResponse({
        connected: true,
        profile: publicProfileSummary(row),
        publicProfile: summary.publicProfile,
        settings: normalizeSettings(row.settings),
        lastSyncedAt: row.last_synced_at,
      });
    } catch {
      // If the backfill fails (e.g. rate-limit), fall through and return what we have.
    }
  }

  return jsonResponse({
    connected: true,
    profile: publicProfileSummary(row),
    publicProfile: row.public_profile ?? null,
    settings: normalizeSettings(row.settings),
    lastSyncedAt: row.last_synced_at,
  });
}

async function actionConnect(ctx: Ctx, body: Record<string, unknown>) {
  const externalUserId = typeof body.userId === "string" ? body.userId.trim() : "";
  const apiToken = typeof body.apiToken === "string" ? body.apiToken.trim() : "";
  if (!externalUserId || !apiToken) {
    return badRequest("Both User ID and API Token are required.");
  }

  let user: HabiticaUserDetailed;
  try {
    user = await fetchHabiticaUser({
      external_user_id: externalUserId,
      api_token: apiToken,
    });
  } catch (e: any) {
    const status = e?.status === 401 ? 401 : 400;
    return jsonResponse(
      { error: e?.message ?? "Could not verify Habitica credentials.", status },
      status,
    );
  }

  const publicProfile = buildPublicProfile(user);
  const { error } = await ctx.adminClient.from("user_integrations").upsert(
    {
      user_id: ctx.userId,
      provider: PROVIDER,
      external_user_id: publicProfile.externalUserId,
      api_token: apiToken,
      display_name: publicProfile.displayName,
      username: publicProfile.username,
      remote_level: publicProfile.level,
      public_profile: publicProfile,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider" },
  );
  if (error) return serverError(error.message);

  return jsonResponse({
    connected: true,
    profile: {
      externalUserId: publicProfile.externalUserId,
      displayName: publicProfile.displayName,
      username: publicProfile.username,
      level: publicProfile.level,
    },
    publicProfile,
    settings: { ...DEFAULT_SETTINGS },
    lastSyncedAt: new Date().toISOString(),
  });
}

async function actionDisconnect(ctx: Ctx) {
  const { error: clearMapErr } = await ctx.adminClient
    .from("tasks")
    .update({ habitica_task_id: null, habitica_meta: null })
    .eq("user_id", ctx.userId)
    .not("habitica_task_id", "is", null);
  if (clearMapErr) return serverError(clearMapErr.message);

  const { error } = await ctx.adminClient
    .from("user_integrations")
    .delete()
    .eq("user_id", ctx.userId)
    .eq("provider", PROVIDER);
  if (error) return serverError(error.message);

  return jsonResponse({ connected: false });
}

async function actionUpdateSettings(ctx: Ctx, body: Record<string, unknown>) {
  const next = normalizeSettings(body.settings);
  const { error } = await ctx.adminClient
    .from("user_integrations")
    .update({ settings: next })
    .eq("user_id", ctx.userId)
    .eq("provider", PROVIDER);
  if (error) return serverError(error.message);
  return jsonResponse({ settings: next });
}

async function actionImport(ctx: Ctx) {
  const row = await requireIntegration(ctx);
  const creds: HabiticaCreds = {
    external_user_id: row.external_user_id,
    api_token: row.api_token,
  };

  const [habits, dailies, todos] = await Promise.all([
    fetchHabiticaTasks(creds, "habits"),
    fetchHabiticaTasks(creds, "dailys"),
    fetchHabiticaTasks(creds, "todos"),
  ]);

  // Habitica's `/tasks/user?type=todos` only returns ACTIVE todos; we just
  // import those and skip ones already completed on Habitica.
  const activeTodos = todos.filter((t) => t.completed !== true);

  const remoteIds = [...habits, ...dailies, ...activeTodos].map((t) => t.id);
  let mapped = new Set<string>();
  if (remoteIds.length > 0) {
    const { data: existing, error } = await ctx.adminClient
      .from("tasks")
      .select("habitica_task_id")
      .eq("user_id", ctx.userId)
      .in("habitica_task_id", remoteIds);
    if (error) return serverError(error.message);
    mapped = new Set(
      ((existing ?? []) as { habitica_task_id: string | null }[])
        .map((r) => r.habitica_task_id)
        .filter((v): v is string => !!v),
    );
  }

  let importedHabits = 0;
  let importedDailies = 0;
  let importedTodos = 0;
  let skipped = 0;

  const insertOne = async (h: HabiticaTask) => {
    if (mapped.has(h.id)) {
      skipped += 1;
      return;
    }
    const auraType =
      h.type === "habit"
        ? "habit"
        : h.type === "daily"
          ? "daily"
          : h.type === "todo"
            ? "todo"
            : null;
    if (!auraType) {
      skipped += 1;
      return;
    }
    const { error } = await ctx.adminClient.from("tasks").insert({
      user_id: ctx.userId,
      type: auraType,
      title: h.text || "Untitled (from Habitica)",
      notes: h.notes ?? "",
      difficulty: priorityToDifficulty(h.priority),
      habitica_task_id: h.id,
      habitica_meta: buildTaskMeta(h),
    });
    if (error) {
      skipped += 1;
      return;
    }
    if (auraType === "habit") importedHabits += 1;
    else if (auraType === "daily") importedDailies += 1;
    else importedTodos += 1;
  };

  for (const h of habits) await insertOne(h);
  for (const d of dailies) await insertOne(d);
  for (const t of activeTodos) await insertOne(t);

  // Pick up the latest user profile too so the HUD reflects newly-earned levels etc.
  try {
    const user = await fetchHabiticaUser(creds);
    const publicProfile = buildPublicProfile(user);
    await ctx.adminClient
      .from("user_integrations")
      .update({
        display_name: publicProfile.displayName,
        username: publicProfile.username,
        remote_level: publicProfile.level,
        public_profile: publicProfile,
        last_synced_at: new Date().toISOString(),
      })
      .eq("user_id", ctx.userId)
      .eq("provider", PROVIDER);
  } catch {
    // Non-blocking: import already succeeded.
  }

  return jsonResponse({ importedHabits, importedDailies, importedTodos, skipped });
}

async function actionScore(ctx: Ctx, body: Record<string, unknown>) {
  const auraTaskId = typeof body.auraTaskId === "string" ? body.auraTaskId : "";
  const fallbackHabiticaId =
    typeof body.habiticaTaskId === "string" && body.habiticaTaskId.length > 0
      ? body.habiticaTaskId
      : null;
  const direction = body.direction === "up" || body.direction === "down" ? body.direction : null;
  if (!auraTaskId && !fallbackHabiticaId) {
    return badRequest("auraTaskId or habiticaTaskId is required.");
  }
  if (!direction) return badRequest("direction is required.");

  const row = await loadIntegration(ctx);
  if (!row) return jsonResponse({ scored: false, reason: "not_connected" });

  const settings = normalizeSettings(row.settings);
  if (!settings.autoSyncOnComplete) {
    return jsonResponse({ scored: false, reason: "auto_sync_disabled" });
  }

  let habiticaTaskId: string | null = null;
  if (auraTaskId) {
    const { data: task, error } = await ctx.adminClient
      .from("tasks")
      .select("habitica_task_id")
      .eq("user_id", ctx.userId)
      .eq("id", auraTaskId)
      .maybeSingle();
    if (error) return serverError(error.message);
    habiticaTaskId = (task as { habitica_task_id: string | null } | null)?.habitica_task_id ?? null;
  }
  if (!habiticaTaskId) habiticaTaskId = fallbackHabiticaId;
  if (!habiticaTaskId) return jsonResponse({ scored: false, reason: "no_mapping" });

  // Snapshot the player's stats *before* the score so we can present a
  // per-score reward delta to the user. We use the cached public profile —
  // it lags real Habitica state by a few seconds at worst, which is fine
  // for deltas because the score response itself contains the new values.
  const before = row.public_profile ?? null;
  const beforeStats = {
    exp: typeof before?.exp === "number" ? before.exp : null,
    gp: typeof before?.gold === "number" ? before.gold : null,
    hp: typeof before?.hp === "number" ? before.hp : null,
    mp: typeof before?.mp === "number" ? before.mp : null,
    lvl: typeof before?.level === "number" ? before.level : null,
  };

  let scoreResult: HabiticaScoreResult;
  try {
    scoreResult = await scoreHabiticaTask(
      { external_user_id: row.external_user_id, api_token: row.api_token },
      habiticaTaskId,
      direction,
    );
  } catch (e: any) {
    const status = e?.status ?? 500;
    return jsonResponse({ scored: false, error: e?.message ?? "Habitica score failed" }, status);
  }

  // Build the reward delta. For each stat we report a delta only when both
  // sides are known and Habitica actually returned a new value for that
  // stat (the score endpoint omits stats it didn't touch — e.g. `mp` only
  // changes when the player is a mage casting on score, etc.).
  const after = {
    exp: typeof scoreResult.exp === "number" ? scoreResult.exp : null,
    gp: typeof scoreResult.gp === "number" ? scoreResult.gp : null,
    hp: typeof scoreResult.hp === "number" ? scoreResult.hp : null,
    mp: typeof scoreResult.mp === "number" ? scoreResult.mp : null,
    lvl: typeof scoreResult.lvl === "number" ? scoreResult.lvl : null,
  };

  const diff = (b: number | null, a: number | null): number | null =>
    b !== null && a !== null ? Math.round((a - b) * 100) / 100 : null;

  const reward = {
    delta: typeof scoreResult.delta === "number" ? scoreResult.delta : null,
    xpDelta: diff(beforeStats.exp, after.exp),
    goldDelta: diff(beforeStats.gp, after.gp),
    hpDelta: diff(beforeStats.hp, after.hp),
    mpDelta: diff(beforeStats.mp, after.mp),
    leveledUp:
      after.lvl !== null && beforeStats.lvl !== null && after.lvl > beforeStats.lvl
        ? { from: beforeStats.lvl, to: after.lvl }
        : null,
    drop: scoreResult._tmp?.drop ?? null,
    quest: scoreResult._tmp?.quest ?? null,
  };

  // Push the post-score stats into the cached public_profile snapshot so
  // the HUD chip stays in sync and the next score's "before" baseline is
  // accurate. We only patch the fields Habitica actually returned.
  if (before) {
    const nextProfile: PublicProfile = {
      ...before,
      exp: after.exp ?? before.exp,
      gold: after.gp ?? before.gold,
      hp: after.hp ?? before.hp,
      mp: after.mp ?? before.mp,
      level: after.lvl ?? before.level,
      refreshedAt: new Date().toISOString(),
    };
    await ctx.adminClient
      .from("user_integrations")
      .update({ public_profile: nextProfile, remote_level: nextProfile.level })
      .eq("user_id", ctx.userId)
      .eq("provider", PROVIDER);
  }

  return jsonResponse({ scored: true, reward });
}

async function actionSyncPull(ctx: Ctx) {
  const row = await requireIntegration(ctx);
  const creds: HabiticaCreds = {
    external_user_id: row.external_user_id,
    api_token: row.api_token,
  };
  const summary = await persistRefresh(ctx, creds, { reconcileCompletions: true });
  return jsonResponse({
    habitsUpdated: summary.habitsUpdated,
    dailiesUpdated: summary.dailiesUpdated,
    completionsApplied: summary.completionsApplied,
    newTasksImported: summary.newTasksImported,
    tasksUnlinked: summary.tasksUnlinked,
  });
}

async function actionRefresh(ctx: Ctx) {
  const row = await requireIntegration(ctx);
  const creds: HabiticaCreds = {
    external_user_id: row.external_user_id,
    api_token: row.api_token,
  };
  const summary = await persistRefresh(ctx, creds, { reconcileCompletions: false });
  return jsonResponse({
    publicProfile: summary.publicProfile,
    tasksRefreshed: summary.habitsUpdated + summary.dailiesUpdated,
    newTasksImported: summary.newTasksImported,
    tasksUnlinked: summary.tasksUnlinked,
  });
}

async function actionTagSync(ctx: Ctx, body: Record<string, unknown>) {
  const auraTaskId = typeof body.auraTaskId === "string" ? body.auraTaskId : "";
  const op = body.op === "add" || body.op === "remove" ? body.op : null;
  const tagName = typeof body.tagName === "string" ? body.tagName.trim() : "";
  if (!auraTaskId || !op || !tagName) {
    return badRequest("auraTaskId, op, and tagName are required.");
  }

  const row = await loadIntegration(ctx);
  if (!row) return jsonResponse({ synced: false, reason: "not_connected" });

  const { data: task, error } = await ctx.adminClient
    .from("tasks")
    .select("habitica_task_id")
    .eq("user_id", ctx.userId)
    .eq("id", auraTaskId)
    .maybeSingle();
  if (error) return serverError(error.message);
  const habiticaTaskId =
    (task as { habitica_task_id: string | null } | null)?.habitica_task_id ?? null;
  if (!habiticaTaskId) return jsonResponse({ synced: false, reason: "no_mapping" });

  const creds: HabiticaCreds = {
    external_user_id: row.external_user_id,
    api_token: row.api_token,
  };

  try {
    const catalog = await fetchHabiticaTags(creds);
    const lower = tagName.toLowerCase();
    let tag = catalog.find((t) => t.name?.trim().toLowerCase() === lower) ?? null;

    if (op === "add") {
      if (!tag) tag = await createHabiticaTag(creds, tagName);
      await attachHabiticaTaskTag(creds, habiticaTaskId, tag.id);
    } else {
      if (!tag) return jsonResponse({ synced: false, reason: "tag_not_found" });
      await detachHabiticaTaskTag(creds, habiticaTaskId, tag.id);
    }
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return jsonResponse({ synced: false, error: e?.message ?? "Tag sync failed" }, status);
  }
  return jsonResponse({ synced: true });
}

async function actionPushTask(ctx: Ctx, body: Record<string, unknown>) {
  const auraTaskId = typeof body.auraTaskId === "string" ? body.auraTaskId : "";
  if (!auraTaskId) return badRequest("auraTaskId is required.");

  const row = await loadIntegration(ctx);
  if (!row) return jsonResponse({ pushed: false, reason: "not_connected" });

  const { data: task, error } = await ctx.adminClient
    .from("tasks")
    .select(
      "habitica_task_id, type, title, notes, difficulty, repeat_every, repeat_unit, sacred_days",
    )
    .eq("user_id", ctx.userId)
    .eq("id", auraTaskId)
    .maybeSingle();
  if (error) return serverError(error.message);
  if (!task) return jsonResponse({ pushed: false, reason: "no_task" });
  const habiticaTaskId = (task as { habitica_task_id: string | null }).habitica_task_id ?? null;
  if (!habiticaTaskId) return jsonResponse({ pushed: false, reason: "no_mapping" });

  type LocalTask = {
    habitica_task_id: string;
    type: "habit" | "daily" | "todo";
    title: string;
    notes: string | null;
    difficulty: keyof typeof DIFFICULTY_PRIORITY;
    repeat_every: number | null;
    repeat_unit: string | null;
    sacred_days: number | null;
  };
  const t = task as LocalTask;

  const payload: Record<string, unknown> = {
    text: t.title,
    notes: t.notes ?? "",
    priority: DIFFICULTY_PRIORITY[t.difficulty] ?? 1,
  };
  if (t.type === "daily") {
    const freq = REPEAT_UNIT_TO_FREQUENCY[t.repeat_unit ?? "day"] ?? "daily";
    payload.frequency = freq;
    payload.everyX = Math.max(1, t.repeat_every ?? 1);
    if (freq === "weekly") {
      payload.repeat = sacredDaysToRepeat(t.sacred_days);
    }
  }

  const creds: HabiticaCreds = {
    external_user_id: row.external_user_id,
    api_token: row.api_token,
  };
  let updated: HabiticaTask | null = null;
  try {
    updated = await updateHabiticaTask(creds, habiticaTaskId, payload);
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return jsonResponse({ pushed: false, error: e?.message ?? "Habitica update failed" }, status);
  }

  if (updated) {
    await ctx.adminClient
      .from("tasks")
      .update({ habitica_meta: buildTaskMeta(updated) })
      .eq("user_id", ctx.userId)
      .eq("id", auraTaskId);
  }

  return jsonResponse({ pushed: true });
}

async function actionCreateTask(ctx: Ctx, body: Record<string, unknown>) {
  const auraTaskId = typeof body.auraTaskId === "string" ? body.auraTaskId : "";
  if (!auraTaskId) return badRequest("auraTaskId is required.");

  const row = await loadIntegration(ctx);
  if (!row) return jsonResponse({ created: false, reason: "not_connected" });

  const { data: task, error } = await ctx.adminClient
    .from("tasks")
    .select(
      "habitica_task_id, type, title, notes, difficulty, repeat_every, repeat_unit, sacred_days",
    )
    .eq("user_id", ctx.userId)
    .eq("id", auraTaskId)
    .maybeSingle();
  if (error) return serverError(error.message);
  if (!task) return jsonResponse({ created: false, reason: "no_task" });

  type LocalTask = {
    habitica_task_id: string | null;
    type: "habit" | "daily" | "todo";
    title: string;
    notes: string | null;
    difficulty: keyof typeof DIFFICULTY_PRIORITY;
    repeat_every: number | null;
    repeat_unit: string | null;
    sacred_days: number | null;
  };
  const t = task as LocalTask;

  // Already linked — no-op to avoid creating duplicates.
  if (t.habitica_task_id) return jsonResponse({ created: false, reason: "already_linked" });

  const habiticaType = t.type === "daily" ? "daily" : t.type === "habit" ? "habit" : "todo";
  const payload: Record<string, unknown> = {
    type: habiticaType,
    text: t.title,
    notes: t.notes ?? "",
    priority: DIFFICULTY_PRIORITY[t.difficulty] ?? 1,
  };
  if (t.type === "daily") {
    const freq = REPEAT_UNIT_TO_FREQUENCY[t.repeat_unit ?? "day"] ?? "daily";
    payload.frequency = freq;
    payload.everyX = Math.max(1, t.repeat_every ?? 1);
    if (freq === "weekly") {
      payload.repeat = sacredDaysToRepeat(t.sacred_days);
    }
  }

  const creds: HabiticaCreds = {
    external_user_id: row.external_user_id,
    api_token: row.api_token,
  };

  let created: HabiticaTask;
  try {
    created = await createHabiticaTask(creds, payload);
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    return jsonResponse({ created: false, error: e?.message ?? "Habitica create failed" }, status);
  }

  await ctx.adminClient
    .from("tasks")
    .update({ habitica_task_id: created.id, habitica_meta: buildTaskMeta(created) })
    .eq("user_id", ctx.userId)
    .eq("id", auraTaskId);

  return jsonResponse({ created: true, habiticaTaskId: created.id });
}

async function actionDeleteTask(ctx: Ctx, body: Record<string, unknown>) {
  const auraTaskId = typeof body.auraTaskId === "string" ? body.auraTaskId : "";
  if (!auraTaskId) return badRequest("auraTaskId is required.");

  const row = await loadIntegration(ctx);
  if (!row) return jsonResponse({ deleted: false, reason: "not_connected" });

  const { data: task, error } = await ctx.adminClient
    .from("tasks")
    .select("habitica_task_id")
    .eq("user_id", ctx.userId)
    .eq("id", auraTaskId)
    .maybeSingle();
  if (error) return serverError(error.message);
  const habiticaTaskId =
    (task as { habitica_task_id: string | null } | null)?.habitica_task_id ?? null;
  if (!habiticaTaskId) return jsonResponse({ deleted: false, reason: "no_mapping" });

  const creds: HabiticaCreds = {
    external_user_id: row.external_user_id,
    api_token: row.api_token,
  };
  try {
    await deleteHabiticaTask(creds, habiticaTaskId);
  } catch (e: any) {
    // 404 means it was already gone on Habitica's side — treat as success.
    if ((e as { status?: number })?.status !== 404) {
      const status = typeof e?.status === "number" ? e.status : 500;
      return jsonResponse(
        { deleted: false, error: e?.message ?? "Habitica delete failed" },
        status,
      );
    }
  }

  return jsonResponse({ deleted: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return unauthorized();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return serverError("Supabase environment is not fully configured.");
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return unauthorized();

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ctx: Ctx = { userId: userData.user.id, adminClient };

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // ok — some actions have no body
    }
    const action = typeof body.action === "string" ? body.action : "";

    switch (action) {
      case "status":
        return await actionStatus(ctx);
      case "connect":
        return await actionConnect(ctx, body);
      case "disconnect":
        return await actionDisconnect(ctx);
      case "updateSettings":
        return await actionUpdateSettings(ctx, body);
      case "import":
        return await actionImport(ctx);
      case "score":
        return await actionScore(ctx, body);
      case "syncPull":
        return await actionSyncPull(ctx);
      case "refresh":
        return await actionRefresh(ctx);
      case "tagSync":
        return await actionTagSync(ctx, body);
      case "pushTask":
        return await actionPushTask(ctx, body);
      case "createTask":
        return await actionCreateTask(ctx, body);
      case "deleteTask":
        return await actionDeleteTask(ctx, body);
      default:
        return badRequest(`Unknown action: ${action || "<missing>"}`);
    }
  } catch (e: any) {
    const message = typeof e?.message === "string" ? e.message : "Internal server error";
    const status = typeof e?.status === "number" ? e.status : 500;
    return jsonResponse({ error: message }, status);
  }
});
