/**
 * POLARIS — Crew Verification letter generation.
 *
 * When a crew member has no Seaman's book, generate the JLS Crew Verification
 * letter (Arabic/English) for their passport:
 *   1. fill the tokenised .docx template with the crew/passport/vessel data,
 *   2. upload the .docx to the crew member's SharePoint folder (the write-back),
 *   3. convert it to PDF via Microsoft Graph (Office server-side rendering — the
 *      only reliable way to render the Arabic RTL letter),
 *   4. store the PDF in Supabase storage + write it back to SharePoint,
 *   5. save the PDF URL onto the passport so the UI download slot lights up.
 *
 * Requires Graph Files.ReadWrite.All / Sites.ReadWrite.All (granted).
 */

import { createServerFn } from "@tanstack/react-start";
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getSpConfig, getGraphToken, resolveSpSite } from "@/lib/sharepoint-sync.server";
import { CREW_VERIFICATION_TEMPLATE_B64 } from "@/lib/visa/crewVerificationTemplate";

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toArabicDigits = (s: string) => s.replace(/[0-9]/g, (d) => AR_DIGITS[+d]);

/** Date shown as English + Arabic-Indic, e.g. "22-Jun-2026  ٢٢-٠٦-٢٠٢٦". */
function formatDualDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const en = `${dd}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
  const ar = toArabicDigits(`${dd}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`);
  return `${en}  ${ar}`;
}

const b64ToU8 = (b64: string) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};
const u8ToB64 = (u8: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
};

export interface CrewVerificationData {
  fullName: string;
  passportNumber: string;
  nationality: string;
  vesselName: string;
  officialNo: string;
  date?: Date;
}

/** Fill the tokenised template and return the .docx bytes. */
export function fillCrewVerificationDocx(data: CrewVerificationData): Uint8Array {
  const files = unzipSync(b64ToU8(CREW_VERIFICATION_TEMPLATE_B64));
  let doc = strFromU8(files["word/document.xml"]);
  const map: Record<string, string> = {
    "{{DATE}}": xmlEscape(formatDualDate(data.date ?? new Date())),
    "{{YACHT_NAME}}": xmlEscape(data.vesselName || ""),
    "{{OFFICIAL_NO}}": xmlEscape(data.officialNo || ""),
    "{{NAME}}": xmlEscape(data.fullName || ""),
    "{{NATIONALITY}}": xmlEscape(data.nationality || ""),
    "{{PASSPORT_NO}}": xmlEscape(data.passportNumber || ""),
  };
  for (const [tok, val] of Object.entries(map)) doc = doc.split(tok).join(val);
  files["word/document.xml"] = strToU8(doc);
  return zipSync(files, { level: 6 });
}

const sanitize = (s: string) => (s || "").replace(/["*:<>?/\\|]/g, " ").replace(/\s+/g, " ").trim() || "Unknown";

async function ensureFolder(siteId: string, token: string, parentRef: string, name: string) {
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/drive/${parentRef}/children`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "replace" }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as any;
    if (!String(err?.error?.message ?? "").includes("already exist")) {
      throw new Error(`SharePoint folder "${name}" failed: ${err?.error?.message ?? res.statusText}`);
    }
  }
}

/** Upload bytes to drive-root/{segments}/{fileName}, creating folders. Returns the item id. */
async function uploadToFolders(
  siteId: string, token: string, segments: string[], fileName: string, contentType: string, bytes: Uint8Array,
): Promise<{ id: string; webUrl: string }> {
  let pathSoFar = "";
  for (const seg of segments) {
    const parentRef = pathSoFar ? `root:/${encodeURI(pathSoFar)}:` : "root";
    await ensureFolder(siteId, token, parentRef, seg);
    pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
  }
  const fullPath = `${pathSoFar}/${fileName}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(fullPath)}:/content`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType }, body: bytes as any },
  );
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as any;
    throw new Error(`SharePoint upload failed: ${err?.error?.message ?? res.statusText}`);
  }
  const created = (await res.json()) as any;
  return { id: created.id, webUrl: created.webUrl };
}

/**
 * Download a drive item converted to PDF via Graph.
 * Graph 302-redirects to a pre-signed download URL; that URL must be fetched
 * WITHOUT the Authorization header (re-sending it makes the storage host reject
 * with HTTP 406/401). So we intercept the redirect and fetch the location clean.
 */
async function convertItemToPdf(siteId: string, token: string, itemId: string): Promise<Uint8Array> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${itemId}/content?format=pdf`;
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" }, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc) {
        const pdfRes = await fetch(loc, { headers: { Accept: "application/pdf" } }); // pre-signed — no auth
        if (pdfRes.ok) return new Uint8Array(await pdfRes.arrayBuffer());
        lastErr = `download HTTP ${pdfRes.status}: ${(await pdfRes.text().catch(() => "")).slice(0, 150)}`;
      } else lastErr = "redirect with no location";
    } else if (res.ok) {
      return new Uint8Array(await res.arrayBuffer());
    } else {
      lastErr = `convert HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 150)}`;
    }
    await sleep(1500); // transient (file not ready / conversion warming up)
  }
  throw new Error(`Graph PDF conversion failed — ${lastErr}`);
}

/** The full generate → upload → convert → store → write-back pipeline. */
export async function generateCrewVerificationLetter(
  data: CrewVerificationData & { crewId: string; passportId: string },
): Promise<{ pdfUrl: string; pdfWarning: string | null }> {
  const cfg = await getSpConfig();
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl);

  const docx = fillCrewVerificationDocx(data);
  const folder = ["Yacht", sanitize(data.vesselName), "Crew Documents", sanitize(data.fullName)];
  const stamp = new Date().toISOString().slice(0, 10);
  const docxName = `Crew Verification Letter ${stamp}.docx`;

  // 1. Upload the filled .docx to the crew folder (write-back) → get item id.
  const docItem = await uploadToFolders(
    siteId, token, folder, docxName,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx,
  );

  // 2. Convert to PDF via Graph. If conversion fails (Graph can be picky about the
  //    re-zipped .docx), fall back to serving the .docx so there's always a working
  //    downloadable letter — and surface the PDF error for diagnosis.
  const DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  let bytes: Uint8Array = docx;
  let ext = "docx";
  let contentType = DOCX_CT;
  let pdfWarning: string | null = null;
  try {
    bytes = await convertItemToPdf(siteId, token, docItem.id);
    ext = "pdf";
    contentType = "application/pdf";
    await uploadToFolders(siteId, token, folder, `Crew Verification Letter ${stamp}.pdf`, "application/pdf", bytes);
  } catch (e: any) {
    pdfWarning = e?.message ?? "PDF conversion failed";
    console.error("[crew-verification] PDF conversion failed, serving .docx:", pdfWarning);
  }

  // 3. Store in Supabase storage for in-app download.
  const storagePath = `crew/${data.crewId}/crew-verification-${Date.now()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from("permit-documents").upload(storagePath, bytes, { upsert: true, contentType });
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);
  const fileUrl = supabaseAdmin.storage.from("permit-documents").getPublicUrl(storagePath).data.publicUrl;

  // 4. Save the URL onto the passport so the UI download slot appears.
  await (supabaseAdmin as any).from("crew_passports")
    .update({ crew_verification_letter_url: fileUrl }).eq("id", data.passportId);

  // 5. Also file the passport documents into the same SharePoint crew folder, so
  //    the folder holds the full set (cover, inside pages, headshot, seaman's book).
  //    Best-effort — never fail the letter over a doc push.
  try {
    const { data: pp } = await (supabaseAdmin as any)
      .from("crew_passports").select("document_url, cover_url, headshot_url, seamans_book_url").eq("id", data.passportId).maybeSingle();
    const extFromUrl = (u: string) => (u.split("?")[0].split(".").pop() || "bin").slice(0, 5);
    const pushes: { label: string; url: string | null }[] = [
      { label: "Passport - Front Cover", url: pp?.cover_url },
      { label: "Passport - Inside Pages", url: pp?.document_url },
      { label: "Headshot", url: pp?.headshot_url },
      { label: "Seamans Book", url: pp?.seamans_book_url },
    ];
    for (const p of pushes) {
      if (!p.url) continue;
      const r = await fetch(p.url);
      if (!r.ok) continue;
      const ct = r.headers.get("content-type") ?? "application/octet-stream";
      await uploadToFolders(siteId, token, folder, `${p.label}.${extFromUrl(p.url)}`, ct, new Uint8Array(await r.arrayBuffer()));
    }
  } catch (e) {
    console.error("[crew-verification] passport doc push to SharePoint failed:", e);
  }

  return { pdfUrl: fileUrl, pdfWarning };
}

/**
 * Worker API route — POST /api/crew/verification-letter
 * Used instead of a serverFn import so this server-only module (supabaseAdmin,
 * fflate, the embedded template, Graph) never enters the client bundle.
 */
export async function crewVerificationHandler(request: Request): Promise<Response> {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  // Authenticate the caller.
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);
  const { data: { user }, error: aErr } = await (supabaseAdmin as any).auth.getUser(auth.slice(7));
  if (aErr || !user) return json({ ok: false, error: "Unauthorized" }, 401);

  let d: any;
  try { d = await request.json(); } catch { return json({ ok: false, error: "Invalid body" }, 400); }
  if (!d?.crewId || !d?.passportId || !d?.vesselName) {
    return json({ ok: false, error: "crewId, passportId and vesselName are required" }, 400);
  }
  try {
    let officialNo = d.officialNo ?? "";
    if (!officialNo && d.vesselName) {
      const { data: y } = await (supabaseAdmin as any)
        .from("yachts").select("official_no").ilike("vessel_name", d.vesselName).maybeSingle();
      officialNo = y?.official_no ?? "";
    }
    const { pdfUrl, pdfWarning } = await generateCrewVerificationLetter({
      crewId: d.crewId, passportId: d.passportId,
      fullName: d.fullName ?? "", passportNumber: d.passportNumber ?? "", nationality: d.nationality ?? "",
      vesselName: d.vesselName, officialNo,
    });
    // If PDF conversion fell back to .docx, log the reason so it's diagnosable.
    if (pdfWarning) {
      try {
        await (supabaseAdmin as any).from("client_logs").insert({
          level: "warn", message: `Crew verification letter served as .docx (PDF conversion failed): ${pdfWarning}`,
          source: "api/crew/verification-letter", user_id: user.id, user_email: user.email ?? null,
        });
      } catch { /* non-fatal */ }
    }
    return json({ ok: true, pdfUrl, pdfWarning });
  } catch (e: any) {
    const msg = e?.message ?? "Generation failed";
    // Surface server-side failures in the Error & Warning Log for diagnosis.
    try {
      await (supabaseAdmin as any).from("client_logs").insert({
        level: "error", message: `Crew verification letter generation failed: ${msg}`,
        source: "api/crew/verification-letter", stack: e?.stack ? String(e.stack).slice(0, 4000) : null,
        user_id: user.id, user_email: user.email ?? null,
      });
    } catch { /* non-fatal */ }
    return json({ ok: false, error: msg }, 500);
  }
}

export const doGenerateCrewVerification = createServerFn({ method: "POST" })
  // @ts-expect-error — TanStack Start v1 serverFn handler typing
  .handler(async (ctx: {
    data: { crewId: string; passportId: string; fullName: string; passportNumber: string;
            nationality: string; vesselName: string; officialNo?: string };
  }): Promise<{ ok: boolean; pdfUrl?: string; error?: string }> => {
    const d = ctx.data;
    try {
      // Fill in officialNo from the yacht record if not supplied.
      let officialNo = d.officialNo ?? "";
      if (!officialNo && d.vesselName) {
        const { data: y } = await (supabaseAdmin as any)
          .from("yachts").select("official_no").ilike("vessel_name", d.vesselName).maybeSingle();
        officialNo = y?.official_no ?? "";
      }
      const { pdfUrl } = await generateCrewVerificationLetter({
        crewId: d.crewId, passportId: d.passportId,
        fullName: d.fullName, passportNumber: d.passportNumber, nationality: d.nationality,
        vesselName: d.vesselName, officialNo,
      });
      return { ok: true, pdfUrl };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Generation failed" };
    }
  });
