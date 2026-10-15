/**
 * Signature Campaigns — a recipient's "pack": one or more documents (e-Sign
 * templates and/or Anchor forms) merged into ONE PDF, so the vessel signs and
 * stamps once. Each part keeps its own signature spots, shifted to where its
 * pages land in the merged file. Server-only (DMA forms render through Graph).
 */
import { PDFDocument } from "pdf-lib";
import { getFormDef, type FormDef } from "@/lib/anchor-forms/definitions";
import { buildFormPdf, buildFormPdfDetailed } from "@/lib/anchor-forms/pdf.server";
import { generateDmaPdf } from "@/lib/anchor-forms/dma-docx.server";
import { generateCf12aPdf } from "@/lib/anchor-forms/cf12a-pdf.server";
import { AGENT_KEYS, formFieldKeys } from "@/lib/anchor-forms/prefill";

const BUCKET = "esign-documents";

/** One document in a pack, as stored on esign_documents.pack. */
export type PackPart =
  | { kind: "template"; key: string; title: string; signs: true; file_path: string; fields: any[] }
  | { kind: "form"; key: string; title: string; signs: boolean; values: Record<string, string> };

/** Does the vessel sign this form? (DMA notices are signed by JLS as agent.) */
export const vesselSigns = (def: FormDef) => def.signedBy !== "agent";

/** Render one form with its values. Official layouts first; plain fallback. */
export async function buildFormPart(def: FormDef, values: Record<string, unknown>): Promise<{ bytes: Uint8Array; fields: any[] }> {
  if (def.key === "cf12a") {
    try { return { bytes: await generateCf12aPdf(values), fields: [] }; }
    catch { return { bytes: await buildFormPdf(def, values), fields: [] }; }
  }
  if (def.key.startsWith("dma-")) {
    try { return { bytes: await generateDmaPdf(def.key, values, def.title), fields: [] }; }
    catch { return { bytes: await buildFormPdf(def, values), fields: [] }; }
  }
  const { bytes, signature } = await buildFormPdfDetailed(def, values);
  return { bytes, fields: signature ? [{ page: signature.page, x: signature.x, y: signature.y, role: "client", label: false }] : [] };
}

async function partPdf(sb: any, part: PackPart): Promise<{ bytes: Uint8Array; fields: any[] }> {
  if (part.kind === "template") {
    const { data: blob, error } = await sb.storage.from(BUCKET).download(part.file_path);
    if (error || !blob) throw new Error(`Could not load “${part.title}”`);
    return { bytes: new Uint8Array(await blob.arrayBuffer()), fields: part.fields ?? [] };
  }
  const def = getFormDef(part.key);
  if (!def) throw new Error(`Unknown form “${part.key}”`);
  return buildFormPart(def, part.values ?? {});
}

/**
 * Build the merged pack. Returns the PDF, the signature spots for every part the
 * vessel signs (pages shifted into the merged file), and each part's own PDF
 * (so completed forms can be filed back into Anchor Forms).
 */
export async function buildPackPdf(sb: any, parts: PackPart[]): Promise<{ bytes: Uint8Array; fields: any[]; partBytes: Uint8Array[] }> {
  const built = [];
  for (const p of parts) built.push(await partPdf(sb, p));
  const partBytes = built.map((b) => b.bytes);

  // A single document is sent as-is (keeps a fillable form fillable).
  if (parts.length === 1) {
    return { bytes: built[0].bytes, fields: parts[0].signs ? built[0].fields : [], partBytes };
  }

  const out = await PDFDocument.create();
  const fields: any[] = [];
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    const src = await PDFDocument.load(built[i].bytes, { ignoreEncryption: true });
    // Form fields don't survive being copied into another file — flatten them
    // so what was filled in is printed on the page.
    try { const form = src.getForm(); if (form.getFields().length) form.flatten(); } catch { /* no form */ }
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
    if (parts[i].signs) for (const f of built[i].fields) fields.push({ ...f, page: (Number(f.page) || 1) + offset });
    offset += pages.length;
  }
  return { bytes: await out.save(), fields, partBytes };
}

/**
 * Merge what the signer typed into a pack's forms. Only real fields of each
 * form are taken, JLS's own agent details can't be changed, and values are
 * trimmed to a sane length. Returns the updated parts and any required fields
 * still empty.
 */
export function applySignerValues(parts: PackPart[], input: Record<string, Record<string, unknown>> | undefined) {
  const missing: string[] = [];
  const next = parts.map((p, i) => {
    if (p.kind !== "form") return p;
    const def = getFormDef(p.key);
    if (!def) return p;
    const keys = formFieldKeys(def);
    const values = { ...(p.values ?? {}) };
    for (const [k, v] of Object.entries(input?.[String(i)] ?? {})) {
      if (!keys.has(k) || AGENT_KEYS.has(k)) continue;
      values[k] = String(v ?? "").slice(0, 2000).trim();
    }
    for (const f of def.sections.flatMap((s) => s.fields)) {
      if (f.required && !String(values[f.key] ?? "").trim()) missing.push(`${def.title}: ${f.label}`);
    }
    return { ...p, values };
  });
  return { parts: next, missing };
}
