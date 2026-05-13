import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { APP_LOGO_URL } from "@/lib/branding";
import { AURA_PATHS, type AuraPath } from "@/lib/aura/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { motion } from "framer-motion";
import swordsmanIdle from "../../characters/swordsman/idle.gif";
import swordsmanStance from "../../characters/swordsman/stance.gif";
import mageIdle from "../../characters/mage/idle.gif";
import mageStance from "../../characters/mage/stance.gif";
import paladinIdle from "../../characters/paladin/idle.gif";
import paladinStance from "../../characters/paladin/stance.gif";
import rogueIdle from "../../characters/rogue/idle.gif";
import rogueStance from "../../characters/rogue/stance.gif";
import evilSwordsmanIdle from "../../characters/evilswordsman/idle.gif";
import evilSwordsmanStance from "../../characters/evilswordsman/stance.gif";
import evilMageIdle from "../../characters/evilmage/idle.gif";
import evilMageStance from "../../characters/evilmage/stance.gif";
import evilPaladinIdle from "../../characters/evilpaladin/idle.gif";
import evilPaladinStance from "../../characters/evilpaladin/stance.gif";
import evilRogueIdle from "../../characters/evilrogue/idle.gif";
import evilRogueStance from "../../characters/evilrogue/stance.gif";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const PATH_GIFS: Record<AuraPath, { idle: string; stance: string }> = {
  swordsman: { idle: swordsmanIdle, stance: swordsmanStance },
  mage: { idle: mageIdle, stance: mageStance },
  tank: { idle: paladinIdle, stance: paladinStance },
  rogue: { idle: rogueIdle, stance: rogueStance },
  evilswordsman: { idle: evilSwordsmanIdle, stance: evilSwordsmanStance },
  evilmage: { idle: evilMageIdle, stance: evilMageStance },
  evilpaladin: { idle: evilPaladinIdle, stance: evilPaladinStance },
  evilrogue: { idle: evilRogueIdle, stance: evilRogueStance },
};

const dramaticByPath: Record<AuraPath, string> = {
  swordsman:
    "Steel sings in your hands. You break enemy lines and turn discipline into momentum.",
  mage:
    "Arcane equations bend in your favor. You mend the party and outthink the battlefield.",
  tank: "You are the wall that does not fall. Threat shatters on your guard and resolve.",
  rogue:
    "You strike from the blind angle. Precision, pace, and timing become your true weapons.",
  evilswordsman:
    "Blood stains your blade. You crush resistance and turn chaos into your own ruthless power.",
  evilmage:
    "Forbidden runes flicker in your gaze. You shatter minds and bend the void to your dark whims.",
  evilpaladin:
    "You are the shadow that consumes. Mercy withers in your presence as you enforce your cold, iron will.",
  evilrogue:
    "You are the whisper in the dark. Malice, cunning, and betrayal are the tools of your deadly trade.",
};

type SignupPhase = "credentials" | "awaiting_path" | "profile";

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signupPhase, setSignupPhase] = useState<SignupPhase>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [path, setPath] = useState<AuraPath | "">("");
  const [alignment, setAlignment] = useState<"good" | "evil" | null>(null);
  const [loading, setLoading] = useState(false);
  const [pathModalOpen, setPathModalOpen] = useState(false);
  const [pathCardGifMode, setPathCardGifMode] = useState<"idle" | "stance">("idle");
  /** True when path modal was closed via CONFIRM PATH during signup path step. */
  const awaitingPathConfirmedRef = useRef(false);
  /** True when modal was opened from profile step (change path), so dismiss returns to profile. */
  const pathModalFromProfileRef = useRef(false);

  useEffect(() => {
    if (!path) return;
    setPathCardGifMode("idle");
  }, [path]);

  useEffect(() => {
    if (!path) return;
    const timer = window.setInterval(() => {
      setPathCardGifMode((m) => (m === "idle" ? "stance" : "idle"));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [path]);

  useEffect(() => {
    if (pathModalOpen || mode !== "signup" || signupPhase !== "awaiting_path") return;
    if (awaitingPathConfirmedRef.current) {
      awaitingPathConfirmedRef.current = false;
      pathModalFromProfileRef.current = false;
      setSignupPhase("profile");
      return;
    }
    if (pathModalFromProfileRef.current) {
      pathModalFromProfileRef.current = false;
      setSignupPhase("profile");
      return;
    }
    setSignupPhase("credentials");
    setPath("");
  }, [pathModalOpen, mode, signupPhase]);

  function openPathModalForSignup() {
    awaitingPathConfirmedRef.current = false;
    pathModalFromProfileRef.current = false;
    setPath("");
    setAlignment(null);
    setSignupPhase("awaiting_path");
    setPathModalOpen(true);
  }

  function confirmPathFromModal() {
    if (!path) {
      toast.error("Choose a path to begin your adventure.");
      return;
    }
    awaitingPathConfirmedRef.current = true;
    setPathModalOpen(false);
  }

  function cancelPathModalSignup() {
    awaitingPathConfirmedRef.current = false;
    setPathModalOpen(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup" && signupPhase === "credentials") {
        if (!email.trim() || password.length < 6) {
          toast.error("Enter a valid email and password (6+ characters).");
          return;
        }
        openPathModalForSignup();
        return;
      }

      if (mode === "signup" && signupPhase === "profile") {
        if (!path) {
          toast.error("Choose a path to begin your adventure.");
          return;
        }
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: name.trim() || email.split("@")[0],
              aura_path: path as AuraPath,
            },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) throw error;
        toast.success("Welcome, adventurer! Check your email to verify.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  function setAuthMode(next: "signin" | "signup") {
    setMode(next);
    setSignupPhase("credentials");
    setPath("");
    setAlignment(null);
    awaitingPathConfirmedRef.current = false;
    pathModalFromProfileRef.current = false;
    setPathModalOpen(false);
  }

  const signupOnProfile = mode === "signup" && signupPhase === "profile";
  const signupOnCredentials = mode === "signup" && signupPhase === "credentials";

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
          <h1 className="text-xl sm:text-2xl text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
            AURA
          </h1>
          <p className="text-xs text-muted-foreground mt-1 sm:mt-2" style={{ fontFamily: "var(--font-pixel)" }}>
            The Desktop Sanctuary
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          {signupOnProfile && (
            <p className="text-[10px] text-muted-foreground break-all" style={{ fontFamily: "var(--font-pixel)" }}>
              {email.trim()}
            </p>
          )}
          {signupOnProfile && (
            <>
              <label className="text-xs text-muted-foreground block" style={{ fontFamily: "var(--font-pixel)" }}>
                Hero name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hero name"
                className="w-full px-3 py-2.5 bg-input border-2 border-border focus:border-primary outline-none leading-snug"
                style={{
                  fontFamily: "var(--font-pixel)",
                  /* rem avoids styles.css floor that forces inline 9–11px to 14px */
                  fontSize: "0.5625rem",
                }}
              />
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground block" style={{ fontFamily: "var(--font-pixel)" }}>
                  Your path
                </label>
                {path ? (
                  <button
                    type="button"
                    onClick={() => {
                      awaitingPathConfirmedRef.current = false;
                      pathModalFromProfileRef.current = true;
                      setSignupPhase("awaiting_path");
                      setPathModalOpen(true);
                    }}
                    className="relative w-full overflow-hidden border-2 border-border bg-secondary/40 p-3 text-sm text-left hover:border-primary hover:shadow-[0_0_14px_rgba(217,150,48,0.35)]"
                  >
                    <motion.img
                      key={`${path}-${pathCardGifMode}`}
                      aria-hidden
                      alt=""
                      src={PATH_GIFS[path as AuraPath][pathCardGifMode]}
                      className="pointer-events-none absolute right-2 top-2 z-0 h-[96px] w-auto max-w-[min(44%,140px)] object-contain object-top sm:h-[112px]"
                      style={{ imageRendering: "pixelated" }}
                      initial={false}
                      animate={{ y: [0, -2, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    />
                    <div className="relative z-[1] space-y-1 min-w-0 pr-[calc(96px+0.75rem)] sm:pr-[calc(112px+1rem)]">
                      <div className="text-primary" style={{ fontFamily: "var(--font-pixel)" }}>
                        {AURA_PATHS.find((p) => p.id === path)?.label}
                      </div>
                      <p className="text-muted-foreground">{AURA_PATHS.find((p) => p.id === path)?.fantasy}</p>
                      <p className="text-accent">{AURA_PATHS.find((p) => p.id === path)?.growth}</p>
                      <p className="text-muted-foreground">Skill: {AURA_PATHS.find((p) => p.id === path)?.skill}</p>
                      <p className="text-sm text-foreground/90 italic">{dramaticByPath[path as AuraPath]}</p>
                    </div>
                  </button>
                ) : null}
              </div>
            </>
          )}

          {(mode === "signin" || signupOnCredentials) && (
            <>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                className="w-full px-3 py-2.5 bg-input border-2 border-border focus:border-primary outline-none leading-snug"
                style={{
                  fontFamily: "var(--font-pixel)",
                  /* rem avoids styles.css floor that forces inline 9–11px to 14px */
                  fontSize: "0.5625rem",
                }}
              />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password"
                className="w-full px-3 py-2.5 bg-input border-2 border-border focus:border-primary outline-none leading-snug"
                style={{
                  fontFamily: "var(--font-pixel)",
                  /* rem avoids styles.css floor that forces inline 9–11px to 14px */
                  fontSize: "0.5625rem",
                }}
              />
            </>
          )}

          <button
            type="submit"
            disabled={loading || (mode === "signup" && signupPhase === "awaiting_path")}
            className="w-full py-3 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            style={{ fontFamily: "var(--font-pixel)", fontSize: 12 }}
          >
            {loading
              ? "..."
              : mode === "signin"
                ? "ENTER"
                : signupOnCredentials
                  ? "CONTINUE"
                  : "BEGIN QUEST"}
          </button>
        </form>

        <button
          onClick={() => setAuthMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-xs text-muted-foreground hover:text-primary"
          style={{ fontFamily: "var(--font-pixel)" }}
        >
          {mode === "signin" ? "» Create account" : "» I have an account"}
        </button>
      </div>

      <Dialog
        open={pathModalOpen}
        onOpenChange={(open) => {
          if (open) {
            setPathModalOpen(true);
            return;
          }
          if (mode === "signup" && signupPhase === "awaiting_path") {
            setPathModalOpen(false);
            return;
          }
          setPathModalOpen(false);
        }}
      >
        <DialogContent
          className="w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] max-w-7xl gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8 max-h-[90dvh] overflow-y-auto"
          onPointerDownOutside={(e) => {
            if (mode === "signup" && signupPhase === "awaiting_path") {
              e.preventDefault();
            }
          }}
          onEscapeKeyDown={(e) => {
            if (mode === "signup" && signupPhase === "awaiting_path") {
              e.preventDefault();
              cancelPathModalSignup();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle
              className="text-xl sm:text-2xl lg:text-3xl pr-8"
              style={{ fontFamily: "var(--font-pixel)" }}
            >
              {alignment === null ? "Choose Your Alignment" : "Choose Your Path"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm sm:text-base text-muted-foreground">
            {alignment === null
              ? "Will you walk the path of light or embrace the darkness?"
              : "You must choose one path to continue. This choice is permanent."}
          </p>

          {alignment === null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setAlignment("good")}
                className="pixel-panel p-6 border-2 border-border hover:border-primary hover:bg-primary/10 transition-all group"
              >
                <div className="text-2xl text-primary mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
                  GOOD
                </div>
                <p className="text-sm text-muted-foreground group-hover:text-foreground">
                  Protect the sanctuary and uphold the virtues of discipline.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setAlignment("evil")}
                className="pixel-panel p-6 border-2 border-border hover:border-accent hover:bg-accent/10 transition-all group"
              >
                <div className="text-2xl text-accent mb-2" style={{ fontFamily: "var(--font-pixel)" }}>
                  EVIL
                </div>
                <p className="text-sm text-muted-foreground group-hover:text-foreground">
                  Harness the power of chaos and bend the world to your will.
                </p>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 min-[520px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 min-w-0">
              {AURA_PATHS.filter((p) => p.alignment === alignment).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPath(p.id)}
                  aria-pressed={path === p.id}
                  className={`relative text-left pixel-panel min-w-0 p-3 sm:p-4 border-2 transition-all duration-150 ${
                    path === p.id
                      ? "!border-primary !bg-primary/10 shadow-[0_0_0_2px_rgba(217,150,48,0.9),0_0_24px_rgba(217,150,48,0.55)]"
                      : "border-border hover:!border-primary hover:shadow-[0_0_16px_rgba(217,150,48,0.45)]"
                  }`}
                >
                  {path === p.id && (
                    <span
                      className="absolute top-2 right-2 px-1.5 py-0.5 text-[9px] sm:text-[10px] bg-primary text-primary-foreground"
                      style={{ fontFamily: "var(--font-pixel)" }}
                    >
                      SELECTED
                    </span>
                  )}
                  <div className="w-full h-32 min-[520px]:h-36 sm:h-40 lg:h-44 border-2 border-border bg-secondary/40 mb-3 flex items-center justify-center overflow-hidden">
                    <img
                      src={path === p.id ? PATH_GIFS[p.id].stance : PATH_GIFS[p.id].idle}
                      alt={`${p.label} preview`}
                      className="h-full w-auto max-w-full object-contain"
                    />
                  </div>
                  <div
                    className="text-primary mb-1.5 text-sm sm:text-base"
                    style={{ fontFamily: "var(--font-pixel)" }}
                  >
                    {p.label}
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">{p.fantasy}</p>
                  <p className="text-xs sm:text-sm text-accent mt-1">{p.growth}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">Skill: {p.skill}</p>
                  <p className="text-xs sm:text-sm text-foreground/80 italic mt-2 leading-relaxed">
                    {dramaticByPath[p.id]}
                  </p>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            {alignment !== null && (
              <button
                type="button"
                onClick={() => {
                  setAlignment(null);
                  setPath("");
                }}
                className="px-4 py-2.5 border-2 border-border mr-auto"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
              >
                BACK TO ALIGNMENT
              </button>
            )}
            {mode === "signup" && signupPhase === "awaiting_path" && (
              <button
                type="button"
                onClick={cancelPathModalSignup}
                className="px-4 py-2.5 border-2 border-border"
                style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
              >
                BACK
              </button>
            )}
            <button
              type="button"
              onClick={confirmPathFromModal}
              disabled={!path}
              className="px-4 py-2.5 bg-primary text-primary-foreground disabled:opacity-50"
              style={{ fontFamily: "var(--font-pixel)", fontSize: 14 }}
            >
              CONFIRM PATH
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
