/**
 * The guest's whole world: the Training files and folders shared with them.
 *
 *   GET  /api/guest?op=home                 → who they are + the items shared with them
 *   GET  /api/guest?op=folder&id=           → one shared folder's contents
 *   GET  /api/guest?op=open&id=[&download=1] → a 5-minute signed link to one file
 *   POST /api/guest  { op: "mkdir",  parentId, name }        (Read & write)
 *   POST /api/guest  { op: "rename", type, id, name }        (Read & write, inside a share)
 *   POST /api/guest  { op: "remove", type, id }              (Read & write, guest-added only)
 *   POST /api/guest  multipart op=upload  folderId + file(s) (Read & write)
 *   POST /api/guest  multipart op=replace docId + file       (Read & write)
 *
 * Every request: resolveGuest() (an ACTIVE guest login) → the guest's live shares
 * → accessTo() for the exact item → only then the service role touches data.
 * A guest never reads a table directly — RLS fences them out of all of it.
 *
 * Rules beyond Read / Read & write:
 *   • The shared item itself can't be renamed or removed by the guest — only
 *     things inside a shared folder. It belongs to JLS.
 *   • A guest may only remove what a guest added (guest_uploaded_by /
 *     guest_created_by). Staff files are never deleted from outside.
 */
import { json, liveSharesFor, loadFolderTree, resolveGuest, type GuestCaller } from "@/lib/guest/guest-auth.server";
import { accessTo, folderChain, type Access, type GuestShare, type ShareResourceType, type TreeFolder } from "@/lib/guest/shares";
import { parseStorageRef, storageRef } from "@/lib/signed-url";
import { uploadContentType, uploadRejectionReason } from "@/lib/upload-guard";

const BUCKET = "permit-documents";
const OPEN_TTL = 5 * 60;
const MAX_FILES_PER_UPLOAD = 20;

type Ctx = {
  sb: any;
  guest: GuestCaller;
  shares: GuestShare[];
  folders: TreeFolder[];
  byId: Map<string, TreeFolder>;
  ip: string | null;
};

const docName = (d: { title?: string | null; file_name?: string | null }) => d.title ?? d.file_name ?? "Document";

async function log(ctx: Ctx, action: string, a: Access | null, res: { type: ShareResourceType; id: string; name: string }, detail?: string) {
  await ctx.sb.from("guest_activity").insert({
    guest_id: ctx.guest.guestId, share_id: a?.share.id ?? null, action,
    resource_type: res.type, resource_id: res.id, resource_name: res.name,
    detail: detail ?? null, ip_address: ctx.ip,
  }).then(undefined, () => undefined);
}

async function getDoc(sb: any, id: string) {
  const { data } = await sb.from("training_documents")
    .select("id, folder_id, yacht_id, title, file_name, file_url, created_at, guest_uploaded_by").eq("id", id).maybeSingle();
  return data as null | {
    id: string; folder_id: string | null; yacht_id: string | null; title: string | null; file_name: string | null;
    file_url: string | null; created_at: string; guest_uploaded_by: string | null;
  };
}

const forbidden = () => json({ error: "That isn't shared with you, or your access has ended." }, 403);
const readOnly = () => json({ error: "You have read-only access to this." }, 403);

/** Folder ids from the share's root folder down to this folder (for breadcrumbs). */
function crumbsFrom(rootId: string, folderId: string, byId: Map<string, TreeFolder>) {
  const chain = folderChain(folderId, byId); // nearest first
  const i = chain.indexOf(rootId);
  return (i === -1 ? [folderId] : chain.slice(0, i + 1)).reverse()
    .map((id) => ({ id, name: byId.get(id)?.name ?? "Folder" }));
}

/** Every folder under this one (not including it). */
function descendants(folderId: string, folders: TreeFolder[]): string[] {
  const out: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const f of folders) if (f.parent_id === id && !out.includes(f.id)) { out.push(f.id); stack.push(f.id); }
  }
  return out;
}

async function storeFile(ctx: Ctx, file: File): Promise<{ ref: string } | { error: string }> {
  const reason = uploadRejectionReason(file);
  if (reason) return { error: reason };
  const key = `training/guest/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.\- ()]+/g, "_")}`;
  const { error } = await ctx.sb.storage.from(BUCKET).upload(key, file, { contentType: uploadContentType(file) });
  if (error) return { error: `${file.name}: ${error.message}` };
  return { ref: storageRef(BUCKET, key) };
}

// ── GET ──────────────────────────────────────────────────────────────────────
async function home(ctx: Ctx): Promise<Response> {
  // One entry per shared item. Something shared inside a folder that is ALSO
  // shared with them is reached through that folder, so it isn't listed twice.
  const sharedFolders = new Set(ctx.shares.filter((s) => s.resource_type === "training_folder").map((s) => s.resource_id));
  const docIds = [...new Set(ctx.shares.filter((s) => s.resource_type === "training_document").map((s) => s.resource_id))];
  const { data: docs } = docIds.length
    ? await ctx.sb.from("training_documents").select("id, folder_id, title, file_name, created_at").in("id", docIds)
    : { data: [] as any[] };

  const items: any[] = [];
  for (const fid of sharedFolders) {
    const f = ctx.byId.get(fid);
    if (!f) continue; // folder since deleted
    if (folderChain(f.parent_id, ctx.byId).some((id) => sharedFolders.has(id))) continue;
    const a = accessTo({ type: "training_folder", id: fid, folderId: fid }, ctx.shares, ctx.byId)!;
    items.push({ type: "folder", id: fid, name: f.name, permission: a.permission,
      sharedBy: a.share.shared_by_name, sharedAt: a.share.created_at, expiresAt: a.share.expires_at });
  }
  for (const d of docs ?? []) {
    if (folderChain(d.folder_id, ctx.byId).some((id) => sharedFolders.has(id))) continue;
    const a = accessTo({ type: "training_document", id: d.id, folderId: d.folder_id }, ctx.shares, ctx.byId)!;
    items.push({ type: "document", id: d.id, name: docName(d), permission: a.permission, createdAt: d.created_at,
      sharedBy: a.share.shared_by_name, sharedAt: a.share.created_at, expiresAt: a.share.expires_at });
  }
  items.sort((x, y) => (x.type === y.type ? x.name.localeCompare(y.name) : x.type === "folder" ? -1 : 1));

  await ctx.sb.from("guest_accounts").update({ last_seen_at: new Date().toISOString() }).eq("id", ctx.guest.guestId);
  return json({ me: { email: ctx.guest.email, displayName: ctx.guest.displayName }, items });
}

async function folder(ctx: Ctx, id: string): Promise<Response> {
  const f = ctx.byId.get(id);
  if (!f) return json({ error: "That folder no longer exists." }, 404);
  const a = accessTo({ type: "training_folder", id, folderId: id }, ctx.shares, ctx.byId);
  if (!a) return forbidden();

  const childIds = ctx.folders.filter((x) => x.parent_id === id).map((x) => x.id);
  const [{ data: childMeta }, { data: docs }] = await Promise.all([
    childIds.length
      ? ctx.sb.from("training_document_folders").select("id, name, guest_created_by, created_at").in("id", childIds).order("name")
      : Promise.resolve({ data: [] as any[] }),
    ctx.sb.from("training_documents").select("id, title, file_name, created_at, guest_uploaded_by")
      .eq("folder_id", id).order("title"),
  ]);
  return json({
    folder: { id, name: f.name },
    permission: a.permission,
    isShareRoot: a.root.type === "training_folder" && a.root.id === id,
    crumbs: crumbsFrom(a.root.id, id, ctx.byId),
    folders: (childMeta ?? []).map((c: any) => ({ id: c.id, name: c.name, guestAdded: !!c.guest_created_by })),
    documents: (docs ?? []).map((d: any) => ({ id: d.id, name: docName(d), createdAt: d.created_at, guestAdded: !!d.guest_uploaded_by })),
  });
}

async function open(ctx: Ctx, id: string, download: boolean): Promise<Response> {
  const d = await getDoc(ctx.sb, id);
  if (!d) return json({ error: "That file no longer exists." }, 404);
  const a = accessTo({ type: "training_document", id, folderId: d.folder_id }, ctx.shares, ctx.byId);
  if (!a) return forbidden();
  const ref = d.file_url ? parseStorageRef(d.file_url, BUCKET) : null;
  if (!ref) return json({ error: "This file can't be opened." }, 404);
  const { data, error } = await ctx.sb.storage.from(ref.bucket)
    .createSignedUrl(ref.path, OPEN_TTL, download ? { download: d.file_name ?? docName(d) } : undefined);
  if (error || !data?.signedUrl) return json({ error: "The file could not be opened right now." }, 500);
  await log(ctx, download ? "download" : "open", a, { type: "training_document", id, name: docName(d) });
  return json({ url: data.signedUrl });
}

// ── POST ─────────────────────────────────────────────────────────────────────
async function mkdir(ctx: Ctx, parentId: string, rawName: string): Promise<Response> {
  const name = rawName.trim().slice(0, 200);
  if (!name) return json({ error: "Give the folder a name." }, 400);
  const parent = ctx.byId.get(parentId);
  if (!parent) return json({ error: "That folder no longer exists." }, 404);
  const a = accessTo({ type: "training_folder", id: parentId, folderId: parentId }, ctx.shares, ctx.byId);
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  if (ctx.folders.some((f) => f.parent_id === parentId && f.name.toLowerCase() === name.toLowerCase())) {
    return json({ error: `There is already a folder called “${name}” here.` }, 400);
  }
  const { data: p } = await ctx.sb.from("training_document_folders").select("yacht_id").eq("id", parentId).maybeSingle();
  const { data, error } = await ctx.sb.from("training_document_folders").insert({
    name, parent_id: parentId, yacht_id: p?.yacht_id ?? null, guest_created_by: ctx.guest.guestId,
  }).select("id").single();
  if (error) return json({ error: error.message }, 500);
  await log(ctx, "create_folder", a, { type: "training_folder", id: data.id, name }, `In “${parent.name}”`);
  return json({ success: true, id: data.id });
}

async function rename(ctx: Ctx, type: ShareResourceType, id: string, rawName: string): Promise<Response> {
  const name = rawName.trim().slice(0, 200);
  if (!name) return json({ error: "The name can't be empty." }, 400);
  if (type === "training_folder") {
    const f = ctx.byId.get(id);
    if (!f) return json({ error: "That folder no longer exists." }, 404);
    const a = accessTo({ type, id, folderId: id }, ctx.shares, ctx.byId);
    if (!a) return forbidden();
    if (a.permission !== "read_write") return readOnly();
    if (a.root.id === id) return json({ error: "The shared folder itself can only be renamed by JLS." }, 403);
    const { error } = await ctx.sb.from("training_document_folders").update({ name }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    await log(ctx, "rename", a, { type, id, name }, `Was “${f.name}”`);
    return json({ success: true });
  }
  const d = await getDoc(ctx.sb, id);
  if (!d) return json({ error: "That file no longer exists." }, 404);
  const a = accessTo({ type, id, folderId: d.folder_id }, ctx.shares, ctx.byId);
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  if (a.root.id === id) return json({ error: "A file shared on its own can only be renamed by JLS." }, 403);
  const { error } = await ctx.sb.from("training_documents").update({ title: name }).eq("id", id);
  if (error) return json({ error: error.message }, 500);
  await log(ctx, "rename", a, { type, id, name }, `Was “${docName(d)}”`);
  return json({ success: true });
}

async function removeObjects(sb: any, refs: (string | null)[]) {
  const paths = refs.map((r) => (r ? parseStorageRef(r, BUCKET) : null))
    .filter((p): p is { bucket: string; path: string } => !!p && p.bucket === BUCKET).map((p) => p.path);
  for (let i = 0; i < paths.length; i += 1000) await sb.storage.from(BUCKET).remove(paths.slice(i, i + 1000));
}

async function remove(ctx: Ctx, type: ShareResourceType, id: string): Promise<Response> {
  if (type === "training_document") {
    const d = await getDoc(ctx.sb, id);
    if (!d) return json({ error: "That file no longer exists." }, 404);
    const a = accessTo({ type, id, folderId: d.folder_id }, ctx.shares, ctx.byId);
    if (!a) return forbidden();
    if (a.permission !== "read_write") return readOnly();
    if (a.root.id === id) return json({ error: "A file shared with you can only be removed by JLS." }, 403);
    if (!d.guest_uploaded_by) return json({ error: "Only files added by a guest can be removed here. Ask JLS to remove this one." }, 403);
    const { error } = await ctx.sb.from("training_documents").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    await removeObjects(ctx.sb, [d.file_url]);
    await log(ctx, "remove", a, { type, id, name: docName(d) });
    return json({ success: true });
  }

  const f = ctx.byId.get(id);
  if (!f) return json({ error: "That folder no longer exists." }, 404);
  const a = accessTo({ type, id, folderId: id }, ctx.shares, ctx.byId);
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  if (a.root.id === id) return json({ error: "The shared folder itself can only be removed by JLS." }, 403);
  // Everything in it — every folder and file at any depth — must be guest-added.
  const ids = [id, ...descendants(id, ctx.folders)];
  const [{ data: fRows }, { data: dRows }] = await Promise.all([
    ctx.sb.from("training_document_folders").select("id, guest_created_by").in("id", ids),
    ctx.sb.from("training_documents").select("id, file_url, guest_uploaded_by").in("folder_id", ids),
  ]);
  if ((fRows ?? []).some((r: any) => !r.guest_created_by) || (dRows ?? []).some((r: any) => !r.guest_uploaded_by)) {
    return json({ error: "This folder holds things added by JLS, so it can't be removed here." }, 403);
  }
  const { error: dErr } = await ctx.sb.from("training_documents").delete().in("folder_id", ids);
  if (dErr) return json({ error: dErr.message }, 500);
  // Deepest first so no folder is removed while a child still points at it.
  for (const fid of [...ids].reverse()) {
    const { error } = await ctx.sb.from("training_document_folders").delete().eq("id", fid);
    if (error) return json({ error: error.message }, 500);
  }
  await removeObjects(ctx.sb, (dRows ?? []).map((r: any) => r.file_url));
  await log(ctx, "remove", a, { type, id, name: f.name }, `${(dRows ?? []).length} file(s) inside`);
  return json({ success: true });
}

async function upload(ctx: Ctx, form: FormData): Promise<Response> {
  const folderId = String(form.get("folderId") ?? "");
  const parent = ctx.byId.get(folderId);
  if (!parent) return json({ error: "That folder no longer exists." }, 404);
  const a = accessTo({ type: "training_folder", id: folderId, folderId }, ctx.shares, ctx.byId);
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) return json({ error: "Choose a file to upload." }, 400);
  if (files.length > MAX_FILES_PER_UPLOAD) return json({ error: `Upload at most ${MAX_FILES_PER_UPLOAD} files at a time.` }, 400);

  const { data: p } = await ctx.sb.from("training_document_folders").select("yacht_id").eq("id", folderId).maybeSingle();
  let added = 0;
  const failed: string[] = [];
  for (const file of files) {
    const stored = await storeFile(ctx, file);
    if ("error" in stored) { failed.push(stored.error); continue; }
    const { data, error } = await ctx.sb.from("training_documents").insert({
      folder_id: folderId, yacht_id: p?.yacht_id ?? null, title: file.name, file_name: file.name,
      file_url: stored.ref, guest_uploaded_by: ctx.guest.guestId,
    }).select("id").single();
    if (error) { failed.push(`${file.name}: ${error.message}`); await removeObjects(ctx.sb, [stored.ref]); continue; }
    added++;
    await log(ctx, "upload", a, { type: "training_document", id: data.id, name: file.name }, `Into “${parent.name}”`);
  }
  return json({ success: added > 0, added, failed });
}

async function replace(ctx: Ctx, form: FormData): Promise<Response> {
  const id = String(form.get("docId") ?? "");
  const file = form.get("file");
  if (!(file && typeof file !== "string")) return json({ error: "Choose a file." }, 400);
  const d = await getDoc(ctx.sb, id);
  if (!d) return json({ error: "That file no longer exists." }, 404);
  const a = accessTo({ type: "training_document", id, folderId: d.folder_id }, ctx.shares, ctx.byId);
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  const stored = await storeFile(ctx, file as File);
  if ("error" in stored) return json({ error: stored.error }, 400);
  const { error } = await ctx.sb.from("training_documents")
    .update({ file_url: stored.ref, file_name: (file as File).name }).eq("id", id);
  if (error) { await removeObjects(ctx.sb, [stored.ref]); return json({ error: error.message }, 500); }
  await removeObjects(ctx.sb, [d.file_url]);
  await log(ctx, "replace", a, { type: "training_document", id, name: docName(d) }, `New file “${(file as File).name}”`);
  return json({ success: true });
}

export async function guestHandler(request: Request): Promise<Response> {
  const auth = await resolveGuest(request);
  if (!auth.ok) return auth.response;
  try {
    const [shares, tree] = await Promise.all([liveSharesFor(auth.sb, auth.guest), loadFolderTree(auth.sb)]);
    const ctx: Ctx = {
      sb: auth.sb, guest: auth.guest, shares, ...tree,
      ip: request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for"),
    };
    const url = new URL(request.url);

    if (request.method === "GET") {
      const op = url.searchParams.get("op") ?? "home";
      const id = url.searchParams.get("id") ?? "";
      if (op === "home") return home(ctx);
      if (op === "folder") return folder(ctx, id);
      if (op === "open") return open(ctx, id, url.searchParams.get("download") === "1");
      return json({ error: "Unknown request" }, 400);
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      const op = String(form.get("op") ?? "");
      if (op === "upload") return upload(ctx, form);
      if (op === "replace") return replace(ctx, form);
      return json({ error: "Unknown request" }, 400);
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, any>;
    const type = body.type === "folder" || body.type === "training_folder" ? "training_folder" : "training_document";
    if (body.op === "mkdir") return mkdir(ctx, String(body.parentId ?? ""), String(body.name ?? ""));
    if (body.op === "rename") return rename(ctx, type, String(body.id ?? ""), String(body.name ?? ""));
    if (body.op === "remove") return remove(ctx, type, String(body.id ?? ""));
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    console.error("[api/guest]", e);
    return json({ error: "Something went wrong — please try again." }, 500);
  }
}
