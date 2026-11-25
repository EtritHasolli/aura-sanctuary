import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import { normalizeRoomCode, useStudyCall, type StudyCallState } from "@/hooks/useStudyCall";
import { useProfile } from "@/hooks/useProfile";
import { notificationDisplayText, studyCallCode } from "@/lib/notificationLinks";
import { StudyCallModal } from "./StudyCallModal";
import {
  NOTIFICATION_RECEIVED_EVENT,
  useNotifications,
  type NotificationReceivedDetail,
} from "./NotificationsContext";

interface StudyCallCtx {
  callState: StudyCallState | null;
  isLoading: boolean;
  error: string | null;
  createCall: () => Promise<string | null>;
  /** Joins `roomCode` (switching calls if needed) and marks its invites read. */
  joinCall: (roomCode: string) => Promise<boolean>;
  leaveCall: () => void;
}

const Ctx = createContext<StudyCallCtx | null>(null);

/**
 * Owns the active study call for the whole app, so a call survives page navigation
 * (picture-in-picture keeps floating) and invites can be joined from anywhere.
 */
export function StudyCallProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useProfile();
  const displayName = profile?.display_name ?? "Adventurer";
  const { callState, isLoading, error, createCall, joinCall, leaveCall } = useStudyCall();
  const { markMatchingRead } = useNotifications();

  const join = useCallback(
    async (roomCode: string) => {
      const code = normalizeRoomCode(roomCode);
      markMatchingRead((message) => studyCallCode(message) === code);
      if (callState?.roomName === code) return true;
      const ok = await joinCall(code, displayName);
      if (ok) toast.success(`Joined study call ${code}`);
      else toast.error("Could not join the study call.");
      return ok;
    },
    [callState?.roomName, displayName, joinCall, markMatchingRead],
  );

  // Pop a JOIN toast when a friend invites us while the app is open.
  useEffect(() => {
    const onReceived = (event: Event) => {
      const { notification, local } = (event as CustomEvent<NotificationReceivedDetail>).detail;
      if (local) return;
      const code = studyCallCode(notification.message);
      if (!code) return;
      toast(notificationDisplayText(notification.message), {
        id: `call-invite-${notification.id}`,
        duration: 30_000,
        action: { label: "JOIN", onClick: () => void join(code) },
      });
    };
    window.addEventListener(NOTIFICATION_RECEIVED_EVENT, onReceived);
    return () => window.removeEventListener(NOTIFICATION_RECEIVED_EVENT, onReceived);
  }, [join]);

  const value = useMemo<StudyCallCtx>(
    () => ({
      callState,
      isLoading,
      error,
      createCall: () => createCall(displayName),
      joinCall: join,
      leaveCall: () => leaveCall(),
    }),
    [callState, isLoading, error, createCall, displayName, join, leaveCall],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {callState && (
        <StudyCallModal
          key={callState.roomName}
          callState={callState}
          onLeave={() => leaveCall(callState.roomName)}
        />
      )}
    </Ctx.Provider>
  );
}

export function useStudyCallContext() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudyCallContext outside StudyCallProvider");
  return ctx;
}
