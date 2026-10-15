/**
 * The guest's whole world: the documents shared with them, from three libraries —
 * Training documents, Vessel documents (the Documents card on a yacht) and Crew
 * documents (the Documents card on a crew profile).
 *
 *   GET  /api/guest?op=home                         → who they are + the items shared with them
 *   GET  /api/guest?op=folder&type=&id=             → one shared container's contents
 *   GET  /api/guest?op=open&type=&id=[&download=1]  → { url, name }: a short-lived link to one file
 *   POST /api/guest  { op: "mkdir",  parentId, name }        (Training, Read & write)
 *   POST /api/guest  { op: "rename", type, id, name }        (Read & write, inside a share)
 *   POST /api/guest  { op: "remove", type, id }              (Read & write, guest-added only)
 *   POST /api/guest  multipart op=upload  type + id + file(s) (Read & write)
 *   POST /api/guest  multipart op=replace type + docId + file (Read & write)
 *
 * Containers (open into a list):  training_folder · yacht_all (id = yacht) · yacht_folder
 *                                 · crew_all (id = crew member) · crew_folder
 * Documents:  training_document · yacht_document · yacht_sp (id = "<yacht id>:<SharePoint item id>")
 *             · crew_document · crew_passport (id = "<passport id>:<column>")
 *             · crew_sp (id = "<crew member id>:<SharePoint item id>")
 *
 * Every request: resolveGuest() (an ACTIVE guest login) → the guest's live shares
 * → accessTo()/vesselAccess() for the exact item → only then the service role
 * touches data. A guest never reads a table directly — RLS fences them out.
 *
 * Rules beyond Read / Read & write:
 *   • The shared item itself can't be renamed or removed by the guest — only
 *     things inside a shared folder. It belongs to JLS.
 *   • A guest may only remove what a guest added. Staff files are never deleted
 *     from outside.
 *   • Vessel and crew folders mirror SharePoint folders, so guests can't create,
 *     rename or remove them; SharePoint-only files and passport files are
 *     read-only.
 */
import { json, liveSharesFor, loadFolderTree, resolveGuest, type GuestCaller } from "@/lib/guest/guest-auth.server";
import {
  accessTo, crewAccess, folderChain, vesselAccess, type Access, type GuestShare, type ShareResourceType, type TreeFolder,
} from "@/lib/guest/shares";
import { loadVesselLibrary, placementOf, vesselName, type VesselLibrary } from "@/lib/guest/vessel-docs.server";
import { crewIdentity, loadCrewLibrary, type CrewLibrary } from "@/lib/guest/crew-docs.server";
import { PASSPORT_COLUMNS } from "@/lib/crew-docs/library";
import { sharePointDownloadUrl } from "@/lib/yacht-doc-sharepoint.server";
import { parseStorageRefOrPath, storageRef } from "@/lib/signed-url";
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
type Ref = { type: string; id: string };
type ListedFolder = { type: ShareResourceType; id: string; name: string; guestAdded: boolean };
type ListedDoc = { type: "training_document" | "yacht_document" | "yacht_sp" | "crew_document" | "crew_passport" | "crew_sp"; id: string; name: string; createdAt: string | null; guestAdded: boolean; sub: string | null };

const docName = (d: { title?: string | null; file_name?: string | null }) => d.title ?? d.file_name ?? "Document";
const forbidden = () => json({ error: "That isn't shared with you, or your access has ended." }, 403);
const readOnly = () => json({ error: "You have read-only access to this." }, 403);
const gone = (what = "file") => json({ error: `That ${what} no longer exists.` }, 404);

async function log(ctx: Ctx, action: string, a: Access | null, res: { type: string; id: string; name: string }, detail?: string) {
  await ctx.sb.from("guest_activity").insert({
    guest_id: ctx.guest.guestId, share_id: a?.share.id ?? null, action,
    resource_type: res.type, resource_id: /^[0-9a-f-]{36}$/i.test(res.id) ? res.id : null,
    resource_name: res.name, detail: detail ?? null, ip_address: ctx.ip,
  }).then(undefined, () => undefined);
}

async function removeObjects(sb: any, refs: (string | null)[]) {
  const paths = refs.map((r) => (r ? parseStorageRefOrPath(r, BUCKET) : null))
    .filter((p): p is { bucket: string; path: string } => !!p && p.bucket === BUCKET).map((p) => p.path);
  for (let i = 0; i < paths.length; i += 1000) await sb.storage.from(BUCKET).remove(paths.slice(i, i + 1000));
}

async function storeFile(sb: any, prefix: string, file: File): Promise<{ ref: string } | { error: string }> {
  const reason = uploadRejectionReason(file);
  if (reason) return { error: reason };
  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name.replace(/[^\w.\- ()]+/g, "_")}`;
  const { error } = await sb.storage.from(BUCKET).upload(key, file, { contentType: uploadContentType(file) });
  if (error) return { error: `${file.name}: ${error.message}` };
  return { ref: storageRef(BUCKET, key) };
}

// Stored values are "<bucket>/<path>" ("permit-documents/training/…"). NOT
// parseStorageRef(value, BUCKET): given a default bucket it reads the WHOLE value
// as the path, so the bucket name was doubled and no guest file would open.
async function signed(sb: any, fileUrl: string | null, name: string, download: boolean): Promise<string | null> {
  const ref = fileUrl ? parseStorageRefOrPath(fileUrl, BUCKET) : null;
  if (!ref) return null;
  const { data } = await sb.storage.from(ref.bucket).createSignedUrl(ref.path, OPEN_TTL, download ? { download: name } : undefined);
  return data?.signedUrl ?? null;
}

// ═══ Training documents ══════════════════════════════════════════════════════
async function getTrainingDoc(sb: any, id: string) {
  const { data } = await sb.from("training_documents")
    .select("id, folder_id, yacht_id, title, file_name, file_url, created_at, guest_uploaded_by").eq("id", id).maybeSingle();
  return data as null | {
    id: string; folder_id: string | null; yacht_id: string | null; title: string | null; file_name: string | null;
    file_url: string | null; created_at: string; guest_uploaded_by: string | null;
  };
}

const trainingAccess = (ctx: Ctx, type: "training_folder" | "training_document", id: string, folderId: string | null) =>
  accessTo({ type, id, folderId }, ctx.shares, ctx.byId);

function descendants(folderId: string, folders: TreeFolder[]): string[] {
  const out: string[] = [];
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const f of folders) if (f.parent_id === id && !out.includes(f.id)) { out.push(f.id); stack.push(f.id); }
  }
  return out;
}

async function trainingFolder(ctx: Ctx, id: string): Promise<Response> {
  const f = ctx.byId.get(id);
  if (!f) return gone("folder");
  const a = trainingAccess(ctx, "training_folder", id, id);
  if (!a) return forbidden();
  const childIds = ctx.folders.filter((x) => x.parent_id === id).map((x) => x.id);
  const [{ data: childMeta }, { data: docs }] = await Promise.all([
    childIds.length
      ? ctx.sb.from("training_document_folders").select("id, name, guest_created_by").in("id", childIds).order("name")
      : Promise.resolve({ data: [] as any[] }),
    ctx.sb.from("training_documents").select("id, title, file_name, created_at, guest_uploaded_by").eq("folder_id", id).order("title"),
  ]);
  // Breadcrumbs start at the folder the share is on — nothing above it is theirs to see.
  const chain = folderChain(id, ctx.byId);
  const i = chain.indexOf(a.root.id);
  const crumbs = (i === -1 ? [id] : chain.slice(0, i + 1)).reverse()
    .map((cid) => ({ type: "training_folder", id: cid, name: ctx.byId.get(cid)?.name ?? "Folder" }));
  return json({
    container: { type: "training_folder", id, name: f.name },
    permission: a.permission,
    crumbs,
    caps: { upload: a.permission === "read_write", mkdir: a.permission === "read_write" },
    folders: (childMeta ?? []).map((c: any): ListedFolder => ({ type: "training_folder", id: c.id, name: c.name, guestAdded: !!c.guest_created_by })),
    documents: (docs ?? []).map((d: any): ListedDoc => ({
      type: "training_document", id: d.id, name: docName(d), createdAt: d.created_at, guestAdded: !!d.guest_uploaded_by, sub: null,
    })),
  });
}

// ═══ Vessel documents ════════════════════════════════════════════════════════
async function getYachtDoc(sb: any, id: string) {
  const { data } = await sb.from("yacht_documents")
    .select("id, yacht_id, title, file_name, file_url, created_at, guest_uploaded_by").eq("id", id).maybeSingle();
  return data as null | {
    id: string; yacht_id: string; title: string | null; file_name: string | null;
    file_url: string | null; created_at: string; guest_uploaded_by: string | null;
  };
}

async function getYachtFolder(sb: any, id: string): Promise<{ id: string; yacht_id: string; name: string } | null> {
  const { data } = await sb.from("yacht_document_folders").select("id, yacht_id, name").eq("id", id).maybeSingle();
  return data ?? null;
}

function vesselListing(lib: VesselLibrary, folderId: string | null) {
  const docs = lib.items.filter((it) => it.folderId === folderId).map((it): ListedDoc => ({
    type: it.kind === "doc" ? "yacht_document" : "yacht_sp",
    id: it.kind === "doc" ? it.id : `${lib.yacht.id}:${it.id}`,
    name: it.name, createdAt: it.createdAt, guestAdded: it.guestAdded,
    sub: it.kind === "sp" ? (it.sub ? `${it.sub} · SharePoint` : "SharePoint") : it.sub,
  }));
  return docs;
}

async function vesselContainer(ctx: Ctx, type: "yacht_all" | "yacht_folder", id: string): Promise<Response> {
  let yachtId = id;
  let folder: { id: string; yacht_id: string; name: string } | null = null;
  if (type === "yacht_folder") {
    folder = await getYachtFolder(ctx.sb, id);
    if (!folder) return gone("folder");
    yachtId = folder.yacht_id;
  }
  const a = vesselAccess({ yachtId, folderId: folder?.id ?? null }, ctx.shares);
  if (!a) return forbidden();
  const lib = await loadVesselLibrary(ctx.sb, yachtId);
  if (!lib) return gone("vessel");

  const vesselCrumb = { type: "yacht_all", id: yachtId, name: lib.yacht.name };
  const crumbs = folder
    ? (a.root.type === "yacht_all" ? [vesselCrumb] : []).concat([{ type: "yacht_folder", id: folder.id, name: folder.name }])
    : [vesselCrumb];
  return json({
    container: { type, id, name: folder?.name ?? lib.yacht.name },
    permission: a.permission,
    crumbs,
    caps: { upload: a.permission === "read_write", mkdir: false },
    folders: folder ? [] : lib.folders.map((f): ListedFolder => ({ type: "yacht_folder", id: f.id, name: f.name, guestAdded: false })),
    documents: vesselListing(lib, folder?.id ?? null),
    notice: lib.sharePointError ? "Some files are kept in SharePoint, which couldn't be reached just now — try again shortly." : undefined,
  });
}

/** Access to a Polaris vessel document — its own share, its folder's, or its vessel's. */
async function yachtDocAccess(ctx: Ctx, d: { id: string; yacht_id: string }) {
  const folderId = await placementOf(ctx.sb, d.yacht_id, `doc:${d.id}`);
  return vesselAccess({ yachtId: d.yacht_id, folderId, docId: d.id }, ctx.shares);
}

// ═══ Crew documents ══════════════════════════════════════════════════════════
async function getCrewDoc(sb: any, id: string) {
  const { data } = await sb.from("crew_documents")
    .select("id, crew_member_id, title, file_name, file_url, doc_type, created_at, guest_uploaded_by").eq("id", id).maybeSingle();
  return data as null | {
    id: string; crew_member_id: string; title: string | null; file_name: string | null; file_url: string | null;
    doc_type: string | null; created_at: string; guest_uploaded_by: string | null;
  };
}

async function getCrewFolder(sb: any, id: string): Promise<{ id: string; crew_member_id: string; name: string } | null> {
  const { data } = await sb.from("crew_document_folders").select("id, crew_member_id, name").eq("id", id).maybeSingle();
  return data ?? null;
}

async function crewPlacement(sb: any, crewId: string, key: string): Promise<string | null> {
  const { data } = await sb.from("crew_document_placements").select("folder_id")
    .eq("crew_member_id", crewId).eq("doc_key", key).maybeSingle();
  return data?.folder_id ?? null;
}

async function crewDocAccess(ctx: Ctx, d: { id: string; crew_member_id: string }) {
  const folderId = await crewPlacement(ctx.sb, d.crew_member_id, `doc:${d.id}`);
  return crewAccess({ crewId: d.crew_member_id, folderId, file: { type: "crew_document", id: d.id } }, ctx.shares);
}

/** Is anything of this crew member's shared with the guest at all? (Before any SharePoint call.) */
async function crewReachable(ctx: Ctx, crewId: string): Promise<boolean> {
  if (ctx.shares.some((s) => (s.resource_type === "crew_all" || s.resource_type === "crew_sp_file") && s.resource_id === crewId)) return true;
  const folderIds = ctx.shares.filter((s) => s.resource_type === "crew_folder").map((s) => s.resource_id);
  if (!folderIds.length) return false;
  const { data } = await ctx.sb.from("crew_document_folders").select("id").eq("crew_member_id", crewId).in("id", folderIds);
  return (data ?? []).length > 0;
}

function crewListing(lib: CrewLibrary, folderId: string | null): ListedDoc[] {
  return lib.items.filter((it) => it.folderId === folderId).map((it): ListedDoc => {
    if (it.kind === "doc") {
      return { type: "crew_document", id: it.key.slice(4), name: it.name, createdAt: null, guestAdded: it.guestAdded, sub: it.meta };
    }
    if (it.kind === "passport") {
      const [, pid, col] = it.key.split(":");
      return { type: "crew_passport", id: `${pid}:${col}`, name: it.name, createdAt: null, guestAdded: false, sub: it.meta };
    }
    return { type: "crew_sp", id: `${lib.crew.id}:${it.key.slice(3)}`, name: it.name, createdAt: null, guestAdded: false,
      sub: it.meta ? `${it.meta} · SharePoint` : "SharePoint" };
  });
}

async function crewContainer(ctx: Ctx, type: "crew_all" | "crew_folder", id: string): Promise<Response> {
  let crewId = id;
  let folder: { id: string; crew_member_id: string; name: string } | null = null;
  if (type === "crew_folder") {
    folder = await getCrewFolder(ctx.sb, id);
    if (!folder) return gone("folder");
    crewId = folder.crew_member_id;
  }
  const a = crewAccess({ crewId, folderId: folder?.id ?? null }, ctx.shares);
  if (!a) return forbidden();
  // SharePoint-only files are only ever listed at the top of a crew member's file.
  const lib = await loadCrewLibrary(ctx.sb, crewId, !folder);
  if (!lib) return gone("crew member");

  const crewCrumb = { type: "crew_all", id: crewId, name: lib.crew.name };
  const crumbs = folder
    ? (a.root.type === "crew_all" ? [crewCrumb] : []).concat([{ type: "crew_folder", id: folder.id, name: folder.name }])
    : [crewCrumb];
  return json({
    container: { type, id, name: folder?.name ?? lib.crew.name },
    permission: a.permission,
    crumbs,
    caps: { upload: a.permission === "read_write", mkdir: false },
    folders: folder ? [] : lib.folders.map((f): ListedFolder => ({ type: "crew_folder", id: f.id, name: f.name, guestAdded: false })),
    documents: crewListing(lib, folder?.id ?? null),
    notice: lib.sharePointError ? "Some files are kept in SharePoint, which couldn't be reached just now — try again shortly." : undefined,
  });
}

/** Home entries for crew shares — anything reached through a wider share is left to it. */
async function crewHomeItems(ctx: Ctx, entry: (a: Access) => Record<string, unknown>): Promise<any[]> {
  const items: any[] = [];
  const crewShares = ctx.shares.filter((s) => s.resource_type.startsWith("crew_"));
  if (!crewShares.length) return items;
  const allCrew = new Set(crewShares.filter((s) => s.resource_type === "crew_all").map((s) => s.resource_id));
  const names = new Map<string, string>();
  const nameOf = async (crewId: string) => {
    if (!names.has(crewId)) names.set(crewId, (await crewIdentity(ctx.sb, crewId))?.name ?? "Crew member");
    return names.get(crewId)!;
  };

  for (const crewId of allCrew) {
    items.push({ kind: "folder", ref: { type: "crew_all", id: crewId }, name: await nameOf(crewId), sub: "Crew documents",
      ...entry(crewAccess({ crewId, folderId: null }, ctx.shares)!) });
  }
  const folderIds = [...new Set(crewShares.filter((s) => s.resource_type === "crew_folder").map((s) => s.resource_id))];
  const sharedFolders = new Set<string>();
  if (folderIds.length) {
    const { data } = await ctx.sb.from("crew_document_folders").select("id, crew_member_id, name").in("id", folderIds);
    for (const f of data ?? []) {
      sharedFolders.add(f.id);
      if (allCrew.has(f.crew_member_id)) continue;
      items.push({ kind: "folder", ref: { type: "crew_folder", id: f.id }, name: f.name, sub: `${await nameOf(f.crew_member_id)} · crew documents`,
        ...entry(crewAccess({ crewId: f.crew_member_id, folderId: f.id }, ctx.shares)!) });
    }
  }
  // Single files: crew documents, passport files, SharePoint-only files.
  for (const s of crewShares) {
    let crewId: string | null = null;
    let key = "";
    let ref: Ref | null = null;
    if (s.resource_type === "crew_document") {
      const d = await getCrewDoc(ctx.sb, s.resource_id);
      if (!d) continue;
      crewId = d.crew_member_id; key = `doc:${d.id}`; ref = { type: "crew_document", id: d.id };
    } else if (s.resource_type === "crew_passport_file") {
      const { data: pp } = await ctx.sb.from("crew_passports").select("crew_id").eq("id", s.resource_id).maybeSingle();
      if (!pp) continue;
      crewId = pp.crew_id; key = `passport:${s.resource_id}:${s.resource_part}`; ref = { type: "crew_passport", id: `${s.resource_id}:${s.resource_part}` };
    } else if (s.resource_type === "crew_sp_file") {
      crewId = s.resource_id; key = `sp:${s.resource_part}`; ref = { type: "crew_sp", id: `${s.resource_id}:${s.resource_part}` };
    } else continue;
    if (!crewId || !ref || allCrew.has(crewId)) continue;
    const folderId = key.startsWith("sp:") ? null : await crewPlacement(ctx.sb, crewId, key);
    if (folderId && sharedFolders.has(folderId)) continue;
    if (items.some((i) => i.ref.type === ref!.type && i.ref.id === ref!.id)) continue;
    const a = crewAccess({ crewId, folderId, file: { type: s.resource_type, id: s.resource_id, part: s.resource_part ?? null } }, ctx.shares);
    if (!a) continue;
    items.push({ kind: "document", ref, name: s.resource_label ?? "Document", sub: `${await nameOf(crewId)} · crew documents`, ...entry(a) });
  }
  return items;
}

async function crewOpen(ctx: Ctx, ref: Ref, download: boolean): Promise<Response> {
  if (ref.type === "crew_document") {
    const d = await getCrewDoc(ctx.sb, ref.id);
    if (!d) return gone();
    const a = await crewDocAccess(ctx, d);
    if (!a) return forbidden();
    const url = await signed(ctx.sb, d.file_url, d.file_name ?? docName(d), download);
    if (!url) return json({ error: "This file can't be opened right now." }, 500);
    await log(ctx, download ? "download" : "open", a, { type: ref.type, id: d.id, name: docName(d) });
    return json({ url, name: d.file_name ?? docName(d) });
  }
  const sep = ref.id.indexOf(":");
  const [head, tail] = [ref.id.slice(0, sep), ref.id.slice(sep + 1)];
  if (sep < 1 || !tail) return gone();

  if (ref.type === "crew_passport") {
    if (!PASSPORT_COLUMNS.includes(tail)) return gone();
    const { data: pp } = await ctx.sb.from("crew_passports").select("crew_id").eq("id", head).maybeSingle();
    if (!pp) return gone();
    if (!(await crewReachable(ctx, pp.crew_id)) && !ctx.shares.some((s) => s.resource_type === "crew_passport_file" && s.resource_id === head)) return forbidden();
    // Only a file the crew card lists (e.g. never a seaman's book hidden by a verification letter).
    const lib = await loadCrewLibrary(ctx.sb, pp.crew_id, false);
    const item = lib?.items.find((it) => it.key === `passport:${head}:${tail}`);
    if (!lib || !item) return gone();
    const a = crewAccess({ crewId: pp.crew_id, folderId: item.folderId, file: { type: "crew_passport_file", id: head, part: tail } }, ctx.shares);
    if (!a) return forbidden();
    const ext = (item.stored ?? "").split("?")[0].split(".").pop() ?? "pdf";
    const url = await signed(ctx.sb, item.stored, `${lib.crew.name} - ${item.name}.${ext}`, download);
    if (!url) return json({ error: "This file can't be opened right now." }, 500);
    await log(ctx, download ? "download" : "open", a, { type: "crew_passport_file", id: head, name: item.name }, lib.crew.name);
    return json({ url, name: `${lib.crew.name} - ${item.name}.${ext}` });
  }

  if (ref.type === "crew_sp") {
    if (!(await crewReachable(ctx, head))) return forbidden();
    const lib = await loadCrewLibrary(ctx.sb, head, true);
    const item = lib?.items.find((it) => it.kind === "sp" && it.key === `sp:${tail}`);
    if (!lib || !item) return gone();
    const a = crewAccess({ crewId: head, folderId: null, file: { type: "crew_sp_file", id: head, part: tail } }, ctx.shares);
    if (!a) return forbidden();
    const url = await sharePointDownloadUrl(tail);
    if (!url) return json({ error: "SharePoint couldn't provide this file just now — try again shortly." }, 502);
    await log(ctx, download ? "download" : "open", a, { type: "crew_sp_file", id: head, name: item.name }, `${lib.crew.name} · SharePoint`);
    return json({ url, name: item.name });
  }
  return json({ error: "Unknown file type" }, 400);
}

// ═══ GET ═════════════════════════════════════════════════════════════════════
async function home(ctx: Ctx): Promise<Response> {
  const items: any[] = [];
  const entry = (a: Access) => ({ permission: a.permission, sharedBy: a.share.shared_by_name, sharedAt: a.share.created_at, expiresAt: a.share.expires_at });
  const ids = (t: ShareResourceType) => [...new Set(ctx.shares.filter((s) => s.resource_type === t).map((s) => s.resource_id))];

  // ── Training: something inside a folder that is ALSO shared is reached through it.
  const tFolders = new Set(ids("training_folder"));
  for (const fid of tFolders) {
    const f = ctx.byId.get(fid);
    if (!f || folderChain(f.parent_id, ctx.byId).some((x) => tFolders.has(x))) continue;
    items.push({ kind: "folder", ref: { type: "training_folder", id: fid }, name: f.name, sub: "Training documents",
      ...entry(trainingAccess(ctx, "training_folder", fid, fid)!) });
  }
  const tDocIds = ids("training_document");
  if (tDocIds.length) {
    const { data } = await ctx.sb.from("training_documents").select("id, folder_id, title, file_name").in("id", tDocIds);
    for (const d of data ?? []) {
      if (folderChain(d.folder_id, ctx.byId).some((x) => tFolders.has(x))) continue;
      items.push({ kind: "document", ref: { type: "training_document", id: d.id }, name: docName(d), sub: "Training documents",
        ...entry(trainingAccess(ctx, "training_document", d.id, d.folder_id)!) });
    }
  }

  // ── Vessels
  const yAll = new Set(ids("yacht_all"));
  const yFolderIds = ids("yacht_folder");
  const yDocIds = ids("yacht_document");
  const names = new Map<string, string>();
  const nameOf = async (yachtId: string) => {
    if (!names.has(yachtId)) names.set(yachtId, (await vesselName(ctx.sb, yachtId)) ?? "Vessel");
    return names.get(yachtId)!;
  };
  for (const yid of yAll) {
    items.push({ kind: "folder", ref: { type: "yacht_all", id: yid }, name: await nameOf(yid), sub: "Vessel documents",
      ...entry(vesselAccess({ yachtId: yid, folderId: null }, ctx.shares)!) });
  }
  const yFolders = new Set<string>();
  if (yFolderIds.length) {
    const { data } = await ctx.sb.from("yacht_document_folders").select("id, yacht_id, name").in("id", yFolderIds);
    for (const f of data ?? []) {
      yFolders.add(f.id);
      if (yAll.has(f.yacht_id)) continue;
      items.push({ kind: "folder", ref: { type: "yacht_folder", id: f.id }, name: f.name, sub: `${await nameOf(f.yacht_id)} · vessel documents`,
        ...entry(vesselAccess({ yachtId: f.yacht_id, folderId: f.id }, ctx.shares)!) });
    }
  }
  if (yDocIds.length) {
    const [{ data: docs }, { data: placed }] = await Promise.all([
      ctx.sb.from("yacht_documents").select("id, yacht_id, title, file_name").in("id", yDocIds),
      ctx.sb.from("yacht_document_placements").select("doc_key, folder_id").in("doc_key", yDocIds.map((i) => `doc:${i}`)),
    ]);
    const folderOf = new Map(((placed ?? []) as any[]).map((p) => [p.doc_key, p.folder_id]));
    for (const d of docs ?? []) {
      const folderId = folderOf.get(`doc:${d.id}`) ?? null;
      if (yAll.has(d.yacht_id) || (folderId && yFolders.has(folderId))) continue;
      items.push({ kind: "document", ref: { type: "yacht_document", id: d.id }, name: docName(d), sub: `${await nameOf(d.yacht_id)} · vessel documents`,
        ...entry(vesselAccess({ yachtId: d.yacht_id, folderId, docId: d.id }, ctx.shares)!) });
    }
  }
  // Single SharePoint-only vessel files, shared as they are.
  for (const s of ctx.shares.filter((x) => x.resource_type === "yacht_sp_file" && x.resource_part)) {
    if (yAll.has(s.resource_id)) continue;
    const folderId = await placementOf(ctx.sb, s.resource_id, `sp:${s.resource_part}`);
    if (folderId && yFolders.has(folderId)) continue;
    const ref = { type: "yacht_sp", id: `${s.resource_id}:${s.resource_part}` };
    if (items.some((i) => i.ref.type === ref.type && i.ref.id === ref.id)) continue;
    const a = vesselAccess({ yachtId: s.resource_id, folderId, spId: s.resource_part }, ctx.shares);
    if (!a) continue;
    items.push({ kind: "document", ref, name: s.resource_label ?? "Document", sub: `${await nameOf(s.resource_id)} · vessel documents · SharePoint`, ...entry(a) });
  }

  items.push(...await crewHomeItems(ctx, entry));

  items.sort((x, y) => (x.kind === y.kind ? x.name.localeCompare(y.name) : x.kind === "folder" ? -1 : 1));
  await ctx.sb.from("guest_accounts").update({ last_seen_at: new Date().toISOString() }).eq("id", ctx.guest.guestId);
  return json({ me: { email: ctx.guest.email, displayName: ctx.guest.displayName }, items });
}

async function open(ctx: Ctx, ref: Ref, download: boolean): Promise<Response> {
  if (ref.type === "training_document") {
    const d = await getTrainingDoc(ctx.sb, ref.id);
    if (!d) return gone();
    const a = trainingAccess(ctx, "training_document", d.id, d.folder_id);
    if (!a) return forbidden();
    const url = await signed(ctx.sb, d.file_url, d.file_name ?? docName(d), download);
    if (!url) return json({ error: "This file can't be opened right now." }, 500);
    await log(ctx, download ? "download" : "open", a, { type: ref.type, id: d.id, name: docName(d) });
    return json({ url, name: d.file_name ?? docName(d) });
  }
  if (ref.type === "yacht_document") {
    const d = await getYachtDoc(ctx.sb, ref.id);
    if (!d) return gone();
    const a = await yachtDocAccess(ctx, d);
    if (!a) return forbidden();
    const url = await signed(ctx.sb, d.file_url, d.file_name ?? docName(d), download);
    if (!url) return json({ error: "This file can't be opened right now." }, 500);
    await log(ctx, download ? "download" : "open", a, { type: ref.type, id: d.id, name: docName(d) });
    return json({ url, name: d.file_name ?? docName(d) });
  }
  if (ref.type === "yacht_sp") {
    const [yachtId, spId] = [ref.id.slice(0, ref.id.indexOf(":")), ref.id.slice(ref.id.indexOf(":") + 1)];
    if (!yachtId || !spId) return gone();
    // Cheap check first: nothing shared from this vessel means no SharePoint call.
    const folderShareIds = ctx.shares.filter((s) => s.resource_type === "yacht_folder").map((s) => s.resource_id);
    const { data: vesselFolders } = folderShareIds.length
      ? await ctx.sb.from("yacht_document_folders").select("id").eq("yacht_id", yachtId).in("id", folderShareIds)
      : { data: [] as any[] };
    const reachable = ctx.shares.some((s) => (s.resource_type === "yacht_all" || s.resource_type === "yacht_sp_file") && s.resource_id === yachtId)
      || (vesselFolders ?? []).length > 0;
    if (!reachable) return forbidden();
    // The file must be one the vessel's card lists (never "Crew Documents"), and
    // the guest must reach it through the vessel or the folder it is filed in.
    const lib = await loadVesselLibrary(ctx.sb, yachtId);
    const item = lib?.items.find((it) => it.kind === "sp" && it.id === spId);
    if (!lib || !item) return gone();
    const a = vesselAccess({ yachtId, folderId: item.folderId, spId }, ctx.shares);
    if (!a) return forbidden();
    const url = await sharePointDownloadUrl(spId);
    if (!url) return json({ error: "SharePoint couldn't provide this file just now — try again shortly." }, 502);
    await log(ctx, download ? "download" : "open", a, { type: "yacht_sp", id: spId, name: item.name }, `${lib.yacht.name} · SharePoint`);
    return json({ url, name: item.name });
  }
  if (ref.type.startsWith("crew_")) return crewOpen(ctx, ref, download);
  return json({ error: "Unknown file type" }, 400);
}

// ═══ POST ════════════════════════════════════════════════════════════════════
async function mkdir(ctx: Ctx, parentId: string, rawName: string): Promise<Response> {
  const name = rawName.trim().slice(0, 200);
  if (!name) return json({ error: "Give the folder a name." }, 400);
  const parent = ctx.byId.get(parentId);
  if (!parent) return json({ error: "New folders can only be made inside a shared Training folder." }, 400);
  const a = trainingAccess(ctx, "training_folder", parentId, parentId);
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

/** A document row a guest wants to change, with the access they have to it. */
type WritableDoc = {
  table: "training_documents" | "yacht_documents" | "crew_documents";
  row: { id: string; title: string | null; file_name: string | null; file_url: string | null; guest_uploaded_by: string | null };
  access: Access | null;
  /** Remove the row's folder placement, where the library keeps one. */
  unplace: () => Promise<void>;
  /** Storage prefix for a replacement file. */
  prefix: string;
};

async function writableDoc(ctx: Ctx, ref: Ref): Promise<WritableDoc | null | "unsupported"> {
  if (ref.type === "training_document") {
    const d = await getTrainingDoc(ctx.sb, ref.id);
    if (!d) return null;
    return { table: "training_documents", row: d, access: trainingAccess(ctx, "training_document", d.id, d.folder_id),
      unplace: async () => {}, prefix: "training/guest" };
  }
  if (ref.type === "yacht_document") {
    const d = await getYachtDoc(ctx.sb, ref.id);
    if (!d) return null;
    return { table: "yacht_documents", row: d, access: await yachtDocAccess(ctx, d),
      unplace: async () => { await ctx.sb.from("yacht_document_placements").delete().eq("yacht_id", d.yacht_id).eq("doc_key", `doc:${d.id}`); },
      prefix: `yachts/${d.yacht_id}/guest` };
  }
  if (ref.type === "crew_document") {
    const d = await getCrewDoc(ctx.sb, ref.id);
    if (!d) return null;
    return { table: "crew_documents", row: d, access: await crewDocAccess(ctx, d),
      unplace: async () => { await ctx.sb.from("crew_document_placements").delete().eq("crew_member_id", d.crew_member_id).eq("doc_key", `doc:${d.id}`); },
      prefix: `crew/${d.crew_member_id}/guest` };
  }
  return "unsupported";
}

async function rename(ctx: Ctx, ref: Ref, rawName: string): Promise<Response> {
  const name = rawName.trim().slice(0, 200);
  if (!name) return json({ error: "The name can't be empty." }, 400);

  if (ref.type === "training_folder") {
    const f = ctx.byId.get(ref.id);
    if (!f) return gone("folder");
    const a = trainingAccess(ctx, "training_folder", ref.id, ref.id);
    if (!a) return forbidden();
    if (a.permission !== "read_write") return readOnly();
    if (a.root.id === ref.id) return json({ error: "The shared folder itself can only be renamed by JLS." }, 403);
    const { error } = await ctx.sb.from("training_document_folders").update({ name }).eq("id", ref.id);
    if (error) return json({ error: error.message }, 500);
    await log(ctx, "rename", a, { type: ref.type, id: ref.id, name }, `Was “${f.name}”`);
    return json({ success: true });
  }
  const w = await writableDoc(ctx, ref);
  if (w === "unsupported") return json({ error: "This can only be renamed by JLS." }, 403);
  if (!w) return gone();
  const a = w.access;
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  if (a.root.id === ref.id) return json({ error: "A file shared on its own can only be renamed by JLS." }, 403);
  const { error } = await ctx.sb.from(w.table).update({ title: name }).eq("id", ref.id);
  if (error) return json({ error: error.message }, 500);
  await log(ctx, "rename", a, { type: ref.type, id: ref.id, name }, `Was “${docName(w.row)}”`);
  return json({ success: true });
}

async function remove(ctx: Ctx, ref: Ref): Promise<Response> {
  const w = await writableDoc(ctx, ref);
  if (w && w !== "unsupported") {
    const a = w.access;
    if (!a) return forbidden();
    if (a.permission !== "read_write") return readOnly();
    if (a.root.id === ref.id) return json({ error: "A file shared with you can only be removed by JLS." }, 403);
    if (!w.row.guest_uploaded_by) return json({ error: "Only files added by a guest can be removed here. Ask JLS to remove this one." }, 403);
    const { error } = await ctx.sb.from(w.table).delete().eq("id", ref.id);
    if (error) return json({ error: error.message }, 500);
    await w.unplace();
    await removeObjects(ctx.sb, [w.row.file_url]);
    await log(ctx, "remove", a, { type: ref.type, id: ref.id, name: docName(w.row) });
    return json({ success: true });
  }
  if (w === null) return gone();

  if (ref.type !== "training_folder") return json({ error: "This can only be removed by JLS." }, 403);
  const f = ctx.byId.get(ref.id);
  if (!f) return gone("folder");
  const a = trainingAccess(ctx, "training_folder", ref.id, ref.id);
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  if (a.root.id === ref.id) return json({ error: "The shared folder itself can only be removed by JLS." }, 403);
  // Everything in it — every folder and file at any depth — must be guest-added.
  const ids = [ref.id, ...descendants(ref.id, ctx.folders)];
  const [{ data: fRows }, { data: dRows }] = await Promise.all([
    ctx.sb.from("training_document_folders").select("id, guest_created_by").in("id", ids),
    ctx.sb.from("training_documents").select("id, file_url, guest_uploaded_by").in("folder_id", ids),
  ]);
  if ((fRows ?? []).some((r: any) => !r.guest_created_by) || (dRows ?? []).some((r: any) => !r.guest_uploaded_by)) {
    return json({ error: "This folder holds things added by JLS, so it can't be removed here." }, 403);
  }
  const { error: dErr } = await ctx.sb.from("training_documents").delete().in("folder_id", ids);
  if (dErr) return json({ error: dErr.message }, 500);
  for (const fid of [...ids].reverse()) {
    const { error } = await ctx.sb.from("training_document_folders").delete().eq("id", fid);
    if (error) return json({ error: error.message }, 500);
  }
  await removeObjects(ctx.sb, (dRows ?? []).map((r: any) => r.file_url));
  await log(ctx, "remove", a, { type: ref.type, id: ref.id, name: f.name }, `${(dRows ?? []).length} file(s) inside`);
  return json({ success: true });
}

async function upload(ctx: Ctx, form: FormData): Promise<Response> {
  const type = String(form.get("type") ?? "training_folder");
  const id = String(form.get("id") ?? form.get("folderId") ?? "");
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (!files.length) return json({ error: "Choose a file to upload." }, 400);
  if (files.length > MAX_FILES_PER_UPLOAD) return json({ error: `Upload at most ${MAX_FILES_PER_UPLOAD} files at a time.` }, 400);

  // Where the files go, and how each becomes a row.
  let a: Access | null;
  let where: string;
  let insert: (file: File, ref: string) => Promise<{ id?: string; error?: string }>;
  let prefix: string;
  let docType: "training_document" | "yacht_document" | "crew_document";

  if (type === "training_folder") {
    const parent = ctx.byId.get(id);
    if (!parent) return gone("folder");
    a = trainingAccess(ctx, "training_folder", id, id);
    where = parent.name;
    prefix = "training/guest";
    docType = "training_document";
    const { data: p } = await ctx.sb.from("training_document_folders").select("yacht_id").eq("id", id).maybeSingle();
    insert = async (file, ref) => {
      const { data, error } = await ctx.sb.from("training_documents").insert({
        folder_id: id, yacht_id: p?.yacht_id ?? null, title: file.name, file_name: file.name,
        file_url: ref, guest_uploaded_by: ctx.guest.guestId,
      }).select("id").single();
      return error ? { error: error.message } : { id: data.id };
    };
  } else if (type === "yacht_all" || type === "yacht_folder") {
    const folder = type === "yacht_folder" ? await getYachtFolder(ctx.sb, id) : null;
    if (type === "yacht_folder" && !folder) return gone("folder");
    const yachtId = folder?.yacht_id ?? id;
    const vName = await vesselName(ctx.sb, yachtId);
    if (vName === null) return gone("vessel");
    a = vesselAccess({ yachtId, folderId: folder?.id ?? null }, ctx.shares);
    where = folder ? `${vName} › ${folder.name}` : vName;
    prefix = `yachts/${yachtId}/guest`;
    docType = "yacht_document";
    insert = async (file, ref) => {
      const { data, error } = await ctx.sb.from("yacht_documents").insert({
        yacht_id: yachtId, title: file.name, file_name: file.name, file_url: ref,
        doc_type: "guest_upload", guest_uploaded_by: ctx.guest.guestId,
      }).select("id").single();
      if (error) return { error: error.message };
      if (folder) {
        await ctx.sb.from("yacht_document_placements").upsert(
          { yacht_id: yachtId, doc_key: `doc:${data.id}`, folder_id: folder.id, updated_at: new Date().toISOString() },
          { onConflict: "yacht_id,doc_key" },
        );
      }
      return { id: data.id };
    };
  } else if (type === "crew_all" || type === "crew_folder") {
    const folder = type === "crew_folder" ? await getCrewFolder(ctx.sb, id) : null;
    if (type === "crew_folder" && !folder) return gone("folder");
    const crewId = folder?.crew_member_id ?? id;
    const crew = await crewIdentity(ctx.sb, crewId);
    if (!crew) return gone("crew member");
    a = crewAccess({ crewId, folderId: folder?.id ?? null }, ctx.shares);
    where = folder ? `${crew.name} › ${folder.name}` : crew.name;
    prefix = `crew/${crewId}/guest`;
    docType = "crew_document";
    insert = async (file, ref) => {
      const { data, error } = await ctx.sb.from("crew_documents").insert({
        crew_member_id: crewId, doc_type: "other", title: file.name, file_name: file.name, file_url: ref,
        guest_uploaded_by: ctx.guest.guestId,
      }).select("id").single();
      if (error) return { error: error.message };
      if (folder) {
        await ctx.sb.from("crew_document_placements").upsert(
          { crew_member_id: crewId, doc_key: `doc:${data.id}`, folder_id: folder.id, updated_at: new Date().toISOString() },
          { onConflict: "crew_member_id,doc_key" },
        );
      }
      return { id: data.id };
    };
  } else {
    return json({ error: "Files can't be uploaded here." }, 400);
  }
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();

  let added = 0;
  const failed: string[] = [];
  for (const file of files) {
    const stored = await storeFile(ctx.sb, prefix, file);
    if ("error" in stored) { failed.push(stored.error); continue; }
    const r = await insert(file, stored.ref);
    if (r.error) { failed.push(`${file.name}: ${r.error}`); await removeObjects(ctx.sb, [stored.ref]); continue; }
    added++;
    await log(ctx, "upload", a, { type: docType, id: r.id!, name: file.name }, `Into “${where}”`);
  }
  return json({ success: added > 0, added, failed });
}

async function replace(ctx: Ctx, form: FormData): Promise<Response> {
  const type = String(form.get("type") ?? "training_document");
  const id = String(form.get("docId") ?? "");
  const file = form.get("file");
  if (!(file && typeof file !== "string")) return json({ error: "Choose a file." }, 400);
  const w = await writableDoc(ctx, { type, id });
  if (w === "unsupported") return json({ error: "This file can't be replaced here." }, 400);
  if (!w) return gone();
  const a = w.access;
  if (!a) return forbidden();
  if (a.permission !== "read_write") return readOnly();
  const stored = await storeFile(ctx.sb, w.prefix, file as File);
  if ("error" in stored) return json({ error: stored.error }, 400);
  const { error } = await ctx.sb.from(w.table).update({ file_url: stored.ref, file_name: (file as File).name }).eq("id", id);
  if (error) { await removeObjects(ctx.sb, [stored.ref]); return json({ error: error.message }, 500); }
  await removeObjects(ctx.sb, [w.row.file_url]);
  await log(ctx, "replace", a, { type, id, name: docName(w.row) }, `New file “${(file as File).name}”`);
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
      const ref = { type: url.searchParams.get("type") ?? "", id: url.searchParams.get("id") ?? "" };
      if (op === "home") return home(ctx);
      if (op === "folder") {
        if (ref.type === "yacht_all" || ref.type === "yacht_folder") return vesselContainer(ctx, ref.type, ref.id);
        if (ref.type === "crew_all" || ref.type === "crew_folder") return crewContainer(ctx, ref.type, ref.id);
        return trainingFolder(ctx, ref.id);
      }
      if (op === "open") return open(ctx, { type: ref.type || "training_document", id: ref.id }, url.searchParams.get("download") === "1");
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
    const ref = { type: String(body.type ?? ""), id: String(body.id ?? "") };
    if (body.op === "mkdir") return mkdir(ctx, String(body.parentId ?? ""), String(body.name ?? ""));
    if (body.op === "rename") return rename(ctx, ref, String(body.name ?? ""));
    if (body.op === "remove") return remove(ctx, ref);
    return json({ error: "Unknown request" }, 400);
  } catch (e) {
    console.error("[api/guest]", e);
    return json({ error: "Something went wrong — please try again." }, 500);
  }
}
