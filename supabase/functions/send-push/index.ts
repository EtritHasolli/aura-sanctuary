import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@aurasanctuary.app";

// ── VAPID helpers ────────────────────────────────────────────────────────────

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
}

function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function importVapidPrivateKey(pkcs8B64url: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    b64urlDecode(pkcs8B64url),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function makeVapidJwt(audience: string): Promise<string> {
  const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  })));
  const sigInput = new TextEncoder().encode(`${header}.${payload}`);
  const key = await importVapidPrivateKey(VAPID_PRIVATE_KEY);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, sigInput);
  return `${header}.${payload}.${b64urlEncode(sig)}`;
}

// ── Encryption helpers (RFC 8291 / RFC 8188) ────────────────────────────────

async function encryptPayload(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  plaintext: string,
): Promise<{ ciphertext: Uint8Array; salt: Uint8Array; serverPublicKey: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Server ephemeral key pair
  const serverKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKeyPair.publicKey));

  // Client public key
  const clientPublicKey = await crypto.subtle.importKey(
    "raw", b64urlDecode(subscription.keys.p256dh),
    { name: "ECDH", namedCurve: "P-256" }, false, [],
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey }, serverKeyPair.privateKey, 256,
  ));

  const authSecret = b64urlDecode(subscription.keys.auth);

  // HKDF PRK
  const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);

  const prk = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: new TextEncoder().encode("Content-Encoding: auth\0") },
    hkdfKey, 256,
  ));

  const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);

  // Context = 0x00 + clientPublicKey length (2 bytes) + clientPublicKey + serverPublicKey length (2 bytes) + serverPublicKey
  const clientPubRaw = b64urlDecode(subscription.keys.p256dh);
  const context = new Uint8Array(1 + 2 + clientPubRaw.length + 2 + serverPublicKeyRaw.length);
  let off = 0;
  context[off++] = 0x00;
  new DataView(context.buffer).setUint16(off, clientPubRaw.length, false); off += 2;
  context.set(clientPubRaw, off); off += clientPubRaw.length;
  new DataView(context.buffer).setUint16(off, serverPublicKeyRaw.length, false); off += 2;
  context.set(serverPublicKeyRaw, off);

  const cekInfo = concat(new TextEncoder().encode("Content-Encoding: aesgcm\0"), context);
  const nonceInfo = concat(new TextEncoder().encode("Content-Encoding: nonce\0"), context);

  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: cekInfo }, prkKey, 128,
  ));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: nonceInfo }, prkKey, 96,
  ));

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);

  // Pad plaintext: 2-byte padding length (0) + plaintext
  const pt = new TextEncoder().encode(plaintext);
  const padded = new Uint8Array(2 + pt.length);
  padded.set(pt, 2);

  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded));
  return { ciphertext, salt, serverPublicKey: serverPublicKeyRaw };
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// ── Send one push ────────────────────────────────────────────────────────────

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; tag?: string; url?: string },
): Promise<Response> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(audience);

  const { ciphertext, salt, serverPublicKey } = await encryptPayload(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
  );

  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aesgcm",
      "Encryption": `salt=${b64urlEncode(salt)}`,
      "Crypto-Key": `dh=${b64urlEncode(serverPublicKey)};p256ecdsa=${VAPID_PUBLIC_KEY}`,
      "Authorization": `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      "TTL": "86400",
    },
    body: ciphertext,
  });
}

// ── Edge Function entry ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json() as {
    user_id?: string;   // send to one user
    all?: boolean;      // send to all users
    title: string;
    message: string;
    tag?: string;
    url?: string;
  };

  let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (body.user_id) query = query.eq("user_id", body.user_id);

  const { data: subs, error } = await query;
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const results = await Promise.allSettled(
    (subs ?? []).map((s) =>
      sendPush(s, { title: body.title, body: body.message, tag: body.tag, url: body.url })
    ),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return new Response(JSON.stringify({ sent, total: subs?.length ?? 0 }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
