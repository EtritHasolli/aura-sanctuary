import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Flame, Info } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useApplyReward } from "@/hooks/useProfile";
import { useMarkMessageScopeRead, useMessageUnreadCounts } from "@/hooks/useMessageUnreadCounts";
import { useNotifications } from "@/components/aura/NotificationsContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { xpForLevel } from "@/lib/aura/types";
import {
  useSkillFocusWard,
  useSkillPartyMend,
  useSkillSecondWind,
  useSkillShadowStrike,
} from "@/hooks/useSkills";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/tavern")({
  head: () => ({ meta: [{ title: "The Tavern — Aura" }] }),
  validateSearch: z.object({
    invite: z.string().optional(),
    party: z.string().optional(),
    message: z.string().optional(),
  }),
  component: TavernPage,
});

interface Party {
  id: string;
  name: string;
  boss_name: string;
  boss_hp: number;
  boss_max_hp: number;
  boss_level?: number | null;
  boss_loop_count?: number | null;
  invite_code?: string | null;
  leader_id?: string | null;
  boss_rage?: number | null;
}
interface ChatMsg {
  id: string;
  party_id: string;
  user_id: string;
  display_name: string;
  content: string;
  created_at: string;
}
interface Adventure {
  id: string;
  party_id: string;
  difficulty: "easy" | "medium" | "hard" | "mythic";
  boss_name: string;
  boss_hp: number;
  boss_max_hp: number;
  task_damage_only: boolean;
  active: boolean;
  next_tick_on: string;
}
interface StrikePartyBossResult {
  dmg: number;
  killed: boolean;
  boss_hp: number;
  boss_max_hp: number;
  bonus_gold: number;
  drop_slug: string | null;
  drop_name: string | null;
  stamina_spent: number;
  boss_rage_after?: number;
}
interface PartyPlayer {
  id: string;
  display_name: string;
  level: number;
  hp: number;
  max_hp: number;
  xp: number;
  stamina: number;
  max_stamina: number;
  strength: number;
  intelligence: number;
  constitution: number;
  dexterity: number;
  avatar_url?: string | null;
  equip_str_bonus?: number;
  equip_int_bonus?: number;
  equip_con_bonus?: number;
  equip_dex_bonus?: number;
}

const PARTY_CHAT_NAME_COLORS = [
  "#f59e0b",
  "#fb923c",
  "#f97316",
  "#22c55e",
  "#14b8a6",
  "#38bdf8",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#f43f5e",
];

const PARTY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function looksLikePartyUuid(value: string): boolean {
  return PARTY_UUID_RE.test(value.trim());
}

async function refreshPartyScaled(partyId: string) {
  const { error: syncErr } = await supabase.rpc("sync_party_boss_scaling", { p_party_id: partyId });
  if (syncErr) console.warn("sync_party_boss_scaling:", syncErr.message);
  const { data } = await supabase.from("parties").select("*").eq("id", partyId).maybeSingle();
  return data as Party | null;
}

function PlayerMeter({
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

function playerStat(base: number, bonus?: number) {
  return base + (bonus ?? 0);
}

function TavernPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { data: unreadCounts } = useMessageUnreadCounts();
  const { notifications, markTavernPartyRead } = useNotifications();
  const markMessageScopeRead = useMarkMessageScopeRead();
  const reward = useApplyReward();
  const focusWard = useSkillFocusWard();
  const partyMend = useSkillPartyMend();
  const shadowStrike = useSkillShadowStrike();
  const secondWind = useSkillSecondWind();
  const navigate = useNavigate();
  const { invite, party: partySearchId, message: messageSearchId } = Route.useSearch();
  const [myParties, setMyParties] = useState<Party[]>([]);
  const [party, setParty] = useState<Party | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [newPartyName, setNewPartyName] = useState("New Fellowship");
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [editingPartyName, setEditingPartyName] = useState("");
  const [adventure, setAdventure] = useState<Adventure | null>(null);
  const [pendingTeamDamage, setPendingTeamDamage] = useState(0);
  const [showBossInfo, setShowBossInfo] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [partyPlayers, setPartyPlayers] = useState<PartyPlayer[]>([]);
  const [partyMemberIds, setPartyMemberIds] = useState<string[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [leavingParty, setLeavingParty] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const markMessageScopeReadRef = useRef(markMessageScopeRead);
  const INVITE_PROCESSED_KEY = "tavernInviteProcessed";

  useEffect(() => {
    markMessageScopeReadRef.current = markMessageScopeRead;
  }, [markMessageScopeRead]);

  const partyNotificationCounts = notifications.reduce<Record<string, number>>((acc, n) => {
    if (n.read) return acc;
    const match = n.message.match(/\/tavern\?([^\s]+)/i);
    if (!match) return acc;
    const partyId = new URLSearchParams(match[1]).get("party");
    if (!partyId) return acc;
    acc[partyId] = (acc[partyId] ?? 0) + 1;
    return acc;
  }, {});

  useEffect(() => {
    if (!party?.id) return;
    markTavernPartyRead(party.id);
  }, [markTavernPartyRead, notifications, party?.id]);

  const loadAdventure = async (partyId: string) => {
    const { data: adv } = await supabase
      .from("party_adventures")
      .select("*")
      .eq("party_id", partyId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const a = (adv as Adventure | null) ?? null;
    setAdventure(a);
    if (!a) {
      setPendingTeamDamage(0);
      return;
    }
    const { data: dmgRows } = await supabase
      .from("party_adventure_damage")
      .select("pending_damage")
      .eq("adventure_id", a.id);
    const sum = (dmgRows ?? []).reduce((acc, r) => acc + Number(r.pending_damage ?? 0), 0);
    setPendingTeamDamage(sum);
  };

  const loadMyParties = async () => {
    if (!user) return [] as Party[];
    const { data: memberRows } = await supabase
      .from("party_members")
      .select("party_id")
      .eq("user_id", user.id);
    const ids = Array.from(new Set((memberRows ?? []).map((r) => r.party_id)));
    if (!ids.length) {
      setMyParties([]);
      return [] as Party[];
    }
    const { data: rows } = await supabase
      .from("parties")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });
    const result = (rows ?? []) as Party[];
    setMyParties(result);
    return result;
  };

  const loadParty = async (partyId: string) => {
    const full = await refreshPartyScaled(partyId);
    setParty(full);
    await loadAdventure(partyId);
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("party_id", partyId)
      .order("created_at", { ascending: true })
      .limit(100);
    setMessages((msgs ?? []) as ChatMsg[]);
    const { data: memberRows } = await supabase
      .from("party_members")
      .select("user_id")
      .eq("party_id", partyId);
    setPartyMemberIds(Array.from(new Set((memberRows ?? []).map((r) => r.user_id))));
    markTavernPartyRead(partyId);
    markMessageScopeRead.mutate(
      { scopeType: "party", scopeId: partyId },
      { onError: (e) => console.warn("mark party read failed", e) },
    );
  };

  const chatNameColorByUserId = useMemo(() => {
    const idsFromMessages = Array.from(new Set(messages.map((m) => m.user_id)));
    const merged = Array.from(new Set([...partyMemberIds, ...idsFromMessages]));
    const sorted = merged.sort((a, b) => a.localeCompare(b)).slice(0, PARTY_CHAT_NAME_COLORS.length);
    const map = new Map<string, string>();
    sorted.forEach((id, idx) => map.set(id, PARTY_CHAT_NAME_COLORS[idx]));
    return map;
  }, [messages, partyMemberIds]);

  const loadPartyPlayers = async (partyId: string) => {
    setPlayersLoading(true);
    const { data: memberRows, error: memberErr } = await supabase
      .from("party_members")
      .select("user_id")
      .eq("party_id", partyId);
    if (memberErr) {
      toast.error(memberErr.message);
      setPartyPlayers([]);
      setPlayersLoading(false);
      return;
    }

    const ids = Array.from(new Set((memberRows ?? []).map((r) => r.user_id)));
    if (!ids.length) {
      setPartyPlayers([]);
      setPlayersLoading(false);
      return;
    }

    const { data: profileRows, error: profileErr } = await supabase
      .from("profiles")
      .select(
        "id, display_name, level, hp, max_hp, xp, stamina, max_stamina, strength, intelligence, constitution, dexterity, avatar_url, equip_str_bonus, equip_int_bonus, equip_con_bonus, equip_dex_bonus",
      )
      .in("id", ids)
      .order("display_name");
    if (profileErr) {
      toast.error(profileErr.message);
      setPartyPlayers([]);
      setPlayersLoading(false);
      return;
    }

    setPartyPlayers((profileRows ?? []) as unknown as PartyPlayer[]);
    setPlayersLoading(false);
  };

  // bootstrap: load selected party, handle invite link
  useEffect(() => {
    if (!user) return;
    (async () => {
      const targetId: string | undefined = invite ?? partySearchId;
      const inviteProcessKey = invite ? `${user.id}:${invite}` : null;
      const alreadyProcessedInvite =
        inviteProcessKey &&
        sessionStorage.getItem(`${INVITE_PROCESSED_KEY}:${inviteProcessKey}`) === "1";

      if (invite && !alreadyProcessedInvite) {
        sessionStorage.setItem(`${INVITE_PROCESSED_KEY}:${inviteProcessKey}`, "1");
        await supabase.rpc("join_party_by_id", { p_party_id: invite });
      }
      const parties = await loadMyParties();
      const initialId = targetId && parties.some((p) => p.id === targetId) ? targetId : undefined;
      if (initialId) await loadParty(initialId);
      if (invite && !alreadyProcessedInvite) toast.success("Joined the party!");
      setLoading(false);
      if (invite || partySearchId) {
        navigate({
          to: "/tavern",
          search: messageSearchId ? { message: messageSearchId } : {},
          replace: true,
        });
      }
    })();
  }, [user, invite, partySearchId, messageSearchId, navigate]);

  // realtime (party state only; chat is handled by custom websocket)
  useEffect(() => {
    if (!party) return;
    const channel = supabase
      .channel(`tavern:${party.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "parties", filter: `id=eq.${party.id}` },
        (payload) => setParty(payload.new as Party),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [party?.id]);

  useEffect(() => {
    if (!party?.id) return;
    void loadAdventure(party.id);
  }, [party?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (!messageSearchId) return;
    document.getElementById(`tavern-message-${messageSearchId}`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [messageSearchId, messages]);

  useEffect(() => {
    if (!messageSearchId) {
      setHighlightedMessageId(null);
      return;
    }
    setHighlightedMessageId(messageSearchId);
    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === messageSearchId ? null : current));
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [messageSearchId]);

  // Realtime chat — mirrors the boss-HP subscription already used for the parties table
  useEffect(() => {
    if (!party?.id) return;
    const channel = supabase
      .channel(`party-chat:${party.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => {
          const msg = payload.new as ChatMsg;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.user_id !== user?.id) {
            void markMessageScopeReadRef.current.mutateAsync({
              scopeType: "party",
              scopeId: party.id,
            });
            markTavernPartyRead(party.id);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [party?.id, user?.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !party || !user || !profile) return;
    const text = input.trim();
    setInput("");
    const { error } = await supabase.from("chat_messages").insert({
      party_id: party.id,
      user_id: user.id,
      display_name: profile.display_name,
      content: text,
    });
    if (error) {
      toast.error(error.message);
      setInput(text);
    }
    // Realtime subscription delivers the new message to all clients including sender
  };

  const joinWithCode = async () => {
    if (!user || !joinCode.trim()) return;
    setLoading(true);
    const raw = joinCode.trim();
    const { data, error } = looksLikePartyUuid(raw)
      ? await supabase.rpc("join_party_by_id", { p_party_id: raw })
      : await supabase.rpc("join_party_by_invite_code", { p_code: raw.toUpperCase() });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const pid = (data as { party_id?: string })?.party_id;
    if (!pid) {
      setLoading(false);
      return;
    }
    await loadMyParties();
    await loadParty(pid);
    setJoinCode("");
    setLoading(false);
    toast.success("Joined party!");
  };

  const createNewParty = async () => {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("create_party", {
      p_name: (newPartyName || "New Fellowship").trim(),
      p_boss_name: "Shadow Wyrm",
      p_kind: "party",
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const res = data as { party_id?: string; invite_code?: string };
    if (!res?.party_id) return;
    await loadMyParties();
    await loadParty(res.party_id);
    toast.success(`Party created! Invite code: ${res.invite_code ?? "—"}`);
  };

  const renameParty = async (partyId: string, nextName: string) => {
    if (!nextName.trim()) return;
    const { error } = await supabase.rpc("rename_party", {
      p_party_id: partyId,
      p_name: nextName.trim(),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadMyParties();
    if (party?.id === partyId) await loadParty(party.id);
    toast.success("Tavern renamed.");
  };

  const beginInlineRename = (p: Party) => {
    setEditingPartyId(p.id);
    setEditingPartyName(p.name);
  };

  const commitInlineRename = async (p: Party) => {
    const next = editingPartyName.trim();
    setEditingPartyId(null);
    if (!next || next === p.name) return;
    await renameParty(p.id, next);
  };

  const startAdventure = async () => {
    if (!party) return;
    const { error } = await supabase.rpc("start_party_adventure", {
      p_party_id: party.id,
      p_difficulty: "party",
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadAdventure(party.id);
    const refreshed = await refreshPartyScaled(party.id);
    setParty(refreshed);
    toast.success("Boss hunt started.");
  };

  const invokeSkill = async (key: "swordsman" | "mage" | "rogue" | "tank") => {
    try {
      if (key === "swordsman") await focusWard.mutateAsync();
      if (key === "mage" && party) await partyMend.mutateAsync(party.id);
      if (key === "rogue") await shadowStrike.mutateAsync();
      if (key === "tank") await secondWind.mutateAsync();
      toast.success("Skill invoked!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Skill failed");
    }
  };

  const sendEmailInvite = () => {
    if (!party || !inviteEmail.trim()) return;
    const subject = encodeURIComponent("Join my party on Aura Sanctuary!");
    const body = encodeURIComponent(
      `Hey! Come join my party on Aura Sanctuary.\n\nIn the app, open the Tavern and paste this party ID into Join:\n\n${party.id}`,
    );
    window.open(`mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`);
    setInviteEmail("");
    setShowEmailInvite(false);
    toast.success("Email client opened!");
  };

  const copyInvite = async () => {
    if (!party) return;
    await navigator.clipboard.writeText(party.id);
    setCopied(true);
    toast.success("Party ID copied — paste in Tavern → Join");
    setTimeout(() => setCopied(false), 2000);
  };

  const leaveParty = async () => {
    if (!party || !user || leavingParty) return;
    if (
      !window.confirm(
        "Leave this party? You can rejoin with the party ID if a friend shares it. If you are the leader, the longest-standing member becomes leader.",
      )
    ) {
      return;
    }
    setLeavingParty(true);
    const { error } = await supabase.rpc("leave_party", { p_party_id: party.id });
    setLeavingParty(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("You left the party.");
    setParty(null);
    setMessages([]);
    setAdventure(null);
    await loadMyParties();
  };

  if (loading) return <div className="p-6 text-muted-foreground">Entering the tavern...</div>;

  if (!party) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="pixel-panel p-4 space-y-2">
            <div
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              MY PARTIES
            </div>
            {myParties.length > 0 ? (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {myParties.map((p) => {
                  const unread = Math.max(
                    unreadCounts?.partyUnreadById[p.id] ?? 0,
                    partyNotificationCounts[p.id] ?? 0,
                  );
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => void loadParty(p.id)}
                      className="w-full text-left px-2 py-1 border border-border hover:border-primary text-xs flex items-center gap-2"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      {unread > 0 && (
                        <span className="min-w-[16px] h-4 px-1 bg-destructive text-destructive-foreground flex items-center justify-center text-[9px]">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p
                className="text-sm text-muted-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                You are not in a party yet.
              </p>
            )}
          </div>
          <div className="pixel-panel p-6 text-center space-y-4">
            <h1 className="text-lg text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              THE TAVERN
            </h1>
            <p className="text-sm text-muted-foreground">
              Join a fellowship with a code, or forge a new party.
            </p>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="Party ID or short invite code"
                className="flex-1 px-2 py-2 bg-input border-2 border-border text-sm"
                style={{ fontFamily: "var(--font-pixel)" }}
              />
              <button
                type="button"
                onClick={() => void joinWithCode()}
                disabled={loading || !joinCode.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground disabled:opacity-50"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              >
                JOIN
              </button>
            </div>
            <button
              type="button"
              onClick={() => void createNewParty()}
              disabled={creating}
              className="px-4 py-2 border-2 border-border hover:border-primary disabled:opacity-50"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
            >
              {creating ? "CREATING..." : "+ CREATE PARTY"}
            </button>
            <input
              value={newPartyName}
              onChange={(e) => setNewPartyName(e.target.value)}
              placeholder="Party name"
              className="w-full px-2 py-2 bg-input border-2 border-border text-sm"
            />
            <p
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              Paste the party ID (UUID) a friend copied from the tavern, or their short invite code.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const shownBossHp = adventure?.active ? adventure.boss_hp : party.boss_hp;
  const shownBossMaxHp = adventure?.active ? adventure.boss_max_hp : party.boss_max_hp;
  const bossPct = (shownBossHp / shownBossMaxHp) * 100;

  return (
    <div className="p-6 max-w-6xl mx-auto h-full">
      <div className="space-y-4 h-full">
        <div className="pixel-panel p-3 flex flex-col lg:flex-row lg:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setParty(null);
                  setMessages([]);
                  setAdventure(null);
                }}
                className="inline-flex items-center justify-center px-2 py-1 border-2 border-border hover:border-primary text-xs bg-background shrink-0"
                style={{ fontFamily: "var(--font-pixel)" }}
                title="Back to party list"
              >
                PARTIES
              </button>
              <div className="w-full border border-primary bg-primary/10 text-xs">
                <div className="flex items-center gap-1 px-2 py-1">
                {editingPartyId === party.id ? (
                  <input
                    autoFocus
                    value={editingPartyName}
                    onChange={(e) => setEditingPartyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitInlineRename(party);
                      if (e.key === "Escape") setEditingPartyId(null);
                    }}
                    className="flex-1 bg-input border border-border px-1 py-0.5 outline-none"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  />
                ) : (
                  <div className="flex-1 truncate" style={{ fontFamily: "var(--font-pixel)" }}>
                    {party.name}
                  </div>
                )}
                {profile?.id === party.leader_id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (editingPartyId === party.id) {
                        void commitInlineRename(party);
                        return;
                      }
                      beginInlineRename(party);
                    }}
                    className="px-1.5 py-0.5 border border-border hover:border-primary text-[10px]"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {editingPartyId === party.id ? "SAVE" : "EDIT"}
                  </button>
                )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setPlayersOpen(true);
                void loadPartyPlayers(party.id);
              }}
              className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              title="View party players"
            >
              PLAYERS
            </button>
            <button
              onClick={() => setShowEmailInvite((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              title="Invite via email"
            >
              EMAIL
            </button>
            <button
              onClick={copyInvite}
              className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              title="Copy party ID for friends to paste in Join"
            >
              {copied ? "COPIED!" : "ID"}
            </button>
            <button
              type="button"
              onClick={() => void leaveParty()}
              disabled={leavingParty}
              className="flex items-center gap-1 px-2 py-1 border-2 border-destructive bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors disabled:opacity-50"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              title="Leave this party"
            >
              LEAVE
            </button>
          </div>
        </div>

        <Dialog open={playersOpen} onOpenChange={setPlayersOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "var(--font-pixel)" }}>
                {party.name} Players
              </DialogTitle>
            </DialogHeader>
            {playersLoading ? (
              <p className="text-sm text-muted-foreground">Loading players...</p>
            ) : partyPlayers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No players found in this party.</p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y-2 divide-border border-2 border-border">
                {partyPlayers.map((player) => (
                  <div key={player.id} className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 border-2 border-border bg-secondary overflow-hidden shrink-0">
                        {player.avatar_url ? (
                          <img
                            src={player.avatar_url}
                            alt={`${player.display_name} avatar`}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-primary truncate"
                          style={{ fontFamily: "var(--font-pixel)" }}
                        >
                          {player.display_name}
                          {player.id === party.leader_id ? " · LEADER" : ""}
                        </div>
                        <div
                          className="text-xs text-muted-foreground"
                          style={{ fontFamily: "var(--font-pixel)" }}
                        >
                          LV {player.level}
                        </div>
                        <div className="grid grid-cols-4 gap-1 mt-2 text-[10px]">
                          <span className="border border-border px-1 py-0.5">
                            STR {playerStat(player.strength, player.equip_str_bonus)}
                          </span>
                          <span className="border border-border px-1 py-0.5">
                            INT {playerStat(player.intelligence, player.equip_int_bonus)}
                          </span>
                          <span className="border border-border px-1 py-0.5">
                            CON {playerStat(player.constitution, player.equip_con_bonus)}
                          </span>
                          <span className="border border-border px-1 py-0.5">
                            DEX {playerStat(player.dexterity, player.equip_dex_bonus)}
                          </span>
                        </div>
                      </div>
                      <div className="w-56 space-y-1.5 pr-2">
                        <PlayerMeter
                          label="HP"
                          value={player.hp}
                          max={player.max_hp}
                          color="var(--color-hp)"
                        />
                        <PlayerMeter
                          label="XP"
                          value={player.xp}
                          max={xpForLevel(player.level)}
                          color="var(--color-xp)"
                        />
                        <PlayerMeter
                          label="STA"
                          value={player.stamina}
                          max={player.max_stamina}
                          color="var(--color-stamina)"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 h-[calc(100%-4.5rem)]">
          <div className="space-y-4 flex flex-col min-h-0">
            {/* Chat */}
            <div className="pixel-panel p-3 flex-1 flex flex-col min-h-0">
              <h3 className="text-sm text-primary mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
                TAVERN CHAT
              </h3>
              <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 px-1">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    The hall is quiet... break the silence.
                  </p>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    id={`tavern-message-${m.id}`}
                    className={`text-sm px-2 py-0.5 ${
                      highlightedMessageId === m.id ? "bg-primary/10 border border-primary" : ""
                    }`}
                  >
                    <span
                      style={{
                        color: chatNameColorByUserId.get(m.user_id) ?? "var(--color-primary)",
                        fontFamily: "var(--font-pixel)",
                        fontSize: 12,
                      }}
                    >
                      {m.display_name}:
                    </span>{" "}
                    <span style={{ fontFamily: "var(--font-display)" }}>{m.content}</span>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="mt-2 flex gap-1">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Cast into ink..."
                  className="flex-1 bg-input border-2 border-border px-2 py-1.5 text-sm focus:border-primary outline-none"
                />
                <button className="px-3 bg-primary text-primary-foreground">
                  <Send size={14} />
                </button>
              </form>
            </div>
          </div>

          <div className="space-y-3">
            {/* Boss */}
            <div className="pixel-panel p-4">
              <div className="flex items-center gap-3 mb-2">
                <h2
                  className="text-sm text-destructive flex-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  {party.boss_name}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowBossInfo(true)}
                  className="text-muted-foreground hover:text-primary"
                  title="Party boss tutorial"
                >
                  <Info size={16} />
                </button>
              </div>
              <div className="h-4 w-full bg-muted border-2 border-border relative overflow-hidden">
                <motion.div
                  className="h-full"
                  style={{ backgroundColor: "var(--color-hp)" }}
                  animate={{ width: `${bossPct}%` }}
                  transition={{ type: "spring", stiffness: 80, damping: 15 }}
                />
              </div>
              <p
                className="text-xs text-muted-foreground mt-1"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                LV {Math.max(1, Math.min(10, Number(party.boss_level ?? 1)))} · {shownBossHp} /{" "}
                {shownBossMaxHp} HP
                <br />
                Shadow rage {party.boss_rage ?? 0}
              </p>
              {adventure?.active && (
                <p
                  className="text-[10px] text-accent mt-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  Adventure: BOSS LADDER
                  <br />
                  Pending team dmg: {pendingTeamDamage}
                </p>
              )}
            </div>

            {showEmailInvite && (
              <div className="pixel-panel p-3 space-y-1">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendEmailInvite()}
                  placeholder="friend@email.com"
                  className="w-full bg-input border-2 border-border px-2 py-1.5 text-sm focus:border-primary outline-none"
                />
                <button
                  onClick={sendEmailInvite}
                  disabled={!inviteEmail.trim()}
                  className="w-full py-1.5 bg-primary text-primary-foreground disabled:opacity-50 text-sm"
                  style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
                >
                  SEND INVITE
                </button>
              </div>
            )}

            {profile && party.leader_id === profile.id && (
              <div className="pixel-panel p-3 border-2 border-border space-y-2">
                <div
                  className="text-[10px] text-muted-foreground"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  ADVENTURE BOSS
                </div>
                <div className="flex items-center justify-between border border-border px-2 py-1 text-sm">
                  <span>Boss level</span>
                  <span className="text-primary">
                    {Math.max(1, Math.min(10, Number(party.boss_level ?? 1)))}
                  </span>
                </div>
                {!adventure?.active && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => void startAdventure()}
                      className="w-full px-2 py-1 bg-primary text-primary-foreground text-sm flex items-center justify-center gap-1"
                    >
                      <Flame size={10} /> START
                    </button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  Defeat bosses from level 1 to level 10. After level 10, the final boss remains and
                  keeps scaling up.
                </p>
              </div>
            )}

            {profile?.aura_path && (
              <div className="pixel-panel p-3 space-y-1">
                <div
                  className="text-[10px] text-muted-foreground"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  PATH SKILL
                </div>
                <div className="flex flex-wrap gap-1">
                  {profile.aura_path === "swordsman" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("swordsman")}
                    >
                      Battle Focus
                    </button>
                  )}
                  {profile.aura_path === "mage" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("mage")}
                    >
                      Arcane Mend
                    </button>
                  )}
                  {profile.aura_path === "rogue" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("rogue")}
                    >
                      Shadow Strike
                    </button>
                  )}
                  {profile.aura_path === "tank" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("tank")}
                    >
                      Iron Guard
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {showBossInfo && (
        <div
          className="fixed inset-0 z-[130] bg-black/50 p-4 flex items-center justify-center"
          onClick={() => setShowBossInfo(false)}
        >
          <div
            className="pixel-panel w-full max-w-xl p-4 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                PARTY BOSS GUIDE
              </h3>
              <button
                type="button"
                onClick={() => setShowBossInfo(false)}
                className="px-2 py-0.5 border border-border hover:border-primary text-xs"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                CLOSE
              </button>
            </div>
            <ul className="list-disc pl-5 space-y-3 text-base leading-relaxed text-muted-foreground">
              <li>
                <strong className="text-foreground text-[1.05rem]">Toughness scaling:</strong> Toughness rises with
                the combined levels of everyone in this party and refreshes when you enter the
                Tavern.
              </li>
              <li>
                <strong className="text-foreground text-[1.05rem]">Rewards on kill:</strong> Killing the boss
                grants bonus gold and a random gear drop (stored in your bag).
              </li>
              <li>
                <strong className="text-foreground text-[1.05rem]">Damage timing:</strong> Team damage is applied
                at midnight.
              </li>
              <li>
                <strong className="text-foreground text-[1.05rem]">How to progress:</strong> The party owner starts
                an adventure, then members complete habits, dailies, and todos to stack team damage
                for the next midnight tick.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
