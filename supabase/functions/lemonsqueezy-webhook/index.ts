// @ts-nocheck
import { createClient } from "jsr:@supabase/supabase-js@2";

const WEBHOOK_SECRET = Deno.env.get("LEMONSQUEEZY_WEBHOOK_SECRET")!;

// ── Variant ID → tier slug mapping ───────────────────────────────────────────
// Numeric Lemon Squeezy variant IDs (from the dashboard / webhook payload).
const VARIANT_TO_TIER: Record<string, string> = {
  "1693783": "adventurer",
  "1693794": "legend",
};

// ── Signature verification ────────────────────────────────────────────────────

async function verifySignature(body: string, signature: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = hexToBytes(signature);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(body));
}

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.text();
  const signature = req.headers.get("X-Signature") ?? "";

  if (!WEBHOOK_SECRET || !(await verifySignature(body, signature))) {
    console.warn("Signature verification failed (check LEMONSQUEEZY_WEBHOOK_SECRET)");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    console.error("Bad JSON body:", body.slice(0, 500));
    return new Response("Bad JSON", { status: 400 });
  }

  const eventName = (payload.meta as Record<string, unknown>)?.event_name as string | undefined;
  const data = payload.data as Record<string, unknown> | undefined;
  const attrs = data?.attributes as Record<string, unknown> | undefined;

  // Log every received event up front so failures are always diagnosable.
  console.log("Received event:", eventName, "| variant:", attrs?.variant_id, "| email:", attrs?.user_email);

  // Only care about subscription lifecycle events
  if (!eventName?.startsWith("subscription_")) {
    console.log("Ignoring non-subscription event:", eventName);
    return new Response("Ignored", { status: 200 });
  }

  // Extract the customer's email — LS attaches it on the subscription object.
  const userEmail = (attrs?.user_email as string | undefined)?.trim().toLowerCase();
  const variantId = attrs?.variant_id != null ? String(attrs.variant_id) : "";
  const status = attrs?.status as string | undefined; // "active" | "cancelled" | "expired" | "paused"
  const renewsAt = attrs?.renews_at as string | null | undefined;
  const endsAt = attrs?.ends_at as string | null | undefined;

  if (!userEmail || !variantId) {
    console.error("Missing email or variant_id. attrs:", JSON.stringify(attrs)?.slice(0, 800));
    return new Response("Missing email or variant_id", { status: 400 });
  }

  const tierSlug = VARIANT_TO_TIER[variantId];

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Look up the user by email. listUsers() is paginated (default 50/page), so
  // page through until we find a match rather than only checking the first page.
  let user: { id: string; email?: string } | undefined;
  for (let page = 1; page <= 20 && !user; page++) {
    const { data: pageData, error: listErr } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (listErr) {
      console.error("listUsers error", listErr);
      return new Response("Internal error", { status: 500 });
    }
    const users = pageData?.users ?? [];
    user = users.find((u) => u.email?.toLowerCase() === userEmail);
    if (users.length < 1000) break; // last page
  }

  if (!user) {
    console.warn("No user found for email", userEmail);
    return new Response("User not found", { status: 404 });
  }

  const isCancelled =
    eventName === "subscription_cancelled" || status === "cancelled" || status === "expired";

  if (isCancelled) {
    // Revert to free tier; expires_at comes from LS (end of billing period)
    const { error } = await supabase.rpc("admin_set_user_subscription", {
      p_user_id: user.id,
      p_tier_slug: "free",
      p_expires_at: null,
      p_grant_signup_bonus: false,
    });
    if (error) {
      console.error("admin_set_user_subscription error", error);
      return new Response("DB error", { status: 500 });
    }
    console.log(`Reverted ${userEmail} to free (${eventName})`);
    return new Response("OK", { status: 200 });
  }

  if (!tierSlug) {
    console.warn(`No tier mapping for variant ${variantId} — add it to VARIANT_TO_TIER`);
    return new Response("Unknown variant", { status: 200 });
  }

  // Active / renewed subscription
  const expiresAt = endsAt ?? renewsAt ?? null;
  const { error } = await supabase.rpc("admin_set_user_subscription", {
    p_user_id: user.id,
    p_tier_slug: tierSlug,
    p_expires_at: expiresAt,
    p_grant_signup_bonus: eventName === "subscription_created",
  });
  if (error) {
    console.error("admin_set_user_subscription error", error);
    return new Response("DB error", { status: 500 });
  }

  console.log(`Set ${userEmail} → ${tierSlug} (${eventName}, expires ${expiresAt})`);
  return new Response("OK", { status: 200 });
});
