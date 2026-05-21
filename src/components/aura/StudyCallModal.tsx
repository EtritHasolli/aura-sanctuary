import "@livekit/components-styles";
import {
  LiveKitRoom,
  GridLayout,
  FocusLayout,
  FocusLayoutContainer,
  ParticipantTile,
  ControlBar,
  Chat,
  RoomAudioRenderer,
  LayoutContextProvider,
  useLayoutContext,
  useTracks,
  CarouselLayout,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { X, Check, UserPlus, Minimize2, Maximize2, Settings } from "lucide-react";
import React, { useState, useCallback, useRef, useEffect } from "react";
import { useFriends } from "@/hooks/useFriends";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { StudyCallState } from "@/hooks/useStudyCall";

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL as string;

interface CallSettings {
  layout: "grid" | "speaker" | "sidebar";
  hideNonVideo: boolean;
  screenshareMode: "focus" | "alongside";
}

const DEFAULT_SETTINGS: CallSettings = {
  layout: "grid",
  hideNonVideo: false,
  screenshareMode: "focus",
};

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
        {codeCopied ? "COPIED!" : `CODE: ${roomName}`}
      </button>

      <div className="relative">
        <button
          onClick={() => setShowFriends((v) => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-border hover:border-primary bg-black/40 transition-colors"
          style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
        >
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

// ── Layout icons ─────────────────────────────────────────────────────────────
function IconGrid() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="7" height="7" rx="1" fill="currentColor"/>
      <rect x="10" y="1" width="7" height="7" rx="1" fill="currentColor"/>
      <rect x="1" y="10" width="7" height="7" rx="1" fill="currentColor"/>
      <rect x="10" y="10" width="7" height="7" rx="1" fill="currentColor"/>
    </svg>
  );
}
function IconSpeaker() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="16" height="10" rx="1" fill="currentColor"/>
      <rect x="1" y="13" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
      <rect x="7" y="13" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
      <rect x="13" y="13" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
    </svg>
  );
}
function IconSidebar() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="10" height="16" rx="1" fill="currentColor"/>
      <rect x="13" y="1" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
      <rect x="13" y="7" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
      <rect x="13" y="13" width="4" height="4" rx="0.5" fill="currentColor" opacity="0.7"/>
    </svg>
  );
}

// ── Settings modal ────────────────────────────────────────────────────────────
function SettingsModal({
  settings,
  onChange,
  onClose,
}: {
  settings: CallSettings;
  onChange: (s: CallSettings) => void;
  onClose: () => void;
}) {
  const layouts: { id: CallSettings["layout"]; icon: React.ReactNode; label: string }[] = [
    { id: "grid", icon: <IconGrid />, label: "GRID" },
    { id: "speaker", icon: <IconSpeaker />, label: "SPEAKER" },
    { id: "sidebar", icon: <IconSidebar />, label: "SIDEBAR" },
  ];

  const options: { key: keyof Pick<CallSettings, "hideNonVideo">; label: string; description: string }[] = [
    {
      key: "hideNonVideo",
      label: "Hide cameras-off participants",
      description: "Only show tiles for participants who have their camera on",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[510] flex items-center justify-center bg-black/70"
      onMouseDown={onClose}
    >
      <div
        className="pixel-panel bg-card shadow-2xl"
        style={{ width: 560 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <span className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            CALL SETTINGS
          </span>
          <button onClick={onClose} className="hover:text-destructive transition-colors p-0.5">
            <X size={16} />
          </button>
        </div>

        {/* Layout */}
        <div className="px-6 py-5 border-b border-border">
          <p className="text-[10px] text-muted-foreground mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
            LAYOUT
          </p>
          <div className={`flex gap-3 transition-opacity ${settings.screenshareMode === "focus" ? "opacity-40 pointer-events-none" : ""}`}>
            {layouts.map((l) => (
              <button
                key={l.id}
                onClick={() => onChange({ ...settings, layout: l.id })}
                className={`flex-1 flex flex-col items-center gap-3 py-5 border-2 transition-colors ${
                  settings.layout === l.id
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border hover:border-primary text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.icon}
                <span className="text-[10px]" style={{ fontFamily: "var(--font-pixel)" }}>{l.label}</span>
              </button>
            ))}
          </div>
          {settings.screenshareMode === "focus" && (
            <p className="mt-3 text-[10px] text-muted-foreground/60 italic">
              Layout is overridden while "Focus screenshare" is on
            </p>
          )}
        </div>

        {/* Options */}
        <div className="px-6 py-5 space-y-1">
          <p className="text-[10px] text-muted-foreground mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
            OPTIONS
          </p>

          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => onChange({ ...settings, [opt.key]: !settings[opt.key] })}
              className="w-full flex items-start gap-4 px-3 py-3.5 border border-transparent hover:border-border transition-colors text-left"
            >
              <div className={`mt-0.5 w-4 h-4 border-2 shrink-0 flex items-center justify-center transition-colors ${
                settings[opt.key] ? "border-primary bg-primary" : "border-border"
              }`}>
                {settings[opt.key] && <Check size={9} className="text-primary-foreground" />}
              </div>
              <div>
                <p className="text-sm text-foreground leading-tight">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-snug">{opt.description}</p>
              </div>
            </button>
          ))}

          {/* Screenshare mode */}
          <button
            onClick={() => onChange({ ...settings, screenshareMode: settings.screenshareMode === "focus" ? "alongside" : "focus" })}
            className="w-full flex items-start gap-4 px-3 py-3.5 border border-transparent hover:border-border transition-colors text-left"
          >
            <div className={`mt-0.5 w-4 h-4 border-2 shrink-0 flex items-center justify-center transition-colors ${
              settings.screenshareMode === "focus" ? "border-primary bg-primary" : "border-border"
            }`}>
              {settings.screenshareMode === "focus" && <Check size={9} className="text-primary-foreground" />}
            </div>
            <div>
              <p className="text-sm text-foreground leading-tight">Focus screenshare when active</p>
              <p className="text-xs text-muted-foreground mt-1 leading-snug">
                Screenshare fills the full view — your camera shows as a draggable PiP you can move to any corner
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draggable local camera PiP (used during screenshare focus mode) ───────────
const PIP_W = 200;
const PIP_H = 113;
const PIP_PAD = 12;
type PipCorner = "tl" | "tr" | "bl" | "br";

const CORNER_STYLE: Record<PipCorner, React.CSSProperties> = {
  tl: { top: PIP_PAD, left: PIP_PAD },
  tr: { top: PIP_PAD, right: PIP_PAD },
  bl: { bottom: PIP_PAD, left: PIP_PAD },
  br: { bottom: PIP_PAD, right: PIP_PAD },
};

function LocalCamPip() {
  const allTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const localTrack = allTracks.find((t) => t.participant.isLocal);

  const [corner, setCorner] = useState<PipCorner>("br");
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ mouseX: number; mouseY: number; pipX: number; pipY: number } | null>(null);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const container = pipRef.current?.parentElement;
    if (!container || !pipRef.current) return;
    const cr = container.getBoundingClientRect();
    const pr = pipRef.current.getBoundingClientRect();
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      pipX: pr.left - cr.left,
      pipY: pr.top - cr.top,
    };
    setDragOffset({ x: pr.left - cr.left, y: pr.top - cr.top });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      setDragOffset({
        x: dragStart.current.pipX + e.clientX - dragStart.current.mouseX,
        y: dragStart.current.pipY + e.clientY - dragStart.current.mouseY,
      });
    };
    const onUp = () => {
      if (!dragStart.current || !pipRef.current?.parentElement) {
        dragStart.current = null;
        return;
      }
      const cr = pipRef.current.parentElement.getBoundingClientRect();
      const pr = pipRef.current.getBoundingClientRect();
      const cx = pr.left + PIP_W / 2;
      const cy = pr.top + PIP_H / 2;
      const left = cx < cr.left + cr.width / 2;
      const top = cy < cr.top + cr.height / 2;
      setCorner(top ? (left ? "tl" : "tr") : (left ? "bl" : "br"));
      setDragOffset(null);
      dragStart.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!localTrack) return null;

  return (
    <div
      ref={pipRef}
      onMouseDown={onMouseDown}
      className="absolute z-20 shadow-2xl border border-white/20 overflow-hidden select-none"
      style={{
        width: PIP_W,
        height: PIP_H,
        cursor: dragOffset ? "grabbing" : "grab",
        ...(dragOffset !== null ? { left: dragOffset.x, top: dragOffset.y } : CORNER_STYLE[corner]),
      }}
    >
      <ParticipantTile trackRef={localTrack} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

// ── Room layout ───────────────────────────────────────────────────────────────
function RoomLayout() {
  const [settings, setSettings] = useState<CallSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  const allCameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const screenTracks = useTracks(
    [{ source: Track.Source.ScreenShare, withPlaceholder: false }],
    { onlySubscribed: false },
  );

  // Filter out placeholder tracks AND muted cameras when hideNonVideo is on
  const cameraTracks = settings.hideNonVideo
    ? allCameraTracks.filter((t) => t.publication != null && !t.publication.isMuted)
    : allCameraTracks;

  const layoutCtx = useLayoutContext();
  const chatOpen = layoutCtx?.widget.state?.showChat ?? false;
  const hasScreenShare = screenTracks.length > 0;

  const renderVideo = () => {
    // Focus screenshare always wins — overrides any layout selection
    if (hasScreenShare && settings.screenshareMode === "focus") {
      return (
        <div className="relative h-full w-full bg-black">
          <ParticipantTile trackRef={screenTracks[0]} style={{ width: "100%", height: "100%" }} />
          <LocalCamPip />
        </div>
      );
    }

    // Sidebar: screenshare as main (if active), cameras in vertical strip on right
    if (settings.layout === "sidebar") {
      const mainTrack = hasScreenShare ? screenTracks[0] : cameraTracks[0];
      const sidebarTracks = hasScreenShare ? cameraTracks : cameraTracks.slice(1);
      if (!mainTrack) {
        return <GridLayout tracks={cameraTracks} style={{ height: "100%" }}><ParticipantTile /></GridLayout>;
      }
      return (
        <div className="flex h-full">
          <div className="flex-1 min-w-0">
            <ParticipantTile trackRef={mainTrack} style={{ width: "100%", height: "100%" }} />
          </div>
          {sidebarTracks.length > 0 && (
            <div className="w-44 shrink-0 flex flex-col gap-1 overflow-y-auto p-1 bg-black/20 border-l border-white/10">
              {sidebarTracks.map((track, i) => (
                <div key={i} className="aspect-video w-full shrink-0">
                  <ParticipantTile trackRef={track} style={{ width: "100%", height: "100%" }} />
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Speaker: first track gets focus, rest in bottom carousel
    if (settings.layout === "speaker" && cameraTracks.length >= 1) {
      if (cameraTracks.length === 1) {
        return <GridLayout tracks={cameraTracks} style={{ height: "100%" }}><ParticipantTile /></GridLayout>;
      }
      return (
        <FocusLayoutContainer style={{ height: "100%" }}>
          <CarouselLayout tracks={cameraTracks.slice(1)} style={{ height: "100%" }}>
            <ParticipantTile />
          </CarouselLayout>
          <FocusLayout trackRef={cameraTracks[0]} />
        </FocusLayoutContainer>
      );
    }

    // Default grid
    const gridTracks = hasScreenShare ? [...cameraTracks, ...screenTracks] : cameraTracks;
    return (
      <GridLayout tracks={gridTracks} style={{ height: "100%" }}>
        <ParticipantTile />
      </GridLayout>
    );
  };

  return (
    <div className="flex h-full w-full">
      {/* ── Video column ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="flex-1 min-h-0 bg-black">
          {renderVideo()}
        </div>

        <div className="shrink-0 border-t border-white/10 relative">
          <ControlBar
            controls={{ screenShare: true, microphone: true, camera: true, chat: true, leave: true }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <button
              onClick={() => setShowSettings((v) => !v)}
              title="Call settings"
              className={`p-1.5 transition-colors ${showSettings ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Settings size={15} />
            </button>
          </div>
        </div>

        {showSettings && (
          <SettingsModal
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      {/* ── Chat side panel ── */}
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
      <RoomAudioRenderer />
      <LayoutContextProvider>
        {pip ? (
          <div
            className="fixed bottom-6 right-6 z-[520] pixel-panel bg-card overflow-hidden shadow-2xl"
            style={{ width: 260, height: 190 }}
          >
            <PipLayout onExpand={() => setPip(false)} onLeave={onLeave} />
          </div>
        ) : (
          <div className="fixed inset-0 z-[500] flex flex-col bg-black">
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

            <div className="flex-1 min-h-0">
              <RoomLayout />
            </div>
          </div>
        )}
      </LayoutContextProvider>
    </LiveKitRoom>
  );
}
