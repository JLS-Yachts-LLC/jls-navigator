/**
 * Authority-exact bilingual (EN/AR) DMA Notice of Arrival / Departure.
 *
 * The DMA templates are Word documents whose fill points are the default
 * content-control text "Click or tap here to enter text." (contiguous in
 * document.xml). We fill them positionally, then convert to PDF via Microsoft
 * Graph (Office server-side rendering — the only reliable way to render the
 * Arabic RTL layout). Mirrors the crew-verification letter pipeline.
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import { getSpConfig, getGraphToken, resolveSpSite } from "@/lib/sharepoint-sync.server";
import { uploadToFolders, convertItemToPdf } from "@/lib/crew-verification.server";
import { DMA_ARRIVAL_B64, DMA_DEPARTURE_B64 } from "@/lib/anchor-forms/dma-templates";

const PLACEHOLDER = "Click or tap here to enter text.";
const DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const AGENCY = "JLS Yachts LLC";
const TRADE_LICENSE = "698719";

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const b64ToU8 = (b64: string) => {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
};

/** The ordered list of values, one per placeholder, in document order. Anything
 *  we don't have is left blank (the authority template tolerates blanks). */
function orderedValues(formKey: string, v: Record<string, any>): string[] {
  const s = (k: string) => (v[k] == null ? "" : String(v[k]));
  if (formKey === "dma-notice-of-departure") {
    // 19 placeholders.
    return [
      s("vessel_name"), s("vessel_flag"), s("loa"), s("imo"), s("mmsi"), s("persons_onboard"),
      s("etd_date"), s("etd_time"), s("marina_departure"), s("berth"), s("agent_details"), s("contact_number"),
      s("email"), s("next_destination"),
      s("vessel_name"), AGENCY, AGENCY, TRADE_LICENSE, s("signatory_name") || "Michael Fetton",
    ];
  }
  // Arrival — 17 placeholders (IMO has no control; agency block is hard-coded in this template).
  return [
    s("vessel_name"), s("vessel_flag"), s("loa"), s("mmsi"), s("last_port"), s("persons_onboard"),
    s("eta_date"), s("eta_time"), s("marina_arrival"), s("berth"), s("agent_details"), s("contact_number"),
    s("email"), s("purpose"), s("duration"),
    s("vessel_name"), AGENCY,
  ];
}

/** Fill the DMA template positionally and return the .docx bytes. */
export function fillDmaDocx(formKey: string, values: Record<string, any>): Uint8Array {
  const b64 = formKey === "dma-notice-of-departure" ? DMA_DEPARTURE_B64 : DMA_ARRIVAL_B64;
  const files = unzipSync(b64ToU8(b64));
  const doc = strFromU8(files["word/document.xml"]);
  const parts = doc.split(PLACEHOLDER);
  const vals = orderedValues(formKey, values);
  let out = parts[0];
  for (let i = 1; i < parts.length; i++) out += xmlEscape(String(vals[i - 1] ?? "")) + parts[i];
  files["word/document.xml"] = strToU8(out);
  return zipSync(files, { level: 6 });
}

/**
 * The agent's "Stamp & Signature" box on the rendered DMA PDF — measured from
 * Graph's output, as fractions of the page from the top-left (the centre of
 * the box). On the Departure notice the box is at the foot of page 2; on the
 * Arrival notice it doesn't fit and Word carries it to the top of page 3.
 *
 * If a long answer pushes the layout onto a different number of pages, the
 * box has moved and we don't know where to — no spot, and the signature goes
 * on the certificate page only rather than over the form's text.
 */
const DMA_SIGNATURE_BOX: Record<string, { pages: number; x: number; y: number }> = {
  "dma-notice-of-departure": { pages: 2, x: 0.256, y: 0.848 },
  "dma-notice-of-arrival": { pages: 3, x: 0.258, y: 0.126 },
};

export function dmaSignatureFields(formKey: string, pageCount: number): any[] {
  const box = DMA_SIGNATURE_BOX[formKey];
  if (!box || box.pages !== pageCount) return [];
  return [{ page: box.pages, x: box.x, y: box.y, role: "client", label: false }];
}

/** Generate the bilingual DMA PDF via Graph. Returns PDF bytes (throws on failure). */
export async function generateDmaPdf(formKey: string, values: Record<string, any>, title: string): Promise<Uint8Array> {
  const cfg = await getSpConfig();
  const token = await getGraphToken(cfg.tenantId, cfg.clientId, cfg.clientSecret);
  const siteId = await resolveSpSite(token, cfg.tenantUrl, cfg.siteUrl);
  const docx = fillDmaDocx(formKey, values);
  const safe = (title || "DMA Notice").replace(/["*:<>?/\\|]/g, " ").trim();
  const item = await uploadToFolders(siteId, token, ["DMA Notices"], `${safe} ${Date.now()}.docx`, DOCX_CT, docx);
  return convertItemToPdf(siteId, token, item.id);
}
