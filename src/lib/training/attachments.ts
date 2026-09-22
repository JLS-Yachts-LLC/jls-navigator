/**
 * Training Institute — files held against a training record or a student.
 *
 * Four operations, the ones the Institute asked for: upload, rename, move to a
 * different record or student, and delete. They sit here rather than in the
 * components because the Records tab and the Students tab do exactly the same
 * things to exactly the same table, and a second copy would be a second place
 * for every fix to have to land.
 */
import { supabase } from "@/integrations/supabase/client";
import { parseStorageRef, storageRef } from "@/lib/signed-url";
import { uploadContentType } from "@/lib/upload-guard";

/** Shared with training_documents — one bucket for everything the school holds. */
const BUCKET = "permit-documents";

export type AttachmentOwner = "record" | "student";

export type TrainingAttachment = {
  id: string;
  owner_type: AttachmentOwner;
  owner_id: string;
  file_name: string;
  storage_ref: string;
  created_at: string;
};

const sb = supabase as any;

/**
 * Resolve a stored reference to { bucket, path }.
 *
 * NOT `parseStorageRef(stored, BUCKET)`. Given a default bucket that function
 * treats the WHOLE value as the path, and these values already carry the bucket
 * ("permit-documents/training/…"), so the bucket name ends up duplicated inside
 * the path — which is what caused the download 404 and the duplicate "Object not
 * found" on the Documents page. With no default, the first segment is read as
 * the bucket, which is what these values actually hold.
 */
function refOf(stored: string) {
  const ref = parseStorageRef(stored);
  if (!ref) throw new Error("This attachment has no file behind it.");
  return ref;
}

/** A fresh storage path, unique even when two files land in the same millisecond. */
function newKey(ownerType: AttachmentOwner, fileName: string): string {
  const safe = fileName.replace(/[^\w.-]+/g, "_");
  return `training/${ownerType}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
}

export async function listAttachments(
  ownerType: AttachmentOwner,
  ownerId: string,
): Promise<TrainingAttachment[]> {
  const { data, error } = await sb
    .from("training_attachments")
    .select("*")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as TrainingAttachment[];
}

/**
 * How many files each owner holds, for the counts beside the paperclip.
 *
 * One query for the whole tab rather than one per row: a hundred students would
 * otherwise mean a hundred round trips before the table could draw.
 */
export async function attachmentCounts(
  ownerType: AttachmentOwner,
): Promise<Record<string, number>> {
  const { data, error } = await sb
    .from("training_attachments")
    .select("owner_id")
    .eq("owner_type", ownerType);
  if (error) throw new Error(error.message);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { owner_id: string }[]) {
    counts[row.owner_id] = (counts[row.owner_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Upload a file and record it against its owner.
 *
 * The caller has already run the platform upload guard. If the database insert
 * fails the uploaded object is removed again, so a failed attach cannot leave a
 * file in Storage that nothing points at.
 */
export async function uploadAttachment(
  ownerType: AttachmentOwner,
  ownerId: string,
  file: File,
  userId: string | null,
): Promise<TrainingAttachment> {
  const path = newKey(ownerType, file.name);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: uploadContentType(file), upsert: false });
  if (upErr) throw new Error(upErr.message);

  const { data, error } = await sb
    .from("training_attachments")
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      file_name: file.name,
      storage_ref: storageRef(BUCKET, path),
      created_by: userId,
    })
    .select("*")
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  return data as TrainingAttachment;
}

/**
 * Rename an attachment.
 *
 * Only the display name changes. The stored object keeps its path, so nothing
 * already linked or signed stops working, and the extension is preserved when
 * the new name does not carry one — a "Certificate" that stops being a ".pdf"
 * will not open on anybody's machine.
 */
export async function renameAttachment(a: TrainingAttachment, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("The file needs a name.");

  const oldExt = /\.([A-Za-z0-9]{1,8})$/.exec(a.file_name)?.[0] ?? "";
  const hasExt = /\.[A-Za-z0-9]{1,8}$/.test(trimmed);
  const final = hasExt ? trimmed : trimmed + oldExt;

  const { error } = await sb
    .from("training_attachments")
    .update({ file_name: final, updated_at: new Date().toISOString() })
    .eq("id", a.id);
  if (error) throw new Error(error.message);
}

/**
 * Move an attachment to a different record or student.
 *
 * Only the owner changes — the file itself never moves in Storage, so a move is
 * a single row update that cannot half-succeed and leave the file orphaned.
 */
export async function moveAttachment(
  a: TrainingAttachment,
  ownerType: AttachmentOwner,
  ownerId: string,
): Promise<void> {
  if (ownerType === a.owner_type && ownerId === a.owner_id) return;
  const { error } = await sb
    .from("training_attachments")
    .update({ owner_type: ownerType, owner_id: ownerId, updated_at: new Date().toISOString() })
    .eq("id", a.id);
  if (error) throw new Error(error.message);
}

/**
 * Delete an attachment and the file behind it.
 *
 * The row goes first. If Storage then refuses, the object is left behind rather
 * than the row — an unreferenced file wastes space, whereas a row pointing at a
 * file that is gone shows the user a broken link.
 */
export async function deleteAttachment(a: TrainingAttachment): Promise<void> {
  const { error } = await sb.from("training_attachments").delete().eq("id", a.id);
  if (error) throw new Error(error.message);
  try {
    const ref = refOf(a.storage_ref);
    await supabase.storage.from(ref.bucket).remove([ref.path]);
  } catch {
    /* Row already gone — a leftover object is not worth failing the delete over. */
  }
}
