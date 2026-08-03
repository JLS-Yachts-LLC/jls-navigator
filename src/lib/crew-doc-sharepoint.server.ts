/**
 * Crew Documents card ⇄ SharePoint.
 *
 * The Documents card on a crew profile is Polaris-first: files live in Supabase
 * storage, and are *optionally* mirrored into the crew member's SharePoint
 * folder at
 *   Shared Documents / Yacht / {vessel} / Crew Documents / {crew member}
 * which is the same tree the visa uploads and crew verification letters use.
 *
 * These functions let the card
 *   • show which files are already in SharePoint (read-only listing),
 *   • create a subfolder there so a Polaris folder has a SharePoint twin,
 *   • push one stored file on demand (bytes read server-side, never via the
 *     browser), recording the mirror in crew_document_sharepoint_links so the
 *     "in SharePoint" badge is a fact rather than a filename guess.
 *
 * Runs on the Cloudflare Worker — has access to the integration secrets.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSpConfig, getGraphToken, resolveSpSite } from "@/lib/sharepoint-sync.server";
import {
  sanitizeSegment, ensureFoldersAndGetUrl, uploadBytesIntoFolders,
} from "@/lib/visa-sharepoint.server";

const DEFAULT_SITE_URL = "/sites/PortOperationsandAgency";

/** Shared setup for every crew-folder call: config → token → site id. */
async function crewSpContext(): Promise<{ token: string; siteId: string }> {
  const cfg = await getSpConfig();
  const siteUrl = (cfg as unknown as Record<string, any>).visaSiteUrl ?? cfg.siteUrl ?? DEFAULT_SITE_URL;
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSpSite(token, cfg.tenantUrl, siteUrl);
  return { token, siteId };
}

/** Case- and accent-insensitive key: "JOVAN ČAVOR" and "Jovan Cavor" must match. */
const nameKey = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * SharePoint folder names were typed by hand over years — accents, casing and
 * spacing drift from what Polaris holds ("JOVAN ČAVOR" vs "Jovan Cavor"). Look
 * for an existing child folder that matches on a normalised key and return its
 * REAL name, so we read from and write into the folder staff already use instead
 * of creating a near-duplicate beside it.
 */
async function resolveChildFolder(
  siteId: string, token: string, parentPath: string, wanted: string,
): Promise<string | null> {
  const want = nameKey(wanted);
  if (!want) return null;
  const children = await listChildren(siteId, token, parentPath);
  const folders = children.filter((c) => !!c.folder);

  // Accent/case-insensitive match. Duplicates like "Jovan Cavor" AND "JOVAN ČAVOR"
  // both exist in places, and Graph's listing order used to decide the winner at
  // random — which is how a file landed in an empty twin while staff were looking
  // at the folder holding everything. Rank the candidates instead.
  const sameKey = folders.filter((c) => nameKey(String(c.name)) === want);
  if (sameKey.length) return String(pickBest(sameKey, wanted).name);

  // Fall back to a folder containing every word of the name (handles "Jovan
  // Cavor (Deck)" and reversed first/last name orders).
  const words = want.split(" ").filter((w) => w.length > 1);
  const loose = words.length
    ? folders.filter((c) => { const k = nameKey(String(c.name)); return words.every((w) => k.includes(w)); })
    : [];
  return loose.length ? String(pickBest(loose, wanted).name) : null;
}

/** Of several candidate folders, the one already in real use: most items first,
 *  then an exact name match, then most recently modified. Choosing the busiest
 *  folder keeps a crew member's documents together instead of splitting them
 *  across near-identical folders. */
function pickBest(folders: Record<string, any>[], wanted: string): Record<string, any> {
  const want = wanted.toLowerCase();
  return [...folders].sort((a, b) => {
    const ca = Number(a.folder?.childCount ?? 0), cb = Number(b.folder?.childCount ?? 0);
    if (cb !== ca) return cb - ca;
    const la = String(a.name).toLowerCase() === want ? 1 : 0;
    const lb = String(b.name).toLowerCase() === want ? 1 : 0;
    if (lb !== la) return lb - la;
    return String(b.lastModifiedDateTime ?? "").localeCompare(String(a.lastModifiedDateTime ?? ""));
  })[0];
}

const crewSegments = (vesselName: string | null, crewName: string) => [
  "Yacht",
  sanitizeSegment(vesselName, "Unassigned Vessel"),
  "Crew Documents",
  sanitizeSegment(crewName, "Unknown Crew"),
];

/**
 * The crew member's real folder path, matching existing SharePoint folders where
 * the names only differ by accent/case. Returns the sanitised path unchanged when
 * nothing comparable exists (so a push creates it).
 */
async function resolveCrewPath(
  siteId: string, token: string, vesselName: string | null, crewName: string,
): Promise<{ segments: string[]; found: boolean }> {
  const segments = crewSegments(vesselName, crewName);
  const vessel = await resolveChildFolder(siteId, token, "Yacht", segments[1]);
  if (!vessel) return { segments, found: false };
  segments[1] = vessel;
  const crew = await resolveChildFolder(siteId, token, `Yacht/${vessel}/Crew Documents`, segments[3]);
  if (!crew) return { segments, found: false };
  segments[3] = crew;
  return { segments, found: true };
}

/** GET a drive item by path. Returns null on 404 instead of throwing. */
async function getItemByPath(siteId: string, token: string, path: string): Promise<Record<string, any> | null> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(path)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  return (await res.json()) as Record<string, any>;
}

async function listChildren(siteId: string, token: string, path: string): Promise<Record<string, any>[]> {
  const select = "id,name,size,webUrl,folder,file,lastModifiedDateTime";
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(path)}:/children?%24top=200&%24select=${select}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as Record<string, any>;
  return (body.value ?? []) as Record<string, any>[];
}

export type SpCrewItem = {
  id: string;
  name: string;
  /** Subfolder the file sits in, or null when it is at the top of the crew folder. */
  folder: string | null;
  isFolder: boolean;
  webUrl: string | null;
  size: number | null;
  lastModified: string | null;
};

/**
 * READ-ONLY listing of a crew member's SharePoint folder — top level plus one
 * level of subfolders (matching how deep Polaris folders go). Creates nothing:
 * a crew member with no folder yet comes back `exists: false`, which the card
 * renders as "not in SharePoint" rather than as an error.
 */
export const listCrewSharePointFolder = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: { vesselName: string | null; crewName: string };
  }): Promise<{ exists: boolean; webUrl: string | null; items: SpCrewItem[]; error?: string }> => {
    const { vesselName, crewName } = ctx.data;
    try {
      const { token, siteId } = await crewSpContext();
      const { segments, found } = await resolveCrewPath(siteId, token, vesselName, crewName);
      if (!found) return { exists: false, webUrl: null, items: [] };
      const base = segments.join("/");
      const root = await getItemByPath(siteId, token, base);
      if (!root) return { exists: false, webUrl: null, items: [] };

      const items: SpCrewItem[] = [];
      for (const it of await listChildren(siteId, token, base)) {
        const isFolder = !!it.folder;
        items.push({
          id: String(it.id), name: String(it.name), folder: null, isFolder,
          webUrl: it.webUrl ?? null, size: it.size ?? null, lastModified: it.lastModifiedDateTime ?? null,
        });
        if (!isFolder) continue;
        for (const child of await listChildren(siteId, token, `${base}/${it.name}`)) {
          items.push({
            id: String(child.id), name: String(child.name), folder: String(it.name), isFolder: !!child.folder,
            webUrl: child.webUrl ?? null, size: child.size ?? null, lastModified: child.lastModifiedDateTime ?? null,
          });
        }
      }
      return { exists: true, webUrl: root.webUrl ?? null, items };
    } catch (e: any) {
      // SharePoint being unreachable must never break the Documents card.
      return { exists: false, webUrl: null, items: [], error: e?.message ?? String(e) };
    }
  });

/** Create a subfolder in the crew folder so a Polaris folder has a SharePoint twin. */
export const createCrewSharePointFolder = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: { vesselName: string | null; crewName: string; folderName: string };
  }): Promise<{ ok: boolean; webUrl: string | null; error?: string }> => {
    const { vesselName, crewName, folderName } = ctx.data;
    try {
      const { token, siteId } = await crewSpContext();
      const { segments } = await resolveCrewPath(siteId, token, vesselName, crewName);
      return {
        ok: true,
        webUrl: await ensureFoldersAndGetUrl(siteId, token, [...segments, sanitizeSegment(folderName, "New folder")]),
      };
    } catch (e: any) {
      return { ok: false, webUrl: null, error: e?.message ?? String(e) };
    }
  });

/** "<bucket>/<path>" out of a stored value (full storage URL or bare path). */
function parseStoredRef(stored: string): { bucket: string; path: string } | null {
  if (!stored) return null;
  const m = stored.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (m) return { bucket: m[1], path: decodeURIComponent(m[2]) };
  if (/^https?:\/\//i.test(stored)) return null;
  const bare = stored.replace(/^\/+/, "");
  const slash = bare.indexOf("/");
  if (slash > 0) return { bucket: bare.slice(0, slash), path: bare.slice(slash + 1) };
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  heic: "image/heic", webp: "image/webp", gif: "image/gif", txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const contentTypeFor = (name: string) =>
  CONTENT_TYPES[(name.split(".").pop() ?? "").toLowerCase()] ?? "application/octet-stream";

/**
 * Push ONE already-stored Polaris document into the crew's SharePoint folder
 * (into `subfolder` when the document sits in a Polaris folder), then record the
 * mirror so the badge is accurate. Bytes are read from Supabase storage
 * server-side — nothing round-trips through the browser.
 */
export const pushCrewDocToSharePoint = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: {
      crewId: string; docKey: string; vesselName: string | null; crewName: string;
      stored: string; fileName: string; subfolder?: string | null;
    };
  }): Promise<{ ok: boolean; webUrl: string | null; name?: string | null; error?: string }> => {
    const { crewId, docKey, vesselName, crewName, stored, fileName, subfolder } = ctx.data;
    try {
      const ref = parseStoredRef(stored);
      if (!ref) return { ok: false, webUrl: null, error: "This file is not held in Polaris storage, so there is nothing to upload." };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: blob, error: dlErr } = await supabaseAdmin.storage.from(ref.bucket).download(ref.path);
      if (dlErr || !blob) {
        return { ok: false, webUrl: null, error: `Could not read the file from Polaris storage: ${dlErr?.message ?? "not found"}` };
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());

      const { token, siteId } = await crewSpContext();
      const { segments } = await resolveCrewPath(siteId, token, vesselName, crewName);
      if (subfolder) segments.push(sanitizeSegment(subfolder, "Folder"));

      const safeName = sanitizeSegment(fileName, "document");
      const up = await uploadBytesIntoFolders(siteId, token, segments, safeName, contentTypeFor(safeName), bytes);

      await (supabaseAdmin as any).from("crew_document_sharepoint_links").upsert(
        {
          crew_member_id: crewId, doc_key: docKey,
          sp_item_id: up.id, sp_name: up.name, web_url: up.webUrl,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: "crew_member_id,doc_key" },
      );
      return { ok: true, webUrl: up.webUrl, name: up.name };
    } catch (e: any) {
      return { ok: false, webUrl: null, error: e?.message ?? String(e) };
    }
  });
