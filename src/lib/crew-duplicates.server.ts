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
import { nameKey, listFolderChildren, sanitizeSegment } from "@/lib/visa-sharepoint.server";

const DEFAULT_SITE_URL = "/sites/PortOperationsandAgency";

async function spContext(): Promise<{ token: string; siteId: string }> {
  const cfg = await getSpConfig();
  const siteUrl = (cfg as unknown as Record<string, any>).visaSiteUrl ?? cfg.siteUrl ?? DEFAULT_SITE_URL;
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSpSite(token, cfg.tenantUrl, siteUrl);
  return { token, siteId };
}

// ── Fuzzy name similarity ────────────────────────────────────────────────────

/** Levenshtein distance, capped by early exit on the cheap length check. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * 0–1 similarity between two people's names, order-insensitive.
 *
 * Compares the sorted word sets so "Cavor Jovan" scores the same as "Jovan
 * Cavor", and takes the better of (whole-string ratio, shared-word ratio) so an
 * extra middle name or a "(Deck)" suffix doesn't sink an obvious match.
 */
export function nameSimilarity(a: string, b: string): number {
  const ka = nameKey(a), kb = nameKey(b);
  if (!ka || !kb) return 0;
  if (ka === kb) return 1;

  const wa = ka.split(" ").filter(Boolean), wb = kb.split(" ").filter(Boolean);
  const sortedA = [...wa].sort().join(" "), sortedB = [...wb].sort().join(" ");
  const maxLen = Math.max(sortedA.length, sortedB.length);
  const whole = maxLen ? 1 - levenshtein(sortedA, sortedB) / maxLen : 0;

  // Shared-word ratio against the SHORTER name, so "Jovan Cavor" vs
  // "Jovan James Cavor" scores 1.0 on this measure.
  const setB = new Set(wb);
  const shared = wa.filter((w) => setB.has(w)).length;
  const words = shared / Math.max(1, Math.min(wa.length, wb.length));

  // A single shared word ("John" vs "John Smith") is far too weak on its own.
  const wordScore = shared >= 2 || (shared === 1 && Math.min(wa.length, wb.length) === 1) ? words : words * 0.5;
  return Math.max(whole, wordScore);
}

/** Group names whose similarity meets the threshold. Returns only real groups (≥2). */
export function groupSimilar<T>(
  items: T[], label: (t: T) => string, threshold = 0.82,
): T[][] {
  const groups: T[][] = [];
  const used = new Set<number>();
  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;
    const group = [items[i]];
    used.add(i);
    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;
      // Compare against every member so a chain (A~B, B~C) lands in one group.
      if (group.some((g) => nameSimilarity(label(g), label(items[j])) >= threshold)) {
        group.push(items[j]);
        used.add(j);
      }
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

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
