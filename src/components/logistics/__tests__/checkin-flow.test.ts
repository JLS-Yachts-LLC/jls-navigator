/**
 * Check-in, end to end against the fake backend: what gets written, in what order,
 * and — the point of this file — what happens to the PHOTO when something goes wrong.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "./fake-backend";

const be = new FakeBackend();
let commit: typeof import("../checkin-commit");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  commit = await import("../checkin-commit");
});
after(async () => { await be.stop(); });
beforeEach(() => {
  be.reset();
  let n = 0;
  be.rpcs.set("next_shipsync_item_id", () => `ITEM-${String(++n).padStart(4, "0")}`);
});

const photo = () => new Blob([new Uint8Array(2048).fill(7)], { type: "image/jpeg" });

let seq = 0;
function payload(over: { board?: "Local" | "Import" | "Transit"; paid?: boolean; id?: string; awb?: string } = {}) {
  const board = over.board ?? "Local";
  const paid = over.paid ?? false;
  const id = over.id ?? `pkg-${++seq}`;
  const awb = over.awb ?? `AWB${seq}`;
  return {
    id, awb, customs: board !== "Local",
    fields: {
      barcode: awb, boat_name: "NIRVANA", package_owner: "Jo", courier: "DHL", num_packages: 2,
      local_import: board, boe_no: null, description: null, received_at: "2026-10-09T08:00:00.000Z",
    },
    payment: { required: paid, amount: paid ? 250 : null, method: paid ? "Cash" : null },
  } as import("../checkin-commit").CheckinPayload;
}

// ── a normal check-in ────────────────────────────────────────────────────────

test("Local check-in: photo uploaded first, row saved as Warehouse and pointing at the photo", async () => {
  const p = payload();
  const status = await commit.createCheckin(p, photo());
  assert.equal(status, "in_storage");

  assert.equal(be.uploads.length, 1);
  assert.match(be.uploads[0].path, new RegExp(`^shipsync/packages/${p.id}/item_\\d+\\.jpg$`));
  assert.ok(be.uploads[0].bytes > 0);

  const row = be.rows("shipsync_packages").find((r) => r.id === p.id)!;
  assert.equal(row.status, "in_storage");
  assert.equal(row.local_import, "Local");
  assert.equal(row.item_photo_url, `shipsync/${be.uploads[0].path.replace(/^shipsync\//, "")}`);
  assert.equal(row.extra.monday, undefined, "a Local parcel has no Monday columns");
  assert.equal(row.extra.checked_in_via, "logistics-app");

  // the upload happened BEFORE the row was written, so a row never points at a photo that isn't there
  const order = be.requests.filter((r) => /storage|shipsync_packages/.test(r));
  assert.ok(order.findIndex((r) => r.includes("/storage/")) < order.findIndex((r) => r === "POST /rest/v1/shipsync_packages"));
});

test("a check-in with no photo saves with a null photo and uploads nothing", async () => {
  const p = payload();
  await commit.createCheckin(p, null);
  assert.equal(be.uploads.length, 0);
  assert.equal(be.rows("shipsync_packages")[0].item_photo_url, null);
});

test("paid Import: IMPORT group (position copied), Monday status Warehouse, Paid Amount and Payment Method; no app-made Item ID", async () => {
  be.rows("shipsync_packages").push({ id: "old", local_import: "Import", extra: { monday_group_title: "IMPORT", monday_group_position: 2 } });
  const p = payload({ board: "Import", paid: true });
  await commit.createCheckin(p, photo());
  const row = be.rows("shipsync_packages").find((r) => r.id === p.id)!;
  assert.equal(row.local_import, "Import");
  assert.equal(row.status, "in_storage");
  assert.equal(row.extra.monday_group_title, "IMPORT");
  assert.equal(row.extra.monday_group_position, 2);
  // no Item ID from the app: the database trigger adds it on insert (checked against the real table)
  assert.deepEqual(row.extra.monday, { STATUS: "Warehouse", "Paid Amount": "250", "PAYMENT METHOD": "Cash" });
  assert.deepEqual(row.extra.payment, { required: true, amount: 250, method: "Cash" });
});

test("unpaid Import has no payment columns; Transit goes to the TRANSIT group", async () => {
  be.rows("shipsync_packages").push({ id: "old", local_import: "Transit", extra: { monday_group_title: "TRANSIT", monday_group_position: 5 } });
  const a = payload({ board: "Import" });
  await commit.createCheckin(a, null);
  const t = payload({ board: "Transit" });
  await commit.createCheckin(t, null);
  const ra = be.rows("shipsync_packages").find((r) => r.id === a.id)!;
  const rt = be.rows("shipsync_packages").find((r) => r.id === t.id)!;
  assert.deepEqual(ra.extra.monday, { STATUS: "Warehouse" });
  assert.ok(!be.requests.some((r) => r.includes("next_shipsync_item_id")), "the app does not use up an Item ID number itself");
  assert.equal(rt.extra.monday_group_title, "TRANSIT");
  assert.equal(rt.extra.monday_group_position, 5);
});

test("an Import board with no IMPORT group yet still saves (ungrouped) rather than failing", async () => {
  const p = payload({ board: "Import" });
  await commit.createCheckin(p, null);
  const row = be.rows("shipsync_packages")[0];
  assert.equal(row.extra.monday_group_title, undefined);
  assert.equal(row.extra.monday.STATUS, "Warehouse");
});

// ── when something goes wrong ────────────────────────────────────────────────

test("photo upload rejected: the check-in fails loudly and NO half-saved row is left behind", async () => {
  be.faults.push({ match: /POST \/storage\//, fault: 500 });
  await assert.rejects(commit.createCheckin(payload(), photo()));
  assert.equal(be.rows("shipsync_packages").length, 0);
});

test("connection dropped during the photo upload is recognised as a network error (so it can be saved offline)", async () => {
  be.faults.push({ match: /POST \/storage\//, fault: "drop" });
  let err: unknown;
  try { await commit.createCheckin(payload(), photo()); } catch (e) { err = e; }
  assert.ok(err, "expected a failure");
  assert.equal(commit.isNetworkError(err), true, `not classified as network: ${String((err as Error)?.message)}`);
  assert.equal(be.rows("shipsync_packages").length, 0);
});

test("connection dropped when saving the row: retrying the SAME payload gives exactly one parcel", async () => {
  const p = payload();
  be.faults.push({ match: /POST \/rest\/v1\/shipsync_packages/, fault: "drop", times: 1 });
  await assert.rejects(commit.createCheckin(p, photo()));
  assert.equal(be.rows("shipsync_packages").length, 0);
  await commit.createCheckin(p, photo());                      // the retry
  assert.equal(be.rows("shipsync_packages").filter((r) => r.id === p.id).length, 1);
  assert.ok(be.rows("shipsync_packages")[0].item_photo_url, "the retry's photo is linked");
});

test("the row saved on the server but the reply lost: replaying finds it and does not duplicate", async () => {
  const p = payload();
  await commit.createCheckin(p, photo());                      // it did reach the server
  const again = await commit.commitQueued(p, photo());         // the app, unsure, replays it
  assert.deepEqual(again, { result: "already" });
  assert.equal(be.rows("shipsync_packages").length, 1);
});

// ── the duplicate-AWB and replay logic ───────────────────────────────────────

test("replay with an AWB that already belongs to another parcel is HELD, never merged or duplicated", async () => {
  be.rows("shipsync_packages").push({ id: "existing", barcode: "AWB-DUP", boat_name: "ORKA", status: "in_office", local_import: "Import" });
  const p = payload({ awb: "awb-dup" });                       // different case, still the same AWB
  const r = await commit.commitQueued(p, photo());
  assert.equal(r.result, "conflict");
  assert.equal(be.rows("shipsync_packages").length, 1);
  assert.equal(be.uploads.length, 0, "no photo is uploaded for a held check-in");
});

test("AWBs containing _ or % are matched literally, not as wildcards", async () => {
  be.rows("shipsync_packages").push({ id: "a", barcode: "ABXYZ", status: "in_office" });
  assert.equal(await commit.findByAwb("AB_YZ"), null);
  assert.equal(await commit.findByAwb("AB%"), null);
  be.rows("shipsync_packages").push({ id: "b", barcode: "AB_YZ", status: "in_office" });
  assert.equal((await commit.findByAwb("ab_yz"))?.id, "b");
});

test("checking in on an existing parcel: still-in-office becomes Warehouse, photo replaces the old one, paid columns merge in", async () => {
  be.rows("shipsync_packages").push({
    id: "ex", barcode: "AWB-EX", status: "in_office", item_photo_url: "shipsync/old.jpg",
    extra: { monday: { "Item ID": "M-1", Supplier: "Acme" }, keep: true },
  });
  const existing = (await commit.findByAwb("AWB-EX"))!;
  const p = payload({ board: "Import", paid: true, awb: "AWB-EX" });
  await commit.updateCheckin(existing, p, photo());
  const row = be.rows("shipsync_packages").find((r) => r.id === "ex")!;
  assert.equal(row.status, "in_storage");
  assert.match(row.item_photo_url, /^shipsync\/packages\/ex\/item_\d+\.jpg$/);
  assert.equal(row.extra.keep, true);
  assert.deepEqual(row.extra.monday, { "Item ID": "M-1", Supplier: "Acme", STATUS: "Warehouse", "Paid Amount": "250", "PAYMENT METHOD": "Cash" });
});

test("checking in on a parcel that has already moved on keeps its status and its old photo when none is taken", async () => {
  be.rows("shipsync_packages").push({ id: "ex", barcode: "AWB-OUT", status: "out_for_delivery", item_photo_url: "shipsync/old.jpg", extra: {} });
  const existing = (await commit.findByAwb("AWB-OUT"))!;
  await commit.updateCheckin(existing, payload({ awb: "AWB-OUT" }), null);
  const row = be.rows("shipsync_packages").find((r) => r.id === "ex")!;
  assert.equal(row.status, "out_for_delivery");
  assert.equal(row.item_photo_url, "shipsync/old.jpg");
});

test("a failed photo upload while checking in on an existing parcel leaves that parcel untouched", async () => {
  be.rows("shipsync_packages").push({ id: "ex", barcode: "AWB-X", status: "in_office", item_photo_url: "shipsync/old.jpg", extra: {} });
  const existing = (await commit.findByAwb("AWB-X"))!;
  be.faults.push({ match: /POST \/storage\//, fault: 500 });
  await assert.rejects(commit.updateCheckin(existing, payload({ awb: "AWB-X" }), photo()));
  const row = be.rows("shipsync_packages").find((r) => r.id === "ex")!;
  assert.equal(row.status, "in_office");
  assert.equal(row.item_photo_url, "shipsync/old.jpg");
});

// ── network error classification ─────────────────────────────────────────────

test("isNetworkError recognises the real browser / fetch failure messages and not ordinary errors", () => {
  for (const m of ["TypeError: Failed to fetch", "Failed to fetch", "Load failed", "fetch failed", "NetworkError when attempting to fetch resource.", "Network request failed"]) {
    assert.equal(commit.isNetworkError(new Error(m)), true, m);
  }
  for (const m of ["new row violates row-level security policy", "duplicate key value", "JWT expired"]) {
    assert.equal(commit.isNetworkError(new Error(m)), false, m);
  }
});

// ── regression: a check-in must ADD to an existing record, never wipe it ─────

test("checking in on a Monday-raised Import item keeps its consignee, courier, BOE, remarks, board and quantity", async () => {
  be.rows("shipsync_packages").push({
    id: "m1", barcode: "AWB-M", status: "in_office", local_import: "Import", boat_name: "ORKA",
    package_owner: "Captain Sue", courier: "FedEx", boe_no: "1019999", description: "fragile", num_packages: 7,
    received_at: "2026-09-01T00:00:00.000Z",
    extra: { monday_group_title: "IMPORT", monday_group_position: 1, monday: { "Item ID": "M-9", STATUS: "Incoming" } },
  });
  const existing = (await commit.findByAwb("AWB-M"))!;
  // the form on the phone had only the AWB and boat filled in
  const blank = payload({ awb: "AWB-M", board: "Local" });
  blank.fields = { ...blank.fields, boat_name: "ORKA", package_owner: null, courier: null, boe_no: null, description: null, num_packages: 1 };
  await commit.updateCheckin(existing, blank, null);

  const row = be.rows("shipsync_packages").find((r) => r.id === "m1")!;
  assert.equal(row.package_owner, "Captain Sue");
  assert.equal(row.courier, "FedEx");
  assert.equal(row.boe_no, "1019999");
  assert.equal(row.description, "fragile");
  assert.equal(row.num_packages, 7);
  assert.equal(row.local_import, "Import", "a check-in does not move the parcel to another board");
  assert.equal(row.received_at, "2026-09-01T00:00:00.000Z");
  assert.equal(row.status, "in_storage");
  assert.equal(row.extra.monday.STATUS, "Warehouse", "Incoming -> Warehouse now it has arrived");
  assert.equal(row.extra.monday_group_title, "IMPORT");
});

test("blank fields on the record are filled from the check-in; a typed BOE replaces the old one", async () => {
  be.rows("shipsync_packages").push({ id: "m2", barcode: "AWB-N", status: "in_office", local_import: "Import", boe_no: "OLD", package_owner: null, courier: "", num_packages: null, extra: {} });
  const existing = (await commit.findByAwb("AWB-N"))!;
  const p = payload({ awb: "AWB-N", board: "Import" });
  p.fields = { ...p.fields, package_owner: "Jo", courier: "DHL", boe_no: "1011111", num_packages: 3 };
  await commit.updateCheckin(existing, p, null);
  const row = be.rows("shipsync_packages").find((r) => r.id === "m2")!;
  assert.equal(row.package_owner, "Jo");
  assert.equal(row.courier, "DHL");
  assert.equal(row.boe_no, "1011111");
  assert.equal(row.num_packages, 3);
});

test("a Monday status that means something real (e.g. Out for Delivery) is not overwritten with Warehouse", async () => {
  be.rows("shipsync_packages").push({ id: "m3", barcode: "AWB-O", status: "in_office", local_import: "Import", extra: { monday: { STATUS: "Out for Delivery" } } });
  const existing = (await commit.findByAwb("AWB-O"))!;
  await commit.updateCheckin(existing, payload({ awb: "AWB-O", board: "Import" }), null);
  assert.equal(be.rows("shipsync_packages").find((r) => r.id === "m3")!.extra.monday.STATUS, "Out for Delivery");
});

// ── photo format / type ──────────────────────────────────────────────────────

test("a gallery photo that arrives with NO type is stored as an image, not a generic file", async () => {
  const { uploadShipSyncImage } = await import("@/lib/shipsync/data");
  const untyped = new File([new Uint8Array(500).fill(1)], "IMG_0042.jpg", { type: "" });
  const ref = await uploadShipSyncImage(untyped, "packages/x/item_1.jpg");
  assert.equal(ref, "shipsync/packages/x/item_1.jpg");
  assert.equal(be.uploads[0].partType, "image/jpeg");
});

test("a HEIC that cannot be re-encoded is stored as .heic (not mislabelled .jpg) with its real type", async () => {
  const { uploadShipSyncImage } = await import("@/lib/shipsync/data");
  const heic = new File([new Uint8Array(500).fill(1)], "IMG_1.HEIC", { type: "image/heic" });
  const ref = await uploadShipSyncImage(heic, "packages/x/item_2.jpg");
  assert.equal(ref, "shipsync/packages/x/item_2.heic");
  assert.equal(be.uploads[0].partType, "image/heic");
});

test("a signature upload keeps its .png name and type", async () => {
  const { uploadShipSyncImage } = await import("@/lib/shipsync/data");
  const sig = new Blob([new Uint8Array(300).fill(2)], { type: "image/png" });
  const ref = await uploadShipSyncImage(sig, "delivery-notes/1/signature_1.png", "signature");
  assert.equal(ref, "shipsync/delivery-notes/1/signature_1.png");
  assert.equal(be.uploads[0].partType, "image/png");
});

test("a PDF or other non-image file is uploaded untouched", async () => {
  const { uploadShipSyncImage } = await import("@/lib/shipsync/data");
  const pdf = new Blob([new Uint8Array(300).fill(3)], { type: "application/pdf" });
  const ref = await uploadShipSyncImage(pdf, "documents/a/scan.pdf");
  assert.equal(ref, "shipsync/documents/a/scan.pdf");
  assert.equal(be.uploads[0].partType, "application/pdf");
});

test("the fallback id generator makes valid, distinct UUIDs", () => {
  const ids = new Set(Array.from({ length: 200 }, () => commit.newId()));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("isNetworkError also recognises Safari's lost-connection and timeout messages", () => {
  for (const m of ["The network connection was lost.", "The request timed out.", "Request timeout", "socket hang up"]) {
    assert.equal(commit.isNetworkError(new Error(m)), true, m);
  }
});
