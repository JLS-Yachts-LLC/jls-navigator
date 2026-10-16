/** Check-Out (building delivery notes), identity, and run clean-up, against the fake backend. */
import "fake-indexeddb/auto";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "./fake-backend";

const be = new FakeBackend();
let ld: typeof import("../logistics-data");
let dd: typeof import("../logistics-delivery-data");
let idn: typeof import("../logistics-identity");
let drv: typeof import("@/lib/shipsync/driver-data");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  ld = await import("../logistics-data");
  dd = await import("../logistics-delivery-data");
  idn = await import("../logistics-identity");
  drv = await import("@/lib/shipsync/driver-data");
});
after(async () => { await be.stop(); });
beforeEach(() => {
  be.reset();
  let n = 0;
  be.rpcs.set("next_shipsync_delivery_number", () => String(++n).padStart(4, "0"));
});

const lite = (id: string, boat = "ORKA", over: Record<string, unknown> = {}) =>
  ({ id, barcode: `AWB-${id}`, boat_name: boat, package_owner: "Jo", courier: "DHL", num_packages: 1, status: "in_office", delivery_note_id: null, driver_id: null, ...over });
const pk = (id: string) => be.rows("shipsync_packages").find((p) => p.id === id)!;

// ── building a note ──────────────────────────────────────────────────────────

test("a note reserves exactly the parcels on it; taking one off sends it back properly (status and scan marks reset)", async () => {
  be.rows("shipsync_packages").push(lite("P1"), lite("P2"), lite("P3"));
  const note = await ld.syncNoteParcels(null, [pk("P1"), pk("P2")] as any);
  assert.equal(pk("P1").delivery_note_id, note.id);
  assert.equal(pk("P3").delivery_note_id, null);

  pk("P2").driver_scanned = true; pk("P2").status = "assigned";
  await ld.syncNoteParcels(note.id, [pk("P1")] as any);
  assert.equal(pk("P2").delivery_note_id, null);
  assert.equal(pk("P2").status, "in_office", "not left 'assigned' with no note");
  assert.equal(pk("P2").driver_scanned, false);
});

test("if a parcel was just taken by another note, the new note is NOT left behind and nothing stays reserved", async () => {
  be.rows("shipsync_packages").push(lite("P1"), lite("P2", "ORKA", { delivery_note_id: "OTHER" }));
  await assert.rejects(ld.syncNoteParcels(null, [pk("P1"), pk("P2")] as any), /another delivery note/);
  assert.equal(be.rows("shipsync_delivery_notes").length, 0, "no empty note");
  assert.equal(pk("P1").delivery_note_id, null, "the parcel it had claimed is free again");
  assert.equal(pk("P2").delivery_note_id, "OTHER", "the other note's parcel is untouched");
});

test("a note for one boat is labelled with it", async () => {
  be.rows("shipsync_packages").push(lite("P1", "ORKA"), lite("P2", "ORKA"));
  const one = await ld.syncNoteParcels(null, [pk("P1"), pk("P2")] as any);
  assert.equal(be.rows("shipsync_delivery_notes").find((n) => n.id === one.id)!.boat_name, "ORKA");
});

test("a note for several boats has no single boat label", async () => {
  be.rows("shipsync_packages").push(lite("P1", "ORKA"), lite("P2", "NIRVANA"));
  const many = await ld.syncNoteParcels(null, [pk("P1"), pk("P2")] as any);
  assert.equal(be.rows("shipsync_delivery_notes").find((n) => n.id === many.id)!.boat_name, null);
});

test("releasing parcels (third party / client) stamps who took them and closes the note", async () => {
  be.rows("shipsync_packages").push(lite("P1"), lite("P2"));
  const note = await ld.syncNoteParcels(null, [pk("P1"), pk("P2")] as any);
  await ld.releaseParcels(note, [pk("P1"), pk("P2")] as any, {
    name: "Sue", position: "Captain", email: "s@o.com",
    photo: new File([new Uint8Array(500).fill(3)], "p.jpg", { type: "image/jpeg" }),
    signature: new Blob([new Uint8Array(200).fill(1)], { type: "image/png" }),
  });
  for (const id of ["P1", "P2"]) {
    assert.equal(pk(id).status, "collected");
    assert.equal(pk(id).receiver_full_name, "Sue");
    assert.match(pk(id).delivery_photo_url, /^shipsync\/delivery-notes\/.+handover_\d+\.jpg$/);
    assert.match(pk(id).signature_url, /signature_\d+\.png$/);
  }
  assert.equal(be.rows("shipsync_delivery_notes").find((n) => n.id === note.id)!.status, "delivered");
  assert.ok(be.uploads.some((u) => u.path.includes("signature_") && u.partType === "image/png"), "the signature stays a PNG");
});

test("a failed photo upload on release changes NOTHING (no parcel marked collected without its proof)", async () => {
  be.rows("shipsync_packages").push(lite("P1"));
  const note = await ld.syncNoteParcels(null, [pk("P1")] as any);
  be.faults.push({ match: /POST \/storage\//, fault: 500 });
  await assert.rejects(ld.releaseParcels(note, [pk("P1")] as any, { name: "Sue", position: "", email: "", photo: new File([new Uint8Array(9)], "p.jpg", { type: "image/jpeg" }), signature: null }));
  assert.equal(pk("P1").status, "in_office");
  assert.equal(be.rows("shipsync_delivery_notes")[0].status, "open");
});

// ── identity: a failed lookup must not read as "not a driver" ────────────────

test("a driver lookup that FAILS is reported as failed, not as 'no driver record'", async () => {
  be.faults.push({ match: /GET \/rest\/v1\/shipsync_drivers/, fault: 500 });
  const r = await idn.lookupDriver("U1", "a@b.com");
  assert.equal(r.failed, true);
  assert.equal(r.driver, null);
});

test("only ACTIVE drivers count, found by login or by email", async () => {
  be.rows("shipsync_drivers").push({ id: "D1", name: "Ali", user_id: "U1", email: "ali@jls.com", active: true });
  be.rows("shipsync_drivers").push({ id: "D2", name: "Bob", user_id: "U2", email: "bob@jls.com", active: false });
  be.rows("shipsync_drivers").push({ id: "D3", name: "Cy", user_id: null, email: "cy@jls.com", active: true });
  assert.equal((await idn.lookupDriver("U1", null)).driver?.id, "D1");
  assert.equal((await idn.lookupDriver("U2", "bob@jls.com")).driver, null, "a retired driver is not a driver");
  assert.equal((await idn.lookupDriver("U9", "CY@jls.com")).driver?.id, "D3", "email match ignores case");
  assert.deepEqual(await idn.lookupDriver("U9", "nobody@x.com"), { driver: null, failed: false });
});

test("an email containing _ is matched literally, so one driver cannot be mistaken for another", async () => {
  be.rows("shipsync_drivers").push({ id: "D1", name: "A", user_id: null, email: "a_b@jls.com", active: true });
  be.rows("shipsync_drivers").push({ id: "D2", name: "X", user_id: null, email: "axb@jls.com", active: true });
  assert.equal((await idn.lookupDriver("U9", "a_b@jls.com")).driver?.id, "D1");
  assert.equal((await idn.lookupDriver("U9", "a%@jls.com")).driver, null);
});

// ── the driver's cached runs ─────────────────────────────────────────────────

test("a failed load of the driver's runs falls back to the last good copy instead of showing (and caching) an empty list", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N1", driver_id: "D1", status: "dispatched" });
  be.rows("shipsync_packages").push({ id: "P1", driver_id: "D1", status: "assigned", boat_name: "ORKA" });
  const good = await drv.loadDriverRuns("D1");
  assert.equal(good.packages.length, 1);
  be.faults.push({ match: /GET \/rest\/v1\/shipsync_packages/, fault: 500 });
  const after = await drv.loadDriverRuns("D1");
  assert.equal(after.packages.length, 1, "the cached run is still there");
  assert.equal(after.notes.length, 1);
});

// ── cleaning up a run ────────────────────────────────────────────────────────

test("removing the last pending parcel from a run finishes the note; removing the only parcel cancels it", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N1", status: "dispatched", driver_id: "D1" }, { id: "N2", status: "dispatched", driver_id: "D1" });
  be.rows("shipsync_packages").push(
    { id: "A1", status: "delivered", delivery_note_id: "N1", boat_name: "ORKA" }, { id: "A2", status: "assigned", delivery_note_id: "N1", boat_name: "ORKA", driver_id: "D1" },
    { id: "B1", status: "assigned", delivery_note_id: "N2", boat_name: "X", driver_id: "D1" },
  );
  await dd.removeFromRun(pk("A2") as any);
  assert.equal(be.rows("shipsync_delivery_notes").find((n) => n.id === "N1")!.status, "delivered");
  await dd.removeFromRun(pk("B1") as any);
  assert.equal(be.rows("shipsync_delivery_notes").find((n) => n.id === "N2")!.status, "cancelled");
});

test("removing one parcel from a run that still has others leaves the note running", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N1", status: "dispatched", driver_id: "D1" });
  be.rows("shipsync_packages").push({ id: "A1", status: "assigned", delivery_note_id: "N1" }, { id: "A2", status: "assigned", delivery_note_id: "N1" });
  await dd.removeFromRun(pk("A1") as any);
  assert.equal(be.rows("shipsync_delivery_notes")[0].status, "dispatched");
});

test("cancelling a delivery returns every parcel (scan marks cleared) and closes the note", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N1", status: "dispatched", driver_id: "D1" });
  be.rows("shipsync_packages").push({ id: "A1", status: "out_for_delivery", delivery_note_id: "N1", driver_scanned: true, driver_id: "D1" });
  await dd.cancelDelivery("N1");
  assert.equal(pk("A1").status, "in_office");
  assert.equal(pk("A1").driver_scanned, false);
  assert.equal(be.rows("shipsync_delivery_notes")[0].status, "cancelled");
});

// ── adding to a run under way ────────────────────────────────────────────────

test("Add Item: a parcel scanned in joins the run already scanned; one searched for joins as 'assigned'", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N1", status: "dispatched", driver_id: "D1", boat_name: "ORKA" });
  be.rows("shipsync_packages").push(
    { id: "A1", status: "out_for_delivery", delivery_note_id: "N1", boat_name: "ORKA", driver_id: "D1", driver_scanned: true },
    lite("P1", "ORKA"), lite("P2", "ORKA"),
  );
  const note = be.rows("shipsync_delivery_notes")[0] as any;
  const driver = { id: "D1" } as any;

  const a = await dd.addToRun(note, driver, [pk("P1")] as any, true);
  assert.equal(a.added.length, 1);
  assert.equal(pk("P1").delivery_note_id, "N1");
  assert.equal(pk("P1").driver_id, "D1");
  assert.equal(pk("P1").status, "out_for_delivery");
  assert.equal(pk("P1").driver_scanned, true);

  const b = await dd.addToRun(note, driver, [pk("P2")] as any, false);
  assert.equal(b.added.length, 1);
  assert.equal(pk("P2").status, "assigned");
  assert.notEqual(pk("P2").driver_scanned, true, "searched for, not yet scanned onto the van");
  assert.equal(be.rows("shipsync_delivery_notes")[0].boat_name, "ORKA", "same boat keeps the label");

  // and they show up on the driver's run
  const runs = await drv.loadDriverRuns("D1");
  assert.deepEqual(runs.packages.map((p) => p.id).sort(), ["A1", "P1", "P2"]);
});

test("Add Item: a parcel for another boat makes the run a multi-boat one; one taken meanwhile is left alone and counted", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N1", status: "dispatched", driver_id: "D1", boat_name: "ORKA" });
  be.rows("shipsync_packages").push(
    { id: "A1", status: "assigned", delivery_note_id: "N1", boat_name: "ORKA", driver_id: "D1" },
    lite("P1", "ZEUS"), lite("P2", "ZEUS", { delivery_note_id: "OTHER", status: "assigned" }), lite("P3", "ZEUS", { status: "delivered" }),
  );
  const note = be.rows("shipsync_delivery_notes")[0] as any;
  const r = await dd.addToRun(note, { id: "D1" } as any, [pk("P1"), pk("P2"), pk("P3")] as any, false);
  assert.deepEqual(r.added.map((p) => p.id), ["P1"]);
  assert.equal(r.skipped, 2);
  assert.equal(pk("P2").delivery_note_id, "OTHER", "the other note's parcel is untouched");
  assert.equal(pk("P3").delivery_note_id, null, "a delivered parcel can't be put back on a run");
  assert.equal(be.rows("shipsync_delivery_notes")[0].boat_name, null, "two boats on it now");
});

test("Add Item: nothing to add changes nothing", async () => {
  be.rows("shipsync_delivery_notes").push({ id: "N1", status: "dispatched", driver_id: "D1", boat_name: "ORKA" });
  const r = await dd.addToRun(be.rows("shipsync_delivery_notes")[0] as any, { id: "D1" } as any, [], true);
  assert.deepEqual(r, { added: [], skipped: 0 });
});
