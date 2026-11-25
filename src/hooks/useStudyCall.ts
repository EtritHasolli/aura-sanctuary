import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface StudyCallState {
  roomName: string;
  token: string;
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function normalizeRoomCode(raw: string) {
  return raw.toUpperCase().trim();
}

export function useStudyCall() {
  const [callState, setCallState] = useState<StudyCallState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchToken = useCallback(async (roomName: string, displayName: string): Promise<string> => {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/livekit-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ roomName, participantName: displayName }),
      },
    );
    if (!res.ok) throw new Error("Failed to get call token");
    const json = await res.json() as { token: string };
    return json.token;
  }, []);

  const createCall = useCallback(async (displayName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const roomName = generateRoomCode();
      const token = await fetchToken(roomName, displayName);
      setCallState({ roomName, token });
      return roomName;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create call");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [fetchToken]);

  /** Resolves true once the token is fetched and the call UI is shown. */
  const joinCall = useCallback(async (roomName: string, displayName: string) => {
    const code = normalizeRoomCode(roomName);
    setIsLoading(true);
    setError(null);
    try {
      const token = await fetchToken(code, displayName);
      setCallState({ roomName: code, token });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join call");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchToken]);

  /**
   * Leaves the call. With `roomName`, only leaves if that room is still the active one, so a
   * late disconnect event from a previous room can't end a call the user just switched to.
   */
  const leaveCall = useCallback((roomName?: string) => {
    setCallState((current) => (!roomName || current?.roomName === roomName ? null : current));
    setError(null);
  }, []);

  return { callState, isLoading, error, createCall, joinCall, leaveCall };
}
