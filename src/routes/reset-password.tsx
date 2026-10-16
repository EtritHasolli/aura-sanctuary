import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { APP_LOGO_URL } from "@/lib/branding";
import { PasswordInput } from "@/components/aura/PasswordInput";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

// The emailed link signs the user in through the URL fragment, and Supabase reports an
// expired or already-used link the same way. Read it at import time: the Supabase client
// consumes the fragment as soon as it starts, before this page renders.
const LINK_ERROR =
  typeof window === "undefined"
    ? null
    : (new URLSearchParams(window.location.hash.slice(1)).get("error_description") ??
      new URLSearchParams(window.location.search).get("error_description"));

const pixel = { fontFamily: "var(--font-pixel)" };

function ResetPasswordPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("The passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. Welcome back, adventurer!");
      void navigate({ to: "/" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update the password.");
    } finally {
      setSaving(false);
    }
  }

  const linkInvalid = !loading && (LINK_ERROR !== null || !user);

  return (
    <div className="min-h-full flex items-start sm:items-center justify-center bg-background p-4 relative overflow-y-auto">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          background: "radial-gradient(circle at 50% 40%, var(--color-primary), transparent 60%)",
        }}
      />
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
          <h1 className="text-xl sm:text-2xl text-primary" style={pixel}>
            NEW PASSWORD
          </h1>
        </div>

        {loading ? (
          <p className="text-center text-xs text-muted-foreground" style={pixel}>
            ...
          </p>
        ) : linkInvalid ? (
          <div className="space-y-4 text-center">
            <p className="text-[10px] text-muted-foreground leading-relaxed" style={pixel}>
              This reset link is invalid or has expired. Links work once and only for a short time.
            </p>
            <button
              type="button"
              onClick={() => void navigate({ to: "/auth" })}
              className="w-full py-3 bg-primary text-primary-foreground hover:opacity-90"
              style={{ ...pixel, fontSize: 12 }}
            >
              REQUEST A NEW LINK
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-[10px] text-muted-foreground break-all" style={pixel}>
              {user?.email}
            </p>
            <PasswordInput
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="new password"
              autoComplete="new-password"
              autoFocus
            />
            <PasswordInput
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="repeat new password"
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
              style={{ ...pixel, fontSize: 12 }}
            >
              {saving ? "..." : "SAVE PASSWORD"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
