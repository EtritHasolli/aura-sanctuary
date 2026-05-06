import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Swords } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile, useApplyReward } from "@/hooks/useProfile";
import { toast } from "sonner";

export const Route = createFileRoute("/tavern")({
  head: () => ({ meta: [{ title: "The Tavern — Aura" }] }),
  component: TavernPage,
});

interface Party { id: string; name: string; boss_name: string; boss_hp: number; boss_max_hp: number }
interface ChatMsg { id: string; user_id: string; display_name: string; content: string; created_at: string }

function TavernPage() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const reward = useApplyReward();
  const [party, setParty] = useState<Party | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  // bootstrap: get or create the global tavern party
  useEffect(() => {
    if (!user) return;
    (async () => {
      let { data: p } = await supabase.from("parties").select("*").limit(1).maybeSingle();
      if (!p) {
        // create global tavern (allowed: parties has no INSERT policy, but service-side we'll skip;
        // workaround: rely on RLS — without insert policy, only members can see; we need an open party.
        // Simpler: ask user to be auto-joined to existing one. If none exists in seed, show empty state.
      }
      // ensure membership
      if (p) {
        await supabase.from("party_members").upsert({ party_id: p.id, user_id: user.id });
        const { data: full } = await supabase.from("parties").select("*").eq("id", p.id).maybeSingle();
        setParty(full as Party);
        const { data: msgs } = await supabase.from("chat_messages").select("*").eq("party_id", p.id).order("created_at", { ascending: true }).limit(100);
        setMessages((msgs ?? []) as ChatMsg[]);
      }
      setLoading(false);
    })();
  }, [user]);

  // realtime
  useEffect(() => {
    if (!party) return;
    const channel = supabase
      .channel(`tavern:${party.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `party_id=eq.${party.id}` },
        (payload) => setMessages((m) => [...m, payload.new as ChatMsg]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "parties", filter: `id=eq.${party.id}` },
        (payload) => setParty(payload.new as Party))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [party?.id]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !party || !user || !profile) return;
    const text = input.trim();
    setInput("");
    const { error } = await supabase.from("chat_messages").insert({
      party_id: party.id, user_id: user.id, display_name: profile.display_name, content: text,
    });
    if (error) toast.error(error.message);
  };

  const attackBoss = async () => {
    if (!party || !profile) return;
    const dmg = 5 + profile.strength * 2;
    const newHp = Math.max(0, party.boss_hp - dmg);
    const { error } = await supabase.from("parties").update({ boss_hp: newHp === 0 ? party.boss_max_hp : newHp }).eq("id", party.id);
    if (!error) {
      reward.mutate({ xp: dmg, gold: 2, stat: "strength" });
      toast.success(`Dealt ${dmg} damage!`);
    } else toast.error(error.message);
  };

  if (loading) return <div className="p-6 text-muted-foreground">Entering the tavern...</div>;

  if (!party) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="pixel-panel p-6 text-center">
          <h1 className="text-lg text-primary mb-2" style={{ fontFamily: "var(--font-pixel)" }}>THE TAVERN</h1>
          <p className="text-sm text-muted-foreground mb-4">No active party. The tavern hall is empty.</p>
          <p className="text-xs text-muted-foreground">Ask the keeper to seed a party in the database, or invite the dev to create one.</p>
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
              <h2 className="text-sm text-destructive flex-1" style={{ fontFamily: "var(--font-pixel)" }}>
                {party.boss_name}
              </h2>
              <button onClick={attackBoss} className="px-3 py-2 bg-destructive text-destructive-foreground flex items-center gap-1"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}>
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
            <p className="text-[10px] text-muted-foreground mt-1" style={{ fontFamily: "var(--font-pixel)" }}>
              {party.boss_hp} / {party.boss_max_hp} HP
            </p>
          </div>

          {/* Chat */}
          <div className="pixel-panel p-3 flex-1 flex flex-col min-h-0">
            <h3 className="text-xs text-primary mb-2" style={{ fontFamily: "var(--font-pixel)" }}>TAVERN CHAT</h3>
            <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 pr-1">
              {messages.length === 0 && (
                <p className="text-xs text-muted-foreground italic">The hall is quiet... break the silence.</p>
              )}
              {messages.map((m) => (
                <div key={m.id} className="text-sm">
                  <span className={m.user_id === user?.id ? "text-primary" : "text-accent"} style={{ fontFamily: "var(--font-pixel)", fontSize: 10 }}>
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
              <button className="px-3 bg-primary text-primary-foreground"><Send size={14} /></button>
            </form>
          </div>
        </div>

        {/* Party */}
        <div className="pixel-panel p-3">
          <h3 className="text-xs text-primary mb-3" style={{ fontFamily: "var(--font-pixel)" }}>PARTY</h3>
          {profile && (
            <div className="border-2 border-primary p-2">
              <div className="text-xs" style={{ fontFamily: "var(--font-pixel)" }}>{profile.display_name}</div>
              <div className="text-[10px] text-muted-foreground">LV {profile.level} · {profile.gold}g</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
