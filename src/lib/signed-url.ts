import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Buckets that remain public (non-PII) — the resolver returns their URLs as-is.
const PUBLIC_BUCKETS = new Set(["vessel-images"]);
// Buckets we sign for. Stored values are usually full public URLs that still
// encode <bucket>/<path>; we parse the path out and mint a short-lived signed URL.
const SIGNED_TTL = 60 * 60; // seconds the signed URL is valid for
const REFRESH_MS = 50 * 60 * 1000; // refresh from cache a little before expiry

type Parsed = { bucket: string; path: string };

type SignResult = { signedUrl: string | null };
/** Signs `paths` in one bucket, returning one result per path IN ORDER. Throws on a failed request. */
export type SignFn = (bucket: string, paths: string[], ttlSeconds: number) => Promise<SignResult[]>;

const signWithSupabase: SignFn = async (bucket, paths, ttl) => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, ttl);
  if (error || !data) throw error ?? new Error("Could not sign file links");
  return data.map((d) => ({ signedUrl: d.signedUrl ?? null }));
};

/**
 * Hands out signed links for stored files, without flooding the server.
 *
 * A board with a thousand rows used to ask for a thousand links at once, one
 * request each — enough to make the gateway time some of them out, and a link
 * that timed out left that photo broken on screen (it looked "not uploaded" even
 * though it was stored). Now:
 *   • identical requests share one lookup (a link is never asked for twice at once),
 *   • requests made in the same instant are signed together, up to 100 per call,
 *   • a failed call is retried, and a failure is never remembered — the next time
 *     the photo is shown it is asked for again.
 */
export function createUrlSigner(
  sign: SignFn,
  opts: { delayMs?: number; chunk?: number; retries?: number; retryDelayMs?: number; ttlSeconds?: number; refreshMs?: number; now?: () => number } = {},
) {
  const { delayMs = 30, chunk = 100, retries = 2, retryDelayMs = 400, ttlSeconds = SIGNED_TTL, refreshMs = REFRESH_MS, now = Date.now } = opts;
  const cache = new Map<string, { url: string; at: number }>();
  const inflight = new Map<string, Promise<string | null>>();
  // bucket -> path -> the callers waiting on it
  const queue = new Map<string, Map<string, ((url: string | null) => void)[]>>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function signChunk(bucket: string, paths: string[]): Promise<(string | null)[]> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const out = await sign(bucket, paths, ttlSeconds);
        return paths.map((_, i) => out[i]?.signedUrl ?? null);
      } catch {
        if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
      }
    }
    return paths.map(() => null);
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      while (queue.size > 0) {
        const batch = [...queue.entries()];
        queue.clear();
        for (const [bucket, byPath] of batch) {
          const paths = [...byPath.keys()];
          for (let i = 0; i < paths.length; i += chunk) {
            const part = paths.slice(i, i + chunk);
            const urls = await signChunk(bucket, part);
            part.forEach((p, j) => { for (const done of byPath.get(p) ?? []) done(urls[j]); });
          }
        }
      }
    } finally {
      flushing = false;
    }
  }

  function schedule() {
    if (timer || flushing) return;
    timer = setTimeout(() => { timer = null; void flush().then(() => { if (queue.size > 0) schedule(); }); }, delayMs);
  }

  /** A signed link for bucket/path, or null if it could not be made (never throws). */
  function resolve(bucket: string, path: string): Promise<string | null> {
    const key = `${bucket}/${path}`;
    const hit = cache.get(key);
    if (hit && now() - hit.at < refreshMs) return Promise.resolve(hit.url);
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = new Promise<string | null>((resolveUrl) => {
      let byPath = queue.get(bucket);
      if (!byPath) queue.set(bucket, (byPath = new Map()));
      byPath.set(path, [...(byPath.get(path) ?? []), resolveUrl]);
      schedule();
    }).then((url) => {
      inflight.delete(key);
      if (url) cache.set(key, { url, at: now() });
      return url;
    });
    inflight.set(key, p);
    return p;
  }

  return { resolve, clear: () => { cache.clear(); inflight.clear(); } };
}

const signer = createUrlSigner(signWithSupabase);

// Accepts a full Supabase storage URL (public or signed) or a bare "<bucket>/<path>"
// (or a bare path when a default bucket is supplied).
export function parseStorageRef(stored: string, defaultBucket?: string): Parsed | null {
  if (!stored) return null;
  const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  if (/^https?:\/\//i.test(stored)) return null; // some other absolute URL — leave alone
  if (defaultBucket) return { bucket: defaultBucket, path: stored.replace(/^\/+/, "") };
  const slash = stored.indexOf("/");
  if (slash > 0) return { bucket: stored.slice(0, slash), path: stored.slice(slash + 1) };
  return null;
}

/** Every bucket this project stores files in. */
export const KNOWN_BUCKETS = new Set([
  "permit-documents", "esign-documents", "visa-documents", "crew-docs",
  "orbit-documents", "signatures", "vessel-images", "guide-images", "shipsync",
]);

/**
 * Like `parseStorageRef`, but for columns that hold EITHER a "<bucket>/<path>"
 * reference or a bare path inside a known bucket (`esign_documents.file_path`,
 * `ism_certificates.file_path`).
 *
 * `parseStorageRef` cannot serve both: given a default bucket it treats the whole
 * value as the path, and without one it treats the first segment as the bucket —
 * so a bare `forms/x.pdf` would resolve to the non-existent bucket "forms". Here
 * the first segment is only taken as a bucket when it actually names one.
 */
export function parseStorageRefOrPath(stored: string, fallbackBucket: string): Parsed | null {
  if (!stored) return null;
  const asRef = parseStorageRef(stored);
  if (asRef && KNOWN_BUCKETS.has(asRef.bucket)) return asRef;
  if (/^https?:\/\//i.test(stored)) return null;
  return { bucket: fallbackBucket, path: stored.replace(/^\/+/, "") };
}

export async function resolveSignedUrl(stored: string, defaultBucket?: string): Promise<string> {
  const ref = parseStorageRef(stored, defaultBucket);
  if (!ref) return stored; // not a storage ref we manage — return verbatim
  if (PUBLIC_BUCKETS.has(ref.bucket)) {
    return supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl;
  }
  return (await signer.resolve(ref.bucket, ref.path)) ?? stored; // fall back to the stored value if it can't be signed
}

// Hook: returns a freshly-signed URL for a single stored value ("" while resolving).
export function useSignedUrl(stored: string | null | undefined, defaultBucket?: string): string {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let alive = true;
    if (!stored) { setUrl(""); return; }
    void resolveSignedUrl(stored, defaultBucket).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [stored, defaultBucket]);
  return url;
}

/**
 * The canonical way to record an uploaded file: a `<bucket>/<path>` reference
 * rather than a public URL.
 *
 * Public URLs are permanent and unauthenticated — once one is emailed out or
 * forwarded, the document is readable by anyone, forever, with no audit trail.
 * Storing the reference instead means every read goes through `resolveSignedUrl`
 * (or `SignedAnchor` / `SignedImage`), which mints a short-lived signed URL for
 * the current viewer. Existing rows that still hold a public URL keep working —
 * `parseStorageRef` understands both shapes.
 */
export function storageRef(bucket: string, path: string): string {
  return `${bucket}/${path.replace(/^\/+/, "")}`;
}

/**
 * Seconds a link sent by email stays valid. A client may open the message days
 * after it arrives, so the one-hour in-app TTL is far too short — but "public
 * forever" is what we are moving away from, so it is bounded.
 */
export const EMAIL_LINK_TTL = 30 * 24 * 60 * 60;

/**
 * Sign a stored reference for inclusion in an email. Uncached (each send gets a
 * fresh window) and long-lived compared with an in-app link.
 */
export async function signedUrlForEmail(stored: string, defaultBucket?: string): Promise<string> {
  const ref = parseStorageRef(stored, defaultBucket);
  if (!ref) return stored;
  const { data, error } = await supabase.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, EMAIL_LINK_TTL);
  if (error || !data?.signedUrl) return stored;
  return data.signedUrl;
}
