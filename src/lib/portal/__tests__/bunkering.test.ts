/** What a vessel sees of its bunkering enquiries: shared quotations only, no internal notes, prices only for finance positions. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeForVessel, type RawEnquiry, type RawQuote, type RawEvent } from "../bunkering";
import { SECTION_FEATURE, PORTAL_MODULES } from "../portal-modules";
import { hiddenSections } from "../portal-positions";

const enquiry = (over: Partial<RawEnquiry> = {}): RawEnquiry => ({
  id: "e1", number: "BNK0001", status: "awaiting_vessel", yacht_name: "MY MANGO", port: "Mina Rashid", berth: "Coastal Berth 2",
  preferred_date: "2026-10-30", preferred_time: "06:00:00", fuel_type: "MGO / DMA", fuel_other: null, quantity: 25, quantity_unit: "MT",
  spec_notes: "0.1% S", delivery_method: "Bunker barge", special_requirements: null,
  declared_by_role: "Captain", declared_by_name: "John Smit", declared_at: "2026-10-13T08:00:00Z", declaration_method: "Email confirmation",
  approved_quote_id: null, approved_by_role: null, approved_by_name: null, approved_at: null, approval_method: null,
  delivered_date: null, delivered_quantity: null, delivered_unit: null, bdn_number: null, created_at: "2026-10-13T07:00:00Z", ...over,
});
const quote = (over: Partial<RawQuote> = {}): RawQuote => ({
  id: "q1", supplier: "Gulf Bunkers", quote_ref: "GB-77", fuel_type: "MGO / DMA", quantity: 25, quantity_unit: "MT", unit_price: 820, price_unit: "per MT",
  currency: "USD", total: 20500, valid_until: "2026-10-20", delivery_terms: "Ex-barge", status: "received", shared_with_vessel: true, ...over,
});

test("only quotations the team has shared are shown — an unshared one (another supplier's price, a margin) never reaches the vessel", () => {
  const out = shapeForVessel(enquiry(), [quote(), quote({ id: "q2", supplier: "Secret Supplier", shared_with_vessel: false })], [], [], { canSeeFinance: true });
  assert.deepEqual(out.quotations.map((q) => q.supplier), ["Gulf Bunkers"]);
  assert.ok(!JSON.stringify(out).includes("Secret Supplier"));
});

test("a quotation still waiting for a price is not shown, even if shared", () => {
  const out = shapeForVessel(enquiry(), [quote({ status: "requested" })], [], [], { canSeeFinance: true });
  assert.equal(out.quotations.length, 0);
});

test("prices and totals are only sent to positions that see the vessel's finance", () => {
  const withMoney = shapeForVessel(enquiry(), [quote()], [], [], { canSeeFinance: true }).quotations[0];
  assert.equal(withMoney.unitPrice, 820);
  assert.equal(withMoney.total, 20500);
  const without = shapeForVessel(enquiry(), [quote()], [], [], { canSeeFinance: false }).quotations[0];
  assert.equal(without.unitPrice, null);
  assert.equal(without.total, null);
  assert.equal(without.supplier, "Gulf Bunkers", "the rest of the quotation is still shown");
});

test("the approved quotation is marked, and the approval and delivery are reported", () => {
  const e = enquiry({ status: "delivered", approved_quote_id: "q1", approved_by_name: "Kenny Jones", approved_by_role: "Chief Engineer", approved_at: "2026-10-14T09:00:00Z", approval_method: "WhatsApp confirmation",
    delivered_date: "2026-10-30", delivered_quantity: 24.8, delivered_unit: "MT", bdn_number: "BDN-77" });
  const out = shapeForVessel(e, [quote({ status: "approved" }), quote({ id: "q2", supplier: "Emirates Fuel", status: "rejected" })], [], [], { canSeeFinance: true });
  assert.equal(out.quotations.find((q) => q.supplier === "Gulf Bunkers")!.approved, true);
  assert.equal(out.quotations.find((q) => q.supplier === "Emirates Fuel")!.approved, false);
  assert.deepEqual([out.approval!.by, out.approval!.role], ["Kenny Jones", "Chief Engineer"]);
  assert.deepEqual([out.delivery!.quantity, out.delivery!.unit, out.delivery!.bdn], [24.8, "Metric tonnes (MT)", "BDN-77"]);
});

test("the vessel's timeline shows milestones only — comments, quotation edits and file uploads stay internal", () => {
  const events: RawEvent[] = [
    { kind: "created", actor_name: "Sam", to_status: null, created_at: "2026-10-13T07:00:00Z" },
    { kind: "comment", actor_name: "Hilary", to_status: null, created_at: "2026-10-13T07:30:00Z" },
    { kind: "quote", actor_name: "Hilary", to_status: null, created_at: "2026-10-13T08:00:00Z" },
    { kind: "file", actor_name: "Hilary", to_status: null, created_at: "2026-10-13T08:05:00Z" },
    { kind: "status", actor_name: "Hilary", to_status: "quotes_requested", created_at: "2026-10-13T09:00:00Z" },
  ];
  const out = shapeForVessel(enquiry(), [], events, [], { canSeeFinance: true });
  assert.deepEqual(out.timeline.map((t) => t.label), ["Enquiry logged", "Quotes requested"]);
  assert.ok(!JSON.stringify(out).includes("Sam") && !JSON.stringify(out).includes("Hilary"), "no staff names");
});

test("internal notes and who logged it are never part of what the vessel receives", () => {
  const raw = { ...enquiry(), notes: "INTERNAL: they always haggle", created_by_name: "Sam", cancel_reason: "internal reason" } as unknown as RawEnquiry;
  const text = JSON.stringify(shapeForVessel(raw, [quote({ ...({ notes: "margin 8%" } as object) })], [], [], { canSeeFinance: true }));
  assert.ok(!text.includes("INTERNAL"));
  assert.ok(!text.includes("haggle"));
  assert.ok(!text.includes("margin 8%"));
  assert.ok(!text.includes("internal reason"));
});

test("only the bunker delivery note is given to the vessel as a document", () => {
  const out = shapeForVessel(enquiry(), [], [], [
    { name: "quote.pdf", doc_type: "Quotation", url: "https://x/quote" },
    { name: "BDN.pdf", doc_type: "Bunker delivery note", url: "https://x/bdn" },
    { name: "chat.png", doc_type: "Vessel confirmation", url: "https://x/chat" },
  ], { canSeeFinance: true });
  assert.deepEqual(out.documents, [{ name: "BDN.pdf", url: "https://x/bdn" }]);
});

test("an enquiry that is 'Other' fuel shows the fuel named, and a vessel that hasn't confirmed shows no confirmation", () => {
  const out = shapeForVessel(enquiry({ fuel_type: "Other", fuel_other: "Biofuel B30", declared_by_name: null, declared_by_role: null }), [], [], [], { canSeeFinance: true });
  assert.equal(out.fuel, "Biofuel B30");
  assert.equal(out.confirmation, null);
});

test("Bunkering is a portal section vessels have on by default, hidden from interior crew", () => {
  assert.deepEqual(SECTION_FEATURE.bunkering, { module: "core", feature: "bunkering" });
  assert.ok(PORTAL_MODULES.core.features.some((f) => f.key === "bunkering"));
  assert.equal(hiddenSections("captain").has("bunkering"), false);
  assert.equal(hiddenSections("chief_officer").has("bunkering"), false);
  assert.equal(hiddenSections("chef").has("bunkering"), true);
  assert.equal(hiddenSections("chief_stewardess").has("bunkering"), true);
});
