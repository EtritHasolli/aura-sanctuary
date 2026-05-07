import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Check, Link2, Mail, PlusCircle, Users } from "lucide-react";
import {
  useAcceptFriendRequest,
  useFriendDetail,
  useFriends,
  useInviteFriendToParty,
  usePendingFriendRequests,
  useSendFriendRequest,
  useSendFriendRequestByEmail,
} from "@/hooks/useFriends";
import { PetSprite } from "@/components/aura/PetSprite";
import { xpForLevel } from "@/lib/aura/types";
import {
  effectiveConstitution,
  effectiveIntelligence,
  effectiveStrength,
} from "@/lib/aura/equipmentBonuses";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type FriendMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content: string;
  created_at: string;
};

export const Route = createFileRoute("/friends")({
  head: () => ({ meta: [{ title: "Friends — Aura" }] }),
  validateSearch: z.object({ invite: z.string().uuid().optional() }),
  component: FriendsPage,
});

function Meter({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div>
      <div
        className="flex justify-between text-[10px] mb-0.5 text-muted-foreground"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        <span>{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-2 border border-border bg-secondary/50">
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function FriendsPage() {
  const { user } = useAuth();
  const { invite } = Route.useSearch();
  const { data: friends = [], isLoading } = useFriends();
  const {
    data: pending = [],
    isLoading: loadingPending,
    error: pendingError,
  } = usePendingFriendRequests();
  const sendFriendRequest = useSendFriendRequest();
  const sendFriendRequestByEmail = useSendFriendRequestByEmail();
  const acceptFriendRequest = useAcceptFriendRequest();
  const [copied, setCopied] = useState(false);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const { data: selectedDetail } = useFriendDetail(selectedFriendId);
  const inviteFriendToParty = useInviteFriendToParty();
  const [friendMessages, setFriendMessages] = useState<FriendMessage[]>([]);
  const [friendMessageInput, setFriendMessageInput] = useState("");
  const friendWsRef = useRef<WebSocket | null>(null);
  const friendReconnectTimerRef = useRef<number | null>(null);
  const friendReconnectDelayRef = useRef(1000);
  const INVITE_PROCESSED_KEY = "friendInviteProcessed";

  const directRoomId = useMemo(() => {
    if (!user?.id || !selectedFriendId) return null;
    return ["dm", user.id, selectedFriendId].sort().join(":");
  }, [selectedFriendId, user?.id]);

  useEffect(() => {
    if (!user || !invite || invite === user.id) return;
    const inviteProcessKey = `${user.id}:${invite}`;
    if (sessionStorage.getItem(`${INVITE_PROCESSED_KEY}:${inviteProcessKey}`) === "1") return;
    sessionStorage.setItem(`${INVITE_PROCESSED_KEY}:${inviteProcessKey}`, "1");
    sendFriendRequest
      .mutateAsync(invite)
      .then(() => toast.success("Friend request sent."))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not send request."),
      );
  }, [invite, sendFriendRequest, user]);

  const copyInviteLink = async () => {
    if (!user) return;
    const link = `${window.location.origin}/friends?invite=${user.id}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Friend invite link copied.");
    setTimeout(() => setCopied(false), 1500);
  };

  const sendEmailInvite = () => {
    if (!user || !inviteEmail.trim()) return;
    sendFriendRequestByEmail
      .mutateAsync(inviteEmail.trim())
      .then(() => {
        setInviteEmail("");
        setShowEmailInvite(false);
        toast.success("Friend request sent by email.");
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not send request by email."),
      );
  };

  useEffect(() => {
    if (!user?.id || !selectedFriendId) {
      setFriendMessages([]);
      return;
    }
    void (async () => {
      const { data } = await (supabase as any)
        .from("friend_messages")
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${selectedFriendId}),and(sender_id.eq.${selectedFriendId},recipient_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(200);
      setFriendMessages((data ?? []) as FriendMessage[]);
    })();
  }, [selectedFriendId, user?.id]);

  useEffect(() => {
    if (!user?.id || !selectedFriendId || !directRoomId) return;
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/tavern`;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(wsUrl);
      friendWsRef.current = ws;
      ws.onopen = () => {
        friendReconnectDelayRef.current = 1000;
        ws.send(JSON.stringify({ type: "join", partyId: directRoomId }));
      };
      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(String(event.data ?? "")) as {
            type?: string;
            message?: FriendMessage;
          };
          if (packet.type !== "chat" || !packet.message) return;
          const msg = packet.message;
          const isPair =
            (msg.sender_id === user.id && msg.recipient_id === selectedFriendId) ||
            (msg.sender_id === selectedFriendId && msg.recipient_id === user.id);
          if (!isPair) return;
          setFriendMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        } catch {
          // ignore malformed websocket packet
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        const delay = friendReconnectDelayRef.current;
        friendReconnectDelayRef.current = Math.min(10_000, delay * 2);
        friendReconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (friendReconnectTimerRef.current) {
        window.clearTimeout(friendReconnectTimerRef.current);
        friendReconnectTimerRef.current = null;
      }
      friendReconnectDelayRef.current = 1000;
      if (friendWsRef.current?.readyState === WebSocket.OPEN) {
        friendWsRef.current.send(JSON.stringify({ type: "leave", partyId: directRoomId }));
      }
      friendWsRef.current?.close();
      friendWsRef.current = null;
    };
  }, [directRoomId, selectedFriendId, user?.id]);

  const sendFriendMessage = async () => {
    if (!user?.id || !selectedFriendId || !directRoomId) return;
    const content = friendMessageInput.trim();
    if (!content) return;
    setFriendMessageInput("");
    const { data, error } = await (supabase as any)
      .from("friend_messages")
      .insert({
        sender_id: user.id,
        recipient_id: selectedFriendId,
        content,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message || "Could not send message.");
      return;
    }
    const row = data as FriendMessage;
    if (friendWsRef.current?.readyState === WebSocket.OPEN) {
      friendWsRef.current.send(JSON.stringify({ type: "chat", partyId: directRoomId, message: row }));
    } else {
      setFriendMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Users className="text-primary" size={22} />
        <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          FRIENDS
        </h1>
      </div>

      <div className="pixel-panel p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
            Invite by link or email (same flow as parties).
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowEmailInvite((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-xs"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              <Mail size={11} /> EMAIL
            </button>
            <button
              type="button"
              onClick={() => void copyInviteLink()}
              className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-xs"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {copied ? <Check size={11} /> : <Link2 size={11} />}
              {copied ? "COPIED" : "LINK"}
            </button>
          </div>
        </div>
        {showEmailInvite && (
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendEmailInvite()}
              placeholder="friend@email.com"
              className="flex-1 px-2 py-1.5 bg-input border-2 border-border"
            />
            <button
              type="button"
              onClick={sendEmailInvite}
              disabled={!inviteEmail.trim() || sendFriendRequestByEmail.isPending}
              className="px-3 py-1.5 bg-primary text-primary-foreground disabled:opacity-50 text-xs"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {sendFriendRequestByEmail.isPending ? "SENDING..." : "SEND"}
            </button>
          </div>
        )}
      </div>

      {(loadingPending || pending.length > 0) && (
        <div className="pixel-panel p-3 space-y-2">
          <h2 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            REQUESTS
          </h2>
          {loadingPending ? (
            <p className="text-xs text-muted-foreground">Loading requests...</p>
          ) : pendingError ? (
            <p className="text-xs text-destructive">
              Could not load requests. Refresh after running latest migrations.
            </p>
          ) : (
            pending.map((req) => (
              <div
                key={req.requesterId}
                className="flex items-center justify-between gap-2 border-2 border-border p-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 border border-border bg-secondary overflow-hidden">
                    {req.avatarUrl ? (
                      <img
                        src={req.avatarUrl}
                        alt={`${req.displayName} avatar`}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="text-xs truncate" style={{ fontFamily: "var(--font-pixel)" }}>
                    {req.displayName}
                    <div
                      className="text-[10px] text-muted-foreground"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {req.email}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => acceptFriendRequest.mutate(req.requesterId)}
                  disabled={acceptFriendRequest.isPending}
                  className="px-2 py-1 bg-primary text-primary-foreground disabled:opacity-60 text-xs"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ACCEPT
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading friends...</p>
      ) : friends.length === 0 ? (
        <div className="pixel-panel p-4 text-sm text-muted-foreground">
          No friends yet. Once friendships are accepted, they appear here.
        </div>
      ) : (
        <div className="pixel-panel divide-y-2 divide-border">
          {friends.map((f) => (
            <button
              key={f.id}
              type="button"
              className="w-full text-left p-3 hover:bg-secondary/30 transition-colors"
              onClick={() => setSelectedFriendId(f.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 border-2 border-border bg-secondary overflow-hidden">
                  {f.profile.avatar_url ? (
                    <img
                      src={f.profile.avatar_url}
                      alt={`${f.profile.display_name} avatar`}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="w-12 h-12 flex items-center justify-center">
                  <PetSprite
                    state={f.profile.pet_state}
                    size={42}
                    companionSpriteKey={f.petSpriteKey ?? undefined}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-primary truncate"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {f.profile.display_name}
                  </div>
                  <div
                    className="text-xs text-muted-foreground"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    LV {f.profile.level}
                    {f.petLabel ? ` · ${f.petLabel}` : ""}
                  </div>
                </div>
                <div className="w-56 space-y-1.5 pr-2">
                  <Meter
                    label="HP"
                    value={f.profile.hp}
                    max={f.profile.max_hp}
                    color="var(--color-hp)"
                  />
                  <Meter
                    label="XP"
                    value={f.profile.xp}
                    max={xpForLevel(f.profile.level)}
                    color="var(--color-xp)"
                  />
                  <Meter
                    label="STA"
                    value={f.profile.stamina}
                    max={f.profile.max_stamina}
                    color="var(--color-stamina)"
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={!!selectedFriendId} onOpenChange={(open) => !open && setSelectedFriendId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>Friend Profile</DialogTitle>
          </DialogHeader>
          {!selectedDetail ? (
            <p className="text-sm text-muted-foreground">Loading friend details...</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 border-2 border-border bg-secondary overflow-hidden">
                  {selectedDetail.profile.avatar_url ? (
                    <img
                      src={selectedDetail.profile.avatar_url}
                      alt={`${selectedDetail.profile.display_name} avatar`}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <div
                    className="text-primary text-lg truncate"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {selectedDetail.profile.display_name}
                  </div>
                  <div
                    className="text-xs text-muted-foreground"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    LV {selectedDetail.profile.level}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <StatChip label="STR" value={effectiveStrength(selectedDetail.profile)} />
                <StatChip label="INT" value={effectiveIntelligence(selectedDetail.profile)} />
                <StatChip label="CON" value={effectiveConstitution(selectedDetail.profile)} />
              </div>

              <div>
                <div
                  className="text-xs text-muted-foreground mb-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  EQUIPPED
                </div>
                {selectedDetail.equippedItems.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No equipped items.</div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {selectedDetail.equippedItems.map((it) => (
                      <span key={it.id} className="px-2 py-1 border border-border text-xs">
                        {it.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="text-xs text-muted-foreground">
                {selectedDetail.sharedParty
                  ? `You are in the same party: ${selectedDetail.sharedParty.name}`
                  : "You are not in the same party."}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={
                    !selectedDetail.myParty ||
                    !!selectedDetail.sharedParty ||
                    inviteFriendToParty.isPending
                  }
                  onClick={() => {
                    if (!selectedFriendId || !selectedDetail.myParty) return;
                    inviteFriendToParty
                      .mutateAsync({
                        friendId: selectedFriendId,
                        partyId: selectedDetail.myParty.id,
                      })
                      .then(() => toast.success("Party invite sent to friend notifications."))
                      .catch((e: unknown) =>
                        toast.error(e instanceof Error ? e.message : "Could not invite friend."),
                      );
                  }}
                  className="px-3 py-1.5 bg-primary text-primary-foreground disabled:opacity-50 text-xs flex items-center gap-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  <PlusCircle size={12} />
                  {selectedDetail.sharedParty
                    ? "ALREADY IN PARTY"
                    : inviteFriendToParty.isPending
                      ? "INVITING..."
                      : "ADD TO MY PARTY"}
                </button>
              </div>

              <div className="pt-2 border-t-2 border-border space-y-2">
                <div
                  className="text-xs text-muted-foreground"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  PRIVATE CHAT
                </div>
                <div className="h-44 border-2 border-border bg-secondary/20 p-2 overflow-y-auto space-y-1">
                  {friendMessages.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No messages yet.</div>
                  ) : (
                    friendMessages.map((m) => {
                      const mine = m.sender_id === user?.id;
                      return (
                        <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[80%] px-2 py-1 border text-xs ${
                              mine
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background/70 text-foreground"
                            }`}
                            style={{ fontFamily: "var(--font-display)" }}
                          >
                            {m.content}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={friendMessageInput}
                    onChange={(e) => setFriendMessageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void sendFriendMessage();
                      }
                    }}
                    placeholder="Send a message..."
                    className="flex-1 px-2 py-2 bg-input border-2 border-border text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void sendFriendMessage()}
                    disabled={!friendMessageInput.trim()}
                    className="px-3 py-2 bg-primary text-primary-foreground disabled:opacity-50 text-xs"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    SEND
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-2 border-border px-2 py-1.5">
      <div
        className="text-[10px] text-muted-foreground"
        style={{ fontFamily: "var(--font-pixel)" }}
      >
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}
