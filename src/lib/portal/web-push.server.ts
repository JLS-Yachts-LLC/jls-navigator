/**
 * Web Push, done with WebCrypto only (runs in the Worker — no Node crypto).
 *
 *   - VAPID (RFC 8292): an ES256-signed JWT tells the push service the message
 *     is from us. Keys: VAPID_PUBLIC_KEY (base64url, 65-byte uncompressed point)
 *     and VAPID_PRIVATE_KEY (base64url, 32-byte scalar) — the format
 *     `npx web-push generate-vapid-keys` prints. Set as Worker secrets.
 *   - Message encryption (RFC 8291, aes128gcm): only the device that subscribed
 *     can read the payload; the push service (Apple / Google / Mozilla) can't.
 */

export type PushSubscription = { endpoint: string; p256dh: string; auth: string };
export type PushResult = { ok: true } | { ok: false; gone: boolean; status: number; error: string };

const enc = new TextEncoder();
/** Bytes backed by a plain ArrayBuffer — what WebCrypto accepts. */
type Bytes = Uint8Array<ArrayBuffer>;

export function b64urlDecode(s: string): Bytes {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
export function b64urlEncode(b: Bytes): string {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function vapidConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

async function vapidSigningKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const pub = b64urlDecode(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID_PUBLIC_KEY isn't an uncompressed P-256 key");
  return crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", ext: true,
    x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)), d: privateKey,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** The Authorization header value for one push service (audience = its origin). */
export async function vapidAuthorization(endpoint: string, subject: string, publicKey: string, privateKey: string): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64urlEncode(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await vapidSigningKey(publicKey, privateKey);
  // WebCrypto returns the raw r||s signature JWS wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64urlEncode(sig)}, k=${publicKey}`;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** RFC 8291 aes128gcm: one record, header = salt | rs | idlen | sender public key. */
export async function encryptPayload(sub: PushSubscription, plaintext: Bytes): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.p256dh);
  const authSecret = b64urlDecode(sub.auth);
  const ephemeral = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephemeral.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02 marks the last (only) record.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/** Send one notification. `gone` means the device unsubscribed — forget it. */
export async function sendWebPush(sub: PushSubscription, payload: unknown, opts: { ttl?: number; urgency?: "normal" | "high" } = {}): Promise<PushResult> {
  const publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY ?? "";
  if (!publicKey || !privateKey) return { ok: false, gone: false, status: 0, error: "VAPID keys not set" };
  const subject = process.env.VAPID_SUBJECT || "mailto:itsupport@jlsyachts.com";
  try {
    const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)));
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: await vapidAuthorization(sub.endpoint, subject, publicKey, privateKey),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(opts.ttl ?? 86400),
        Urgency: opts.urgency ?? "normal",
      },
      body,
    });
    if (res.ok) return { ok: true };
    const text = (await res.text().catch(() => "")).slice(0, 300);
    return { ok: false, gone: res.status === 404 || res.status === 410, status: res.status, error: text || res.statusText };
  } catch (e) {
    return { ok: false, gone: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}
