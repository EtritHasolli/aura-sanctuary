import { useEffect, useMemo, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const STORAGE_KEY = "aura:assistant-pos";

function defaultBottomOffset() {
  if (typeof window === "undefined") return 24;
  return window.innerWidth < 768 ? 72 : 24;
}

function loadSavedPosition(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 24, y: defaultBottomOffset() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { x: 24, y: defaultBottomOffset() };
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    return {
      x: typeof parsed.x === "number" ? parsed.x : 24,
      y: typeof parsed.y === "number" ? parsed.y : defaultBottomOffset(),
    };
  } catch {
    return { x: 24, y: defaultBottomOffset() };
  }
}

function RobotIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {/* antenna */}
      <rect x="7" y="0" width="2" height="2" />
      <rect x="6" y="2" width="4" height="1" />
      {/* head */}
      <rect x="2" y="3" width="12" height="10" />
      {/* eyes */}
      <rect x="4" y="6" width="3" height="3" fill="var(--color-background, #000)" />
      <rect x="9" y="6" width="3" height="3" fill="var(--color-background, #000)" />
      {/* eye glow */}
      <rect x="5" y="7" width="1" height="1" fill="currentColor" />
      <rect x="10" y="7" width="1" height="1" fill="currentColor" />
      {/* mouth */}
      <rect x="4" y="11" width="8" height="1" fill="var(--color-background, #000)" />
      <rect x="5" y="11" width="2" height="1" fill="currentColor" />
      <rect x="9" y="11" width="2" height="1" fill="currentColor" />
      {/* ears */}
      <rect x="0" y="5" width="2" height="3" />
      <rect x="14" y="5" width="2" height="3" />
    </svg>
  );
}

export function AiAssistant() {
  const routePath = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Greetings, adventurer. I am Aura Guide, keeper of this sanctuary's lore. Ask of the Sanctuary and Pomodoro, Quests and Archives, Challenges, Friends, Shop and Gear, Forge, Tavern, Subscription, Minigames, or Settings.",
    },
  ]);
  const [offset, setOffset] = useState(loadSavedPosition);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    dragging: boolean;
    moved: boolean;
  } | null>(null);

  const panelStyle = useMemo(
    () => ({
      right: `${offset.x}px`,
      bottom: `${offset.y}px`,
    }),
    [offset.x, offset.y],
  );

  const saveOffset = (x: number, y: number) => {
    const next = { x: Math.max(8, x), y: Math.max(8, y) };
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

  const endBubbleDrag = () => {
    const moved = !!dragRef.current?.moved;
    if (dragRef.current) dragRef.current.dragging = false;
    if (!moved) setOpen(true);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragRef.current?.dragging) return;
      const dx = dragRef.current.startX - e.clientX;
      const dy = dragRef.current.startY - e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) dragRef.current.moved = true;
      saveOffset(dragRef.current.baseX + dx, dragRef.current.baseY + dy);
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current.dragging = false;
    };
    window.addEventListener("pointermove", move);
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
          AURA GUIDE (DRAG)
        </div>
        <div
          className="text-xs text-primary flex-1 md:hidden"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          AURA GUIDE
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
            className="pointer-events-auto h-12 w-12 rounded-full border-2 border-border bg-card shadow-xl flex items-center justify-center hover:border-primary"
            title="Open Aura assistant"
          >
            <RobotIcon size={20} />
          </button>
        ) : chatPanel}
      </div>

      {/* ── Mobile: fixed bottom-right, no drag ── */}
      <div className="md:hidden fixed z-[140] bottom-[72px] right-3 pointer-events-none">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="pointer-events-auto h-11 w-11 rounded-full border-2 border-border bg-card shadow-xl flex items-center justify-center hover:border-primary"
            title="Open Aura assistant"
          >
            <RobotIcon size={18} />
          </button>
        ) : chatPanel}
      </div>
    </>
  );
}
