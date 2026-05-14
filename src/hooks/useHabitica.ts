import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface HabiticaProfile {
  externalUserId: string;
  displayName: string;
  username: string | null;
  level: number;
}

export interface HabiticaPublicProfile {
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
  refreshedAt: string | null;
}

export interface HabiticaSyncSettings {
  autoSyncOnComplete: boolean;
}

export interface HabiticaStatus {
  connected: boolean;
  profile: HabiticaProfile | null;
  publicProfile: HabiticaPublicProfile | null;
  settings: HabiticaSyncSettings;
  lastSyncedAt: string | null;
}

const DEFAULT_STATUS: HabiticaStatus = {
  connected: false,
  profile: null,
  publicProfile: null,
  settings: { autoSyncOnComplete: true },
  lastSyncedAt: null,
};

type HabiticaAction =
  | "status"
  | "connect"
  | "disconnect"
  | "updateSettings"
  | "import"
  | "score"
  | "syncPull"
  | "refresh"
  | "tagSync"
  | "pushTask"
  | "createTask"
  | "deleteTask";

interface InvokeOptions {
  action: HabiticaAction;
  payload?: Record<string, unknown>;
}

async function invokeHabitica<T>({ action, payload }: InvokeOptions): Promise<T> {
  const { data, error } = await supabase.functions.invoke("habitica", {
    body: { action, ...(payload ?? {}) },
  });
  if (error) {
    let serverMessage: string | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as { error?: string };
        if (parsed?.error) serverMessage = parsed.error;
      } catch {
        // ignore
      }
    }
    throw new Error(serverMessage ?? error.message ?? "Habitica request failed");
  }
  return data as T;
}

const habiticaStatusKey = (userId: string | undefined) => ["habitica", "status", userId] as const;

export function useHabiticaStatus() {
  const { user } = useAuth();
  return useQuery({
    queryKey: habiticaStatusKey(user?.id),
    enabled: !!user,
    queryFn: () => invokeHabitica<HabiticaStatus>({ action: "status" }),
    placeholderData: DEFAULT_STATUS,
    staleTime: 30_000,
  });
}

export function useConnectHabitica() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { userId: string; apiToken: string }) => {
      const userId = input.userId.trim();
      const apiToken = input.apiToken.trim();
      if (!userId || !apiToken) {
        throw new Error("Both User ID and API Token are required.");
      }
      return invokeHabitica<HabiticaStatus>({
        action: "connect",
        payload: { userId, apiToken },
      });
    },
    onSuccess: (status) => {
      qc.setQueryData(habiticaStatusKey(user?.id), status);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not connect to Habitica.";
      toast.error(message);
    },
  });
}

export function useDisconnectHabitica() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () => invokeHabitica<{ connected: false }>({ action: "disconnect" }),
    onSuccess: () => {
      qc.setQueryData(habiticaStatusKey(user?.id), DEFAULT_STATUS);
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not disconnect from Habitica.";
      toast.error(message);
    },
  });
}

export function useUpdateHabiticaSettings() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (settings: HabiticaSyncSettings) =>
      invokeHabitica<{ settings: HabiticaSyncSettings }>({
        action: "updateSettings",
        payload: { settings },
      }),
    onSuccess: ({ settings }) => {
      qc.setQueryData<HabiticaStatus | undefined>(habiticaStatusKey(user?.id), (prev) =>
        prev ? { ...prev, settings } : prev,
      );
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Could not update Habitica settings.";
      toast.error(message);
    },
  });
}

export interface HabiticaImportSummary {
  importedHabits: number;
  importedDailies: number;
  importedTodos: number;
  skipped: number;
}

export function useImportHabiticaTasks() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () => invokeHabitica<HabiticaImportSummary>({ action: "import" }),
    onSuccess: (summary) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: habiticaStatusKey(user?.id) });
      const total = summary.importedHabits + summary.importedDailies + summary.importedTodos;
      if (total === 0) {
        toast.message(
          summary.skipped > 0
            ? `Habitica import: nothing new (${summary.skipped} already linked).`
            : "Habitica import: no tasks to import.",
        );
      } else {
        toast.success(
          `Imported ${summary.importedHabits} habit(s), ${summary.importedDailies} daily/dailies, ${summary.importedTodos} todo(s) from Habitica.`,
        );
      }
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not import from Habitica.";
      toast.error(message);
    },
  });
}

export interface HabiticaSyncPullSummary {
  habitsUpdated: number;
  dailiesUpdated: number;
  completionsApplied: number;
  newTasksImported: number;
  tasksUnlinked: number;
}

export interface HabiticaRefreshSummary {
  publicProfile: HabiticaPublicProfile;
  tasksRefreshed: number;
}

/**
 * Lightweight refresh: pulls Habitica user profile + linked task metadata into
 * our cache without rewriting Aura completion state. Use this when the goal is
 * just to update the HUD chip or a quest card's Habitica chrome.
 */
export function useRefreshHabitica() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: () => invokeHabitica<HabiticaRefreshSummary>({ action: "refresh" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: habiticaStatusKey(user?.id) });
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Could not refresh Habitica data.";
      toast.error(message);
    },
  });
}

export function useFriendHabiticaProfile(friendUserId: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["habitica", "friend", friendUserId] as const,
    enabled: !!friendUserId && !!user,
    queryFn: async (): Promise<HabiticaPublicProfile | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)(
        "get_friend_habitica_profile",
        { p_friend_user_id: friendUserId! },
      );
      if (error) throw new Error(error.message);
      // RPC returns JSONB — could be a raw string if postgrest doesn't auto-parse
      const parsed: unknown = typeof data === "string" ? JSON.parse(data) : data;
      if (!parsed || (typeof parsed === "object" && Object.keys(parsed as object).length === 0)) {
        return null;
      }
      return parsed as HabiticaPublicProfile;
    },
    staleTime: 60_000,
  });
}

interface SyncFromHabiticaVars {
  /**
   * When true, suppress the "nothing to reconcile" no-op toast and error
   * toasts (used by the page-load auto-sync so the user only ever sees
   * Habitica toasts when something actually changed). Real updates still
   * surface a success toast.
   */
  silent?: boolean;
}

export function useSyncFromHabitica() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<HabiticaSyncPullSummary, Error, SyncFromHabiticaVars | void>({
    mutationFn: () => invokeHabitica<HabiticaSyncPullSummary>({ action: "syncPull" }),
    onSuccess: (summary, variables) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: habiticaStatusKey(user?.id) });
      const total = summary.habitsUpdated + summary.dailiesUpdated;
      const silent = !!variables?.silent;
      const newImports = summary.newTasksImported ?? 0;
      const unlinked = summary.tasksUnlinked ?? 0;
      if (total === 0 && summary.completionsApplied === 0 && newImports === 0 && unlinked === 0) {
        if (!silent) toast.message("Habitica sync: everything up to date.");
      } else {
        const parts: string[] = [];
        if (newImports > 0) parts.push(`${newImports} new task(s) imported`);
        if (summary.completionsApplied > 0) parts.push(`${summary.completionsApplied} completion(s) applied`);
        if (total > 0) parts.push(`${total} task(s) updated`);
        if (unlinked > 0) parts.push(`${unlinked} deleted (removed on Habitica)`);
        toast.success(`Habitica sync: ${parts.join(", ")}.`);
      }
    },
    onError: (error, variables) => {
      if (variables?.silent) return;
      const message = error instanceof Error ? error.message : "Could not sync from Habitica.";
      toast.error(message);
    },
  });
}

/**
 * Fires `syncPull` exactly once per app session, the first time we observe a
 * connected Habitica integration. This is what makes "complete a daily on
 * habitica.com → refresh Aura → it shows as done" work without any user
 * action. The mutation is silent on no-ops so we don't toast on every reload.
 */
export function useHabiticaAutoSync() {
  const { user } = useAuth();
  const { data: status } = useHabiticaStatus();
  const sync = useSyncFromHabitica();
  const firedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!user || !status?.connected) return;
    if (firedFor.current === user.id) return;
    firedFor.current = user.id;
    sync.mutate({ silent: true });
  }, [user, status?.connected, sync]);
}

export interface HabiticaScoreReward {
  delta: number | null;
  xpDelta: number | null;
  goldDelta: number | null;
  hpDelta: number | null;
  mpDelta: number | null;
  leveledUp: { from: number; to: number } | null;
  drop: {
    type?: string;
    key?: string;
    target?: string;
    dialog?: string;
  } | null;
  quest: {
    progressDelta?: number;
    collection?: Record<string, number>;
  } | null;
}

/**
 * Format the reward delta returned by the edge function into a human toast
 * line. Returns null when the score didn't visibly move anything we care
 * about (which happens, e.g., for habits at high negative value where
 * Habitica clamps the reward to ~0).
 */
function formatRewardToast(reward: HabiticaScoreReward): string | null {
  const parts: string[] = [];
  if (reward.xpDelta && Math.abs(reward.xpDelta) >= 0.1) {
    parts.push(`${reward.xpDelta > 0 ? "+" : ""}${reward.xpDelta} XP`);
  }
  if (reward.goldDelta && Math.abs(reward.goldDelta) >= 0.1) {
    parts.push(`${reward.goldDelta > 0 ? "+" : ""}${reward.goldDelta}g`);
  }
  if (reward.hpDelta && Math.abs(reward.hpDelta) >= 0.1) {
    parts.push(`${reward.hpDelta > 0 ? "+" : ""}${reward.hpDelta} HP`);
  }
  if (reward.mpDelta && Math.abs(reward.mpDelta) >= 0.1) {
    parts.push(`${reward.mpDelta > 0 ? "+" : ""}${reward.mpDelta} MP`);
  }
  if (reward.drop?.dialog) {
    parts.push(reward.drop.dialog);
  } else if (reward.drop?.key) {
    parts.push(`drop: ${reward.drop.key}${reward.drop.type ? ` (${reward.drop.type})` : ""}`);
  }
  if (reward.quest?.progressDelta && reward.quest.progressDelta > 0) {
    parts.push(`boss -${Math.round(reward.quest.progressDelta * 10) / 10}`);
  }
  if (parts.length === 0) return null;
  return `Habitica: ${parts.join(" · ")}`;
}

/**
 * Best-effort score push for a local task. Resolves silently when the user is
 * not connected, auto-sync is disabled, or there is no Habitica mapping — the
 * server is the source of truth for all three checks. When the score does
 * land, surfaces a toast describing what Habitica gave back (XP/gold/HP/MP
 * delta, item drops, quest progress, level-ups).
 *
 * `habiticaTaskId` is an optional fallback used by todo completion: by the
 * time we want to score the todo, the local row may already have been
 * deleted (Aura todos are one-shot), so we pass the cached Habitica id
 * captured before deletion.
 */
export function useScoreLinkedHabiticaTask() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useCallback(
    async (auraTaskId: string, direction: "up" | "down", habiticaTaskId?: string | null) => {
      try {
        const res = await invokeHabitica<{
          scored: boolean;
          reason?: string;
          error?: string;
          reward?: HabiticaScoreReward;
        }>({
          action: "score",
          payload: {
            auraTaskId,
            direction,
            ...(habiticaTaskId ? { habiticaTaskId } : {}),
          },
        });
        if (!res.scored) {
          if (res.error) toast.error(`Habitica sync failed: ${res.error}`);
          return;
        }
        if (res.reward) {
          const line = formatRewardToast(res.reward);
          if (line) toast.message(line, { duration: 3000 });
          if (res.reward.leveledUp) {
            toast.success(
              `Habitica level up! ${res.reward.leveledUp.from} → ${res.reward.leveledUp.to}`,
            );
          }
          // The score endpoint already mutated the cached public_profile on
          // the server; bust the HUD chip query so the new HP/MP/XP/gold
          // bars and level chip pick up the changes immediately.
          qc.invalidateQueries({ queryKey: habiticaStatusKey(user?.id) });
        } else if (direction === "up") {
          toast.message("Synced to Habitica.", { duration: 1500 });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Habitica sync failed.";
        toast.error(message);
      }
    },
    [qc, user?.id],
  );
}

/**
 * Best-effort tag attach/detach push. No-ops for unlinked tasks or
 * disconnected users.
 */
export function useSyncTagToHabitica() {
  return useCallback(
    async (input: { auraTaskId: string; op: "add" | "remove"; tagName: string }) => {
      try {
        await invokeHabitica<{ synced: boolean; reason?: string; error?: string }>({
          action: "tagSync",
          payload: input,
        });
      } catch {
        // Silent: tag sync is best-effort.
      }
    },
    [],
  );
}

/**
 * Best-effort push of an Aura task's edits (title, notes, difficulty,
 * frequency/everyX/repeat for dailies) to Habitica via PUT /tasks/:id.
 */
export function useSyncTaskEditToHabitica() {
  const qc = useQueryClient();
  return useCallback(
    async (auraTaskId: string) => {
      try {
        const res = await invokeHabitica<{ pushed: boolean; reason?: string; error?: string }>({
          action: "pushTask",
          payload: { auraTaskId },
        });
        if (res.pushed) {
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }
      } catch {
        // Silent: schedule push is best-effort.
      }
    },
    [qc],
  );
}

/**
 * Best-effort push of a newly-created Aura task to Habitica. Creates the
 * task on Habitica and stores the returned habitica_task_id on the local row.
 * No-ops if not connected or if the task is already linked.
 */
export function usePushNewTaskToHabitica() {
  const qc = useQueryClient();
  return useCallback(
    async (auraTaskId: string) => {
      try {
        const res = await invokeHabitica<{
          created: boolean;
          reason?: string;
          error?: string;
          habiticaTaskId?: string;
        }>({
          action: "createTask",
          payload: { auraTaskId },
        });
        if (res.created) {
          qc.invalidateQueries({ queryKey: ["tasks"] });
        }
      } catch {
        // Silent: best-effort.
      }
    },
    [qc],
  );
}

/**
 * Best-effort deletion of a linked Habitica task when the Aura task is deleted.
 * The local delete should happen first; this fires afterward. No-ops for
 * unlinked tasks or disconnected users.
 */
export function useDeleteLinkedHabiticaTask() {
  return useCallback(async (auraTaskId: string) => {
    try {
      await invokeHabitica<{ deleted: boolean; reason?: string; error?: string }>({
        action: "deleteTask",
        payload: { auraTaskId },
      });
    } catch {
      // Silent: best-effort.
    }
  }, []);
}
