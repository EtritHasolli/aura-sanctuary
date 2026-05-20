import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { publicAsset } from "@/lib/utils";
import { useRouterState } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";

const EVIL_PATHS = new Set(["evilswordsman", "evilmage", "evilpaladin", "evilrogue"]);

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const STORAGE_KEY = "aura:assistant-pos";
const BUBBLE_SIZE = 80;
const MARGIN = 8;
const MOBILE_NAV_HEIGHT = 72; // bottom nav bar height on mobile

function defaultBottomOffset() {
  if (typeof window === "undefined") return 24;
  return window.innerWidth < 768 ? MOBILE_NAV_HEIGHT + MARGIN : 24;
}

function clampBubble(x: number, y: number): { x: number; y: number } {
  if (typeof window === "undefined") return { x: Math.max(MARGIN, x), y: Math.max(MARGIN, y) };
  const isMobile = window.innerWidth < 768;
  const minBottom = isMobile ? MOBILE_NAV_HEIGHT + MARGIN : MARGIN;
  return {
    x: Math.min(Math.max(MARGIN, x), window.innerWidth - BUBBLE_SIZE - MARGIN),
    y: Math.min(Math.max(minBottom, y), window.innerHeight - BUBBLE_SIZE - MARGIN),
  };
}

function loadSavedPosition(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 24, y: defaultBottomOffset() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return clampBubble(24, defaultBottomOffset());
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    return clampBubble(
      typeof parsed.x === "number" ? parsed.x : 24,
      typeof parsed.y === "number" ? parsed.y : defaultBottomOffset(),
    );
  } catch {
    return clampBubble(24, defaultBottomOffset());
  }
}

function AiChatIcon({ size = 48, evil = false }: { size?: number; evil?: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <img
      src={evil ? publicAsset("aichat-angry.png") : publicAsset("aichat-normal.png")}
      alt="Aura Guide"
      width={size}
      height={size}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        imageRendering: "pixelated",
        animation: "aichat-float 2.4s ease-in-out infinite",
        transform: hovered ? "scale(1.15)" : "scale(1)",
        filter: hovered ? "drop-shadow(0 0 8px rgba(217,150,48,0.7))" : "none",
        transition: "transform 0.15s ease, filter 0.15s ease",
      }}
    />
  );
}

export function AiAssistant() {
  const routePath = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const isEvil = profile?.aura_path ? EVIL_PATHS.has(profile.aura_path) : false;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const goodGreeting =
    "Greetings, brave soul! I am Aura Guide, keeper of this sanctuary's light. Ask of the Sanctuary and Pomodoro, Quests and Archives, Challenges, Friends, Shop and Gear, Forge, Tavern, Subscription, Minigames, or Settings!";
  const evilGreeting =
    "So... you seek counsel. Wise. I am Aura Guide, and my knowledge of this dark sanctuary is... considerable. Ask of the Sanctuary and Pomodoro, Quests and Archives, Challenges, Friends, Shop and Gear, Forge, Tavern, Subscription, Minigames, or Settings. Choose carefully.";

  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: goodGreeting },
  ]);

  // Update greeting once alignment is known
  const alignmentKnown = useRef(false);
  useEffect(() => {
    if (alignmentKnown.current) return;
    if (profile === undefined) return; // still loading
    alignmentKnown.current = true;
    setMessages([{ role: "assistant", content: isEvil ? evilGreeting : goodGreeting }]);
  }, [profile, isEvil, evilGreeting, goodGreeting]);
  const [offset, setOffset] = useState(loadSavedPosition);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    dragging: boolean;
    moved: boolean;
  } | null>(null);

  const panelStyle = useMemo(() => {
    if (!open) return { right: `${offset.x}px`, bottom: `${offset.y}px` };
    // Clamp panel so it doesn't overflow the viewport
    const W = typeof window !== "undefined" ? window.innerWidth : 800;
    const H = typeof window !== "undefined" ? window.innerHeight : 600;
    const pw = Math.min(320, W - 16);
    const ph = 420; // approx panel height: header + messages area + input
    const cx = Math.min(Math.max(MARGIN, offset.x), W - pw - MARGIN);
    const cy = Math.min(Math.max(MARGIN, offset.y), H - ph - MARGIN);
    return { right: `${cx}px`, bottom: `${cy}px` };
  }, [offset.x, offset.y, open]);

  const saveOffset = (x: number, y: number) => {
    const next = clampBubble(x, y);
    setOffset(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      dragging: true,
      moved: false,
    };
    e.preventDefault();
  };

  const startBubbleDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      dragging: true,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const endBubbleDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const moved = !!dragRef.current?.moved;
    if (dragRef.current) dragRef.current.dragging = false;
    if (!moved) setOpen(true);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current?.dragging) return;
      e.preventDefault();
      const dx = dragRef.current.startX - e.clientX;
      const dy = dragRef.current.startY - e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true;
      saveOffset(dragRef.current.baseX + dx, dragRef.current.baseY + dy);
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current.dragging = false;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const endDrag = () => {
    if (!dragRef.current) return;
    dragRef.current.dragging = false;
  };

  const onClose = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    endDrag();
    setOpen(false);
  };

  const onClosePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (dragRef.current?.dragging) {
      dragRef.current.dragging = false;
    }
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("chatbot", {
        body: { messages: nextMessages.slice(-10), routePath },
      });
      if (error) throw error;
      const answer =
        (data as { answer?: string })?.answer?.trim() ||
        "I could not generate an answer right now.";
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `I hit an error: ${msg}. Please try again.` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const chatPanel = (
    <div className="pointer-events-auto w-[min(320px,calc(100vw-1rem))] pixel-panel shadow-xl bg-card">
      <div className="px-3 py-2 border-b-2 border-border flex items-center justify-between select-none">
        {/* Desktop: drag handle. Mobile: just a label, no drag */}
        <div
          className="text-xs text-primary flex-1 hidden md:block md:cursor-move"
          style={{ fontFamily: "var(--font-pixel)" }}
          onPointerDown={startDrag}
        >
          {isEvil ? "DARK GUIDE (DRAG)" : "AURA GUIDE (DRAG)"}
        </div>
        <div
          className="text-xs text-primary flex-1 md:hidden"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {isEvil ? "DARK GUIDE" : "AURA GUIDE"}
        </div>
        <button
          className="hover:text-destructive"
          onPointerDown={onClosePointerDown}
          onClick={onClose}
          title="Close"
        >
          <X size={14} />
        </button>
      </div>

      <div className="h-60 md:h-72 overflow-y-auto px-3 py-2 space-y-2">
        {messages.map((m, idx) => (
          <div
            key={`${idx}-${m.role}`}
            className={`text-xs px-2 py-1.5 border ${
              m.role === "assistant"
                ? "bg-secondary border-border text-foreground"
                : "bg-primary/15 border-primary text-primary"
            }`}
          >
            {m.role === "assistant" ? (
              <div className="prose prose-xs max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            ) : (
              m.content
            )}
          </div>
        ))}
        {loading && (
          <div className="text-xs px-2 py-1.5 border bg-secondary border-border text-muted-foreground">
            Thinking...
          </div>
        )}
      </div>

      <div className="p-2 border-t-2 border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void sendMessage();
          }}
          placeholder="Ask about Aura..."
          className="flex-1 px-2 py-1.5 bg-input border-2 border-border focus:border-primary outline-none text-sm"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={loading}
          className="px-2 bg-primary text-primary-foreground disabled:opacity-50"
          title="Send"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop: draggable floating widget ── */}
      <div className="hidden md:block fixed z-[140] pointer-events-none" style={panelStyle}>
        {!open ? (
          <button
            onPointerDown={startBubbleDrag}
            onPointerUp={endBubbleDrag}
            className="pointer-events-auto bg-transparent border-none shadow-none p-0"
            style={{ touchAction: "none" }}
            title="Open Aura assistant"
          >
            <AiChatIcon size={80} evil={isEvil} />
          </button>
        ) : chatPanel}
      </div>

      {/* ── Mobile: draggable bubble, fixed chat panel ── */}
      <div className="md:hidden">
        {/* Draggable bubble */}
        {!open && (
          <div
            className="fixed z-140 pointer-events-none"
            style={{ right: `${offset.x}px`, bottom: `${offset.y}px` }}
          >
            <button
              onPointerDown={startBubbleDrag}
              onPointerUp={endBubbleDrag}
              className="pointer-events-auto bg-transparent border-none shadow-none p-0"
              style={{ touchAction: "none" }}
              title="Open Aura assistant"
            >
              <AiChatIcon size={72} evil={isEvil} />
            </button>
          </div>
        )}
        {/* Chat panel: always fixed bottom-right, not affected by bubble position */}
        {open && (
          <div className="fixed z-140 bottom-18 right-3 pointer-events-none">
            {chatPanel}
          </div>
        )}
      </div>
    </>
  );
}
