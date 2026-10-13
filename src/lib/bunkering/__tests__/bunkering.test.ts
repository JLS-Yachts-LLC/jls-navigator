/**
 * Bunkering enquiries: what an enquiry and a quotation must say, how totals are worked out, who may do what,
 * the vessel-confirmation gate, and that saving is all-or-nothing.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";
import {
  emptyEnquiry, enquiryProblems, enquiryPayload, emptyQuote, quoteProblems, quotePayload, quoteTotal, quantityDifference,
  allowedMoves, canSendToSuppliers, approvalProblems, priceUnitFor, matchYacht, type EnquiryForm, type QuoteForm,
} from "../model";

const be = new FakeBackend();
let data: typeof import("../data");
let mail: typeof import("../email.server");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  data = await import("../data");
  mail = await import("../email.server");
});
after(async () => { await be.stop(); });
beforeEach(() => be.reset());

const good = (over: Partial<EnquiryForm> = {}): EnquiryForm => ({
  ...emptyEnquiry(), yachtName: "MY MANGO", flag: "Marshall Islands", loa: "60", captain: "John Smit", chiefEngineer: "Kenny Jones",
  contactNumber: "7896451", contactEmail: "captain@mymango.com", port: "Mina Rashid", berth: "Coastal Berth 2", preferredDate: "2026-10-30", preferredTime: "06:00",
  fuelType: "MGO / DMA", quantity: "25", unit: "MT", ...over,
});
const goodQuote = (over: Partial<QuoteForm> = {}): QuoteForm => ({
  ...emptyQuote(), supplier: "Gulf Bunkers", status: "received", dateReceived: "2026-10-14", quantity: "25", unit: "MT", unitPrice: "820", priceUnit: "per MT", ...over,
});

// ── the enquiry ──────────────────────────────────────────────────────────────

test("a complete enquiry (Hilary's example: MY MANGO at Mina Rashid) has no problems", () => {
  assert.deepEqual(enquiryProblems(good()), []);
});

test("an enquiry needs the yacht, a way to reach it, the port, the date, the fuel and the quantity", () => {
  const p = (over: Partial<EnquiryForm>) => enquiryProblems(good(over));
  assert.ok(p({ yachtName: "" }).some((x) => /yacht name/.test(x)));
  assert.ok(p({ contactNumber: "", contactEmail: "" }).some((x) => /phone number|email/.test(x)));
  assert.deepEqual(p({ contactNumber: "", contactEmail: "c@y.com" }), [], "an email alone is enough");
  assert.ok(p({ contactEmail: "nope" }).some((x) => /email address does not look right/.test(x)));
  assert.ok(p({ port: "" }).some((x) => /port/.test(x)));
  assert.ok(p({ preferredDate: "" }).some((x) => /date/.test(x)));
  assert.ok(p({ fuelType: "" }).some((x) => /fuel type/.test(x)));
  assert.ok(p({ quantity: "" }).some((x) => /quantity/.test(x)));
  assert.ok(p({ quantity: "0" }).some((x) => /quantity/.test(x)));
  assert.ok(p({ loa: "sixty" }).some((x) => /length overall/.test(x)));
});

test("'Other' fuel needs saying which, and the name only travels when it is Other", () => {
  assert.ok(enquiryProblems(good({ fuelType: "Other" })).some((x) => /which/i.test(x)));
  assert.equal(enquiryPayload(good({ fuelType: "Other", fuelOther: "Biofuel B30" })).fuel_other, "Biofuel B30");
  assert.equal(enquiryPayload(good({ fuelType: "VLSFO", fuelOther: "left over" })).fuel_other, "");
});

test("the payload is trimmed, numbers are numbers, empty stays empty", () => {
  const p = enquiryPayload(good({ yachtName: "  MY MANGO  ", loa: "60,5", quantity: "1,250" }));
  assert.equal(p.yacht_name, "MY MANGO");
  assert.equal(p.loa_m, "60.5");
  assert.equal(p.quantity, "1250");
  assert.equal(p.imo_no, "");
});

// ── quotations ───────────────────────────────────────────────────────────────

test("a quotation's total is worked out only when the price matches the quantity's unit (or is a lump sum)", () => {
  assert.equal(quoteTotal("25", "MT", "820", "per MT"), 20500);
  assert.equal(quoteTotal("1000", "L", "0.95", "per litre"), 950);
  assert.equal(quoteTotal("25", "MT", "820.555", "per MT"), 20513.88, "rounded to the cent");
  assert.equal(quoteTotal("25", "MT", "0.95", "per litre"), null, "price per litre against tonnes can't be multiplied");
  assert.equal(quoteTotal("25", "MT", "20500", "lump sum"), 20500);
  assert.equal(quoteTotal("", "MT", "820", "per MT"), null);
  assert.equal(quoteTotal("25", "MT", "", "per MT"), null);
  assert.equal(priceUnitFor("USG"), "per US gallon");
});

test("a received quotation must carry what was quoted; a merely requested one only needs the supplier", () => {
  assert.deepEqual(quoteProblems(emptyQuote({ supplier: "Gulf Bunkers" })), []);
  assert.ok(quoteProblems(emptyQuote()).some((x) => /supplier/.test(x)));
  assert.deepEqual(quoteProblems(goodQuote()), []);
  assert.ok(quoteProblems(goodQuote({ quantity: "" })).some((x) => /quantity quoted/.test(x)));
  assert.ok(quoteProblems(goodQuote({ unitPrice: "" })).some((x) => /price quoted/.test(x)));
  assert.ok(quoteProblems(goodQuote({ dateReceived: "" })).some((x) => /date the quotation was received/.test(x)));
  assert.ok(quoteProblems(goodQuote({ priceUnit: "per litre" })).some((x) => /total/.test(x)), "a total is needed when it can't be worked out");
  assert.deepEqual(quoteProblems(goodQuote({ priceUnit: "per litre", total: "21000" })), []);
});

test("the stored quotation carries the worked-out total unless a total was typed", () => {
  assert.equal(quotePayload(goodQuote()).total, 20500);
  assert.equal(quotePayload(goodQuote({ total: "20000" })).total, 20000, "what the supplier quoted wins");
  assert.equal(quotePayload(emptyQuote({ supplier: "X" })).total, null);
});

test("a quantity that differs from what was asked is called out, so the vessel is told before approving", () => {
  assert.equal(quantityDifference(25, "MT", 25, "MT"), null);
  assert.equal(quantityDifference(25, "MT", 20, "MT"), "Quoted 20 MT against 25 requested");
  assert.match(quantityDifference(25, "MT", 25000, "L")!, /Quoted in Litres, requested in Metric tonnes/);
  assert.equal(quantityDifference(null, "MT", 20, "MT"), null);
});

// ── who may do what, and the gates ───────────────────────────────────────────

test("the Agency team can make any open move except approve/deliver (they have their own forms); the logger can only withdraw", () => {
  const ag = allowedMoves("new", { isAgency: true, isCreator: false });
  assert.deepEqual([...ag].sort(), ["awaiting_vessel", "cancelled", "quotes_received", "quotes_requested"]);
  assert.ok(!ag.includes("approved" as never) && !ag.includes("delivered" as never));
  assert.deepEqual(allowedMoves("new", { isAgency: false, isCreator: true }), ["cancelled"]);
  assert.deepEqual(allowedMoves("new", { isAgency: false, isCreator: false }), []);
  assert.deepEqual(allowedMoves("delivered", { isAgency: true, isCreator: true }), []);
  assert.deepEqual(allowedMoves("cancelled", { isAgency: true, isCreator: true }), []);
});

test("enquiries cannot go to suppliers until the Captain or Chief Engineer has confirmed the requirements", () => {
  assert.equal(canSendToSuppliers({ role: null, name: null }), false);
  assert.equal(canSendToSuppliers({ role: "Captain", name: "  " }), false);
  assert.equal(canSendToSuppliers({ role: "Captain", name: "John Smit" }), true);
});

test("an approval needs a received quotation, the Captain or Chief Engineer, a name and how it was confirmed", () => {
  const ok = { role: "Captain", name: "John Smit", method: "Email confirmation", quote: { status: "received" as const } };
  assert.deepEqual(approvalProblems(ok), []);
  assert.ok(approvalProblems({ ...ok, quote: null }).some((x) => /Choose the quotation/.test(x)));
  assert.ok(approvalProblems({ ...ok, quote: { status: "requested" } }).some((x) => /received quotation/.test(x)));
  assert.ok(approvalProblems({ ...ok, role: "Deckhand" }).some((x) => /Captain or the Chief Engineer/.test(x)));
  assert.ok(approvalProblems({ ...ok, name: "" }).some((x) => /name/.test(x)));
  assert.ok(approvalProblems({ ...ok, method: "" }).some((x) => /how it was confirmed/.test(x)));
});

// ── saving: files first, then ONE database call ─────────────────────────────

const pdf = () => ({ file: new File([new Uint8Array(500)], "request.pdf", { type: "application/pdf" }), kind: "document" as const, docType: "Vessel confirmation" });

test("an enquiry is saved by one database call carrying the uploaded files and, when given, the vessel's signed confirmation", async () => {
  let args: any = null;
  be.rpcs.set("create_bunker_enquiry", (a: any) => { args = a; return { id: "e1", number: "BNK0001", ...a.p }; });
  const sig = new Blob([new Uint8Array(300)], { type: "image/png" });
  const made = await data.createEnquiry(good(), [pdf()], { role: "Captain", name: "John Smit", method: "Signed on screen", signature: sig });
  assert.equal(made.number, "BNK0001");
  assert.equal(be.uploads.length, 2, "the file and the signature were uploaded first");
  assert.equal(args.p.yacht_name, "MY MANGO");
  assert.equal(args.p.declared_by_role, "Captain");
  assert.equal(args.p.declared_by_name, "John Smit");
  assert.match(args.p.declaration_signature_url, /^shipsync\/warehouse\/bunkering\//);
  assert.equal(args.p_files.length, 1);
  assert.equal(args.p_files[0].doc_type, "Vessel confirmation");
});

test("an enquiry logged without the vessel's confirmation carries no declaration", async () => {
  let args: any = null;
  be.rpcs.set("create_bunker_enquiry", (a: any) => { args = a; return { id: "e1", number: "BNK0002" }; });
  await data.createEnquiry(good(), [], null);
  assert.equal(args.p.declared_by_name, undefined);
});

test("if a file can't be uploaded nothing is saved; an enquiry with problems is refused before anything is uploaded", async () => {
  let called = false;
  be.rpcs.set("create_bunker_enquiry", () => { called = true; return {}; });
  be.faults.push({ match: /POST \/storage\/v1\/object\//, fault: 500 });
  await assert.rejects(data.createEnquiry(good(), [pdf()], null));
  assert.equal(called, false);
  be.reset();
  await assert.rejects(data.createEnquiry(good({ port: "" }), [pdf()], null), /port/);
  assert.equal(be.uploads.length, 0);
});

test("an approval with something missing is refused before the database is asked", async () => {
  let called = false;
  be.rpcs.set("bunker_approve_quote", () => { called = true; return {}; });
  const q: any = { id: "q1", status: "received", supplier: "X" };
  await assert.rejects(data.approveQuote("e1", q, { role: "Captain", name: "", method: "Email confirmation" }), /name/);
  await assert.rejects(data.approveQuote("e1", { ...q, status: "requested" }, { role: "Captain", name: "J", method: "Email confirmation" }), /received quotation/);
  assert.equal(called, false);
  await data.approveQuote("e1", q, { role: "Chief Engineer", name: "Kenny Jones", method: "WhatsApp confirmation" });
  assert.equal(called, true);
});

test("a stored enquiry turns back into form text so it can be changed", () => {
  const form = data.toEnquiryForm({ yacht_name: "MY MANGO", loa_m: 60, quantity: 25, quantity_unit: "MT", fuel_type: "VLSFO", port: "Mina Rashid", preferred_date: "2026-10-30" } as any);
  assert.equal(form.yachtName, "MY MANGO");
  assert.equal(form.loa, "60");
  assert.equal(form.quantity, "25");
  assert.equal(form.unit, "MT");
  assert.equal(form.preferredDate, "2026-10-30");
});

// -- Linking to a Polaris yacht (what lets the vessel see the enquiry) --------------------------------------

test("only an exact name links an enquiry to a yacht; a near-miss or an ambiguous name links nothing", () => {
  const yachts = [{ id: "y1", vessel_name: "MY MANGO" }, { id: "y2", vessel_name: "MY MANGO II" }, { id: "y3", vessel_name: "ORKA" }, { id: "y4", vessel_name: "Orka" }];
  assert.equal(matchYacht("my mango", yachts)?.id, "y1", "case doesn't matter");
  assert.equal(matchYacht("  MY MANGO  ", yachts)?.id, "y1", "nor do spaces around it");
  assert.equal(matchYacht("MY MAN", yachts), null, "a partial name never links");
  assert.equal(matchYacht("MANGO", yachts), null);
  assert.equal(matchYacht("orka", yachts), null, "two yachts with that name: ambiguous, so not linked");
  assert.equal(matchYacht("", yachts), null);
});

test("the yacht link and the sharing choice travel with what is saved", () => {
  assert.equal(enquiryPayload(good({ yachtId: "y1" })).yacht_id, "y1");
  assert.equal(enquiryPayload(good()).yacht_id, "", "unlinked by default");
  assert.equal(quotePayload(goodQuote({ sharedWithVessel: true })).shared_with_vessel, true);
  assert.equal(quotePayload(goodQuote()).shared_with_vessel, false, "nothing is shared unless the team chooses");
});

// -- the emails ----------------------------------------------------------------------------------------------

test("the Agency team and the person who logged it are told, except the person who just did it; duplicates are removed", () => {
  assert.deepEqual(mail.bunkeringRecipients("sam@jls.com", "hilary@jls.com", ["hilary@jls.com", "agency@jls.com"]), { to: ["agency@jls.com"], cc: ["sam@jls.com"] });
  assert.deepEqual(mail.bunkeringRecipients("sam@jls.com", "sam@jls.com", ["hilary@jls.com"]), { to: ["hilary@jls.com"], cc: [] });
  assert.deepEqual(mail.bunkeringRecipients("HILARY@jls.com", null, ["hilary@jls.com"]), { to: ["hilary@jls.com"], cc: [] });
});

const sample = (over: Record<string, unknown> = {}) => ({
  enquiry: { number: "BNK0007", status: "approved", yacht_name: "MY MANGO <b>", port: "Mina Rashid", berth: "Coastal Berth 2", preferred_date: "2026-10-30", preferred_time: "06:00:00",
    fuel_type: "MGO / DMA", fuel_other: null, quantity: 25, quantity_unit: "MT", declared_by_name: "John Smit", declared_by_role: "Captain", created_by_name: "Sam",
    approved_by_name: "Kenny Jones", approved_by_role: "Chief Engineer", approval_method: "WhatsApp confirmation", delivered_date: null, delivered_quantity: null, delivered_unit: null, bdn_number: null, ...over },
  quotes: [{ supplier: "Gulf Bunkers", status: "approved", quantity: 25, quantity_unit: "MT", unit_price: 820, price_unit: "per MT", currency: "USD", total: 20500 }],
});

test("the approval email says who approved it and how, lists the quotations, and escapes what people typed", () => {
  const m = mail.buildBunkeringEmail("approved", sample() as any, undefined, "Hilary", "https://polaris.example/bunkering?open=BNK0007");
  assert.match(m.subject, /^Bunkering quotation approved — BNK0007 — MY MANGO <b>$/);
  assert.match(m.html, /Kenny Jones<\/strong> \(Chief Engineer\) via WhatsApp confirmation/);
  assert.match(m.html, /Gulf Bunkers/);
  assert.match(m.html, /Open BNK0007 in Polaris/);
  assert.ok(!m.html.includes("MY MANGO <b>"), "the yacht name is escaped in the body");
  assert.match(m.html, /MY MANGO &lt;b&gt;/);
});

test("a new-enquiry email notes when the vessel has not yet confirmed", () => {
  const m = mail.buildBunkeringEmail("created", sample({ declared_by_name: null, declared_by_role: null }) as any, undefined, "Sam", "https://x");
  assert.match(m.html, /Not yet confirmed/);
  assert.match(m.subject, /^New bunkering enquiry/);
});
