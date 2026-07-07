/**
 * Create (idempotent) the "Templates - Polaris" folder in the Port Operations &
 * Agency SharePoint site's Documents library and upload the app's source templates
 * into it, so all Polaris templates have a single home on SharePoint.
 *   POST /api/admin/seed-templates-folder
 * Re-runnable: the folder is left as-is if it exists; files are upserted.
 */
import { getSpConfig, getGraphToken, resolveSpSite } from "@/lib/sharepoint-sync.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DMA_ARRIVAL_B64, DMA_DEPARTURE_B64 } from "@/lib/anchor-forms/dma-templates";
import { CF12A_TEMPLATE_B64 } from "@/lib/anchor-forms/cf12a-template";
import { VISA_ARRIVAL_DOC } from "@/lib/visa/arrival-instructions";

const SITE_URL = "/sites/PortOperationsandAgency";
const FOLDER = "Templates - Polaris";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function ensureFolder(siteId: string, token: string, name: string): Promise<void> {
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    if (err?.error?.code !== "nameAlreadyExists") throw new Error(err?.error?.message ?? res.statusText);
  }
}

async function uploadFile(siteId: string, token: string, fileName: string, contentType: string, bytes: Uint8Array): Promise<string | null> {
  const path = `${FOLDER}/${fileName}`;
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(path)}:/content`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
    body: bytes as unknown as BodyInit,
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(`upload ${fileName}: ${err?.error?.message ?? res.statusText}`);
  }
  return ((await res.json()) as any).webUrl ?? null;
}

export async function seedTemplatesFolderHandler(_request: Request): Promise<Response> {
  try {
    const cfg = await getSpConfig();
    const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
    const siteId = await resolveSpSite(token, cfg.tenantUrl, SITE_URL);
    await ensureFolder(siteId, token, FOLDER);

    // The UAE Arrival Instructions live in storage; the rest are embedded templates.
    let arrivalB64 = "";
    const { data: arrival } = await (supabaseAdmin as any).storage.from(VISA_ARRIVAL_DOC.bucket).download(VISA_ARRIVAL_DOC.path);
    if (arrival) {
      const buf = new Uint8Array(await arrival.arrayBuffer());
      let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
      arrivalB64 = btoa(bin);
    }

    const files: { name: string; type: string; b64: string }[] = [
      { name: "DMA - Notice of Arrival (template).docx", type: DOCX, b64: DMA_ARRIVAL_B64 },
      { name: "DMA - Notice of Departure (template).docx", type: DOCX, b64: DMA_DEPARTURE_B64 },
      { name: "DMA CF12a - Visiting Vessel Permit Application (template).pdf", type: "application/pdf", b64: CF12A_TEMPLATE_B64 },
      ...(arrivalB64 ? [{ name: VISA_ARRIVAL_DOC.filename, type: "application/pdf", b64: arrivalB64 }] : []),
    ];

    // In-app text templates (Crew Placement contracts/payslips) — exported as .txt
    // so the SharePoint folder mirrors what's editable in the app. Re-run this
    // endpoint (fired automatically on template save) to refresh them.
    const { data: cpTemplates } = await (supabaseAdmin as any)
      .from("crew_placement_templates").select("name, kind, body").order("kind");
    const sanitize = (s: string) => s.replace(/["*:<>?/\\|]/g, "-").trim().slice(0, 100);
    for (const t of (cpTemplates ?? [])) {
      if (!t?.name) continue;
      const bytes = new TextEncoder().encode(String(t.body ?? ""));
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      files.push({
        name: `Crew Placement - ${sanitize(t.name)} (${t.kind ?? "template"}).txt`,
        type: "text/plain",
        b64: btoa(bin),
      });
    }

    const uploaded: { name: string; webUrl: string | null }[] = [];
    for (const f of files) {
      const webUrl = await uploadFile(siteId, token, f.name, f.type, b64ToBytes(f.b64));
      uploaded.push({ name: f.name, webUrl });
    }
    return json({ ok: true, folder: FOLDER, site: SITE_URL, uploaded });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
}
