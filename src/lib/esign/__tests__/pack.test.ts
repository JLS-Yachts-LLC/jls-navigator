/** Campaign packs: forms pre-filled per vessel, several documents merged into one PDF signed once. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { getFormDef } from "../../anchor-forms/definitions";
import { prefillFor, AGENT_DEFAULTS } from "../../anchor-forms/prefill";

let pack: typeof import("../pack.server");
before(async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:1"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  pack = await import("../pack.server");
});

const yacht = {
  vessel_name: "M/Y Mango", flag: "Cayman Islands", imo_no: "1011331", length_overall_m: 60, mmsi: "319000000",
  gross_tonnage: 499, owners_name: "Mango Holdings", email_address: "owner@mango.example", eta: "2099-01-05",
};

/** A stand-in for supabase storage: one template PDF of `pages` pages. */
async function fakeSb(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  const bytes = await doc.save();
  return { storage: { from: () => ({ download: async () => ({ data: new Blob([bytes as BlobPart]), error: null }) }) } };
}

test("a form is pre-filled from the vessel record, the recipient and JLS's agent details", () => {
  const def = getFormDef("pre-arrival-cruising-permit")!;
  const v = prefillFor(def, { yacht, recipient: { name: "John Smit", email: "captain@mango.example", role: "Captain" } });
  assert.equal(v.vessel_name, "M/Y Mango");
  assert.equal(v.imo, "1011331");
  assert.equal(v.owner_name, "Mango Holdings");
  assert.equal(v.captain_name, "John Smit");
  assert.equal(v.captain_email, "captain@mango.example");
  assert.equal(v.arrival_date, "2099-01-05"); // a planned ETA still ahead
});

test("campaign-wide staff values fill the gaps but never replace a vessel's own details or JLS's", () => {
  const def = getFormDef("dma-notice-of-arrival")!;
  const v = prefillFor(def, { yacht, staffValues: { vessel_name: "WRONG", agent_details: "WRONG", last_port: "Muscat", eta_date: "2099-02-01" } });
  assert.equal(v.vessel_name, "M/Y Mango");
  assert.equal(v.agent_details, AGENT_DEFAULTS.agent_details);
  assert.equal(v.last_port, "Muscat");
  assert.equal(v.eta_date, "2099-02-01"); // staff's planned date beats the record's ETA
});

test("the appointment letter drops the M/Y prefix the letter prints itself", () => {
  const v = prefillFor(getFormDef("agency-appointment-letter")!, { yacht, recipient: { name: "John Smit", role: "Owner's Representative" } });
  assert.equal(v.vessel_name, "Mango");
  assert.equal(v.signatory_name, "John Smit");
  assert.equal(v.signatory_title, "Owner's Representative");
});

test("the signer's answers are taken for real fields only, JLS's details stay, and required gaps are reported", () => {
  const parts: any[] = [
    { kind: "template", key: "t", title: "Tariff", signs: true, file_path: "x.pdf", fields: [] },
    { kind: "form", key: "dma-notice-of-arrival", title: "DMA — Notice of Arrival", signs: false, values: { agent_details: "JLS" } },
  ];
  const { parts: out, missing } = pack.applySignerValues(parts, { "1": { vessel_name: "Mango", agent_details: "HACKED", not_a_field: "x" } });
  const vals = (out[1] as any).values;
  assert.equal(vals.vessel_name, "Mango");
  assert.equal(vals.agent_details, "JLS");
  assert.equal("not_a_field" in vals, false);
  assert.ok(missing.some((m) => m.includes("Vessel's Flag")), missing.join(" | "));
  assert.ok(!missing.some((m) => m.includes("Vessel's Name")));
});

test("several documents merge into one PDF, with each signed document's spots moved to its pages", async () => {
  const sb = await fakeSb(3);
  const letter = getFormDef("agency-appointment-letter")!;
  const values = prefillFor(letter, { yacht, recipient: { name: "John Smit" } });
  const parts: any[] = [
    { kind: "template", key: "tariff", title: "Tariff", signs: true, file_path: "t.pdf", fields: [{ page: 3, x: 0.2, y: 0.7 }, { page: 3, x: 0.7, y: 0.65, type: "stamp" }] },
    { kind: "form", key: letter.key, title: letter.title, signs: true, values },
    { kind: "form", key: "cf12a", title: "CF12a", signs: true, values: prefillFor(getFormDef("cf12a")!, { yacht }) },
  ];
  const { bytes, fields, partBytes } = await pack.buildPackPdf(sb, parts);
  const merged = await PDFDocument.load(bytes);
  const letterPages = (await PDFDocument.load(partBytes[1])).getPageCount();
  const cfPages = (await PDFDocument.load(partBytes[2])).getPageCount();
  assert.equal(merged.getPageCount(), 3 + letterPages + cfPages);
  assert.deepEqual(fields.filter((f) => f.page === 3).length, 2, "the tariff's signature and stamp spots stay on page 3");
  const letterSig = fields.find((f) => f.page > 3);
  assert.ok(letterSig && letterSig.page >= 4 && letterSig.page <= 3 + letterPages, "the letter's signature spot moves past the tariff's pages");
  assert.equal(partBytes.length, 3);
});

test("a document JLS signs (DMA) contributes no vessel signature spot", async () => {
  const sb = await fakeSb(2);
  const { fields } = await pack.buildPackPdf(sb, [
    { kind: "template", key: "t", title: "T", signs: true, file_path: "t.pdf", fields: [{ page: 1, x: 0.5, y: 0.5 }] },
    { kind: "template", key: "u", title: "U", signs: false as any, file_path: "u.pdf", fields: [{ page: 1, x: 0.5, y: 0.5 }] },
  ]);
  assert.deepEqual(fields.map((f) => f.page), [1]);
});

test("one document on its own is passed through untouched (a fillable form stays fillable)", async () => {
  const cf = getFormDef("cf12a")!;
  const { bytes } = await pack.buildPackPdf(await fakeSb(1), [{ kind: "form", key: cf.key, title: cf.title, signs: true, values: prefillFor(cf, { yacht }) }]);
  const doc = await PDFDocument.load(bytes);
  assert.ok(doc.getForm().getFields().length > 0);
});
