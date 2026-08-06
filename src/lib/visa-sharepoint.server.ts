/**
 * Server-side upload of visa documents to SharePoint.
 *
 * Files are stored on the Port Operations & Agency site, under
 *   Documents (Shared Documents) / Crew Visas / {Vessel} / {Crew Member} / {file}
 *
 * Reuses the Azure app credentials already configured for the SharePoint sync
 * (tenant / client / secret), but targets the visa site below. The Azure app
 * registration must have Files.ReadWrite.All or Sites.ReadWrite.All.
 *
 * Runs on the Cloudflare Worker — has access to the integration secrets.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSpConfig, getGraphToken, resolveSpSite } from "@/lib/sharepoint-sync.server";
import { toTypeableName, nameKey } from "@/lib/crew-name-match";

// Server-relative site path + root folder. Overridable via the `sharepoint`
// integration_settings config (visa_site_url / visa_root_folder) if needed.
const DEFAULT_VISA_SITE_URL = "/sites/PortOperationsandAgency";
const DEFAULT_VISA_ROOT_FOLDER = "Crew Visas";

export { toTypeableName, nameKey };

/** SharePoint forbids " * : < > ? / \ | in file/folder names. Names are also
 *  folded to typeable ASCII (see toTypeableName), so passport OCR accents can
 *  never create a folder staff are unable to type or search for. */
export function sanitizeSegment(s: string | null | undefined, fallback: string): string {
  const cleaned = toTypeableName(s)
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

/** List a folder's children (empty array on any failure — callers treat that as
 *  "nothing comparable exists" and create the folder). */
export async function listFolderChildren(
  siteId: string, token: string, path: string,
): Promise<Record<string, any>[]> {
  const select = "id,name,size,webUrl,folder,file,lastModifiedDateTime";
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(path)}:/children?%24top=200&%24select=${select}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as Record<string, any>;
  return (body.value ?? []) as Record<string, any>[];
}

/** Of several candidate folders, the one already in real use: most items first,
 *  then an exact name match, then most recently modified. Choosing the busiest
 *  folder keeps a crew member's documents together instead of splitting them
 *  across near-identical folders. */
export function pickBestFolder(folders: Record<string, any>[], wanted: string): Record<string, any> {
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

/**
 * Find an existing child folder whose name matches `wanted` apart from accents,
 * casing or spacing, and return its REAL name — so we write into the folder staff
 * already use instead of creating a near-duplicate ("JOVAN ČAVOR" beside "Jovan
 * Cavor"). Returns null when nothing comparable exists.
 */
export async function resolveChildFolder(
  siteId: string, token: string, parentPath: string, wanted: string,
): Promise<string | null> {
  const want = nameKey(wanted);
  if (!want) return null;
  const folders = (await listFolderChildren(siteId, token, parentPath)).filter((c) => !!c.folder);

  const sameKey = folders.filter((c) => nameKey(String(c.name)) === want);
  if (sameKey.length) return String(pickBestFolder(sameKey, wanted).name);

  // Fall back to a folder containing every word of the name (handles "Jovan
  // Cavor (Deck)" and reversed first/last name orders).
  const words = want.split(" ").filter((w) => w.length > 1);
  const loose = words.length
    ? folders.filter((c) => { const k = nameKey(String(c.name)); return words.every((w) => k.includes(w)); })
    : [];
  return loose.length ? String(pickBestFolder(loose, wanted).name) : null;
}

export const crewFolderSegments = (vesselName: string | null, crewName: string) => [
  "Yacht",
  sanitizeSegment(vesselName, "Unassigned Vessel"),
  "Crew Documents",
  sanitizeSegment(crewName, "Unknown Crew"),
];

/**
 * The crew member's real folder path, matching existing SharePoint folders where
 * the names differ only by accent/case. Returns the sanitised path unchanged when
 * nothing comparable exists (so the caller creates it).
 */
export async function resolveCrewSegments(
  siteId: string, token: string, vesselName: string | null, crewName: string,
): Promise<{ segments: string[]; found: boolean }> {
  const segments = crewFolderSegments(vesselName, crewName);
  const vessel = await resolveChildFolder(siteId, token, "Yacht", segments[1]);
  if (!vessel) return { segments, found: false };
  segments[1] = vessel;
  const crew = await resolveChildFolder(siteId, token, `Yacht/${vessel}/Crew Documents`, segments[3]);
  if (!crew) return { segments, found: false };
  segments[3] = crew;
  return { segments, found: true };
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Create a folder under `parentPath` (drive-root-relative), ignoring "already exists". */
export async function ensureFolder(siteId: string, token: string, parentPath: string, name: string): Promise<void> {
  const parentRef = parentPath ? `root:/${encodeURI(parentPath)}:` : "root";
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/${parentRef}/children`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as Record<string, any>;
    const code = err?.error?.code;
    // "nameAlreadyExists" just means the folder is already there — fine.
    if (code !== "nameAlreadyExists") {
      throw new Error(`SharePoint folder "${name}" could not be created: ${err?.error?.message ?? res.statusText}`);
    }
  }
}

/** Upload bytes to `drive/root:/{folderPath}/{fileName}`, creating each folder. */
export async function uploadBytesIntoFolders(
  siteId: string, token: string, folderSegments: string[], fileName: string, contentType: string, bytes: Uint8Array,
): Promise<{ webUrl: string | null; id: string | null; name: string | null }> {
  let accumulated = "";
  for (const seg of folderSegments) {
    await ensureFolder(siteId, token, accumulated, seg);
    accumulated = accumulated ? `${accumulated}/${seg}` : seg;
  }
  const safeFile = sanitizeSegment(fileName, "document");
  const fullPath = `${accumulated}/${safeFile}`;
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(fullPath)}:/content`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType || "application/octet-stream" },
      body: bytes as unknown as BodyInit,
    },
  );
  if (!uploadRes.ok) {
    const err = (await uploadRes.json().catch(() => ({}))) as Record<string, any>;
    throw new Error(`SharePoint upload failed: ${err?.error?.message ?? uploadRes.statusText}`);
  }
  const created = (await uploadRes.json()) as Record<string, any>;
  return { webUrl: created.webUrl ?? null, id: created.id ?? null, name: created.name ?? safeFile };
}

async function uploadIntoFolders(
  siteId: string, token: string, folderSegments: string[], fileName: string, contentType: string, base64: string,
): Promise<{ webUrl: string | null }> {
  const { webUrl } = await uploadBytesIntoFolders(siteId, token, folderSegments, fileName, contentType, base64ToBytes(base64));
  return { webUrl };
}

/** Ensure a folder tree exists and return the deepest folder's webUrl (for linking). */
export async function ensureFoldersAndGetUrl(
  siteId: string, token: string, folderSegments: string[],
): Promise<string | null> {
  let accumulated = "";
  for (const seg of folderSegments) {
    await ensureFolder(siteId, token, accumulated, seg);
    accumulated = accumulated ? `${accumulated}/${seg}` : seg;
  }
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(accumulated)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const item = (await res.json()) as Record<string, any>;
  return item.webUrl ?? null;
}

/**
 * Resolve (creating if needed) the SharePoint folder for a crew member and return
 * a link to open it: Shared Documents / Yacht / {vessel} / Crew Documents / {crew}.
 */
export const getCrewSharePointFolderLink = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: { vesselName: string | null; crewName: string };
  }): Promise<{ webUrl: string | null }> => {
    const { vesselName, crewName } = ctx.data;
    const cfg = await getSpConfig();
    const anyCfg = cfg as unknown as Record<string, any>;
    const siteUrl = anyCfg.visaSiteUrl ?? DEFAULT_VISA_SITE_URL;
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
    const siteId = await resolveSpSite(token, cfg.tenantUrl, siteUrl);
    // Match the folder staff already use (accents/casing differ) rather than
    // creating a near-duplicate next to it.
    const { segments } = await resolveCrewSegments(siteId, token, vesselName, crewName);
    return { webUrl: await ensureFoldersAndGetUrl(siteId, token, segments) };
  });

/**
 * Mirror ANY crew document into SharePoint under:
 *   Shared Documents / Yacht / {vessel} / Crew Documents / {crew member} / {file}
 * (best-effort — the Supabase copy remains the source of truth).
 */
export const uploadCrewDocToSharePoint = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: { vesselName: string | null; crewName: string; fileName: string; contentType: string; base64: string };
  }): Promise<{ webUrl: string | null }> => {
    const { vesselName, crewName, fileName, contentType, base64 } = ctx.data;
    const cfg = await getSpConfig();
    const anyCfg = cfg as unknown as Record<string, any>;
    const siteUrl = anyCfg.visaSiteUrl ?? DEFAULT_VISA_SITE_URL;
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
    const siteId = await resolveSpSite(token, cfg.tenantUrl, siteUrl);

    // Shared Documents/Yacht/{vessel}/Crew Documents/{crew}/{file} — resolved
    // against the existing folder so a document never lands in an empty twin.
    const { segments } = await resolveCrewSegments(siteId, token, vesselName, crewName);
    return uploadIntoFolders(siteId, token, segments, fileName, contentType, base64);
  });

export const uploadVisaDocToSharePoint = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn type requires explicit ctx typing
  .handler(async (ctx: {
    data: {
      vesselName: string | null;
      crewName: string;
      fileName: string;
      contentType: string;
      base64: string;
    };
  }): Promise<{ webUrl: string | null }> => {
    const { vesselName, crewName, fileName, contentType, base64 } = ctx.data;

    const cfg = await getSpConfig();
    const anyCfg = cfg as unknown as Record<string, any>;
    const siteUrl = anyCfg.visaSiteUrl ?? DEFAULT_VISA_SITE_URL;
    const rootFolder = sanitizeSegment(anyCfg.visaRootFolder ?? DEFAULT_VISA_ROOT_FOLDER, "Crew Visas");

    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
    const siteId = await resolveSpSite(token, cfg.tenantUrl, siteUrl);

    const vessel = sanitizeSegment(vesselName, "Unassigned Vessel");
    const crew = sanitizeSegment(crewName, "Unknown Crew");
    const safeFile = sanitizeSegment(fileName, "document");

    // Build the folder tree: Crew Visas / {vessel} / {crew}
    await ensureFolder(siteId, token, "", rootFolder);
    await ensureFolder(siteId, token, rootFolder, vessel);
    await ensureFolder(siteId, token, `${rootFolder}/${vessel}`, crew);

    const fullPath = `${rootFolder}/${vessel}/${crew}/${safeFile}`;
    const bytes = base64ToBytes(base64);

    // Simple upload (suitable for files < 4 MB — ample for passports/photos/forms).
    const uploadRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(fullPath)}:/content`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType || "application/octet-stream" },
        body: bytes as unknown as BodyInit,
      },
    );
    if (!uploadRes.ok) {
      const err = (await uploadRes.json().catch(() => ({}))) as Record<string, any>;
      throw new Error(`SharePoint upload failed: ${err?.error?.message ?? uploadRes.statusText}`);
    }
    const created = (await uploadRes.json()) as Record<string, any>;
    return { webUrl: created.webUrl ?? null };
  });
