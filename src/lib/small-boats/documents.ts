/**
 * Files attached to a small boat registration record: upload, rename, move,
 * delete, download.
 *
 * The shape here is deliberately different from Training's folder tree. A boat's
 * paperwork is not free-form — DMA asks for eighteen named documents, and the
 * screen already lists them. So the checklist IS the structure: a document
 * either answers one of those requirements (doc_key) or sits under "Other"
 * (doc_key null), and "move" means re-filing a document against a different
 * requirement. That keeps the 6/18 progress figure honest, because it can now be
 * read off the files themselves rather than off a tick someone remembered to set.
 *
 * Kept out of the component so the screen stays readable, and so the parts that
 * can bite — storage paths, orphaned objects on delete, the storage/table write
 * order — sit somewhere they can be reasoned about on their own.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseStorageRef, resolveSignedUrl, storageRef } from "@/lib/signed-url";
import { guardUploadFile, uploadContentType } from "@/lib/upload-guard";

export type BoatDoc = {
  id: string;
  boat_id: string;
  doc_key: string | null;
  title: string | null;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
};

const db = () => supabase as any;
const BUCKET = "permit-documents";
const TABLE = "small_boat_documents";

/** The display name for a document — its title, else the uploaded file name. */
export function docLabel(doc: BoatDoc): string {
  return (doc.title ?? "").trim() || doc.file_name || "Untitled document";
}

/**
 * Resolve a stored reference to { bucket, path }.
 *
 * Not `parseStorageRef(stored, BUCKET)`: given a default bucket that function
 * treats the WHOLE value as the path, and these values already carry the bucket
 * ("permit-documents/small-boats/…"), which would bury the bucket name inside
 * the path and break signing and deletion. With no default the first segment is
 * read as the bucket, which is what is actually stored.
 */
function refOf(stored: string) {
  const ref = parseStorageRef(stored);
  if (!ref) throw new Error("This document has no file behind it.");
  return ref;
}

/** A fresh storage path, unique even for two files uploaded in the same ms. */
function newKey(boatId: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-]+/g, "_").slice(-120);
  return `small-boats/${boatId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

export async function listDocs(boatId: string): Promise<BoatDoc[]> {
  const { data, error } = await db()
    .from(TABLE)
    .select("id, boat_id, doc_key, title, file_url, file_name, file_size, mime_type, created_at")
    .eq("boat_id", boatId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BoatDoc[];
}

/**
 * Upload files against one checklist requirement (or none, for "Other").
 *
 * Each file is guarded first — `guardUploadFile` refuses anything the bucket
 * would reject and says why, rather than letting the user wait through an upload
 * that cannot succeed. One bad file in a multi-file pick is skipped, not fatal:
 * the rest still land, and the count returned says what actually happened.
 */
export async function uploadDocs(
  boatId: string,
  docKey: string | null,
  files: File[],
  userId: string | null,
): Promise<{ uploaded: number; skipped: number }> {
  let uploaded = 0;
  let skipped = 0;

  for (const file of files) {
    if (!guardUploadFile(file)) { skipped++; continue; }

    const path = newKey(boatId, file.name);
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      contentType: uploadContentType(file),
      upsert: false,
    });
    if (upErr) throw new Error(`${file.name}: ${upErr.message}`);

    const { error } = await db().from(TABLE).insert([{
      boat_id: boatId,
      doc_key: docKey,
      title: file.name,
      file_url: storageRef(BUCKET, path),
      file_name: file.name,
      file_size: file.size,
      mime_type: uploadContentType(file) ?? file.type ?? null,
      uploaded_by: userId,
    }]);
    // The object is already stored; leaving the row out would orphan it, so the
    // object goes too rather than lingering unreferenced in the bucket.
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
      throw new Error(error.message);
    }
    uploaded++;
  }

  return { uploaded, skipped };
}

/**
 * Tick a checklist requirement on the boat itself, immediately.
 *
 * The rest of the edit dialog is a draft until Save, but an upload is not — the
 * file is already stored. Leaving the tick in unsaved form state only would let
 * someone attach a file, close without saving, and come back to a requirement
 * marked outstanding with its own document sitting under it. So the flag is
 * written now, and the form is updated to match.
 */
export async function markReceived(boatId: string, docKey: string): Promise<void> {
  const { error } = await db().from("small_boats").update({ [docKey]: true }).eq("id", boatId);
  if (error) throw new Error(error.message);
}

/** Rename is a display-name change only — the stored object is never touched. */
export async function renameDoc(id: string, title: string): Promise<void> {
  const next = title.trim();
  if (!next) throw new Error("A document needs a name.");
  const { error } = await db().from(TABLE).update({ title: next }).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Re-file a document against a different requirement; null means "Other". */
export async function moveDoc(id: string, docKey: string | null): Promise<void> {
  const { error } = await db().from(TABLE).update({ doc_key: docKey }).eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Delete the row and the file behind it.
 *
 * The object goes first: if that fails the row survives, so the file is still
 * reachable and can be retried. Removing the row first would leave an object
 * nothing points at, invisible and impossible to clean up from the UI. A file
 * already gone from storage is not an error — the row should still go.
 */
export async function deleteDoc(doc: BoatDoc): Promise<void> {
  try {
    const ref = refOf(doc.file_url);
    const { error } = await supabase.storage.from(ref.bucket).remove([ref.path]);
    if (error && !/not found/i.test(error.message)) throw new Error(error.message);
  } catch (e: any) {
    // No file behind the row at all — nothing to remove, carry on and drop it.
    if (!/no file behind it/i.test(String(e?.message ?? ""))) throw e;
  }
  const { error } = await db().from(TABLE).delete().eq("id", doc.id);
  if (error) throw new Error(error.message);
}

/** Open the file, via a signed URL for this private bucket. */
export async function downloadDoc(doc: BoatDoc): Promise<void> {
  const url = await resolveSignedUrl(doc.file_url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the file (${res.status}).`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: objectUrl,
    download: doc.file_name || docLabel(doc),
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

/** Readable file size for the row, e.g. "1.4 MB". */
export function fileSizeLabel(bytes: number | null): string {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
