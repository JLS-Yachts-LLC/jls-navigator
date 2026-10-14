/**
 * One crew member's documents as the crew profile's Documents card shows them —
 * passport files, crew_documents rows, the card's folders, and the files that
 * exist only in their SharePoint folder — for the guest API.
 *
 * Built with the same functions as the card (lib/crew-docs/library.ts) so a guest
 * can never be shown anything the card would not list. Passports are ordered the
 * way the profile page orders them (primary, then latest expiry, then newest), as
 * that decides which passport is current and which are superseded.
 */
import { buildCrewItems, matchSharePoint, type CrewSpFile } from "@/lib/crew-docs/library";
import { listCrewSharePointItems } from "@/lib/crew-doc-sharepoint.server";

export type CrewLibItem = {
  /** The card's doc_key: "doc:<id>", "passport:<id>:<column>", or "sp:<SharePoint id>". */
  key: string;
  kind: "doc" | "passport" | "sp";
  name: string;
  meta: string | null;
  folderId: string | null;
  guestAdded: boolean;
  /** Polaris storage ref (doc / passport). */
  stored: string | null;
};

export type CrewLibrary = {
  crew: { id: string; name: string; vessel: string | null };
  folders: { id: string; name: string }[];
  items: CrewLibItem[];
  sharePointError: string | null;
};

export async function crewIdentity(sb: any, crewId: string): Promise<{ id: string; name: string; vessel: string | null } | null> {
  const { data: m } = await sb.from("crew_members").select("id, full_name, first_name, last_name, yacht_id").eq("id", crewId).maybeSingle();
  if (!m) return null;
  let vessel: string | null = null;
  if (m.yacht_id) {
    const { data: y } = await sb.from("yachts").select("vessel_name").eq("id", m.yacht_id).maybeSingle();
    vessel = y?.vessel_name ?? null;
  }
  const name = (m.full_name || `${m.first_name ?? ""} ${m.last_name ?? ""}`).trim() || "Crew member";
  return { id: m.id, name, vessel };
}

/**
 * @param withSharePoint  false skips the SharePoint listing (and its Graph calls)
 *                        when only Polaris-held files matter.
 */
export async function loadCrewLibrary(sb: any, crewId: string, withSharePoint = true): Promise<CrewLibrary | null> {
  const crew = await crewIdentity(sb, crewId);
  if (!crew) return null;
  const [{ data: passports }, { data: docs }, { data: folders }, { data: placements }, { data: links }, sp] = await Promise.all([
    sb.from("crew_passports").select("*").eq("crew_id", crewId)
      .order("is_primary", { ascending: false })
      .order("expiry_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
    sb.from("crew_documents").select("*").eq("crew_member_id", crewId).order("created_at", { ascending: false }),
    sb.from("crew_document_folders").select("id, name").eq("crew_member_id", crewId).order("name"),
    sb.from("crew_document_placements").select("doc_key, folder_id").eq("crew_member_id", crewId),
    sb.from("crew_document_sharepoint_links").select("doc_key, web_url").eq("crew_member_id", crewId),
    withSharePoint ? listCrewSharePointItems(crew.vessel, crew.name) : Promise.resolve({ exists: false, webUrl: null, items: [] as CrewSpFile[], error: undefined }),
  ]);

  const placed = new Map<string, string | null>(((placements ?? []) as any[]).map((p) => [p.doc_key, p.folder_id ?? null]));
  const guestAdded = new Set(((docs ?? []) as any[]).filter((d) => d.guest_uploaded_by).map((d) => `doc:${d.id}`));
  const items = buildCrewItems(passports ?? [], docs ?? [], crew.name);
  const { unclaimed } = matchSharePoint(
    items,
    Object.fromEntries(((links ?? []) as any[]).map((l) => [l.doc_key, { webUrl: l.web_url ?? null }])),
    sp.items as CrewSpFile[],
  );

  const out: CrewLibItem[] = items.map((it) => ({
    key: it.docKey,
    kind: it.docKey.startsWith("passport:") ? "passport" : "doc",
    name: it.label, meta: it.meta, folderId: placed.get(it.docKey) ?? null,
    guestAdded: guestAdded.has(it.docKey), stored: it.stored,
  }));
  // The card lists SharePoint-only files apart, never filed into a folder.
  for (const f of unclaimed) {
    out.push({
      key: `sp:${f.id}`, kind: "sp", name: f.name,
      meta: f.folder ? `in ${f.folder}` : null, folderId: null, guestAdded: false, stored: null,
    });
  }
  return {
    crew,
    folders: (folders ?? []) as { id: string; name: string }[],
    items: out,
    sharePointError: (sp as any).error ?? null,
  };
}
