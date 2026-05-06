import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            data: { display_name: name || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success("Welcome, adventurer! Check your email to verify.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
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

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <input
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Hero name"
              className="w-full px-3 py-2 bg-input border-2 border-border focus:border-primary outline-none text-sm"
            />
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
