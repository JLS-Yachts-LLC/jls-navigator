/**
 * Guest sharing — the rules, with no I/O, so the server and the staff UI agree.
 *
 * Two document libraries can be shared:
 *   · Training documents — nested folders (training_folder / training_document).
 *   · Vessel documents (the Documents card on a yacht) — a whole vessel
 *     (yacht_all), one of its flat folders (yacht_folder) or one document
 *     (yacht_document), or one SharePoint-only file (yacht_sp_file,
 *     resource_id = the vessel, resource_part = the SharePoint item id).
 *   · Crew documents (the Documents card on a crew profile) — all of one crew
 *     member's files (crew_all), a folder (crew_folder), one document
 *     (crew_document), one passport file (crew_passport_file, resource_part =
 *     the column) or one SharePoint-only file (crew_sp_file, resource_part = the
 *     SharePoint item id). Personal data — see api.guest-shares.
 *
 * A share puts ONE item in front of
 * one guest or one guest group, as Read or Read & write. A folder share covers
 * everything inside it, including things added later. A guest's access to an
 * item is the strongest live share on the item itself or on any folder above it.
 *
 * "Live" = not revoked and not past its expiry date.
 */

export type ShareResourceType =
  | "training_folder" | "training_document"
  | "yacht_all" | "yacht_folder" | "yacht_document" | "yacht_sp_file"
  | "crew_all" | "crew_folder" | "crew_document" | "crew_passport_file" | "crew_sp_file";

/** The shareable things that hold other things (open into a list). */
export const CONTAINER_TYPES: ShareResourceType[] = ["training_folder", "yacht_all", "yacht_folder", "crew_all", "crew_folder"];
/** Crew documents are personal data (passports, ID) — handled with extra care. */
export const isCrewType = (t: string) => t.startsWith("crew_");
export const isContainer = (t: string) => (CONTAINER_TYPES as string[]).includes(t);
export type SharePermission = "read" | "read_write";

export type GuestShare = {
  id: string;
  resource_type: ShareResourceType;
  resource_id: string;
  /** For a crew passport file: the column; for a SharePoint file (crew or vessel): its item id. */
  resource_part?: string | null;
  /** The item's name when it was shared. */
  resource_label?: string | null;
  guest_id: string | null;
  group_id: string | null;
  permission: SharePermission;
  note: string | null;
  expires_at: string | null;
  shared_by: string | null;
  shared_by_name: string | null;
  created_at: string;
  updated_at: string;
  revoked_at: string | null;
  revoked_by_name?: string | null;
};

export type TreeFolder = { id: string; name: string; parent_id: string | null };

export const PERMISSION_LABEL: Record<SharePermission, string> = {
  read: "Read",
  read_write: "Read & write",
};

export const PERMISSION_HELP: Record<SharePermission, string> = {
  read: "Can open and download.",
  read_write: "Can also add files and folders, and rename things inside a shared folder.",
};

/** True while a share still grants access. */
export function isLive(s: Pick<GuestShare, "revoked_at" | "expires_at">, now = Date.now()): boolean {
  if (s.revoked_at) return false;
  if (s.expires_at && new Date(s.expires_at).getTime() <= now) return false;
  return true;
}

/** Where a share stands, for display. */
export function shareState(s: Pick<GuestShare, "revoked_at" | "expires_at">, now = Date.now()): "active" | "expired" | "revoked" {
  if (s.revoked_at) return "revoked";
  if (s.expires_at && new Date(s.expires_at).getTime() <= now) return "expired";
  return "active";
}

const rank = (p: SharePermission | null | undefined) => (p === "read_write" ? 2 : p === "read" ? 1 : 0);

/** The stronger of two permissions (null = no access). */
export function strongest(a: SharePermission | null, b: SharePermission | null): SharePermission | null {
  return rank(a) >= rank(b) ? a : b;
}

/**
 * Folder ids from this folder up to the top, nearest first, including itself.
 * Guards against a cycle in bad data rather than looping forever.
 */
export function folderChain(folderId: string | null, byId: Map<string, TreeFolder>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = folderId;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.push(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return out;
}

export type Access = {
  permission: SharePermission;
  /** The share that grants it — the nearest one when several apply. */
  share: GuestShare;
  /** The shared item the guest's view of this item starts from. */
  root: { type: ShareResourceType; id: string };
};

/**
 * What a guest may do with an item, given the guest's live shares (direct and
 * via groups). `folderId` is the folder the item sits in (for a document) or the
 * folder itself (for a folder).
 */
export function accessTo(
  item: { type: ShareResourceType; id: string; folderId: string | null },
  shares: GuestShare[],
  byId: Map<string, TreeFolder>,
): Access | null {
  let best: Access | null = null;
  const consider = (s: GuestShare, root: Access["root"]) => {
    if (!best || rank(s.permission) > rank(best.permission)) best = { permission: s.permission, share: s, root };
  };

  if (item.type === "training_document") {
    for (const s of shares) {
      if (s.resource_type === "training_document" && s.resource_id === item.id) consider(s, { type: "training_document", id: item.id });
    }
  }
  // For a folder, its own chain starts with itself; for a document, with its folder.
  for (const fid of folderChain(item.folderId, byId)) {
    for (const s of shares) {
      if (s.resource_type === "training_folder" && s.resource_id === fid) consider(s, { type: "training_folder", id: fid });
    }
  }
  return best;
}

/**
 * Access to a vessel-document item. Nearest share wins on a tie, strongest
 * overall: the document itself, then the folder it is filed in, then the vessel.
 *   · a document: { yachtId, folderId (its placement, or null), docId }
 *   · a folder:   { yachtId, folderId }
 *   · the vessel: { yachtId, folderId: null }
 */
export function vesselAccess(
  item: { yachtId: string; folderId: string | null; docId?: string | null; spId?: string | null },
  shares: GuestShare[],
): Access | null {
  let best: Access | null = null;
  const consider = (type: ShareResourceType, id: string | null | undefined, part: string | null = null) => {
    if (!id) return;
    for (const s of shares) {
      if (s.resource_type !== type || s.resource_id !== id) continue;
      if (part !== (s.resource_part ?? null)) continue;
      if (!best || rank(s.permission) > rank(best.permission)) best = { permission: s.permission, share: s, root: { type, id } };
    }
  };
  consider("yacht_document", item.docId);
  if (item.spId) consider("yacht_sp_file", item.yachtId, item.spId);
  consider("yacht_folder", item.folderId);
  consider("yacht_all", item.yachtId);
  return best;
}

/**
 * Access to a crew-document item. Strongest share wins, nearest first on a tie:
 * the file itself, then the folder it is filed in, then the crew member.
 *   · a file:   { crewId, folderId, file: { type, id, part? } }
 *   · a folder: { crewId, folderId }
 *   · the crew member's whole file: { crewId, folderId: null }
 */
export function crewAccess(
  item: { crewId: string; folderId: string | null; file?: { type: ShareResourceType; id: string; part?: string | null } },
  shares: GuestShare[],
): Access | null {
  let best: Access | null = null;
  const consider = (type: ShareResourceType, id: string | null | undefined, part?: string | null) => {
    if (!id) return;
    for (const s of shares) {
      if (s.resource_type !== type || s.resource_id !== id) continue;
      if ((part ?? null) !== (s.resource_part ?? null)) continue;
      if (!best || rank(s.permission) > rank(best.permission)) best = { permission: s.permission, share: s, root: { type, id } };
    }
  };
  if (item.file) consider(item.file.type, item.file.id, item.file.part);
  consider("crew_folder", item.folderId);
  consider("crew_all", item.crewId);
  return best;
}
