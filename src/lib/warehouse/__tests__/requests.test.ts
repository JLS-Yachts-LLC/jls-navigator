/**
 * Warehouse requests: what each kind must say, who may do what, what the emails say and who gets them,
 * and that saving is all-or-nothing (files first, then one database call).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";
import {
  emptyForm, emptyLine, requestProblems, toPayload, allowedMoves, canAmend, linesSummary, NEEDS_REASON,
  type RequestFormInput,
} from "../requests-model";

const be = new FakeBackend();
let data: typeof import("../requests");
let mail: typeof import("../requests-email.server");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  data = await import("../requests");
  mail = await import("../requests-email.server");
});
after(async () => { await be.stop(); });
beforeEach(() => be.reset());

const item = (over: Partial<ReturnType<typeof emptyLine>> = {}) => ({ ...emptyLine(), description: "Pump", quantity: "2", ...over });
const incoming = (over: Partial<RequestFormInput> = {}): RequestFormInput => ({ ...emptyForm("incoming"), yacht: "ORKA", eta: "2026-10-20T09:00", lines: [item()], ...over });
const picking = (over: Partial<RequestFormInput> = {}): RequestFormInput => ({ ...emptyForm("picking"), requiredAt: "2026-10-20T09:00", lines: [item()], ...over });
const dispatch = (over: Partial<RequestFormInput> = {}): RequestFormInput => ({
  ...emptyForm("dispatch"), destination: "ORKA", berth: "Marina 4", recipientName: "Chief Eng", recipientPhone: "0501234567",
  requiredAt: "2026-10-20T09:00", lines: [item()], ...over,
});

// ── what each kind of request must say ───────────────────────────────────────

test("a complete request of each kind has no problems", () => {
  assert.deepEqual(requestProblems(incoming()), []);
  assert.deepEqual(requestProblems(picking()), []);
  assert.deepEqual(requestProblems(dispatch()), []);
});

test("every request needs at least one described item with a quantity", () => {
  assert.match(requestProblems(incoming({ lines: [emptyLine()] }))[0], /at least one item/);
  assert.ok(requestProblems(incoming({ lines: [item({ quantity: "" })] })).some((p) => /Item 1: add a quantity/.test(p)));
  assert.ok(requestProblems(incoming({ lines: [item({ quantity: "0" })] })).some((p) => /Item 1: add a quantity/.test(p)));
  assert.ok(requestProblems(incoming({ lines: [item({ description: "", quantity: "3" })] })).some((p) => /Item 1: add a description/.test(p)));
});

test("an oversized item needs all four of length, width, height and weight — a normal one doesn't", () => {
  assert.deepEqual(requestProblems(incoming({ lines: [item()] })), []);
  assert.ok(requestProblems(incoming({ lines: [item({ oversized: true, length: "200", width: "100", height: "", weight: "400" })] })).some((p) => /oversized item needs/.test(p)));
  assert.deepEqual(requestProblems(incoming({ lines: [item({ oversized: true, length: "200", width: "100", height: "90", weight: "400" })] })), []);
});

test("an incoming shipment needs an ETA and a yacht or project; a picking needs when it is needed", () => {
  assert.ok(requestProblems(incoming({ eta: "" })).some((p) => /ETA/.test(p)));
  assert.ok(requestProblems(incoming({ yacht: "" })).some((p) => /yacht or project/.test(p)));
  assert.ok(requestProblems(picking({ requiredAt: "" })).some((p) => /needed by/.test(p)));
});

test("a dispatch needs a destination, a named recipient with a phone OR email, and a required date", () => {
  assert.ok(requestProblems(dispatch({ destination: "" })).some((p) => /destination/.test(p)));
  assert.ok(requestProblems(dispatch({ recipientName: "" })).some((p) => /name of the person/.test(p)));
  assert.ok(requestProblems(dispatch({ recipientPhone: "", recipientEmail: "" })).some((p) => /phone number or an email/.test(p)));
  assert.deepEqual(requestProblems(dispatch({ recipientPhone: "", recipientEmail: "chief@orka.com" })), []);
  assert.ok(requestProblems(dispatch({ requiredAt: "" })).some((p) => /delivery date/.test(p)));
  assert.ok(requestProblems(dispatch({ recipientEmail: "not-an-email" })).some((p) => /email does not look right/.test(p)));
});

test("an urgent request must say why and by when; a normal one needn't", () => {
  assert.ok(requestProblems(incoming({ urgent: true })).some((p) => /reason it is urgent/.test(p)));
  assert.ok(requestProblems(incoming({ urgent: true, urgentReason: "Crew sails" })).some((p) => /deadline/.test(p)));
  assert.deepEqual(requestProblems(incoming({ urgent: true, urgentReason: "Crew sails", deadline: "2026-10-19T12:00" })), []);
});

test("the payload carries only what the request kind uses, with dates as real instants", () => {
  const who = { name: "Sam", email: "sam@jls.com", department: "Operations" };
  const p = toPayload(dispatch({ eta: "2026-10-01T08:00", notes: "  fragile  " }), who).request;
  assert.equal(p.eta, "", "a dispatch has no ETA, even if one was typed earlier");
  assert.equal(p.destination, "ORKA");
  assert.equal(p.berth, "Marina 4");
  assert.match(p.required_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(p.notes, "fragile");
  const i = toPayload(incoming({ destination: "X", recipientName: "Y" }), who).request;
  assert.equal(i.destination, "", "an incoming shipment has no destination");
  assert.equal(i.recipient_name, "");
  assert.equal(i.required_at, "");
  assert.match(i.eta, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(i.urgent_reason, "", "no urgency text unless urgent");
});

test("dimensions only travel with an oversized line, and blank lines are dropped", () => {
  const lines = toPayload(incoming({ lines: [item({ length: "9", width: "9", height: "9", weight: "9" }), item({ description: "Crate", oversized: true, length: "200", width: "100", height: "90", weight: "400" }), emptyLine()] }),
    { name: "", email: "", department: "" }).lines;
  assert.equal(lines.length, 2);
  assert.equal(lines[0].length_cm, "", "a normal item ignores stray dimensions");
  assert.equal(lines[1].length_cm, "200");
  assert.equal(lines[1].weight_kg, "400");
});

// ── who may do what ──────────────────────────────────────────────────────────

test("the Warehouse team can make any open move; the requester can only withdraw; finished requests are final", () => {
  const wh = allowedMoves("submitted", { isWarehouse: true, isRequester: false });
  assert.deepEqual(wh.sort(), ["cancelled", "completed", "confirmed", "in_progress", "on_hold"]);
  assert.deepEqual(allowedMoves("submitted", { isWarehouse: false, isRequester: true }), ["cancelled"]);
  assert.deepEqual(allowedMoves("submitted", { isWarehouse: false, isRequester: false }), []);
  assert.deepEqual(allowedMoves("completed", { isWarehouse: true, isRequester: true }), []);
  assert.deepEqual(allowedMoves("cancelled", { isWarehouse: true, isRequester: true }), []);
  assert.ok(!allowedMoves("on_hold", { isWarehouse: true, isRequester: false }).includes("on_hold"), "not a move to where it already is");
});

test("holding or cancelling needs a written reason; changing a request is for its owner or the Warehouse, until it is finished", () => {
  assert.deepEqual([...NEEDS_REASON].sort(), ["cancelled", "on_hold"]);
  assert.equal(canAmend("confirmed", { isWarehouse: false, isRequester: true }), true);
  assert.equal(canAmend("confirmed", { isWarehouse: true, isRequester: false }), true);
  assert.equal(canAmend("confirmed", { isWarehouse: false, isRequester: false }), false);
  assert.equal(canAmend("completed", { isWarehouse: true, isRequester: true }), false);
  assert.equal(linesSummary([{ oversized: true }, {}, {}]), "3 items · 1 oversized");
});

// ── the emails ───────────────────────────────────────────────────────────────

test("the Warehouse is addressed, Logistics and the requester are copied, duplicates removed, and the person who acted isn't emailed", () => {
  const r = mail.requestRecipients("sam@jls.com", "sam@jls.com", "wh@jls.com", "log@jls.com");
  assert.deepEqual(r, { to: ["wh@jls.com"], cc: ["log@jls.com"] }, "Sam acted, so Sam is not emailed");
  const s = mail.requestRecipients("sam@jls.com", "wh@jls.com", "wh@jls.com", "log@jls.com");
  assert.deepEqual(s, { to: ["log@jls.com"], cc: ["sam@jls.com"] }, "the Warehouse acted: the others are told");
  const dup = mail.requestRecipients("LOG@jls.com", null, "wh@jls.com", "log@jls.com");
  assert.deepEqual(dup, { to: ["wh@jls.com"], cc: ["log@jls.com"] }, "the same address in different case is not sent twice");
  assert.deepEqual(mail.requestRecipients(null, "x@y.com", "wh@jls.com", "log@jls.com").to, ["wh@jls.com"]);
});

const sample = (over: Record<string, unknown> = {}) => ({
  request: { number: "WRQ0007", type: "dispatch" as const, status: "submitted" as const, department: "Operations", requester_name: "Sam", yacht: "ORKA", reference: "AWB123",
    required_at: "2026-10-20T05:00:00Z", destination: "ORKA", berth: "Marina 4", recipient_name: "Chief <b>Eng</b>", recipient_phone: "050", recipient_email: null,
    urgent: true, urgent_reason: "Sails tonight", deadline: "2026-10-19T08:00:00Z", notes: "Fragile & heavy", ...over },
  lines: [{ description: "Pump", quantity: 2, unit: "pcs", oversized: false, length_cm: null, width_cm: null, height_cm: null, weight_kg: null },
    { description: "Crate", quantity: 1, unit: "crate", oversized: true, length_cm: 200, width_cm: 100, height_cm: 90, weight_kg: 400 }],
  files: [{ name: "Invoice.pdf", doc_type: "Invoice", link: "https://signed.example/x" }],
});

test("the new-request email carries what the Warehouse needs: urgency, items, oversized dimensions, recipient, links", () => {
  const m = mail.buildRequestEmail("submitted", sample() as any, undefined, "Sam", "https://polaris.example/warehouse-requests?open=WRQ0007");
  assert.match(m.subject, /^URGENT — Dispatch request — WRQ0007 \(ORKA\)$/);
  assert.match(m.html, /URGENT<\/strong> — Sails tonight/);
  assert.match(m.html, /200 × 100 × 90 cm, 400 kg/);
  assert.match(m.html, /Marina 4/);
  assert.match(m.html, /href="https:\/\/signed\.example\/x"/);
  assert.match(m.html, /Open WRQ0007 in Polaris/);
  assert.match(m.text, /AWB \/ shipment reference: AWB123/);
});

test("anything typed by a person is escaped in the email, so it can't inject markup", () => {
  const m = mail.buildRequestEmail("comment", sample() as any, "<script>alert(1)</script>", "Sam", "https://x");
  assert.ok(!m.html.includes("<script>"));
  assert.match(m.html, /&lt;script&gt;/);
  assert.ok(!m.html.includes("<b>Eng</b>"), "the recipient's name is escaped too");
});

test("a change email gives the reason, a status email names the new status", () => {
  assert.match(mail.buildRequestEmail("amended", sample() as any, "Moved to Friday", "Sam", "https://x").html, /Reason given: <em>Moved to Friday<\/em>/);
  const s = mail.buildRequestEmail("status", sample({ status: "on_hold", hold_reason: "Two people disagree" }) as any, "Two people disagree", "Jovian", "https://x");
  assert.match(s.subject, /on hold/);
  assert.match(s.html, /On hold because/);
});

// ── saving: files first, then ONE database call ──────────────────────────────

const who = { name: "Sam", email: "sam@jls.com", department: "Operations" };
const pdf = () => ({ file: new File([new Uint8Array(500)], "invoice.pdf", { type: "application/pdf" }), kind: "document" as const, docType: "Invoice" });
const photo = () => ({ file: new File([new Uint8Array(500)], "crate.jpg", { type: "image/jpeg" }), kind: "photo" as const, docType: "Photo" });

test("a request is saved by one database call carrying its items and the already-uploaded files", async () => {
  let args: any = null;
  be.rpcs.set("create_warehouse_request", (a: any) => { args = a; return { id: "r1", number: "WRQ0001", ...a.p_request }; });
  const { request } = await data.createWarehouseRequest(incoming(), [pdf(), photo()], who);
  assert.equal(request.number, "WRQ0001");
  assert.equal(be.uploads.length, 2, "both files were uploaded first");
  assert.equal(args.p_lines.length, 1);
  assert.equal(args.p_request.type, "incoming");
  assert.equal(args.p_files.length, 2);
  assert.deepEqual(args.p_files.map((f: any) => [f.kind, f.doc_type, f.name]), [["document", "Invoice", "invoice.pdf"], ["photo", "Photo", "crate.jpg"]]);
  assert.ok(args.p_files.every((f: any) => f.url.startsWith("shipsync/warehouse/requests/")), "stored as private references");
});

test("if a file can't be uploaded, nothing is saved — no half-made request", async () => {
  let called = false;
  be.rpcs.set("create_warehouse_request", () => { called = true; return {}; });
  be.faults.push({ match: /POST \/storage\/v1\/object\//, fault: 500 });
  await assert.rejects(data.createWarehouseRequest(incoming(), [pdf()], who));
  assert.equal(called, false, "the request was not created");
});

test("a request with problems is refused before anything is uploaded", async () => {
  await assert.rejects(data.createWarehouseRequest(incoming({ eta: "" }), [pdf()], who), /ETA/);
  assert.equal(be.uploads.length, 0);
});

test("a stored request turns back into form text, so it can be changed", () => {
  const form = data.toFormInput({
    request: { id: "r", number: "WRQ1", type: "dispatch", status: "submitted", destination: "ORKA", berth: "M4", recipient_name: "Chief", urgent: false, amended_count: 0, required_at: "2026-10-20T05:00:00Z" } as any,
    lines: [{ id: "l", position: 0, description: "Crate", quantity: 1, unit: "crate", oversized: true, length_cm: 200, width_cm: 100, height_cm: 90, weight_kg: 400 }],
    files: [], events: [],
  });
  assert.equal(form.destination, "ORKA");
  assert.equal(form.lines[0].length, "200");
  assert.match(form.requiredAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "in the datetime-local format the form's date box uses");
  assert.deepEqual(requestProblems({ ...form, recipientPhone: "050" }), []);
});
