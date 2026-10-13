/** The Master's declaration for VAT zero-rating: JLS's own wording, pre-filled only with what JLS knows. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";
import { declarationPrefill, declarationDate, declarationReceived } from "../master-declaration";
import { shapeForVessel } from "../../portal/bunkering";

const be = new FakeBackend();
let srv: typeof import("../master-declaration.server");
before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  srv = await import("../master-declaration.server");
});
after(async () => { await be.stop(); });

/** Everything the PDF draws as one string (page content is compressed; text is hex or literal). */
function drawn(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  let all = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { try { all += inflateSync(Buffer.from(m[1], "latin1")).toString("latin1") + "\n"; } catch { /* not compressed */ } }
  return all.replace(/<([0-9A-Fa-f]+)>/g, (_, h: string) => Buffer.from(h, "hex").toString("latin1"));
}

test("the form carries JLS's own wording and every field of the declaration", async () => {
  const t = drawn(await srv.buildMasterDeclaration());
  for (const s of ["JLS YACHTS LLC", "DECLARATION FOR INTERNATIONAL TRANSPORTATION", "Article (45) clause (7)", "Cabinet Decision No. (52) of 2017", "Zero rating of VAT",
    "Ship arrival date:", "Date of bunker supply:", "Port of bunker supply:", "Name of Ship:", "IMO number:", "Last port of call:", "Load port (if other than last port):",
    "Next Port of call:", "Final destination port (if next port is in UAE):", "Transporting passengers or goods", "Sailing within the United Arab Emirates Territorial waters",
    "Name of Master:", "Signature:", "Date:", "Ship Stamp:", "bunker delivery receipt"]) assert.ok(t.includes(s), `missing: ${s}`);
});

test("it is pre-filled with the enquiry's facts, and only those", async () => {
  const t = drawn(await srv.buildMasterDeclaration(declarationPrefill({
    yacht_name: "MY MANGO", imo_no: "1011331", preferred_date: "2026-10-30", delivered_date: null, port: "Mina Rashid", berth: "Coastal Berth 2", captain_name: "John Smit", departure_date: "2026-11-01",
  })));
  assert.ok(t.includes("MY MANGO"));
  assert.ok(t.includes("1011331"));
  assert.ok(t.includes("30 Oct 2026"));
  assert.ok(t.includes("Mina Rashid"));
  assert.ok(t.includes("John Smit"));
});

test("the Master's own statements are never filled in for them: no category ticked, no signature, no date", () => {
  const p = declarationPrefill({ yacht_name: "X", departure_date: "2026-11-01" });
  assert.deepEqual(Object.keys(p).sort(), ["bunkerDate", "departureDate", "imo", "masterName", "portOfSupply", "shipName"], "nothing like a tick, signature or signing date exists to fill");
});

test("the delivery date is used once the fuel has been delivered; before that, the preferred date", () => {
  assert.equal(declarationPrefill({ preferred_date: "2026-10-30" }).bunkerDate, "2026-10-30");
  assert.equal(declarationPrefill({ preferred_date: "2026-10-30", delivered_date: "2026-10-31" }).bunkerDate, "2026-10-31");
  assert.equal(declarationPrefill(null).shipName, "");
  assert.equal(declarationDate("2026-10-30"), "30 Oct 2026");
  assert.equal(declarationDate(""), "");
  assert.equal(declarationDate("garbage"), "");
});

test("text the standard fonts can't draw becomes '?' instead of breaking the PDF", async () => {
  assert.equal(srv.pdfSafe("Yacht ŠŠ 船 name"), "Yacht ?? ? name");
  const bytes = await srv.buildMasterDeclaration({ shipName: "神戸 MY MANGO", masterName: "Zoë Müller" });
  assert.ok(bytes.length > 1000, "still produced a PDF");
  assert.ok(drawn(bytes).includes("MY MANGO"));
});

test("an overlong value doesn't break the form", async () => {
  const bytes = await srv.buildMasterDeclaration({ portOfSupply: "X".repeat(400) });
  assert.ok(bytes.length > 1000);
});

test("the signed declaration counts as received only when one is filed under that document type", () => {
  assert.equal(declarationReceived([]), false);
  assert.equal(declarationReceived([{ doc_type: "Quotation" }, { doc_type: "Signed form" }]), false);
  assert.equal(declarationReceived([{ doc_type: "Quotation" }, { doc_type: "Master declaration" }]), true);
});

test("the vessel is told whether its declaration has been received — and is never handed the signed file itself", () => {
  const e: any = { id: "e1", number: "BNK1", status: "approved", yacht_name: "X", port: null, berth: null, preferred_date: "2026-10-30", preferred_time: null, sails_out_of_uae: "yes", departure_date: "2026-11-01",
    fuel_type: "ULSMGO", fuel_other: null, quantity: 1, quantity_unit: "MT", spec_notes: null, delivery_method: null, special_requirements: null, declared_by_role: null, declared_by_name: null,
    declared_at: null, declaration_method: null, approved_quote_id: null, approved_by_role: null, approved_by_name: null, approved_at: null, approval_method: null,
    delivered_date: null, delivered_quantity: null, delivered_unit: null, bdn_number: null, created_at: "2026-10-13T00:00:00Z" };
  assert.equal(shapeForVessel(e, [], [], [], { canSeeFinance: true }).declarationReceived, false);
  const got = shapeForVessel(e, [], [], [{ name: "signed.pdf", doc_type: "Master declaration", url: "https://x/signed" }], { canSeeFinance: true, declarationReceived: true });
  assert.equal(got.declarationReceived, true);
  assert.deepEqual(got.documents, [], "the signed file is not listed for the vessel");
});
