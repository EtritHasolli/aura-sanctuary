import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

const STORAGE_KEY = "aura:assistant-pos";

function loadSavedPosition(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 24, y: 24 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { x: 24, y: 24 };
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    return {
      x: typeof parsed.x === "number" ? parsed.x : 24,
      y: typeof parsed.y === "number" ? parsed.y : 24,
    };
  } catch {
    return { x: 24, y: 24 };
  }
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
        "Greetings, adventurer. I am Aura Guide, an old keeper of this sanctuary's lore. Ask of tasks, stats, paths, boss battles, shop, companions, or settings.",
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
      const response = await fetch("/api/chatbot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          routePath,
          messages: nextMessages.slice(-10),
        }),
      });
      if (!response.ok) {
        throw new Error(`Assistant error (${response.status})`);
      }
      const data = (await response.json()) as { answer?: string };
      const answer = data.answer?.trim() || "I could not generate an answer right now.";
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `I hit an error: ${msg}. Please try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed z-[140] pointer-events-none" style={panelStyle}>
      {!open ? (
        <button
          onPointerDown={startBubbleDrag}
          onPointerUp={endBubbleDrag}
          className="pointer-events-auto h-12 w-12 rounded-full border-2 border-border bg-card shadow-xl flex items-center justify-center hover:border-primary"
          title="Open Aura assistant"
        >
          <MessageCircle size={18} />
        </button>
      ) : (
        <div className="pointer-events-auto w-[320px] pixel-panel shadow-xl bg-card">
          <div className="px-3 py-2 border-b-2 border-border flex items-center justify-between select-none">
            <div
              className="text-xs text-primary cursor-move flex-1"
              style={{ fontFamily: "var(--font-pixel)" }}
              onPointerDown={startDrag}
            >
              AURA GUIDE (DRAG)
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

          <div className="h-72 overflow-y-auto px-3 py-2 space-y-2">
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
      )}
    </div>
  );
}
