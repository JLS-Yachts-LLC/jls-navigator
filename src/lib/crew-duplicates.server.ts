/**
 * Duplicate crew & folder detection ⇄ SharePoint.
 *
 * Crew records and their SharePoint folders drift apart over years of hand-typed
 * names: accents from passport OCR ("JOVAN ČAVOR" vs "Jovan Cavor"), reversed
 * first/last names, middle names appearing and disappearing, trailing notes like
 * "(Deck)". The result is the same person twice — and their documents split
 * across two folders.
 *
 * This module finds those near-duplicates and merges the folders:
 *   • scanDuplicateCrewFolders  — per vessel, group folders by a fuzzy key
 *   • mergeCrewFolders          — move every file into the folder being kept
 *
 * Merging MOVES items via Graph (no copy/delete), so nothing is duplicated or
 * lost; the emptied folder is only removed once its children are gone.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSpConfig, getGraphToken, resolveSpSite } from "@/lib/sharepoint-sync.server";
import { listFolderChildren, sanitizeSegment } from "@/lib/visa-sharepoint.server";
import { nameKey, groupSimilar } from "@/lib/crew-name-match";

const DEFAULT_SITE_URL = "/sites/PortOperationsandAgency";

async function spContext(): Promise<{ token: string; siteId: string }> {
  const cfg = await getSpConfig();
  const siteUrl = (cfg as unknown as Record<string, any>).visaSiteUrl ?? cfg.siteUrl ?? DEFAULT_SITE_URL;
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSpSite(token, cfg.tenantUrl, siteUrl);
  return { token, siteId };
}

// Fuzzy name matching lives in crew-name-match.ts so the server and the review
// screen judge similarity identically.

// ── SharePoint folder scan ───────────────────────────────────────────────────

export type DupFolder = {
  id: string;
  name: string;
  childCount: number;
  webUrl: string | null;
  lastModified: string | null;
};
export type DupGroup = { key: string; vessel: string; folders: DupFolder[] };

/**
 * Scan one vessel (or every vessel) for near-duplicate crew folders under
 * Yacht/{vessel}/Crew Documents. Read-only — it changes nothing.
 */
export const scanDuplicateCrewFolders = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: { vesselName?: string | null };
  }): Promise<{ groups: DupGroup[]; vesselsScanned: number; error?: string }> => {
    try {
      const { token, siteId } = await spContext();
      const wanted = ctx.data?.vesselName ? sanitizeSegment(ctx.data.vesselName, "") : "";

      const vesselFolders = (await listFolderChildren(siteId, token, "Yacht"))
        .filter((c) => !!c.folder)
        .map((c) => String(c.name))
        .filter((n) => (wanted ? nameKey(n) === nameKey(wanted) : true));

      const groups: DupGroup[] = [];
      for (const vessel of vesselFolders) {
        const children = await listFolderChildren(siteId, token, `Yacht/${vessel}/Crew Documents`);
        const folders: DupFolder[] = children
          .filter((c) => !!c.folder)
          .map((c) => ({
            id: String(c.id),
            name: String(c.name),
            childCount: Number(c.folder?.childCount ?? 0),
            webUrl: (c.webUrl as string) ?? null,
            lastModified: (c.lastModifiedDateTime as string) ?? null,
          }));
        for (const g of groupSimilar(folders, (f) => f.name)) {
          // Busiest folder first — that's the one worth keeping.
          g.sort((a, b) => b.childCount - a.childCount);
          groups.push({ key: nameKey(g[0].name), vessel, folders: g });
        }
      }
      return { groups, vesselsScanned: vesselFolders.length };
    } catch (e) {
      return { groups: [], vesselsScanned: 0, error: e instanceof Error ? e.message : "Scan failed" };
    }
  });

// ── Merge ────────────────────────────────────────────────────────────────────

/**
 * Move every item out of `fromFolderId` into `intoFolderId`, then delete the
 * emptied folder. Items are MOVED (Graph PATCH parentReference), so nothing is
 * copied or destroyed. A name clash is resolved by suffixing the moved file
 * rather than overwriting the one already there.
 */
export const mergeCrewFolders = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: { intoFolderId: string; fromFolderId: string; deleteEmptied?: boolean };
  }): Promise<{ moved: number; skipped: string[]; removedFolder: boolean; error?: string }> => {
    const { intoFolderId, fromFolderId, deleteEmptied = true } = ctx.data;
    const skipped: string[] = [];
    let moved = 0;
    try {
      if (!intoFolderId || !fromFolderId) throw new Error("Both folders are required");
      if (intoFolderId === fromFolderId) throw new Error("Cannot merge a folder into itself");
      const { token, siteId } = await spContext();
      const base = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items`;
      const auth = { Authorization: `Bearer ${token}` };

      // Children of the folder being merged away.
      const res = await fetch(`${base}/${fromFolderId}/children?%24top=500&%24select=id,name,folder,file`, { headers: auth });
      if (!res.ok) throw new Error(`Could not read the folder being merged (${res.status})`);
      const items = ((await res.json()) as Record<string, any>).value ?? [];

      // Names already present in the destination, to detect clashes.
      const destRes = await fetch(`${base}/${intoFolderId}/children?%24top=500&%24select=id,name`, { headers: auth });
      const destNames = new Set<string>(
        destRes.ok ? (((await destRes.json()) as Record<string, any>).value ?? []).map((d: any) => String(d.name).toLowerCase()) : [],
      );

      for (const it of items as Record<string, any>[]) {
        const name = String(it.name);
        let target = name;
        if (destNames.has(name.toLowerCase())) {
          const dot = name.lastIndexOf(".");
          const stem = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          target = `${stem} (merged)${ext}`;
        }
        const patch = await fetch(`${base}/${it.id}`, {
          method: "PATCH",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ parentReference: { id: intoFolderId }, name: target }),
        });
        if (patch.ok) { moved++; destNames.add(target.toLowerCase()); }
        else skipped.push(`${name} (${patch.status})`);
      }

      // Only remove the folder once it is genuinely empty.
      let removedFolder = false;
      if (deleteEmptied && skipped.length === 0) {
        const check = await fetch(`${base}/${fromFolderId}/children?%24top=1&%24select=id`, { headers: auth });
        const left = check.ok ? (((await check.json()) as Record<string, any>).value ?? []).length : 1;
        if (left === 0) {
          const del = await fetch(`${base}/${fromFolderId}`, { method: "DELETE", headers: auth });
          removedFolder = del.ok;
        }
      }
      return { moved, skipped, removedFolder };
    } catch (e) {
      return { moved, skipped, removedFolder: false, error: e instanceof Error ? e.message : "Merge failed" };
    }
  });
