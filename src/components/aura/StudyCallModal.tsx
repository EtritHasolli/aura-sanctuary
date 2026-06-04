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
  useMediaDeviceSelect,
  useTrackToggle,
  useTrackMutedIndicator,
} from "@livekit/components-react";
import { Track, setLogLevel, LogLevel } from "livekit-client";

// Silence LiveKit's internal debug logs in production
setLogLevel(LogLevel.silent);
import { X, Check, UserPlus, Minimize2, Maximize2, Settings, Mic, MicOff, Video, VideoOff } from "lucide-react";
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
        {codeCopied
          ? "COPIED!"
          : <><span className="hidden sm:inline">CODE: </span>{roomName}</>}
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
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="pixel-panel bg-card shadow-2xl w-[min(340px,92vw)]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
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
        <div className="px-4 py-5 border-b border-border text-center">
          <p className="text-[10px] text-muted-foreground mb-4" style={{ fontFamily: "var(--font-pixel)" }}>
            LAYOUT
          </p>
          <div className={`flex gap-2 justify-center transition-opacity ${settings.screenshareMode === "focus" ? "opacity-40 pointer-events-none" : ""}`}>
            {layouts.map((l) => (
              <button
                key={l.id}
                onClick={() => onChange({ ...settings, layout: l.id })}
                title={l.label}
                className={`w-14 h-14 flex items-center justify-center border-2 transition-colors ${
                  settings.layout === l.id
                    ? "border-primary text-primary bg-primary/10"
                    : "border-border hover:border-primary text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.icon}
              </button>
            ))}
          </div>
          {settings.screenshareMode === "focus" && (
            <p className="mt-3 text-[10px] text-muted-foreground/60 italic text-center">
              Layout is overridden while "Focus screenshare" is on
            </p>
          )}
        </div>

        {/* Options */}
        <div className="px-4 py-5 space-y-1">
          <p className="text-[10px] text-muted-foreground mb-4 text-center" style={{ fontFamily: "var(--font-pixel)" }}>
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

// ── Mobile device + toggle modal ─────────────────────────────────────────────
function MobileDeviceModal({
  kind,
  enabled,
  onToggle,
  onClose,
}: {
  kind: "audioinput" | "videoinput";
  enabled: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { devices, activeDeviceId, setActiveMediaDevice } = useMediaDeviceSelect({ kind });
  const isMic = kind === "audioinput";
  const label = isMic ? "MICROPHONE" : "CAMERA";

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="pixel-panel bg-card shadow-2xl w-[min(320px,90vw)]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border">
          <span className="text-xs text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            {label}
          </span>
          <button onClick={onClose} className="hover:text-destructive transition-colors p-0.5">
            <X size={14} />
          </button>
        </div>

        {/* Toggle on/off */}
        <button
          onClick={() => { onToggle(); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-3 border-b-2 border-border text-left transition-colors hover:bg-primary/5"
        >
          <span className={`w-8 h-8 border-2 flex items-center justify-center shrink-0 ${
            enabled ? "border-primary text-primary bg-primary/15" : "border-border text-muted-foreground"
          }`}>
            {isMic
              ? (enabled ? <Mic size={16} /> : <MicOff size={16} />)
              : (enabled ? <Video size={16} /> : <VideoOff size={16} />)
            }
          </span>
          <div>
            <p className="text-sm font-medium text-foreground">
              {enabled ? `Turn off ${isMic ? "microphone" : "camera"}` : `Turn on ${isMic ? "microphone" : "camera"}`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Currently {enabled ? "on" : "off"}
            </p>
          </div>
        </button>

        {/* Device list */}
        {devices.length > 0 && (
          <>
            <div className="px-4 py-2">
              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
                SELECT DEVICE
              </span>
            </div>
            <div className="flex flex-col pb-1">
              {devices.map((d) => (
                <button
                  key={d.deviceId}
                  onClick={() => { void setActiveMediaDevice(d.deviceId); onClose(); }}
                  className={`flex items-center gap-3 px-4 py-2.5 text-left text-sm border-t border-border transition-colors ${
                    d.deviceId === activeDeviceId
                      ? "text-primary bg-primary/10"
                      : "text-foreground hover:bg-primary/5 hover:text-primary"
                  }`}
                >
                  <span className={`w-3 h-3 border-2 shrink-0 flex items-center justify-center ${
                    d.deviceId === activeDeviceId ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {d.deviceId === activeDeviceId && <Check size={7} className="text-primary-foreground" />}
                  </span>
                  <span className="truncate">{d.label || (isMic ? "Microphone" : "Camera")}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Mobile control bar ───────────────────────────────────────────────────────
// Replaces LiveKit's ControlBar on mobile with clean custom buttons.
function MobileControlBar({ onLeave, chatOpen, onToggleChat, onOpenSettings }: {
  onLeave: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
  onOpenSettings: () => void;
}) {
  const { toggle: toggleMic, enabled: micEnabled } = useTrackToggle({ source: Track.Source.Microphone });
  const { toggle: toggleCam, enabled: camEnabled } = useTrackToggle({ source: Track.Source.Camera });
  const [deviceModal, setDeviceModal] = useState<"audioinput" | "videoinput" | null>(null);

  const btn = (active: boolean, danger = false) =>
    `w-12 h-12 flex items-center justify-center border-2 transition-colors ${
      danger
        ? "border-destructive text-destructive hover:bg-destructive/10"
        : active
          ? "border-primary text-primary bg-primary/15"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary"
    }`;

  return (
    <>
      <div className="shrink-0 flex items-center justify-evenly gap-2 px-3 py-3 bg-card border-t-2 border-border">
        {/* Mic — tap to open modal */}
        <button
          className={btn(micEnabled)}
          onClick={() => setDeviceModal("audioinput")}
          title="Microphone"
        >
          {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Camera — tap to open modal */}
        <button
          className={btn(camEnabled)}
          onClick={() => setDeviceModal("videoinput")}
          title="Camera"
        >
          {camEnabled ? <Video size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Chat toggle */}
        <button
          className={btn(chatOpen)}
          onClick={onToggleChat}
          title="Chat"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>

        {/* Settings — opens layout/call settings modal */}
        <button
          className={btn(false)}
          onClick={onOpenSettings}
          title="Call settings"
        >
          <Settings size={18} />
        </button>

        {/* Leave */}
        <button
          className={btn(false, true)}
          onClick={onLeave}
          title="Leave call"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

      {deviceModal && (
        <MobileDeviceModal
          kind={deviceModal}
          enabled={deviceModal === "audioinput" ? micEnabled : camEnabled}
          onToggle={deviceModal === "audioinput" ? () => toggleMic() : () => toggleCam()}
          onClose={() => setDeviceModal(null)}
        />
      )}
    </>
  );
}

// ── Room layout ───────────────────────────────────────────────────────────────
function RoomLayout({ onLeave }: { onLeave: () => void }) {
  const [settings, setSettings] = useState<CallSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

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
    <div className="flex h-full w-full relative">
      {/* ── Video column ── */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="flex-1 min-h-0 bg-black">
          {renderVideo()}
        </div>

        {isMobile ? (
          <MobileControlBar
            onLeave={onLeave}
            chatOpen={chatOpen}
            onToggleChat={() => layoutCtx?.widget.dispatch?.({ msg: "toggle_chat" })}
            onOpenSettings={() => setShowSettings(true)}
          />
        ) : (
          <div className="shrink-0 relative">
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
        )}

        {showSettings && (
          <SettingsModal
            settings={settings}
            onChange={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      {/* ── Chat panel ──
            Mobile:  absolute bottom sheet (50% height), overlays the video
            Desktop: static side column (280px wide)               ── */}
      {chatOpen && (
        <>
          {/* Mobile: centered overlay */}
          <div className="md:hidden fixed inset-0 z-20 flex items-center justify-center bg-black/60"
            onClick={() => layoutCtx?.widget.dispatch?.({ msg: "toggle_chat" })}
          >
            <div
              className="flex flex-col bg-card w-[min(320px,88vw)] h-[60vh] pixel-panel shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b-2 border-border">
                <span className="text-xs text-primary" style={{ fontFamily: "var(--font-pixel)" }}>CHAT</span>
                <button
                  onClick={() => layoutCtx?.widget.dispatch?.({ msg: "toggle_chat" })}
                  className="p-1 hover:text-destructive transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden [&_.lk-chat]:h-full [&_.lk-chat]:flex [&_.lk-chat]:flex-col [&_.lk-chat]:border-none [&_.lk-chat]:outline-none [&_.lk-chat-header]:hidden [&_.lk-chat-messages]:flex-1 [&_.lk-chat-messages]:min-h-0 [&_.lk-chat-messages]:overflow-y-auto [&_.lk-chat-messages]:border-none [&_.lk-chat-form]:border-t-2 [&_.lk-chat-form]:border-border [&_.lk-empty-state]:flex [&_.lk-empty-state]:items-center [&_.lk-empty-state]:justify-center">
                <Chat />
              </div>
            </div>
          </div>

          {/* Desktop: static side column */}
          <div className="hidden md:flex md:flex-col md:shrink-0 md:border-l-2 md:border-border md:w-[280px] md:h-auto md:overflow-visible">
            <Chat />
          </div>
        </>
      )}
    </div>
  );
}

// ── Reactive mute indicator for a single track ───────────────────────────────
function MuteIcon({ trackRef, icon }: {
  trackRef: ReturnType<typeof useTracks>[0] | undefined;
  icon: React.ReactNode;
}) {
  const { isMuted } = useTrackMutedIndicator(trackRef);
  // Always render — full opacity when active, dimmed when muted/missing
  return (
    <span className={isMuted ? "opacity-25 text-muted-foreground" : "text-primary"}>
      {icon}
    </span>
  );
}

// ── PiP participant status row ────────────────────────────────────────────────
function PipParticipantStatus() {
  const camTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false },
  );
  const micTracks = useTracks(
    [{ source: Track.Source.Microphone, withPlaceholder: true }],
    { onlySubscribed: false },
  );

  // Prefer remote participant; fall back to local so status always shows
  const remoteCam = camTracks.find((t) => !t.participant.isLocal) ?? camTracks[0];
  const remoteMic = micTracks.find((t) => !t.participant.isLocal) ?? micTracks[0];

  if (!remoteCam && !remoteMic) return null;

  const name = (remoteCam?.participant ?? remoteMic?.participant)?.name ?? "Participant";

  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-2 py-1 bg-black/60">
      <span className="text-[9px] text-primary truncate" style={{ fontFamily: "var(--font-pixel)" }}>
        {name}
      </span>
      <div className="flex items-center gap-1">
        <MuteIcon trackRef={remoteMic} icon={<Mic size={10} />} />
        <MuteIcon trackRef={remoteCam} icon={<Video size={10} />} />
      </div>
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
      <div className="flex-1 min-h-0 bg-black relative">
        <GridLayout tracks={tracks} style={{ height: "100%" }}>
          <ParticipantTile />
        </GridLayout>
        <PipParticipantStatus />
      </div>
    </div>
  );
}

// ── Draggable PiP wrapper ─────────────────────────────────────────────────────
function DraggablePip({
  onExpand,
  onLeave,
}: {
  onExpand: () => void;
  onLeave: () => void;
}) {
  const PIP_W = 260;
  const PIP_H = 190;
  const PAD = 16;

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startPx: number; startPy: number } | null>(null);
  const didDrag = useRef(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Default to bottom-right corner
  const defaultPos = () => ({
    x: window.innerWidth - PIP_W - PAD,
    y: window.innerHeight - PIP_H - PAD - 64, // above mobile nav
  });

  const clamp = (p: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(window.innerWidth - PIP_W, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - PIP_H, p.y)),
  });

  const { x, y } = clamp(pos ?? defaultPos());

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    didDrag.current = false;
    dragState.current = { startX: e.clientX, startY: e.clientY, startPx: x, startPy: y };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) didDrag.current = true;
    setPos(clamp({ x: dragState.current.startPx + dx, y: dragState.current.startPy + dy }));
  };

  const onPointerUp = () => { dragState.current = null; };

  return (
    <div
      ref={wrapperRef}
      style={{ position: "fixed", left: x, top: y, width: PIP_W, height: PIP_H, zIndex: 520, touchAction: "none" }}
      className="pixel-panel bg-card overflow-hidden shadow-2xl select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <PipLayout onExpand={onExpand} onLeave={onLeave} />
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
          <DraggablePip onExpand={() => setPip(false)} onLeave={onLeave} />
        ) : (
          <div className="fixed inset-0 z-[500] flex flex-col bg-background">
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-card border-b-2 border-border">
              <span className="text-sm text-primary hidden md:inline" style={{ fontFamily: "var(--font-pixel)" }}>
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
              <RoomLayout onLeave={onLeave} />
            </div>
          </div>
        )}
      </LayoutContextProvider>
    </LiveKitRoom>
  );
}
