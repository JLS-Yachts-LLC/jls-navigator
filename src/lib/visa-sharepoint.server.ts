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

// Server-relative site path + root folder. Overridable via the `sharepoint`
// integration_settings config (visa_site_url / visa_root_folder) if needed.
const DEFAULT_VISA_SITE_URL = "/sites/PortOperationsandAgency";
const DEFAULT_VISA_ROOT_FOLDER = "Crew Visas";

/** SharePoint forbids " * : < > ? / \ | in file/folder names. */
function sanitizeSegment(s: string | null | undefined, fallback: string): string {
  const cleaned = (s ?? "")
    .replace(/["*:<>?/\\|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Create a folder under `parentPath` (drive-root-relative), ignoring "already exists". */
async function ensureFolder(siteId: string, token: string, parentPath: string, name: string): Promise<void> {
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
async function uploadIntoFolders(
  siteId: string, token: string, folderSegments: string[], fileName: string, contentType: string, base64: string,
): Promise<{ webUrl: string | null }> {
  let accumulated = "";
  for (const seg of folderSegments) {
    await ensureFolder(siteId, token, accumulated, seg);
    accumulated = accumulated ? `${accumulated}/${seg}` : seg;
  }
  const safeFile = sanitizeSegment(fileName, "document");
  const fullPath = `${accumulated}/${safeFile}`;
  const bytes = base64ToBytes(base64);
  const uploadRes = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(fullPath)}:/content`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType || "application/octet-stream" },
      body: bytes,
    },
  );
  if (!uploadRes.ok) {
    const err = (await uploadRes.json().catch(() => ({}))) as Record<string, any>;
    throw new Error(`SharePoint upload failed: ${err?.error?.message ?? uploadRes.statusText}`);
  }
  const created = (await uploadRes.json()) as Record<string, any>;
  return { webUrl: created.webUrl ?? null };
}

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

    const vessel = sanitizeSegment(vesselName, "Unassigned Vessel");
    const crew = sanitizeSegment(crewName, "Unknown Crew");
    // Shared Documents/Yacht/{vessel}/Crew Documents/{crew}/{file}
    return uploadIntoFolders(siteId, token, ["Yacht", vessel, "Crew Documents", crew], fileName, contentType, base64);
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
        body: bytes,
      },
    );
    if (!uploadRes.ok) {
      const err = (await uploadRes.json().catch(() => ({}))) as Record<string, any>;
      throw new Error(`SharePoint upload failed: ${err?.error?.message ?? uploadRes.statusText}`);
    }
    const created = (await uploadRes.json()) as Record<string, any>;
    return { webUrl: created.webUrl ?? null };
  });
