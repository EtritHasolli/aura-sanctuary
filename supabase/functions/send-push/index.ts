// @ts-nocheck
import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@aurasanctuary.app";

// ── helpers ───────────────────────────────────────────────────────────────────

function b64u(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromB64u(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")+pad), c => c.charCodeAt(0));
}

function enc(s: string): Uint8Array { return new TextEncoder().encode(s); }

function cat(...a: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let i = 0; for (const x of a) { out.set(x, i); i += x.length; }
  return out;
}

// ── VAPID JWT (ES256) ─────────────────────────────────────────────────────────

async function vapidJwt(origin: string): Promise<string> {
  const h = b64u(enc(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const p = b64u(enc(JSON.stringify({ aud: origin, exp: Math.floor(Date.now()/1000)+43200, sub: VAPID_SUBJECT })));
  const key = await crypto.subtle.importKey(
    "pkcs8", fromB64u(VAPID_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc(`${h}.${p}`)));
  return `${h}.${p}.${b64u(sig)}`;
}

// ── aes128gcm Web Push encryption (RFC 8291 + RFC 8188) ──────────────────────

async function encrypt(p256dh: string, auth: string, plaintext: string): Promise<Uint8Array> {
  const salt       = crypto.getRandomValues(new Uint8Array(16));
  const authSecret = fromB64u(auth);
  const uaPublic   = fromB64u(p256dh);

  // Server ephemeral key pair
  const asKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic  = new Uint8Array(await crypto.subtle.exportKey("raw", asKeyPair.publicKey));

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhBits = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeyPair.privateKey, 256));

  // PRK = HKDF(salt=auth_secret, ikm=ecdh_secret, info="Content-Encoding: auth\0", len=32)
  const ikm0 = await crypto.subtle.importKey("raw", ecdhBits, "HKDF", false, ["deriveBits"]);
  const prk  = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: enc("Content-Encoding: auth\0") } as HkdfParams,
    ikm0, 256,
  ));

  // IKM = HKDF(salt=salt, ikm=prk, info="WebPush: info\0" || ua_pub || as_pub, len=32)
  const ikm1   = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);
  const wpInfo = cat(enc("WebPush: info\0"), uaPublic, asPublic);
  const ikm    = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: wpInfo } as HkdfParams,
    ikm1, 256,
  ));

  // CEK and nonce
  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const cek    = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc("Content-Encoding: aes128gcm\0") } as HkdfParams,
    ikmKey, 128,
  ));
  const nonce  = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc("Content-Encoding: nonce\0") } as HkdfParams,
    ikmKey, 96,
  ));

  const aesKey    = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const pt        = enc(plaintext);
  const padded    = cat(pt, new Uint8Array([2])); // delimiter = 0x02 (last record)
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));

  // RFC 8188 content-coding header: salt(16) + rs(4) + idlen(1) + keyid(asPublic=65 bytes)
  const rs     = 4096;
  const hdr    = new Uint8Array(16 + 4 + 1 + asPublic.length);
  hdr.set(salt);
  new DataView(hdr.buffer).setUint32(16, rs, false);
  hdr[20] = asPublic.length;
  hdr.set(asPublic, 21);

  return cat(hdr, ciphertext);
}

// ── Send one notification ────────────────────────────────────────────────────

async function sendOne(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const origin = new URL(sub.endpoint).origin;
    const jwt    = await vapidJwt(origin);
    const body   = await encrypt(sub.p256dh, sub.auth, JSON.stringify(payload));

    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        "Content-Type":     "application/octet-stream",
        "Content-Encoding": "aes128gcm",
        "Authorization":    `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
        "TTL":              "86400",
      },
      body,
    });
    const resText = await res.text().catch(() => "");
    console.log("push result", res.status, resText, sub.endpoint.slice(0, 60));
    return { ok: res.ok, status: res.status, error: res.ok ? undefined : resText };
  } catch (e) {
    console.error("push error", String(e));
    return { ok: false, error: String(e) };
  }
}

// ── Edge function entry ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" } });
  }

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json() as { user_id?: string; title: string; message: string; tag?: string; url?: string };

    let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth").order("created_at", { ascending: false }).limit(1);
    if (body.user_id) query = query.eq("user_id", body.user_id);

    const { data: subs, error } = await query;
    console.log("subs found:", subs?.length ?? 0, "user_id:", body.user_id);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

    const results = await Promise.all(
      (subs ?? []).map(s => sendOne(s, { title: body.title, body: body.message, tag: body.tag ?? "aura", url: body.url ?? "/" }))
    );

    const sent = results.filter(r => r.ok).length;
    return new Response(JSON.stringify({ sent, total: results.length, results }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Access-Control-Allow-Origin": "*" } });
  }
});
