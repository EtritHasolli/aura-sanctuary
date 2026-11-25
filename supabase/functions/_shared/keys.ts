// @ts-nocheck
// API keys for Edge Functions.
//
// Supabase injects the new keys as JSON objects keyed by name:
//   SUPABASE_PUBLISHABLE_KEYS = {"default": "sb_publishable_..."}
//   SUPABASE_SECRET_KEYS      = {"default": "sb_secret_...", ...}
// alongside the legacy SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY JWTs.
// The legacy keys are only a fallback for this function's *own* calls while the
// project still has them; they are never accepted from callers (see isSecretKeyRequest).

function namedKeys(envName: string): Record<string, string> {
  const raw = Deno.env.get(envName);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function pick(keys: Record<string, string>): string | undefined {
  return keys["default"] ?? Object.values(keys).find((v) => typeof v === "string" && v.length > 0);
}

/** Key for privileged server-side clients (bypasses RLS). */
export function secretKey(): string {
  return (
    pick(namedKeys("SUPABASE_SECRET_KEYS")) ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    ""
  );
}

/** Low-privilege key for clients that act as the calling user. */
export function publishableKey(): string {
  return (
    pick(namedKeys("SUPABASE_PUBLISHABLE_KEYS")) ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_ANON_KEY") ??
    ""
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/**
 * True when the request carries one of the project's new secret keys on the `apikey`
 * header — how the notifications trigger and the reminders cron job call us.
 * Functions using this must have verify_jwt = false (the new keys aren't JWTs), which
 * makes this check the only gate, so it deliberately does not accept legacy keys.
 */
export function isSecretKeyRequest(req: Request): boolean {
  const presented = req.headers.get("apikey") ?? "";
  if (!presented.startsWith("sb_secret_")) return false;
  const accepted = [
    ...Object.values(namedKeys("SUPABASE_SECRET_KEYS")),
    Deno.env.get("SUPABASE_SECRET_KEY") ?? "",
  ].filter((k) => typeof k === "string" && k.startsWith("sb_secret_"));
  return accepted.some((k) => timingSafeEqual(presented, k));
}
