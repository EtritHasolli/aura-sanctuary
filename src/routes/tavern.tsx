import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Send, Swords, UserPlus, Check, Mail } from "lucide-react";
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
import { InventoryBag } from "@/components/aura/InventoryBag";
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
  shadow_pressure_mode?: string | null;
}
interface ChatMsg {
  id: string;
  user_id: string;
  display_name: string;
  content: string;
  created_at: string;
}
const ATTACK_STAMINA_COST = 10;

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
  const [party, setParty] = useState<Party | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showEmailInvite, setShowEmailInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // bootstrap: get or create the global tavern party, handle invite link
  useEffect(() => {
    if (!user) return;
    (async () => {
      const targetId: string | undefined = invite;

      // If arriving via invite: join FIRST so RLS SELECT policy allows fetching the party
      if (targetId) {
        await supabase.from("party_members").upsert({ party_id: targetId, user_id: user.id });
      }

      const { data: p } = targetId
        ? await supabase.from("parties").select("*").eq("id", targetId).maybeSingle()
        : await supabase.from("parties").select("*").limit(1).maybeSingle();

      if (!p) {
        setLoading(false);
        return;
      }

      // For non-invite bootstrap, join the found party
      if (!targetId) {
        await supabase.from("party_members").upsert({ party_id: p.id, user_id: user.id });
      }

      const full = await refreshPartyScaled(p.id);
      setParty(full);
      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("party_id", p.id)
        .order("created_at", { ascending: true })
        .limit(100);
      setMessages((msgs ?? []) as ChatMsg[]);
      if (invite) toast.success("Joined the party!");
      setLoading(false);
    })();
  }, [user, invite]);

  // realtime
  useEffect(() => {
    if (!party) return;
    const channel = supabase
      .channel(`tavern:${party.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `party_id=eq.${party.id}`,
        },
        (payload) => setMessages((m) => [...m, payload.new as ChatMsg]),
      )
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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

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
    if (error) toast.error(error.message);
  };

  const attackBoss = async () => {
    if (!party || !profile) return;
    if (profile.stamina < ATTACK_STAMINA_COST) {
      toast.error(`Not enough stamina. Need ${ATTACK_STAMINA_COST}.`);
      return;
    }
    const { data: raw, error } = await supabase.rpc("strike_party_boss", { p_party_id: party.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    const r = raw as StrikePartyBossResult | null;
    if (!r || typeof r.dmg !== "number") {
      toast.error("Boss strike failed.");
      return;
    }

    setParty((prev) =>
      prev
        ? {
            ...prev,
            boss_hp: r.boss_hp,
            boss_max_hp: r.boss_max_hp,
            boss_rage: typeof r.boss_rage_after === "number" ? r.boss_rage_after : prev.boss_rage,
          }
        : prev,
    );
    await qc.invalidateQueries({ queryKey: ["profile", user?.id] });
    reward.mutate({ xp: r.dmg, gold: 2, stat: "strength" });

    if (r.killed) {
      await qc.invalidateQueries({ queryKey: ["userItems", user?.id] });
      toast.success(
        `SHADOW DOWN! +${r.bonus_gold} gold${r.drop_name ? ` · ${r.drop_name}` : ""} — next boss is up!`,
      );
    } else {
      toast.success(`Dealt ${r.dmg} damage! -${r.stamina_spent} stamina`);
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
    const full = await refreshPartyScaled(pid);
    setParty(full);
    setJoinCode("");
    setLoading(false);
    toast.success("Joined party!");
  };

  const createNewParty = async () => {
    if (!user) return;
    setCreating(true);
    const { data, error } = await supabase.rpc("create_party", {
      p_name: "New Fellowship",
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
    const p = await refreshPartyScaled(res.party_id);
    if (p) {
      setParty(p);
      toast.success(`Party created! Invite code: ${res.invite_code ?? "—"}`);
    }
  };

  const copyInviteCode = async () => {
    if (!party?.invite_code) return;
    await navigator.clipboard.writeText(party.invite_code);
    toast.success("Invite code copied!");
  };

  const setPressureMode = async (mode: "support" | "hardcore") => {
    if (!party || profile?.id !== party.leader_id) return;
    const { error } = await supabase
      .from("parties")
      .update({ shadow_pressure_mode: mode })
      .eq("id", party.id);
    if (error) toast.error(error.message);
    else {
      setParty((prev) => (prev ? { ...prev, shadow_pressure_mode: mode } : prev));
      toast.success(`Shadow mode: ${mode}`);
    }
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
      <div className="p-6 max-w-xl mx-auto space-y-4">
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
          <p
            className="text-[10px] text-muted-foreground"
            style={{ fontFamily: "var(--font-pixel)" }}
          >
            Or ask a friend to share their invite link (`/tavern?invite=` plus party id).
          </p>
        </div>
      </div>
    );
  }

  const bossPct = (party.boss_hp / party.boss_max_hp) * 100;

  return (
    <div className="p-6 max-w-6xl mx-auto h-full">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 h-[calc(100%-1rem)]">
        <div className="space-y-4 flex flex-col">
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
                onClick={attackBoss}
                disabled={!profile || profile.stamina < ATTACK_STAMINA_COST}
                className="px-3 py-2 bg-destructive text-destructive-foreground flex items-center gap-1 disabled:opacity-50"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}
              >
                <Swords size={12} /> ATTACK
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
              {party.boss_hp} / {party.boss_max_hp} HP · Shadow rage {party.boss_rage ?? 0}
            </p>
            {party.invite_code && (
              <p
                className="text-[10px] text-accent mt-1 flex flex-wrap items-center gap-2"
                style={{ fontFamily: "var(--font-pixel)" }}
              >
                Code: {party.invite_code}
                <button type="button" onClick={() => void copyInviteCode()} className="underline">
                  copy
                </button>
              </p>
            )}
            <p
              className="text-[10px] text-muted-foreground mt-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Toughness rises with the combined levels of everyone in this party (refreshes when you
              enter the Tavern). On a kill you get bonus gold and a random drop (gear in your bag).
            </p>
          </div>

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

        {/* Party */}
        <div className="pixel-panel p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
              PARTY
            </h3>
            <div className="flex gap-1">
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

          {showEmailInvite && (
            <div className="mb-3 space-y-1">
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
            <div className="mb-3 text-[10px] space-y-1" style={{ fontFamily: "var(--font-pixel)" }}>
              <div className="text-muted-foreground">Shadow pressure (party)</div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => void setPressureMode("support")}
                  className={`flex-1 py-1 border ${party.shadow_pressure_mode !== "hardcore" ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  Support
                </button>
                <button
                  type="button"
                  onClick={() => void setPressureMode("hardcore")}
                  className={`flex-1 py-1 border ${party.shadow_pressure_mode === "hardcore" ? "border-destructive bg-destructive/10" : "border-border"}`}
                >
                  Hardcore
                </button>
              </div>
            </div>
          )}

          {profile?.aura_path && (
            <div className="mb-3 space-y-1">
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

          {profile && (
            <div className="border-2 border-primary p-2">
              <div className="text-sm" style={{ fontFamily: "var(--font-pixel)" }}>
                {profile.display_name}
              </div>
              <div className="text-xs text-muted-foreground">
                LV {profile.level} · {profile.gold}g · {profile.stamina}/{profile.max_stamina} STA
              </div>
            </div>
          )}

          <div className="mt-4">
            <InventoryBag listMaxHeightClass="max-h-52" />
          </div>
        </div>
      </div>
    </div>
  );
}
