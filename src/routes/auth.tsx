import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AURA_PATHS, type AuraPath } from "@/lib/aura/types";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-20" style={{
        background: "radial-gradient(circle at 50% 40%, var(--color-primary), transparent 60%)"
      }} />
      <div className="pixel-panel p-8 w-full max-w-sm relative">
        <div className="text-center mb-6">
          <h1 className="text-2xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>AURA</h1>
          <p className="text-xs text-muted-foreground mt-2" style={{ fontFamily: "var(--font-pixel)" }}>
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
                <select
                  value={path}
                  onChange={(e) => setPath(e.target.value as AuraPath)}
                  className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-sm"
                >
                  {AURA_PATHS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} - {p.skill}
                    </option>
                  ))}
                </select>
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
