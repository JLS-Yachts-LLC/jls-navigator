/**
 * A vessel's document library as the staff Documents card shows it — Polaris
 * documents, SharePoint-only files and the card's (flat) folders — for the guest
 * API, which may only serve what the card would show.
 *
 * The merge mirrors YachtDocumentsCard: a Polaris document claims its SharePoint
 * twin by the recorded link, else by matching name; whatever SharePoint holds that
 * no document claims is listed on its own as a SharePoint-only file. Placements
 * (yacht_document_placements, keyed "doc:<id>" / "sp:<item id>") file either kind
 * into a folder. "Crew Documents" is excluded by the SharePoint listing itself.
 */
import { listVesselSharePointItems } from "@/lib/yacht-doc-sharepoint.server";

export type VesselItem = {
  /** "doc:<yacht_documents.id>" or "sp:<SharePoint item id>" — the card's doc_key. */
  key: string;
  kind: "doc" | "sp";
  id: string;
  name: string;
  createdAt: string | null;
  folderId: string | null;
  guestAdded: boolean;
  /** Extra context, e.g. "in Certificates" for a file in a SharePoint subfolder. */
  sub: string | null;
  fileUrl: string | null;
};

export type VesselLibrary = {
  yacht: { id: string; name: string };
  folders: { id: string; name: string }[];
  items: VesselItem[];
  sharePointError: string | null;
};

const nameKey = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export async function vesselName(sb: any, yachtId: string): Promise<string | null> {
  const { data } = await sb.from("yachts").select("vessel_name").eq("id", yachtId).maybeSingle();
  return data ? String(data.vessel_name ?? "Vessel") : null;
}

/** The folder a card item is filed in (null = the vessel's main list). */
export async function placementOf(sb: any, yachtId: string, key: string): Promise<string | null> {
  const { data } = await sb.from("yacht_document_placements").select("folder_id")
    .eq("yacht_id", yachtId).eq("doc_key", key).maybeSingle();
  return data?.folder_id ?? null;
}

export async function loadVesselLibrary(sb: any, yachtId: string): Promise<VesselLibrary | null> {
  const name = await vesselName(sb, yachtId);
  if (name === null) return null;
  const [{ data: docs }, { data: folders }, { data: placements }, { data: links }, sp] = await Promise.all([
    sb.from("yacht_documents").select("id, title, file_name, file_url, created_at, guest_uploaded_by")
      .eq("yacht_id", yachtId).order("created_at", { ascending: false }),
    sb.from("yacht_document_folders").select("id, name").eq("yacht_id", yachtId).order("name"),
    sb.from("yacht_document_placements").select("doc_key, folder_id").eq("yacht_id", yachtId),
    sb.from("yacht_document_sharepoint_links").select("doc_key, sp_item_id").eq("yacht_id", yachtId),
    listVesselSharePointItems(name),
  ]);
  const placed = new Map<string, string | null>(((placements ?? []) as any[]).map((p) => [p.doc_key, p.folder_id ?? null]));
  const linked = new Map<string, string | null>(((links ?? []) as any[]).map((l) => [l.doc_key, l.sp_item_id ?? null]));
  const spFiles = sp.items.filter((i) => !i.isFolder);
  const claimed = new Set<string>();
  const items: VesselItem[] = [];

  for (const d of (docs ?? []) as any[]) {
    const key = `doc:${d.id}`;
    const label = d.title || d.file_name || "Untitled document";
    const recorded = linked.get(key);
    let match = recorded ? spFiles.find((f) => f.id === recorded) : undefined;
    if (!match) {
      const want = nameKey(d.file_name || label);
      match = spFiles.find((f) => !claimed.has(f.id) && nameKey(f.name) === want);
    }
    if (match) claimed.add(match.id);
    items.push({
      key, kind: "doc", id: d.id, name: label, createdAt: d.created_at ?? null,
      folderId: placed.get(key) ?? null, guestAdded: !!d.guest_uploaded_by, sub: null, fileUrl: d.file_url ?? null,
    });
  }
  for (const f of spFiles) {
    if (claimed.has(f.id)) continue;
    const key = `sp:${f.id}`;
    items.push({
      key, kind: "sp", id: f.id, name: f.name, createdAt: f.lastModified,
      folderId: placed.get(key) ?? null, guestAdded: false, sub: f.folder ? `in ${f.folder}` : null, fileUrl: null,
    });
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return {
    yacht: { id: yachtId, name },
    folders: (folders ?? []) as { id: string; name: string }[],
    items,
    sharePointError: sp.error ?? null,
  };
}
