/** The Bunker Delivery Note: JLS's sheet as a PDF, pre-filled from the approved enquiry. */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";
import { bdnGrade, bdnPrefill, bdnUom, BDN_DECLARATION } from "../bdn";

const be = new FakeBackend();
let srv: typeof import("../bdn.server");
before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  srv = await import("../bdn.server");
});
after(async () => { await be.stop(); });

function drawn(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  let all = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) { try { all += inflateSync(Buffer.from(m[1], "latin1")).toString("latin1") + "\n"; } catch { /* not compressed */ } }
  return all.replace(/<([0-9A-Fa-f]+)>/g, (_, h: string) => Buffer.from(h, "hex").toString("latin1"));
}

test("the grades come from the sheet's own list, and our fuel names map onto them", () => {
  assert.deepEqual(bdnGrade("MGO / DMA"), { grade: "MGO", description: "Marine Gas Oil", maxSulphur: "1000ppm" });
  assert.equal(bdnGrade("ULSMGO").maxSulphur, "(sulfur 0.001% max)");
  assert.equal(bdnGrade("LSMGO").grade, "LSMGO");
  assert.equal(bdnGrade("VLSFO").grade, "VLSFO", "not on the sheet's list, so described in full");
  assert.equal(bdnGrade("Other", "Biofuel B30").grade, "Biofuel B30");
  assert.equal(bdnUom("MT"), "MT");
  assert.equal(bdnUom("USG"), "US gal");
});

test("the approved quotation's fuel, quantity and supplier win over the original request", () => {
  const p = bdnPrefill(
    { yacht_name: "MY MANGO", flag: "Marshall Islands", imo_no: "1011331", loa_m: 60, port: "Mina Rashid", berth: "Coastal Berth 2", fuel_type: "MGO / DMA", quantity: 25, quantity_unit: "MT", delivery_method: "Road tanker", spec_notes: "0.1% S" },
    { supplier: "Gulf Bunkers", supplier_phone: "04 123 4567", supplier_contact: "Ali", fuel_type: "ULSMGO", quantity: 20, quantity_unit: "MT" },
  );
  assert.equal(p.grade, "ULSMGO");
  assert.equal(p.maxQty, "20");
  assert.equal(p.supplierName, "Gulf Bunkers");
  assert.equal(p.supplierContact, "Ali · 04 123 4567");
  assert.equal(p.deliveryMethodTick, "Ex-Truck", "a road tanker is the sheet's Ex-Truck");
  assert.equal(p.vesselName, "MY MANGO");
  assert.equal(p.deliveryPort, "Mina Rashid");
});

test("with no approved quotation it falls back to what was requested; a bunker barge isn't ticked as Ex-Wharf or Ex-Truck", () => {
  const p = bdnPrefill({ yacht_name: "X", fuel_type: "VLSFO", quantity: 100, quantity_unit: "MT", delivery_method: "Bunker barge" }, null);
  assert.equal(p.grade, "VLSFO");
  assert.equal(p.maxQty, "100");
  assert.equal(p.deliveryMethodTick, "");
  assert.equal(p.deliveryMethodText, "Bunker barge");
  assert.equal(p.supplierName, "");
});

test("the delivered quantity and the BDN number appear once recorded", () => {
  const p = bdnPrefill({ yacht_name: "X", bdn_number: "BDN-77", delivered_quantity: 24.8, delivered_unit: "MT" }, null);
  assert.equal(p.bdnNumber, "BDN-77");
  assert.equal(p.deliveredQty, "24.8 MT");
});

test("the note carries every section of JLS's sheet, with the MARPOL declaration word for word", async () => {
  const t = drawn(await srv.buildBunkerDeliveryNote());
  for (const s of ["BUNKER DELIVERY NOTE", "BDN No.", "PTW No.", "Receiving Vessel's Particulars", "Vessel Name", "IMO No.", "Official No.", "Draft (m)", "Delivery Port", "Berth No.",
    "Adaptor (Male)", "Coupler (Female)", "Fwd", "Mid", "Aft", "Bunker Fuel Requirement", "Fuel Grade", "Max. Sulfur Cont.", "Min. Qty", "Max. Qty", "UoM", "Bunker Rate / Hour",
    "Ex-Wharf", "Ex-Truck", "Berth Alongside", "Bunker Supplier", "Driver Name", "Tanker No.", "Tanker Capacity", "Bunker Delivery Log", "Alongside", "Bunker Commence", "Bunker Complete",
    "Viscosity @ 50 C (cSt)", "Sulfur Content (% m/m)", "Flash Point (C)", "Density @ 15 C (kg/m3)", "Delivered (Mt.)", "Declaration", "Vessel Stamp", "Supplier Stamp", "Master / Ch. Eng.", "Supplier Name"]) {
    assert.ok(t.includes(s), `missing: ${s}`);
  }
  assert.ok(t.includes("regulation 18.3 of MARPOL Annex VI"));
  assert.ok(t.includes("regulation 14.4 of MARPOL Annex VI"));
  assert.ok(BDN_DECLARATION.options.length === 3);
});

test("the vessel and supplier details are printed when known, and a missing value doesn't break the page", async () => {
  const filled = drawn(await srv.buildBunkerDeliveryNote(bdnPrefill({ yacht_name: "MY MANGO", imo_no: "1011331", port: "Mina Rashid", berth: "Coastal Berth 2", fuel_type: "MGO / DMA", quantity: 25, quantity_unit: "MT" }, { supplier: "Gulf Bunkers" })));
  for (const s of ["MY MANGO", "1011331", "Mina Rashid", "Coastal Berth 2", "Marine Gas Oil", "Gulf Bunkers"]) assert.ok(filled.includes(s), `missing: ${s}`);
  const odd = await srv.buildBunkerDeliveryNote({ vesselName: "神戸 " + "X".repeat(300) });
  assert.ok(odd.length > 1000);
});
