/**
 * Server-side counterpart to `signed-url.ts`.
 *
 * Worker code (email senders, document bundlers, SharePoint sync) has no browser
 * session, so it signs with the service role instead. Same stored shapes are
 * accepted: a `<bucket>/<path>` reference, a legacy public URL, or a bare path
 * with a default bucket.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { parseStorageRef } from "@/lib/signed-url";

/** An hour — enough for a person to open something we just handed them. */
export const SHORT_TTL = 60 * 60;

/**
 * Links that travel by email need to outlive the click: a client may open the
 * message days later. Until the tokenised delivery layer lands, 30 days is the
 * compromise between "usable" and "not public forever".
 */
export const EMAIL_LINK_TTL = 30 * 24 * 60 * 60;

export async function resolveSignedUrlAdmin(
  stored: string,
  ttlSeconds: number = SHORT_TTL,
  defaultBucket?: string,
): Promise<string> {
  const ref = parseStorageRef(stored, defaultBucket);
  if (!ref) return stored; // not a storage ref we manage — hand it back untouched
  const { data, error } = await supabaseAdmin.storage
    .from(ref.bucket)
    .createSignedUrl(ref.path, ttlSeconds);
  if (error || !data?.signedUrl) return stored;
  return data.signedUrl;
}
