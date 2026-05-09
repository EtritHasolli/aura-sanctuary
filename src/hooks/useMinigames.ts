import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export interface LeaderboardRow {
  rank: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number | null;
  score: number;
  metadata: Record<string, unknown> | null;
  achieved_at: string;
}

export interface PersonalBest {
  score: number;
  metadata: Record<string, unknown> | null;
  achieved_at: string;
  rank: number;
}

export function useMinigameLeaderboard(
  gameSlug: string,
  category: string = "",
  limit: number = 25,
) {
  return useQuery<LeaderboardRow[]>({
    queryKey: ["minigame_leaderboard", gameSlug, category, limit],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: LeaderboardRow[] | null; error: { message: string } | null }>;
      }).rpc("get_minigame_leaderboard", {
        p_game_slug: gameSlug,
        p_category: category,
        p_limit: limit,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!gameSlug,
    staleTime: 30_000,
  });
}

export function useMinigamePersonalBest(gameSlug: string, category: string = "") {
  const { user } = useAuth();
  return useQuery<PersonalBest | null>({
    queryKey: ["minigame_personal_best", gameSlug, category, user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: PersonalBest[] | null; error: { message: string } | null }>;
      }).rpc("get_minigame_personal_best", {
        p_game_slug: gameSlug,
        p_category: category,
      });
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return rows.length > 0 ? rows[0] : null;
    },
    enabled: !!gameSlug && !!user,
    staleTime: 30_000,
  });
}

export interface SubmitScoreInput {
  game_slug: string;
  category?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface SubmitScoreResult {
  is_new_high: boolean;
  best_score: number;
}

export function useSubmitMinigameScore() {
  const qc = useQueryClient();
  return useMutation<SubmitScoreResult, Error, SubmitScoreInput>({
    mutationFn: async (input) => {
      const { data, error } = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: SubmitScoreResult[] | null; error: { message: string } | null }>;
      }).rpc("submit_minigame_score", {
        p_game_slug: input.game_slug,
        p_category: input.category ?? "",
        p_score: input.score,
        p_metadata: input.metadata ?? {},
      });
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      return rows[0] ?? { is_new_high: false, best_score: input.score };
    },
    onSuccess: (_res, input) => {
      qc.invalidateQueries({
        queryKey: ["minigame_leaderboard", input.game_slug, input.category ?? ""],
      });
      qc.invalidateQueries({
        queryKey: ["minigame_personal_best", input.game_slug, input.category ?? ""],
      });
    },
  });
}
