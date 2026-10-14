/**
 * Guest sharing — the rules, with no I/O, so the server and the staff UI agree.
 *
 * A share puts ONE item (a Training folder or a Training document) in front of
 * one guest or one guest group, as Read or Read & write. A folder share covers
 * everything inside it, including things added later. A guest's access to an
 * item is the strongest live share on the item itself or on any folder above it.
 *
 * "Live" = not revoked and not past its expiry date.
 */

export type ShareResourceType = "training_folder" | "training_document";
export type SharePermission = "read" | "read_write";

export type GuestShare = {
  id: string;
  resource_type: ShareResourceType;
  resource_id: string;
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
