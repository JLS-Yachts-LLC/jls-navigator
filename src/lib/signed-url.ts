import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Buckets that remain public (non-PII) — the resolver returns their URLs as-is.
const PUBLIC_BUCKETS = new Set(["vessel-images"]);
// Buckets we sign for. Stored values are usually full public URLs that still
// encode <bucket>/<path>; we parse the path out and mint a short-lived signed URL.
const SIGNED_TTL = 60 * 60; // seconds the signed URL is valid for
const REFRESH_MS = 50 * 60 * 1000; // refresh from cache a little before expiry

type Parsed = { bucket: string; path: string };
const cache = new Map<string, { url: string; at: number }>();

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

export async function resolveSignedUrl(stored: string, defaultBucket?: string): Promise<string> {
  const ref = parseStorageRef(stored, defaultBucket);
  if (!ref) return stored; // not a storage ref we manage — return verbatim
  if (PUBLIC_BUCKETS.has(ref.bucket)) {
    return supabase.storage.from(ref.bucket).getPublicUrl(ref.path).data.publicUrl;
  }
  const key = `${ref.bucket}/${ref.path}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < REFRESH_MS) return hit.url;
  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, SIGNED_TTL);
  if (error || !data?.signedUrl) return stored; // fall back to stored value on failure
  cache.set(key, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
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
