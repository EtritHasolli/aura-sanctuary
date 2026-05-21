import { createClient } from "jsr:@supabase/supabase-js@2";

const VAPID_PUBLIC_KEY  = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT     = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@aurasanctuary.app";

// ── Base64url helpers ─────────────────────────────────────────────────────────

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
}

function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset, buf.byteLength)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

// ── VAPID JWT ─────────────────────────────────────────────────────────────────

async function makeVapidJwt(audience: string): Promise<string> {
  const header  = b64urlEncode(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: VAPID_SUBJECT,
  })));
  const sigInput = new TextEncoder().encode(`${header}.${payload}`);
  const key = await crypto.subtle.importKey(
    "pkcs8", b64urlDecode(VAPID_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, sigInput);
  return `${header}.${payload}.${b64urlEncode(sig)}`;
}

// ── RFC 8291 / aes128gcm encryption ──────────────────────────────────────────

async function encryptAes128gcm(
  sub: { p256dh: string; auth: string },
  plaintext: string,
): Promise<{ body: Uint8Array; salt: Uint8Array; serverPublicKeyRaw: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const serverKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"],
  );
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeyPair.publicKey),
  );

  const clientPublicKey = await crypto.subtle.importKey(
    "raw", b64urlDecode(sub.p256dh),
    { name: "ECDH", namedCurve: "P-256" }, false, [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPublicKey },
      serverKeyPair.privateKey, 256,
    ),
  );

  const authSecret = b64urlDecode(sub.auth);

  // PRK_key = HKDF-Extract(auth_secret, ecdh_secret)
  const prkKeyMaterial = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const prk = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: authSecret, info: new TextEncoder().encode("Content-Encoding: auth\0") },
    prkKeyMaterial, 256,
  ));

  const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);

  const clientPubRaw = b64urlDecode(sub.p256dh);

  // keyinfo = "Content-Encoding: aes128gcm\0" (RFC 8291 §3.4)
  const keyInfo   = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");

  // key_info in RFC 8291: "WebPush: info\0" || ua_public || as_public
  const wpInfo = concat(
    new TextEncoder().encode("WebPush: info\0"),
    clientPubRaw,
    serverPublicKeyRaw,
  );

  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: wpInfo },
    prkKey, 256,
  ));

  const ikmKey = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);

  const cek = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: keyInfo },
    ikmKey, 128,
  ));
  const nonce = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: nonceInfo },
    ikmKey, 96,
  ));

  const aesKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);

  // Plaintext with 1-byte record delimiter (0x02 = last record)
  const pt = new TextEncoder().encode(plaintext);
  const padded = new Uint8Array(pt.length + 1);
  padded.set(pt);
  padded[pt.length] = 0x02;

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded),
  );

  // RFC 8188 header: salt (16) + rs (4, big-endian, = 4096) + idlen (1) + keyid (serverPublicKeyRaw, 65 bytes)
  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + serverPublicKeyRaw.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = serverPublicKeyRaw.length;
  header.set(serverPublicKeyRaw, 21);

  return { body: concat(header, ciphertext), salt, serverPublicKeyRaw };
}

// ── Send one push ─────────────────────────────────────────────────────────────

async function sendPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string; tag?: string; url?: string },
): Promise<Response> {
  const url      = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt      = await makeVapidJwt(audience);

  const { body } = await encryptAes128gcm(
    { p256dh: sub.p256dh, auth: sub.auth },
    JSON.stringify(payload),
  );

  return fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "Content-Type":     "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization":    `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      "TTL":              "86400",
    },
    body,
  });
}

// ── Edge Function entry ───────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json() as {
    user_id?: string;
    all?: boolean;
    title: string;
    message: string;
    tag?: string;
    url?: string;
  };

  let query = supabase.from("push_subscriptions").select("endpoint, p256dh, auth");
  if (body.user_id) query = query.eq("user_id", body.user_id);

  const { data: subs, error } = await query;
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const results = await Promise.allSettled(
    (subs ?? []).map((s) =>
      sendPush(s, { title: body.title, body: body.message, tag: body.tag, url: body.url })
    ),
  );

  const sent   = results.filter((r) => r.status === "fulfilled").length;
  const failed = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason));

  return new Response(JSON.stringify({ sent, total: subs?.length ?? 0, failed }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
