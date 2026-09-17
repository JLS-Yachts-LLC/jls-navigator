/**
 * Operations on Training documents and folders: rename, move, download,
 * duplicate.
 *
 * Kept out of the component so the screen stays readable, and so the awkward
 * parts — not moving a folder inside itself, copying storage objects rather than
 * sharing them, zipping a folder with its structure intact — each sit somewhere
 * they can be reasoned about on their own.
 */
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { parseStorageRef, resolveSignedUrl, storageRef } from "@/lib/signed-url";

export type Folder = { id: string; name: string; parent_id: string | null; yacht_id: string | null };
export type Doc = {
  id: string; folder_id: string | null; yacht_id: string | null;
  title: string | null; file_url: string; file_name: string | null; created_at: string;
};

const db = () => supabase as any;
const BUCKET = "permit-documents";

/**
 * Resolve a stored reference to { bucket, path }.
 *
 * NOT `parseStorageRef(stored, BUCKET)`. Given a default bucket that function
 * treats the WHOLE value as the path, and our values already carry the bucket
 * ("permit-documents/training/…"), so the bucket name ended up duplicated inside
 * the path. Signing then failed and resolveSignedUrl fell back to returning the
 * raw reference, which fetch() resolved against the site root — the "Could not
 * fetch the file (404)" on download. storage.copy() reported the same path as
 * "Object not found" on duplicate. With no default the first segment is read as
 * the bucket, which is what these values actually hold.
 */
function refOf(stored: string) {
  const ref = parseStorageRef(stored);
  if (!ref) throw new Error("This document has no file behind it.");
  return ref;
}

/** A fresh storage path, unique even when two copies are made in the same ms. */
function newKey(fileName: string): string {
  return `training/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${fileName}`;
}

/** "Report.pdf" → "Report (copy).pdf"; keeps the extension where there is one. */
export function copyName(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? `${name} (copy)` : `${name.slice(0, i)} (copy)${name.slice(i)}`;
}

/** Every folder beneath `id`, plus `id` itself — the set a folder may NOT move into. */
export function selfAndDescendants(id: string, folders: Folder[]): Set<string> {
  const out = new Set<string>([id]);
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const f of folders) {
      if (f.parent_id === cur && !out.has(f.id)) { out.add(f.id); stack.push(f.id); }
    }
  }
  return out;
}

/** Folder path from the root, e.g. "Manuals/Safety". */
export function folderPath(id: string | null, folders: Folder[]): string {
  const parts: string[] = [];
  let cur = id;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) break; // defensive: never loop on a cycle
    guard.add(cur);
    const f = folders.find((x) => x.id === cur);
    if (!f) break;
    parts.unshift(f.name);
    cur = f.parent_id;
  }
  return parts.join("/");
}

// ── Rename ────────────────────────────────────────────────────────────────────

export async function renameDoc(id: string, title: string): Promise<void> {
  const { error } = await db().from("training_documents").update({ title }).eq("id", id);
  if (error) throw error;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await db().from("training_document_folders").update({ name }).eq("id", id);
  if (error) throw error;
}

// ── Move ──────────────────────────────────────────────────────────────────────

export async function moveDoc(id: string, folderId: string | null): Promise<void> {
  const { error } = await db().from("training_documents").update({ folder_id: folderId }).eq("id", id);
  if (error) throw error;
}

/** Moving a folder into itself or its own child would orphan the branch. */
export async function moveFolder(id: string, parentId: string | null, folders: Folder[]): Promise<void> {
  if (parentId && selfAndDescendants(id, folders).has(parentId)) {
    throw new Error("A folder can't be moved inside itself.");
  }
  const { error } = await db().from("training_document_folders").update({ parent_id: parentId }).eq("id", id);
  if (error) throw error;
}

// ── Download ──────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking immediately can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadDoc(doc: Doc): Promise<void> {
  const url = await resolveSignedUrl(doc.file_url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch the file (${res.status})`);
  triggerDownload(await res.blob(), doc.file_name ?? doc.title ?? "document");
}

/**
 * Zip a folder and everything under it, keeping the structure. Files are fetched
 * one at a time: a folder of scans in parallel would open a socket per file and
 * the progress count would be meaningless.
 */
export async function downloadFolder(
  folder: Folder, folders: Folder[], docs: Doc[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const ids = selfAndDescendants(folder.id, folders);
  const inside = docs.filter((d) => d.folder_id && ids.has(d.folder_id));
  if (!inside.length) throw new Error("That folder has no documents to download.");

  // Paths relative to the folder being downloaded, so the zip opens as that folder.
  const rootPath = folderPath(folder.id, folders);
  const zip = new JSZip();
  let done = 0;
  onProgress?.(0, inside.length);

  for (const d of inside) {
    try {
      const url = await resolveSignedUrl(d.file_url);
      const res = await fetch(url);
      if (res.ok) {
        const full = folderPath(d.folder_id, folders);
        const rel = full === rootPath ? "" : full.slice(rootPath.length + 1);
        const name = d.file_name ?? d.title ?? "document";
        zip.file(rel ? `${rel}/${name}` : name, await res.arrayBuffer());
      }
    } catch { /* skip the unreadable one rather than losing the whole zip */ }
    onProgress?.(++done, inside.length);
  }

  triggerDownload(await zip.generateAsync({ type: "blob" }), `${folder.name}.zip`);
  return inside.length;
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Remove the stored files too.
 *
 * Deleting only the row leaves the object in the bucket forever, costing storage
 * and counting against nothing — 1,037 such orphans had already accumulated by
 * 17 Sept 2026 from deleting and re-uploading. Storage is cleared first: an
 * orphaned OBJECT is invisible clutter, whereas a row whose file has gone is a
 * document that appears to exist and cannot be opened.
 */
async function removeStoredFiles(docs: Doc[]): Promise<void> {
  const byBucket = new Map<string, string[]>();
  for (const d of docs) {
    try {
      const ref = refOf(d.file_url);
      const list = byBucket.get(ref.bucket) ?? [];
      list.push(ref.path);
      byBucket.set(ref.bucket, list);
    } catch { /* nothing stored for this row — nothing to clean up */ }
  }
  for (const [bucket, paths] of byBucket) {
    // remove() takes at most 1000 keys per call.
    for (let i = 0; i < paths.length; i += 1000) {
      await supabase.storage.from(bucket).remove(paths.slice(i, i + 1000));
    }
  }
}

export async function deleteDoc(doc: Doc): Promise<void> {
  await removeStoredFiles([doc]);
  const { error } = await db().from("training_documents").delete().eq("id", doc.id);
  if (error) throw error;
}

/** The row delete cascades to subfolders and documents; the files need doing here. */
export async function deleteFolder(folder: Folder, folders: Folder[], docs: Doc[]): Promise<void> {
  const ids = selfAndDescendants(folder.id, folders);
  await removeStoredFiles(docs.filter((d) => d.folder_id && ids.has(d.folder_id)));
  const { error } = await db().from("training_document_folders").delete().eq("id", folder.id);
  if (error) throw error;
}

// ── Duplicate ─────────────────────────────────────────────────────────────────

/** Copy the stored object too, so deleting one copy never breaks the other. */
async function copyStoredFile(stored: string, fileName: string): Promise<string> {
  const ref = refOf(stored);
  const to = newKey(fileName);
  const { error } = await supabase.storage.from(ref.bucket).copy(ref.path, to);
  if (error) throw error;
  return storageRef(ref.bucket, to);
}

export async function duplicateDoc(doc: Doc, userId: string | null): Promise<void> {
  const name = doc.file_name ?? doc.title ?? "document";
  const stored = await copyStoredFile(doc.file_url, name);
  const { error } = await db().from("training_documents").insert([{
    folder_id: doc.folder_id, yacht_id: doc.yacht_id,
    title: copyName(doc.title ?? name), file_url: stored, file_name: doc.file_name,
    created_by: userId,
  }]);
  if (error) throw error;
}

/**
 * Duplicate a folder, its subfolders and every document inside. The copy lands
 * beside the original; only the top folder is renamed "(copy)", so the tree
 * underneath reads the same as the one it came from.
 */
export async function duplicateFolder(
  folder: Folder, folders: Folder[], docs: Doc[], userId: string | null,
  onProgress?: (done: number, total: number) => void,
): Promise<{ folders: number; documents: number }> {
  const ids = selfAndDescendants(folder.id, folders);
  const inside = docs.filter((d) => d.folder_id && ids.has(d.folder_id));
  let done = 0;
  onProgress?.(0, inside.length);

  // Recreate the tree top-down so a parent always exists before its children.
  const idMap = new Map<string, string>();
  async function cloneFolder(src: Folder, parentId: string | null, name: string): Promise<string> {
    const { data, error } = await db().from("training_document_folders")
      .insert([{ name, parent_id: parentId, yacht_id: src.yacht_id, created_by: userId }])
      .select("id").single();
    if (error) throw error;
    idMap.set(src.id, data.id);
    for (const child of folders.filter((f) => f.parent_id === src.id)) {
      await cloneFolder(child, data.id, child.name);
    }
    return data.id;
  }
  await cloneFolder(folder, folder.parent_id, copyName(folder.name));

  for (const d of inside) {
    try {
      const name = d.file_name ?? d.title ?? "document";
      const stored = await copyStoredFile(d.file_url, name);
      await db().from("training_documents").insert([{
        folder_id: idMap.get(d.folder_id!) ?? null, yacht_id: d.yacht_id,
        title: d.title, file_url: stored, file_name: d.file_name, created_by: userId,
      }]);
    } catch { /* one unreadable file shouldn't abandon the rest of the copy */ }
    onProgress?.(++done, inside.length);
  }

  return { folders: idMap.size, documents: inside.length };
}
