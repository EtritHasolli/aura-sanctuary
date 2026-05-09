import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APP_LOGO_URL } from "@/lib/branding";
import { AURA_PATHS, type AuraPath } from "@/lib/aura/types";
import { toast } from "sonner";
import swordsmanIdle from "../../characters/swordsman/idle.gif";
import swordsmanStance from "../../characters/swordsman/stance.gif";
import mageIdle from "../../characters/mage/idle.gif";
import mageStance from "../../characters/mage/stance.gif";
import paladinIdle from "../../characters/paladin/idle.gif";
import paladinStance from "../../characters/paladin/stance.gif";
import rogueIdle from "../../characters/rogue/idle.gif";
import rogueStance from "../../characters/rogue/stance.gif";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const PATH_GIFS: Record<AuraPath, { idle: string; stance: string }> = {
  swordsman: { idle: swordsmanIdle, stance: swordsmanStance },
  mage: { idle: mageIdle, stance: mageStance },
  tank: { idle: paladinIdle, stance: paladinStance },
  rogue: { idle: rogueIdle, stance: rogueStance },
};

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [path, setPath] = useState<AuraPath>("swordsman");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        if (!path) {
          toast.error("Choose a path to begin your adventure.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: {
              display_name: name || email.split("@")[0],
              aura_path: path,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success("Welcome, adventurer! Check your email to verify.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-full flex items-start sm:items-center justify-center bg-background p-4 relative overflow-y-auto">
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        background: "radial-gradient(circle at 50% 40%, var(--color-primary), transparent 60%)"
      }} />
      <div className="pixel-panel p-4 sm:p-8 w-full max-w-sm relative my-auto">
        <div className="text-center mb-4 sm:mb-6">
          <img
            src={APP_LOGO_URL}
            alt=""
            width={96}
            height={96}
            className="mx-auto mb-2 sm:mb-4 h-16 w-16 sm:h-24 sm:w-24 object-contain"
            style={{ imageRendering: "pixelated" }}
            decoding="async"
          />
          <h1 className="text-xl sm:text-2xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>AURA</h1>
          <p className="text-xs text-muted-foreground mt-1 sm:mt-2" style={{ fontFamily: "var(--font-pixel)" }}>
            The Desktop Sanctuary
          </p>
        </div>

        {/* Google OAuth disabled — will be re-enabled for desktop app */}

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hero name"
                className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-sm"
              />
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground block">Choose your path</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {AURA_PATHS.map((p) => {
                    const selected = p.id === path;
                    const sprite = selected ? PATH_GIFS[p.id].stance : PATH_GIFS[p.id].idle;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPath(p.id)}
                        className={`border-2 p-1.5 text-left transition-colors ${
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-secondary/30 hover:border-primary/60"
                        }`}
                      >
                        <div className="w-full h-16 sm:h-20 mb-1.5 border border-border bg-black/20 flex items-center justify-center overflow-hidden">
                          <img src={sprite} alt={`${p.label} preview`} className="h-full w-auto object-contain" />
                        </div>
                        <div className="text-primary text-[10px] sm:text-xs" style={{ fontFamily: "var(--font-pixel)" }}>
                          {p.label}
                        </div>
                        <div className="text-muted-foreground text-[10px] sm:text-xs">{p.skill}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="border border-border bg-secondary/40 p-2 text-xs">
                  {AURA_PATHS.filter((p) => p.id === path).map((p) => (
                    <div key={p.id} className="space-y-1">
                      <div className="text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                        {p.label}
                      </div>
                      <div className="text-muted-foreground">{p.fantasy}</div>
                      <div className="text-accent">{p.growth}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-sm"
          />
          <input
            type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-sm"
          />
          <button
            type="submit" disabled={loading}
            className="w-full py-3 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 12 }}
          >
            {loading ? "..." : mode === "signin" ? "ENTER" : "BEGIN QUEST"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-xs text-muted-foreground hover:text-primary"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {mode === "signin" ? "» Create account" : "» I have an account"}
        </button>
      </div>
    </div>
  );
}
