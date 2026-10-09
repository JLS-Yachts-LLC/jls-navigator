/**
 * One-time clean-up of the oversized item photos (the September bulk import left ~260 full-size phone photos of
 * 4-9 MB each; the lists draw them as 32px thumbnails). For each one over the limit:
 *   1. the original is COPIED to `originals/<same path>` in the same bucket (never served, kept as the backup),
 *   2. the photo is re-encoded at review size (shrinkImage: long edge 1400px, JPEG),
 *   3. it is written back to the SAME path, so every link that points at it keeps working,
 *   4. what is now stored is read back and checked before moving on.
 * Safe to stop and run again: photos that are already small are skipped, an existing backup is never overwritten.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseStorageRef } from "@/lib/signed-url";
import { shrinkImage } from "@/lib/shipsync/image-shrink";

const BUCKET = "shipsync";
/** Anything at or below this is left alone. */
export const SHRINK_ABOVE_BYTES = 800_000;
const BACKUP_PREFIX = "originals/";

export type ShrinkEvent =
  | { kind: "found"; total: number }
  | { kind: "skipped"; path: string; reason: string }
  | { kind: "shrunk"; path: string; before: number; after: number }
  | { kind: "failed"; path: string; error: string };

/** The storage paths of every item photo (deduplicated, in this bucket, not already a backup). */
export async function listItemPhotoPaths(): Promise<string[]> {
  const paths = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (supabase as any).from("shipsync_packages").select("item_photo_url").not("item_photo_url", "is", null).order("id").range(from, from + 999);
    if (error) throw error;
    for (const r of data ?? []) {
      const ref = parseStorageRef(String(r.item_photo_url));
      if (ref && ref.bucket === BUCKET && !ref.path.startsWith(BACKUP_PREFIX)) paths.add(ref.path);
    }
    if (!data || data.length < 1000) break;
  }
  return [...paths];
}

const alreadyThere = (m: string) => /already exists|duplicate|resource already/i.test(m);

export async function shrinkOne(path: string, shrink: (b: Blob) => Promise<Blob> = shrinkImage): Promise<ShrinkEvent> {
  const store = supabase.storage.from(BUCKET);
  const { data: blob, error: dlErr } = await store.download(path);
  if (dlErr || !blob) return { kind: "failed", path, error: dlErr?.message ?? "could not download" };
  if (blob.size <= SHRINK_ABOVE_BYTES) return { kind: "skipped", path, reason: "already small" };

  // Only plain JPEG/PNG photos: anything the browser can't decode would come back unchanged and gain nothing.
  const small = await shrink(blob);
  if (small === blob || small.size >= blob.size * 0.8) return { kind: "skipped", path, reason: "could not be made meaningfully smaller" };
  if (small.type !== "image/jpeg") return { kind: "skipped", path, reason: `unexpected type ${small.type}` };

  // 1. back up the original (an existing backup is kept as it is — it is the real original)
  const copy = await store.copy(path, `${BACKUP_PREFIX}${path}`);
  if (copy.error && !alreadyThere(copy.error.message)) return { kind: "failed", path, error: `backup failed: ${copy.error.message}` };

  // 2. write the small one over the same path
  const up = await store.upload(path, small, { upsert: true, contentType: "image/jpeg" });
  if (up.error) return { kind: "failed", path, error: up.error.message };

  // 3. read it back
  const back = await store.download(path);
  if (back.error || !back.data || back.data.size !== small.size) {
    // put the original back rather than leave a doubtful file in place
    await store.upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    return { kind: "failed", path, error: "the stored copy did not match - the original was put back" };
  }
  return { kind: "shrunk", path, before: blob.size, after: small.size };
}

/** Runs through the photos a few at a time, reporting each; `isStopped` lets the page's Stop button end it cleanly. */
export async function shrinkOldPhotos(onEvent: (e: ShrinkEvent) => void, isStopped: () => boolean, concurrency = 3): Promise<void> {
  const paths = await listItemPhotoPaths();
  onEvent({ kind: "found", total: paths.length });
  let next = 0;
  const worker = async () => {
    while (!isStopped()) {
      const i = next++;
      if (i >= paths.length) return;
      try { onEvent(await shrinkOne(paths[i])); }
      catch (e) { onEvent({ kind: "failed", path: paths[i], error: e instanceof Error ? e.message : String(e) }); }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
}
