import "@livekit/components-styles";
import {
  LiveKitRoom,
  GridLayout,
  FocusLayout,
  FocusLayoutContainer,
  ParticipantTile,
  ControlBar,
  Chat,
  LayoutContextProvider,
  useLayoutContext,
  useTracks,
  CarouselLayout,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { X, Copy, Check, UserPlus, Users, Minimize2, Maximize2 } from "lucide-react";
import { useState, useCallback } from "react";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StudyCallState } from "@/hooks/useStudyCall";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;

// ── Invite controls ───────────────────────────────────────────────────────────
function InvitePanel({ roomName }: { roomName: string }) {
  const { data: friends = [] } = useFriends();
  const [codeCopied, setCodeCopied] = useState(false);
  const [inviting, setInviting] = useState<Set<string>>(new Set());
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [showFriends, setShowFriends] = useState(false);

  const copyCode = useCallback(() => {
    void navigator.clipboard.writeText(roomName);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [roomName]);

  const inviteFriend = useCallback(async (friendId: string, friendName: string) => {
    setInviting((prev) => new Set(prev).add(friendId));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).rpc("send_call_invite", {
        p_friend_id: friendId,
        p_room_code: roomName,
      });
      if (error) throw error;
      setInvited((prev) => new Set(prev).add(friendId));
      toast.success(`Invited ${friendName}`);
    } catch {
      toast.error("Could not send invite");
    } finally {
      setInviting((prev) => { const n = new Set(prev); n.delete(friendId); return n; });
    }
  }, [roomName]);

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={copyCode}
        className="flex items-center gap-1.5 px-2.5 py-1 border border-border hover:border-primary bg-black/40 transition-colors"
        style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
      >
        {codeCopied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
        {codeCopied ? "COPIED!" : `CODE: ${roomName}`}
      </button>

      <div className="relative">
        <button
          onClick={() => setShowFriends((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-border hover:border-primary bg-black/40 transition-colors"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
        >
          <Users size={11} />
          INVITE
        </button>
        {showFriends && (
          <div className="absolute right-0 top-full mt-1 z-20 pixel-panel bg-card w-52 max-h-56 overflow-y-auto flex flex-col shadow-xl">
            {friends.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">No friends yet.</p>
            ) : friends.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border last:border-b-0">
                <span className="text-xs truncate">{f.profile.display_name}</span>
                <button
                  onClick={() => void inviteFriend(f.id, f.profile.display_name)}
                  disabled={inviting.has(f.id) || invited.has(f.id)}
                  className="shrink-0 p-1 hover:text-primary disabled:opacity-50 transition-colors"
                >
                  {invited.has(f.id)
                    ? <Check size={13} className="text-green-400" />
                    : <UserPlus size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Room layout: screenshare gets focus, cameras in carousel, chat outside ────
function RoomLayout() {
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  const layoutCtx = useLayoutContext();
  const chatOpen = layoutCtx?.widget.state?.showChat ?? false;

  const hasScreenShare = screenTracks.length > 0;

  return (
    // Outer wrapper: video area + chat panel side by side
    <div className="flex h-full w-full">

      {/* ── Video column ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {/* Main area */}
        <div className="flex-1 min-h-0 bg-black">
          {hasScreenShare ? (
            // Screenshare focused, cameras in bottom carousel
            <FocusLayoutContainer style={{ height: "100%" }}>
              <CarouselLayout tracks={cameraTracks} style={{ height: "100%" }}>
                <ParticipantTile />
              </CarouselLayout>
              <FocusLayout trackRef={screenTracks[0]} />
            </FocusLayoutContainer>
          ) : (
            <GridLayout tracks={cameraTracks} style={{ height: "100%" }}>
              <ParticipantTile />
            </GridLayout>
          )}
        </div>

        {/* Controls bar — flush, no extra wrapper */}
        <div className="shrink-0 border-t border-white/10">
          <ControlBar
            controls={{ screenShare: true, microphone: true, camera: true, chat: true, leave: true }}
          />
        </div>
      </div>

      {/* ── Chat side panel — outside the video column, doesn't shrink it ── */}
      {chatOpen && (
        <div
          className="shrink-0 flex flex-col border-l-2 border-border bg-card"
          style={{ width: 280 }}
        >
          <div className="flex-1 min-h-0 [&_.lk-chat]:h-full [&_.lk-chat]:flex [&_.lk-chat]:flex-col [&_.lk-chat-header]:hidden [&_.lk-message-input]:shrink-0 [&_.lk-chat-messages]:flex-1 [&_.lk-chat-messages]:min-h-0 [&_.lk-chat-messages]:overflow-y-auto [&_.lk-empty-state]:flex [&_.lk-empty-state]:items-center [&_.lk-empty-state]:justify-center">
            <Chat />
          </div>
        </div>
      )}
    </div>
  );
}

// ── PiP bubble ────────────────────────────────────────────────────────────────
function PipLayout({ onExpand, onLeave }: { onExpand: () => void; onLeave: () => void }) {
  const tracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-2 py-1 border-b border-border bg-card/90">
        <span className="text-[9px] text-primary" style={{ fontFamily: "var(--font-pixel)" }}>STUDY CALL</span>
        <div className="flex items-center gap-1">
          <button onClick={onExpand} className="hover:text-primary p-0.5 transition-colors"><Maximize2 size={11} /></button>
          <button onClick={onLeave} className="hover:text-destructive p-0.5 transition-colors"><X size={11} /></button>
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-black">
        <GridLayout tracks={tracks} style={{ height: "100%" }}>
          <ParticipantTile />
        </GridLayout>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function StudyCallModal({
  callState,
  onLeave,
}: {
  callState: StudyCallState;
  onLeave: () => void;
}) {
  const [pip, setPip] = useState(false);

  return (
    <LiveKitRoom
      serverUrl={LIVEKIT_URL}
      token={callState.token}
      connect
      video
      audio
      onDisconnected={onLeave}
    >
      <LayoutContextProvider>
        {pip ? (
          <div
            className="fixed bottom-6 right-6 z-[200] pixel-panel bg-card overflow-hidden shadow-2xl"
            style={{ width: 260, height: 190 }}
          >
            <PipLayout onExpand={() => setPip(false)} onLeave={onLeave} />
          </div>
        ) : (
          // Full-screen takeover
          <div className="fixed inset-0 z-[150] flex flex-col bg-black">
            {/* Header bar */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-card border-b-2 border-border">
              <span className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                STUDY CALL
              </span>
              <InvitePanel roomName={callState.roomName} />
              <div className="flex items-center gap-2 ml-2">
                <button
                  onClick={() => setPip(true)}
                  className="hover:text-primary transition-colors"
                  title="Picture-in-picture"
                >
                  <Minimize2 size={15} />
                </button>
                <button onClick={onLeave} className="hover:text-destructive transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Room fills the rest of the screen */}
            <div className="flex-1 min-h-0">
              <RoomLayout />
            </div>
          </div>
        )}
      </LayoutContextProvider>
    </LiveKitRoom>
  );
}
