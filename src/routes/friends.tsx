import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Check, Copy, Mail, PlusCircle, Users } from "lucide-react";
import {
  useAcceptFriendRequest,
  useFriendDetail,
  useFriends,
  useInviteFriendToParty,
  usePendingFriendRequests,
  useSendFriendRequest,
  useSendFriendRequestByEmail,
  useSendFriendRequestByFriendCode,
} from "@/hooks/useFriends";
import { getItemIconUrl } from "@/hooks/useShop";
import { CompanionSprite } from "@/components/aura/CompanionSprite";
import { xpForLevel, type Profile } from "@/lib/aura/types";
import { pathCharacterSpriteSrc } from "@/lib/aura/pathCharacterSprites";
import {
  effectiveConstitution,
  effectiveDexterity,
  effectiveIntelligence,
  effectiveStrength,
} from "@/lib/aura/equipmentBonuses";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useMarkMessageScopeRead } from "@/hooks/useMessageUnreadCounts";
import { useNotifications } from "@/components/aura/NotificationsContext";
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
  validateSearch: z.object({
    invite: z.string().uuid().optional(),
    /** Target's 8-digit friend code (same role as `invite` UUID deep link). */
    friendCode: z.string().regex(/^\d{8}$/).optional(),
    friend: z.string().uuid().optional(),
    message: z.string().uuid().optional(),
  }),
  component: FriendsPage,
});

/** Match HUD-style path portrait crop (head-focused). */
const FRIEND_PATH_HEAD_SCALE = 3.5;
const FRIEND_PATH_HEAD_NUDGE_Y_PX = -25;

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
  const { data: myProfile, isFetched: profileFetched } = useProfile();
  const { invite, friendCode, friend: friendSearchId, message: messageSearchId } =
    Route.useSearch();
  const { data: friends = [], isLoading } = useFriends();
  const {
    data: pending = [],
    isLoading: loadingPending,
    error: pendingError,
  } = usePendingFriendRequests();
  const sendFriendRequest = useSendFriendRequest();
  const sendFriendRequestByEmail = useSendFriendRequestByEmail();
  const sendFriendRequestByFriendCode = useSendFriendRequestByFriendCode();
  const acceptFriendRequest = useAcceptFriendRequest();
  const markMessageScopeRead = useMarkMessageScopeRead();
  const { notifications, markFriendMessagesRead } = useNotifications();
  const [copiedCode, setCopiedCode] = useState(false);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const { data: selectedDetail } = useFriendDetail(selectedFriendId);
  const inviteFriendToParty = useInviteFriendToParty();
  const [friendMessages, setFriendMessages] = useState<FriendMessage[]>([]);
  const [friendMessageInput, setFriendMessageInput] = useState("");
  const [selectedInvitePartyId, setSelectedInvitePartyId] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const markMessageScopeReadRef = useRef(markMessageScopeRead);
  const markFriendMessagesReadRef = useRef(markFriendMessagesRead);
  const INVITE_PROCESSED_KEY = "friendInviteProcessed";
  const FRIEND_CODE_PROCESSED_KEY = "friendCodeInviteProcessed";

  useEffect(() => {
    markMessageScopeReadRef.current = markMessageScopeRead;
  }, [markMessageScopeRead]);

  useEffect(() => {
    markFriendMessagesReadRef.current = markFriendMessagesRead;
  }, [markFriendMessagesRead]);

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

  useEffect(() => {
    if (!user || !friendCode || !profileFetched) return;
    if (myProfile?.friend_code === friendCode) {
      const processKey = `${user.id}:fc:${friendCode}`;
      sessionStorage.setItem(`${FRIEND_CODE_PROCESSED_KEY}:${processKey}`, "1");
      toast.error("That is your own friend code.");
      return;
    }
    const processKey = `${user.id}:fc:${friendCode}`;
    if (sessionStorage.getItem(`${FRIEND_CODE_PROCESSED_KEY}:${processKey}`) === "1") return;
    sessionStorage.setItem(`${FRIEND_CODE_PROCESSED_KEY}:${processKey}`, "1");
    sendFriendRequestByFriendCode
      .mutateAsync(friendCode)
      .then(() => toast.success("Friend request sent."))
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not send request."),
      );
  }, [
    friendCode,
    myProfile?.friend_code,
    profileFetched,
    sendFriendRequestByFriendCode,
    user,
  ]);

  useEffect(() => {
    if (friendSearchId) setSelectedFriendId(friendSearchId);
  }, [friendSearchId]);

  useEffect(() => {
    const firstInviteable = selectedDetail?.inviteableParties?.[0]?.id ?? "";
    setSelectedInvitePartyId(firstInviteable);
  }, [selectedDetail?.inviteableParties]);

  useEffect(() => {
    if (!selectedFriendId) return;
    markFriendMessagesRead(selectedFriendId);
  }, [markFriendMessagesRead, notifications, selectedFriendId]);

  useEffect(() => {
    if (!messageSearchId) return;
    document.getElementById(`friend-message-${messageSearchId}`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [friendMessages, messageSearchId]);

  const copyMyFriendCode = async () => {
    const code = myProfile?.friend_code?.trim();
    if (!code) {
      toast.error("Friend code not loaded yet. Try again in a moment.");
      return;
    }
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success("Friend code copied.");
    setTimeout(() => setCopiedCode(false), 1500);
  };

  const submitFriendCode = () => {
    const digits = friendCodeInput.replace(/\D/g, "");
    if (digits.length !== 8) {
      toast.error("Enter your friend's 8-digit code.");
      return;
    }
    sendFriendRequestByFriendCode
      .mutateAsync(digits)
      .then(() => {
        setFriendCodeInput("");
        toast.success("Friend request sent.");
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not send request."),
      );
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
      const { data } = await supabase
        .from("friend_messages" as never)
        .select("*")
        .or(
          `and(sender_id.eq.${user.id},recipient_id.eq.${selectedFriendId}),and(sender_id.eq.${selectedFriendId},recipient_id.eq.${user.id})`,
        )
        .order("created_at", { ascending: true })
        .limit(200);
      setFriendMessages((data ?? []) as FriendMessage[]);
      markFriendMessagesReadRef.current(selectedFriendId);
      markMessageScopeReadRef.current.mutate(
        { scopeType: "friend", scopeId: selectedFriendId },
        { onError: (e) => console.warn("mark friend read failed", e) },
      );
    })();
  }, [selectedFriendId, user?.id]);

  // Subscribe to incoming messages from the selected friend via Supabase Realtime
  useEffect(() => {
    if (!user?.id || !selectedFriendId) return;

    const channel = supabase
      .channel(`friend-chat:${directRoomId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "friend_messages",
          filter: `sender_id=eq.${selectedFriendId}&recipient_id=eq.${user.id}`,
        } as never,
        (payload: { new: FriendMessage }) => {
          const msg = payload.new;
          setFriendMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          void markMessageScopeReadRef.current.mutateAsync({
            scopeType: "friend",
            scopeId: msg.sender_id,
          });
          markFriendMessagesReadRef.current(msg.sender_id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [directRoomId, selectedFriendId, user?.id]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [friendMessages]);

  const sendFriendMessage = async () => {
    if (!user?.id || !selectedFriendId) return;
    const content = friendMessageInput.trim();
    if (!content) return;
    setFriendMessageInput("");
    const { data, error } = await supabase
      .from("friend_messages" as never)
      .insert({ sender_id: user.id, recipient_id: selectedFriendId, content } as never)
      .select("*")
      .single();
    if (error) {
      toast.error(error.message || "Could not send message.");
      return;
    }
    const row = data as FriendMessage;
    setFriendMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Users className="text-primary" size={22} />
        <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
          FRIENDS
        </h1>
      </div>

      <div className="pixel-panel p-3 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground" style={{ fontFamily: "var(--font-pixel)" }}>
              Share your 8-digit code or add someone using theirs.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs" style={{ fontFamily: "var(--font-pixel)" }}>
              <span className="text-muted-foreground">YOUR CODE</span>
              <span className="text-primary tracking-widest tabular-nums text-sm">
                {myProfile?.friend_code ?? "········"}
              </span>
              <button
                type="button"
                onClick={() => void copyMyFriendCode()}
                disabled={!myProfile?.friend_code}
                className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary disabled:opacity-50 text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                {copiedCode ? <Check size={11} /> : <Copy size={11} />}
                {copiedCode ? "COPIED" : "COPY"}
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowEmailInvite((v) => !v)}
            className="flex items-center justify-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-xs shrink-0 self-start sm:self-center"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            <Mail size={11} /> EMAIL
          </button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={friendCodeInput}
            onChange={(e) => setFriendCodeInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && submitFriendCode()}
            placeholder="Friend's 8-digit code"
            className="w-full sm:max-w-[12rem] px-2 py-1.5 bg-input border-2 border-border tracking-widest tabular-nums"
            style={{ fontFamily: "var(--font-pixel)" }}
          />
          <button
            type="button"
            onClick={submitFriendCode}
            disabled={friendCodeInput.replace(/\D/g, "").length !== 8 || sendFriendRequestByFriendCode.isPending}
            className="px-3 py-1.5 bg-primary text-primary-foreground disabled:opacity-50 text-xs shrink-0"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            {sendFriendRequestByFriendCode.isPending ? "SENDING..." : "ADD FRIEND"}
          </button>
        </div>
        {showEmailInvite && (
          <div className="flex gap-2 pt-1 border-t border-border">
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
                <div className="relative h-12 w-12 shrink-0 overflow-hidden">
                  {f.profile.aura_path ? (
                    <img
                      key={`${f.id}-${f.profile.aura_path}`}
                      src={pathCharacterSpriteSrc(f.profile.aura_path, "idle")}
                      alt={`${f.profile.display_name} path character`}
                      className="pointer-events-none absolute left-1/2 top-0 block w-12 max-w-none h-auto"
                      style={{
                        imageRendering: "pixelated",
                        transform: `translateX(-50%) translateY(${FRIEND_PATH_HEAD_NUDGE_Y_PX}px) scale(${FRIEND_PATH_HEAD_SCALE})`,
                        transformOrigin: "top center",
                      }}
                    />
                  ) : (
                    <CompanionSprite
                      state={f.profile.character_state}
                      size={42}
                      gear={[]}
                      companionSpriteKey={f.companionSpriteKey ?? undefined}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-primary truncate"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {f.profile.display_name}
                    {f.profile.aura_path && (
                      <span
                        className="ml-2 text-[10px] align-middle"
                        style={{
                          color:
                            f.profile.aura_path === "swordsman"
                              ? "#d97706"
                              : f.profile.aura_path === "mage"
                                ? "#2563eb"
                                : f.profile.aura_path === "rogue"
                                  ? "#a21caf"
                                  : "#15803d",
                        }}
                      >
                        {f.profile.aura_path === "tank"
                          ? "PALADIN"
                          : f.profile.aura_path.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs text-muted-foreground"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    LV {f.profile.level}
                    {f.companionLabel ? ` · ${f.companionLabel}` : ""}
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
        <DialogContent className="max-w-2xl w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>Friend Profile</DialogTitle>
          </DialogHeader>
          {!selectedDetail ? (
            <p className="text-sm text-muted-foreground">Loading friend details...</p>
          ) : (
            <div className="space-y-3">
              {(() => {
                const commonParties = selectedDetail.commonParties ?? [];
                const inviteableParties = selectedDetail.inviteableParties ?? [];
                return (
                  <>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatChip label="STR" value={effectiveStrength(selectedDetail.profile as Profile)} />
                <StatChip label="INT" value={effectiveIntelligence(selectedDetail.profile as Profile)} />
                <StatChip label="CON" value={effectiveConstitution(selectedDetail.profile as Profile)} />
                <StatChip label="DEX" value={effectiveDexterity(selectedDetail.profile as Profile)} />
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
                  <div className="flex flex-wrap gap-2">
                    {selectedDetail.equippedItems.map((it) => (
                      <EquippedItemBadge
                        key={it.id}
                        slug={it.slug}
                        name={it.name}
                        rarity={it.rarity}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div
                  className="text-xs text-muted-foreground mb-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  PARTIES IN COMMON
                </div>
                {commonParties.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No parties in common.</div>
                ) : (
                  <div className="flex flex-col gap-0.5 text-xs text-foreground">
                    {commonParties.map((p) => (
                      <div key={p.id}>
                        {p.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                {inviteableParties.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedInvitePartyId}
                      onChange={(e) => setSelectedInvitePartyId(e.target.value)}
                      className="px-2 py-1.5 bg-input border-2 border-border text-xs"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      {inviteableParties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={inviteFriendToParty.isPending || !selectedInvitePartyId}
                      onClick={() => {
                        if (!selectedFriendId || !selectedInvitePartyId) return;
                        inviteFriendToParty
                          .mutateAsync({
                            friendId: selectedFriendId,
                            partyId: selectedInvitePartyId,
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
                      {inviteFriendToParty.isPending ? "INVITING..." : "INVITE TO PARTY"}
                    </button>
                  </div>
                ) : (
                <button
                  type="button"
                  disabled
                  className="px-3 py-1.5 bg-primary text-primary-foreground disabled:opacity-50 text-xs flex items-center gap-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  <PlusCircle size={12} />
                  NO INVITES
                </button>
                )}
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
                        <div
                          key={m.id}
                          id={`friend-message-${m.id}`}
                          className={`flex ${mine ? "justify-end" : "justify-start"} ${
                            messageSearchId === m.id
                              ? "bg-primary/10 outline outline-1 outline-primary"
                              : ""
                          }`}
                        >
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
                  <div ref={messagesEndRef} />
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
                    placeholder="Write to thy ally…"
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
                  </>
                );
              })()}
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

function EquippedItemBadge({
  slug,
  name,
  rarity,
}: {
  slug: string;
  name: string;
  rarity: string;
}) {
  const [iconFailed, setIconFailed] = useState(false);
  const showIcon = !!slug && !iconFailed;
  const tooltip = `${name} · ${rarity.toUpperCase()}`;
  if (!showIcon) {
    return (
      <span
        className="px-2 py-1 border border-border text-xs"
        style={{ fontFamily: "var(--font-pixel)" }}
        title={tooltip}
      >
        {name}
      </span>
    );
  }
  return (
    <div
      className="w-12 h-12 border-2 border-border bg-secondary/40 flex items-center justify-center"
      title={tooltip}
      aria-label={tooltip}
    >
      <img
        src={getItemIconUrl(slug)}
        alt={name}
        draggable={false}
        className="w-9 h-9 pixelated object-contain"
        onError={() => setIconFailed(true)}
      />
    </div>
  );
}
