import { useState } from "react";
import { BadgeCheck, KeyRound, Mail, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { webOrigin } from "@/lib/utils";
import { PasswordInput } from "./PasswordInput";

const MIN_PASSWORD_LENGTH = 6;

/** Settings → Account: shows the sign-in email and lets the user change their password. */
export function AccountSection() {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const verified = !!user?.email_confirmed_at;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit =
    !!current && next.length >= MIN_PASSWORD_LENGTH && next === confirm && !saving && !!email;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    if (next === current) {
      setError("The new password must be different from the current one.");
      return;
    }
    setSaving(true);
    try {
      // Confirm it's really the account owner before changing the password: an unlocked
      // device with a live session shouldn't be enough to lock someone out.
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verifyError) {
        setError("Your current password is incorrect.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed.");
    } finally {
      setSaving(false);
    }
  };

  const sendResetLink = async () => {
    if (!email) return;
    setSendingReset(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${webOrigin()}/reset-password`,
    });
    setSendingReset(false);
    if (resetError) toast.error(resetError.message);
    else toast.success(`Reset link sent to ${email}.`);
  };

  const pixel = { fontFamily: "var(--font-pixel)" } as const;
  const labelClass = "block text-sm text-muted-foreground";

  return (
    <section className="pixel-panel p-5 space-y-4 min-w-0 xl:col-span-2">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-primary" />
        <h2 className="text-lg text-primary" style={pixel}>
          ACCOUNT
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-2 min-w-0">
          <div className={labelClass}>Email</div>
          <div className="flex items-center gap-2 border-2 border-border bg-secondary/40 px-3 py-2 min-w-0">
            <Mail size={14} className="text-muted-foreground shrink-0" />
            <span
              className="truncate text-foreground"
              style={{ fontFamily: "var(--font-input)", fontSize: "0.875rem" }}
              title={email}
            >
              {email || "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {verified ? (
              <>
                <BadgeCheck size={13} className="text-primary" />
                <span className="text-muted-foreground">
                  Verified — this is the email you sign in with.
                </span>
              </>
            ) : (
              <>
                <TriangleAlert size={13} className="text-[color:var(--color-gold)]" />
                <span className="text-muted-foreground">
                  Not verified yet — check your inbox for the confirmation link.
                </span>
              </>
            )}
          </div>
        </div>

        <form onSubmit={changePassword} className="space-y-2 min-w-0">
          <label className={labelClass}>
            Current password
            <div className="mt-1">
              <PasswordInput
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                placeholder="current password"
              />
            </div>
          </label>
          <label className={labelClass}>
            New password
            <div className="mt-1">
              <PasswordInput
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>
          </label>
          <label className={labelClass}>
            Confirm new password
            <div className="mt-1">
              <PasswordInput
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                placeholder="type it again"
                aria-invalid={mismatch}
                className={mismatch ? "border-destructive focus:border-destructive" : undefined}
              />
            </div>
          </label>
          {mismatch && (
            <p className="text-xs text-destructive">The new passwords don&apos;t match.</p>
          )}
          {next.length > 0 && next.length < MIN_PASSWORD_LENGTH && (
            <p className="text-xs text-muted-foreground">
              Use at least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => void sendResetLink()}
              disabled={sendingReset || !email}
              className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline disabled:opacity-50"
            >
              {sendingReset ? "Sending…" : "Forgot it? Email me a reset link"}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="px-4 py-2.5 bg-primary text-primary-foreground disabled:opacity-50"
              style={{ ...pixel, fontSize: 10 }}
            >
              {saving ? "SAVING..." : "CHANGE PASSWORD"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
