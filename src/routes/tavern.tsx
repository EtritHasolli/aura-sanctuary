import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Send, UserPlus, Check, Mail, Flame, ArrowLeft, Info } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useApplyReward } from "@/hooks/useProfile";
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
  validateSearch: z.object({ invite: z.string().optional() }),
  component: TavernPage,
});

interface Party {
  id: string;
  name: string;
  boss_name: string;
  boss_hp: number;
  boss_max_hp: number;
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
async function refreshPartyScaled(partyId: string) {
  const { error: syncErr } = await supabase.rpc("sync_party_boss_scaling", { p_party_id: partyId });
  if (syncErr) console.warn("sync_party_boss_scaling:", syncErr.message);
  const { data } = await supabase.from("parties").select("*").eq("id", partyId).maybeSingle();
  return data as Party | null;
}

function TavernPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const reward = useApplyReward();
  const focusWard = useSkillFocusWard();
  const partyMend = useSkillPartyMend();
  const shadowStrike = useSkillShadowStrike();
  const secondWind = useSkillSecondWind();
  const { invite } = Route.useSearch();
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
  const [startingDifficulty, setStartingDifficulty] = useState<Adventure["difficulty"] | "">("");
  const [showBossInfo, setShowBossInfo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectDelayRef = useRef(1000);

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
  };

  // bootstrap: get or create the global tavern party, handle invite link
  useEffect(() => {
    if (!user) return;
    (async () => {
      const targetId: string | undefined = invite;

      if (targetId) await supabase.rpc("join_party_by_id", { p_party_id: targetId });
      const parties = await loadMyParties();
      const initialId = targetId && parties.some((p) => p.id === targetId) ? targetId : undefined;
      if (initialId) await loadParty(initialId);
      if (invite) toast.success("Joined the party!");
      setLoading(false);
    })();
  }, [user, invite]);

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
    if (!party?.id) return;
    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/tavern`;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectDelayRef.current = 1000;
        ws.send(JSON.stringify({ type: "join", partyId: party.id }));
        void (async () => {
          const { data: latest } = await supabase
            .from("chat_messages")
            .select("*")
            .eq("party_id", party.id)
            .order("created_at", { ascending: true })
            .limit(100);
          const rows = (latest ?? []) as ChatMsg[];
          if (!rows.length) return;
          setMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const next = [...prev];
            for (const row of rows) {
              if (!seen.has(row.id)) next.push(row);
            }
            return next;
          });
        })();
      };

      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(String(event.data ?? "")) as {
            type?: string;
            message?: ChatMsg;
            partyId?: string;
          };
          if (packet.type === "joined") {
            return;
          }
          if (packet.type !== "chat" || !packet.message || packet.message.party_id !== party.id) return;
          const msg = packet.message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        } catch {
          // Ignore malformed packets
        }
      };

      ws.onclose = () => {
        if (stopped) return;
        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(10_000, delay * 2);
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      stopped = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectDelayRef.current = 1000;
      if (wsRef.current?.readyState === WebSocket.OPEN && party?.id) {
        wsRef.current.send(JSON.stringify({ type: "leave", partyId: party.id }));
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [party?.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !party || !user || !profile) return;
    const text = input.trim();
    setInput("");
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        party_id: party.id,
        user_id: user.id,
        display_name: profile.display_name,
        content: text,
      })
      .select("*")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    const row = data as ChatMsg;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "chat", partyId: party.id, message: row }));
    } else {
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    }
  };

  const joinWithCode = async () => {
    if (!user || !joinCode.trim()) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("join_party_by_invite_code", {
      p_code: joinCode.trim(),
    });
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
    if (!party || !startingDifficulty) return;
    const { error } = await supabase.rpc("start_party_adventure", {
      p_party_id: party.id,
      p_difficulty: startingDifficulty,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadAdventure(party.id);
    const refreshed = await refreshPartyScaled(party.id);
    setParty(refreshed);
    setStartingDifficulty("");
    toast.success("Adventure started.");
  };

  const invokeSkill = async (key: "warden" | "scholar" | "strider" | "keeper") => {
    try {
      if (key === "warden") await focusWard.mutateAsync();
      if (key === "scholar" && party) await partyMend.mutateAsync(party.id);
      if (key === "strider") await shadowStrike.mutateAsync();
      if (key === "keeper") await secondWind.mutateAsync();
      toast.success("Skill invoked!");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Skill failed");
    }
  };

  const sendEmailInvite = () => {
    if (!party || !inviteEmail.trim()) return;
    const link = `${window.location.origin}/tavern?invite=${party.id}`;
    const subject = encodeURIComponent("Join my party on Aura Sanctuary!");
    const body = encodeURIComponent(
      `Hey! Come join my party on Aura Sanctuary.\n\nClick this link to join:\n${link}`,
    );
    window.open(`mailto:${inviteEmail.trim()}?subject=${subject}&body=${body}`);
    setInviteEmail("");
    setShowEmailInvite(false);
    toast.success("Email client opened!");
  };

  const copyInvite = async () => {
    if (!party) return;
    const link = `${window.location.origin}/tavern?invite=${party.id}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Invite link copied!");
    setTimeout(() => setCopied(false), 2000);
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
                {myParties.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void loadParty(p.id)}
                    className="w-full text-left px-2 py-1 border border-border hover:border-primary text-xs"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {p.name}
                  </button>
                ))}
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
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="INVITE CODE"
                className="flex-1 px-2 py-2 bg-input border-2 border-border text-sm uppercase"
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
              Or ask a friend to share their invite link (`/tavern?invite=` plus party id).
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
    <div className="p-6 max-w-6xl mx-auto h-full relative">
      <button
        type="button"
        onClick={() => {
          setParty(null);
          setMessages([]);
          setAdventure(null);
        }}
        className="absolute -left-12 top-2 z-10 px-2 py-1 border-2 border-border hover:border-primary text-xs bg-background"
        style={{ fontFamily: "var(--font-pixel)" }}
        title="Back to party list"
      >
        <ArrowLeft size={14} />
      </button>
      <div className="space-y-4 h-full">
        <div className="pixel-panel p-3 flex flex-col lg:flex-row lg:items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="max-h-28 overflow-y-auto space-y-1">
              {myParties.map((p) => (
                <div
                  key={p.id}
                  className={`w-full border text-xs ${party.id === p.id ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <div className="flex items-center gap-1 px-2 py-1">
                    {editingPartyId === p.id ? (
                      <input
                        autoFocus
                        value={editingPartyName}
                        onChange={(e) => setEditingPartyName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void commitInlineRename(p);
                          if (e.key === "Escape") setEditingPartyId(null);
                        }}
                        className="flex-1 bg-input border border-border px-1 py-0.5 outline-none"
                        style={{ fontFamily: "var(--font-pixel)" }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => void loadParty(p.id)}
                        className="flex-1 text-left"
                        style={{ fontFamily: "var(--font-pixel)" }}
                      >
                        {p.name}
                      </button>
                    )}
                    {profile?.id === p.leader_id && (
                      <button
                        type="button"
                        onClick={() => {
                          if (editingPartyId === p.id) {
                            void commitInlineRename(p);
                            return;
                          }
                          beginInlineRename(p);
                        }}
                        className="px-1.5 py-0.5 border border-border hover:border-primary text-[10px]"
                        style={{ fontFamily: "var(--font-pixel)" }}
                      >
                        {editingPartyId === p.id ? "SAVE" : "EDIT"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowEmailInvite((v) => !v)}
              className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              title="Invite via email"
            >
              <Mail size={10} /> EMAIL
            </button>
            <button
              onClick={copyInvite}
              className="flex items-center gap-1 px-2 py-1 border-2 border-border hover:border-primary text-muted-foreground hover:text-primary transition-colors"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 11 }}
              title="Copy invite link"
            >
              {copied ? <Check size={10} /> : <UserPlus size={10} />}
              {copied ? "COPIED!" : "LINK"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 h-[calc(100%-4.5rem)]">
          <div className="space-y-4 flex flex-col min-h-0">
            {/* Chat */}
            <div className="pixel-panel p-3 flex-1 flex flex-col min-h-0">
              <h3 className="text-sm text-primary mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
                TAVERN CHAT
              </h3>
              <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 pr-1">
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">
                    The hall is quiet... break the silence.
                  </p>
                )}
                {messages.map((m) => (
                  <div key={m.id} className="text-sm">
                    <span
                      className={m.user_id === user?.id ? "text-primary" : "text-accent"}
                      style={{ fontFamily: "var(--font-pixel)", fontSize: 12 }}
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
                  placeholder="Speak..."
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
                {shownBossHp} / {shownBossMaxHp} HP · Shadow rage {party.boss_rage ?? 0}
              </p>
              {adventure?.active && (
                <p
                  className="text-[10px] text-accent mt-1"
                  style={{ fontFamily: "var(--font-pixel)" }}
                >
                  Adventure: {adventure.difficulty.toUpperCase()}
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
                <div className="flex gap-1">
                  <select
                    value={startingDifficulty}
                    onChange={(e) =>
                      setStartingDifficulty(e.target.value as Adventure["difficulty"] | "")
                    }
                    className="flex-1 bg-input border-2 border-border px-2 py-1 text-sm"
                  >
                    <option value="">Select difficulty</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                    <option value="mythic">Mythic</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => void startAdventure()}
                    disabled={!startingDifficulty}
                    className="px-2 py-1 bg-primary text-primary-foreground disabled:opacity-50 text-sm flex items-center gap-1"
                  >
                    <Flame size={10} /> START
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Daily/todo completions and habit + actions accumulate party damage, applied at
                  midnight.
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
                  {profile.aura_path === "warden" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("warden")}
                    >
                      Focus Ward
                    </button>
                  )}
                  {profile.aura_path === "scholar" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("scholar")}
                    >
                      Party Mend
                    </button>
                  )}
                  {profile.aura_path === "strider" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("strider")}
                    >
                      Shadow Strike
                    </button>
                  )}
                  {profile.aura_path === "keeper" && (
                    <button
                      type="button"
                      className="px-2 py-1 border border-border text-[10px]"
                      onClick={() => void invokeSkill("keeper")}
                    >
                      Second Wind
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
