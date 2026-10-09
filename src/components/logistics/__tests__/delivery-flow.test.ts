/**
 * The driver's handover and the office's note handling, against the fake backend —
 * including a connection that drops part-way, and the offline queue replaying later.
 */
import "fake-indexeddb/auto";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "./fake-backend";

const be = new FakeBackend();
let dd: typeof import("../logistics-delivery-data");
let offline: typeof import("@/lib/shipsync/offline");
let data: typeof import("@/lib/shipsync/data");
const apiCalls: { url: string; body: any }[] = [];
let apiFail: string | null = null;
const realFetch = globalThis.fetch;

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  // the app calls its own server routes with relative URLs; answer them here
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.startsWith("/api/")) {
      apiCalls.push({ url, body: JSON.parse(init?.body ?? "{}") });
      if (apiFail && url.includes(apiFail)) return new Response(JSON.stringify({ ok: false, error: "mail server down" }), { status: 500 });
      return new Response(JSON.stringify({ ok: true, pdfUrl: "shipsync/delivery-notes/1/delivery.pdf" }), { status: 200 });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  dd = await import("../logistics-delivery-data");
  offline = await import("@/lib/shipsync/offline");
  data = await import("@/lib/shipsync/data");
});
after(async () => { globalThis.fetch = realFetch; await be.stop(); });

const png = () => new Blob([new Uint8Array(400).fill(9)], { type: "image/png" });
const jpg = () => new Blob([new Uint8Array(900).fill(5)], { type: "image/jpeg" });
const parcel = (id: string, boat: string, status = "out_for_delivery", over: Record<string, unknown> = {}) =>
  ({ id, barcode: `AWB-${id}`, boat_name: boat, status, delivery_note_id: "N1", driver_id: "D1", driver_scanned: true, ...over });

beforeEach(async () => {
  be.reset(); apiCalls.length = 0; apiFail = null;
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  be.rows("shipsync_delivery_notes").push({ id: "N1", number: "0007", status: "dispatched", driver_id: "D1", awaiting_completion_at: "2026-10-09T08:00:00Z" });
  be.rows("shipsync_packages").push(parcel("P1", "ORKA"), parcel("P2", "ORKA"), parcel("P3", "NIRVANA"));
  // empty the phone's offline queue between tests
  for (const m of await offline.queueAll()) await offline.queueDel(m.qid);
});

const handover = () => ({ name: "Sue", position: "Captain", email: "sue@orka.com", photo: jpg(), signature: png() });
const driver = { id: "D1", name: "Ali", email: "ali@jls.com" } as any;
const note = () => be.rows("shipsync_delivery_notes").find((n) => n.id === "N1")!;
const pkg = (id: string) => be.rows("shipsync_packages").find((p) => p.id === id)!;
const asParcels = (...ids: string[]) => ids.map((id) => pkg(id)) as any[];

// ── a normal handover ────────────────────────────────────────────────────────

test("handover for one boat: its parcels get the receiver, photo and a PNG signature; the note stays open for the other boat", async () => {
  const r = await dd.completeDelivery(note() as any, asParcels("P1", "P2"), handover(), driver, "ORKA");
  assert.equal(r.closed, false);
  assert.equal(r.problem, undefined);
  for (const id of ["P1", "P2"]) {
    assert.equal(pkg(id).status, "delivered");
    assert.equal(pkg(id).receiver_full_name, "Sue");
    assert.match(pkg(id).delivery_photo_url, /^shipsync\/deliveries\/.+\.jpg$/);
    assert.match(pkg(id).signature_url, /^shipsync\/deliveries\/.+signature_\d+\.png$/);
  }
  assert.equal(pkg("P3").status, "out_for_delivery", "the other boat is untouched");
  assert.equal(note().status, "dispatched");
  assert.equal(note().awaiting_completion_at, null, "completing a boat clears the 'awaiting completion' flag");
  // the signature went up as a PNG (never re-encoded to a black JPEG)
  assert.ok(be.uploads.some((u) => u.path.includes("signature_") && u.partType === "image/png"));
});

test("proof is emailed to the boat's client and the driver, for THAT boat only", async () => {
  await dd.completeDelivery(note() as any, asParcels("P1", "P2"), handover(), driver, "ORKA");
  const email = apiCalls.find((c) => c.url.includes("email-pod"))!;
  assert.equal(email.body.to, "sue@orka.com,ali@jls.com");
  assert.equal(email.body.boat, "ORKA");
  assert.ok(apiCalls.findIndex((c) => c.url.includes("note-pdf")) < apiCalls.findIndex((c) => c.url.includes("email-pod")), "the PDF is rebuilt before it is emailed");
});

test("the last boat closes the note", async () => {
  await dd.completeDelivery(note() as any, asParcels("P1", "P2"), handover(), driver, "ORKA");
  const r = await dd.completeDelivery(note() as any, asParcels("P3"), handover(), driver, "NIRVANA");
  assert.equal(r.closed, true);
  assert.equal(note().status, "delivered");
  assert.ok(note().delivered_at);
});

// ── when something fails AFTER the parcels were delivered ─────────────────────

test("email failure: reported as a warning, parcels stay delivered, nothing throws (so the driver is not tempted to redo it)", async () => {
  apiFail = "email-pod";
  const r = await dd.completeDelivery(note() as any, asParcels("P1", "P2", "P3"), handover(), driver, "ORKA");
  assert.equal(pkg("P1").status, "delivered");
  assert.match(r.problem ?? "", /email failed/);
  assert.equal(r.closed, true);
});

test("if the 'anything left?' check fails, the note is NOT closed (it used to close on a failed check)", async () => {
  be.faults.push({ match: /HEAD \/rest\/v1\/shipsync_packages|GET \/rest\/v1\/shipsync_packages/, fault: 500, times: 99 });
  // the deliver step needs PATCH (not faulted); only the count read fails
  const r = await dd.completeDelivery(note() as any, asParcels("P1", "P2", "P3"), handover(), driver, "ORKA");
  assert.equal(r.closed, false);
  assert.equal(note().status, "dispatched");
  assert.match(r.problem ?? "", /could not be closed/);
});

// ── the connection drops during the handover ─────────────────────────────────

test("connection drops while uploading the photo: the handover is saved on the phone, then sent and the run closed once signal returns", async () => {
  be.faults.push({ match: /POST \/storage\//, fault: "drop", times: 1 });
  const r = await dd.completeDelivery(note() as any, asParcels("P1", "P2", "P3"), handover(), driver, "ORKA");
  assert.equal(r.queued, true);
  assert.equal(pkg("P1").status, "out_for_delivery", "not yet applied");
  assert.ok((await offline.queueAll()).length >= 3, "the handover is parked on the phone");

  // signal returns: the app's flush sends everything…
  const sent = await offline.flushQueue();
  assert.ok(sent > 0);
  for (const id of ["P1", "P2", "P3"]) {
    assert.equal(pkg(id).status, "delivered");
    assert.equal(pkg(id).receiver_full_name, "Sue");
    assert.match(pkg(id).delivery_photo_url, /^shipsync\/packages\/.+delivery_\d+\.jpg$/);
    assert.match(pkg(id).signature_url, /^shipsync\/packages\/.+signature_\d+\.png$/);
  }
  assert.equal((await offline.queueAll()).length, 0);
  // …and the run that was left dispatched is closed
  assert.equal(await dd.closeFinishedNotes("D1"), 1);
  assert.equal(note().status, "delivered");
});

test("phone fully offline when the driver completes: queued, and replays to the same result", async () => {
  Object.defineProperty(globalThis.navigator, "onLine", { value: false, configurable: true });
  const r = await dd.completeDelivery(note() as any, asParcels("P1", "P2", "P3"), handover(), driver, "ORKA");
  assert.equal(r.queued, true);
  assert.equal(pkg("P1").status, "out_for_delivery");
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  await offline.flushQueue();
  assert.equal(pkg("P3").status, "delivered");
  assert.match(pkg("P3").signature_url, /signature_\d+\.png$/);
});

test("closeFinishedNotes leaves a run alone while a parcel is still to deliver, and ignores other drivers' runs", async () => {
  be.rows("shipsync_packages").find((p) => p.id === "P1")!.status = "delivered";
  assert.equal(await dd.closeFinishedNotes("D1"), 0);
  assert.equal(await dd.closeFinishedNotes("OTHER"), 0);
  for (const id of ["P2", "P3"]) pkg(id).status = "delivered";
  assert.equal(await dd.closeFinishedNotes("D1"), 1);
});

// ── the offline queue itself ─────────────────────────────────────────────────

test("one queued item that is permanently rejected does not block the ones behind it", async () => {
  await offline.queueAdd({ kind: "patch", table: "shipsync_packages", id: "P1", patch: { courier: "FIRST" } });
  await offline.queueAdd({ kind: "patch", table: "shipsync_packages", id: "P2", patch: { courier: "SECOND" } });
  be.faults.push({ match: /PATCH \/rest\/v1\/shipsync_packages/, fault: 400, times: 1 });   // the first is rejected outright
  const n = await offline.flushQueue();
  assert.equal(n, 1, "the second went through");
  assert.equal(pkg("P2").courier, "SECOND");
  assert.equal((await offline.queueAll()).length, 1, "the rejected one stays queued (not silently dropped)");
});

test("no signal stops the run so nothing is sent out of order", async () => {
  await offline.queueAdd({ kind: "patch", table: "shipsync_packages", id: "P1", patch: { courier: "A" } });
  await offline.queueAdd({ kind: "patch", table: "shipsync_packages", id: "P2", patch: { courier: "B" } });
  be.faults.push({ match: /PATCH \/rest\/v1\/shipsync_packages/, fault: "drop", times: 99 });
  assert.equal(await offline.flushQueue(), 0);
  assert.equal((await offline.queueAll()).length, 2);
});

// ── office: changing the driver, removing from a run ─────────────────────────

test("giving a DRAFT note a driver makes it a real run: parcels assigned, note dispatched", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N2", number: "0008", status: "open", driver_id: null });
  be.rows("shipsync_packages").push({ id: "Q1", boat_name: "X", status: "in_office", delivery_note_id: "N2", driver_id: null });
  await dd.setNoteDriver("N2", "D9");
  const q = be.rows("shipsync_packages").find((p) => p.id === "Q1")!;
  assert.equal(q.status, "assigned");
  assert.equal(q.driver_id, "D9");
  assert.equal(be.rows("shipsync_delivery_notes").find((n) => n.id === "N2")!.status, "dispatched");
});

test("changing the driver on a run under way moves only the parcels still to deliver", async () => {
  pkg("P1").status = "delivered";
  await dd.setNoteDriver("N1", "D2");
  assert.equal(note().driver_id, "D2");
  assert.equal(pkg("P2").driver_id, "D2");
  assert.equal(pkg("P1").driver_id, "D1", "an already-delivered parcel keeps the driver who delivered it");
});

test("a failed change leaves note and parcels on the SAME driver", async () => {
  be.faults.push({ match: /PATCH \/rest\/v1\/shipsync_packages/, fault: 500, times: 1 });
  await assert.rejects(dd.setNoteDriver("N1", "D2"));
  assert.equal(note().driver_id, "D1");
  assert.equal(pkg("P2").driver_id, "D1");
});

test("taking a scanned parcel off a run clears its scanned flag, so it can't appear pre-scanned on the next run", async () => {
  pkg("P2").driver_scan_out_time = "2026-10-09T08:00:00Z";
  await data.unassignPackage("P2");
  assert.equal(pkg("P2").driver_scanned, false);
  assert.equal(pkg("P2").driver_scan_out_time, null);
  assert.equal(pkg("P2").delivery_note_id, null);
});

test("admin 'mark delivered' does not overwrite parcels that were collected or refused", async () => {
  pkg("P1").status = "collected"; pkg("P2").status = "refused";
  await dd.adminSetStatus("N1", "delivered");
  assert.equal(pkg("P1").status, "collected");
  assert.equal(pkg("P2").status, "refused");
  assert.equal(pkg("P3").status, "delivered");
});
