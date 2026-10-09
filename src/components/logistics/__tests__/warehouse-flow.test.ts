/**
 * Store In, Move to Storage and Warehouse - Out against the fake backend: what is
 * (and is not) left behind when a step fails half-way, and that stock can't be promised twice.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "./fake-backend";

const be = new FakeBackend();
let wh: typeof import("../logistics-warehouse-data");
let out: typeof import("../logistics-warehouse-out-data");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-key";
  Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
  wh = await import("../logistics-warehouse-data");
  out = await import("../logistics-warehouse-out-data");
});
after(async () => { await be.stop(); });

beforeEach(() => {
  be.reset();
  let c = 0, w = 0;
  be.rpcs.set("next_warehouse_client_ref", () => `JLSWH26-${String(++c).padStart(5, "0")}`);
  be.rpcs.set("next_warehouse_internal_ref", () => `JLS-INT-26-${String(++c).padStart(4, "0")}`);
  be.rpcs.set("next_warehouse_checkout_number", () => `WH${String(++w).padStart(4, "0")}`);
  be.rpcs.set("next_warehouse_package_item_id", (a: { p_ref_no: string }) =>
    `${a.p_ref_no}-${String(be.rows("warehouse_package_contents").filter((r) => r.ref_no === a.p_ref_no).length + 1).padStart(2, "0")}`);
});

const jpg = () => new File([new Uint8Array(1200).fill(4)], "x.jpg", { type: "image/jpeg" });
const loc = { zone: "A", bay: "1", shelf: "1" };
const clientStore = (over: Record<string, unknown> = {}) => ({
  client: "NIRVANA", description: "Crate", quotation: "Q1", length: "100", width: "100", height: "100", weight: "50",
  dateStored: "2026-10-09", dueDate: "", charges: "", loc, photo: null as File | null, docs: [] as File[], packing: [] as any[], ...over,
});
const line = (name: string, over: Record<string, unknown> = {}) => ({ itemName: name, quantity: "2", unit: "pcs", remarks: "", photo: null as File | null, ...over });

// ── Store In ─────────────────────────────────────────────────────────────────

test("Store In: record, photo and packing list are saved with the ref, item IDs and location", async () => {
  const ref = await wh.storeClient(clientStore({ photo: jpg(), packing: [line("Glass", { photo: jpg() }), line("Plates")] }));
  assert.equal(ref, "JLSWH26-00001");
  const item = be.rows("warehouse_client_items")[0];
  assert.equal(item.ref_no, ref);
  assert.equal(item.cbm, 1);
  assert.match(item.image_url, /^shipsync\/warehouse\/client\/JLSWH26-00001\/photo-\d+\.jpg$/);
  assert.deepEqual(be.rows("warehouse_package_contents").map((c) => c.item_id), ["JLSWH26-00001-01", "JLSWH26-00001-02"]);
  assert.equal(be.rows("warehouse_package_contents")[0].quantity, 2);
});

test("Store In: a failed photo upload creates NOTHING (no record to duplicate on retry)", async () => {
  be.faults.push({ match: /POST \/storage\//, fault: 500 });
  await assert.rejects(wh.storeClient(clientStore({ photo: jpg() })));
  assert.equal(be.rows("warehouse_client_items").length, 0);
});

test("Store In: a packing-list photo that fails to upload creates nothing either (uploads happen before the record)", async () => {
  // the box photo uploads fine; the second upload (a packing line's photo) is rejected
  be.faults.push({ match: /POST \/storage\//, fault: 500, when: (n) => n >= 2 });
  await assert.rejects(wh.storeClient(clientStore({ photo: jpg(), packing: [line("Glass", { photo: jpg() })] })));
  assert.equal(be.rows("warehouse_client_items").length, 0);
  assert.equal(be.rows("warehouse_package_contents").length, 0);
});

test("Store In: if a packing line fails to save, the record and the lines already made are removed (Save again must not store it twice)", async () => {
  be.faults.push({ match: /POST \/rest\/v1\/warehouse_package_contents/, fault: 500, when: (n) => n >= 2 });   // the SECOND line fails
  await assert.rejects(wh.storeClient(clientStore({ packing: [line("Glass"), line("Plates"), line("Cups")] })));
  assert.equal(be.rows("warehouse_client_items").length, 0, "the box record was removed");
  assert.equal(be.rows("warehouse_package_contents").length, 0, "and so was the line that had been made");
});

test("Store In: a zero or negative quantity or dimension never makes a negative CBM or charge", async () => {
  await wh.storeClient(clientStore({ length: "-100", width: "-100", height: "100", packing: [line("X", { quantity: "-5" })] }));
  const item = be.rows("warehouse_client_items")[0];
  assert.equal(item.length_cm, null);
  assert.equal(item.cbm, null);
  assert.equal(be.rows("warehouse_package_contents")[0].quantity, 1);
});

test("the monthly charge is rounded to pence", () => {
  assert.equal(wh.storageCharge(3.3333), 850 + 94.99);
  assert.equal(wh.storageCharge(3.5), 992.5);
});

// ── Move to Storage ──────────────────────────────────────────────────────────

const parcelRow = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, barcode: `AWB-${id}`, boat_name: "NIRVANA", package_owner: "Jo", courier: "DHL", num_packages: 1, status: "in_office", delivery_note_id: null, extra: {}, ...over });
const asLite = (...ids: string[]) => ids.map((id) => be.rows("shipsync_packages").find((p) => p.id === id)) as any[];
const move = (parcels: any[], mode: "box" | "individual" = "box") =>
  wh.moveParcelsToStorage(parcels, { mode, length: "100", width: "50", height: "50", weight: "20", quotation: "Q9", loc, photo: jpg() });

test("Move to Storage as a box: one record, an item ID per parcel, parcels flagged as warehoused", async () => {
  be.rows("shipsync_packages").push(parcelRow("P1"), parcelRow("P2"));
  const ref = await move(asLite("P1", "P2"));
  assert.equal(be.rows("warehouse_client_items").length, 1);
  assert.equal(be.rows("warehouse_package_contents").length, 2);
  for (const id of ["P1", "P2"]) {
    const p = be.rows("shipsync_packages").find((r) => r.id === id)!;
    assert.equal(p.status, "in_storage");
    assert.equal(p.extra.warehouse_ref, ref);
  }
});

test("Move to Storage: a parcel that has just gone onto a delivery note stops the whole move before anything is created", async () => {
  be.rows("shipsync_packages").push(parcelRow("P1"), parcelRow("P2", { delivery_note_id: "N9" }));
  await assert.rejects(move(asLite("P1", "P2")), /delivery note/);
  assert.equal(be.rows("warehouse_client_items").length, 0);
  assert.equal(be.rows("shipsync_packages").find((p) => p.id === "P1")!.status, "in_office");
});

test("Move to Storage: if flagging a parcel fails, everything is backed out — parcels as they were, no record left", async () => {
  be.rows("shipsync_packages").push(parcelRow("P1", { warehouse_zone: null }), parcelRow("P2"));
  be.faults.push({ match: /PATCH \/rest\/v1\/shipsync_packages/, fault: 500, when: (n) => n === 2 });   // the SECOND parcel fails
  await assert.rejects(move(asLite("P1", "P2")));
  assert.equal(be.rows("warehouse_client_items").length, 0);
  assert.equal(be.rows("warehouse_package_contents").length, 0);
  for (const id of ["P1", "P2"]) {
    const p = be.rows("shipsync_packages").find((r) => r.id === id)!;
    assert.equal(p.status, "in_office", `${id} is back to how it was`);
    assert.equal(p.extra.warehouse_ref, undefined);
  }
});

test("Move to Storage: two different boats cannot go in one record", async () => {
  be.rows("shipsync_packages").push(parcelRow("P1"), parcelRow("P2", { boat_name: "ORKA" }));
  await assert.rejects(move(asLite("P1", "P2")), /one client/);
});

// ── Warehouse - Out: stock can't be promised twice ───────────────────────────

async function seedBox(ref = "JLSWH26-00111") {
  const c = { id: `ci-${ref}`, ref_no: ref, client_name: "NIRVANA", description: "Assorted Box", status: "Stored" };
  be.rows("warehouse_client_items").push(c);
  const lines = [{ id: `${ref}-a`, item_id: `${ref}-01`, ref_no: ref, item_name: "Glass", quantity: 3, status: "Stored", client_or_dept: "NIRVANA" },
                 { id: `${ref}-b`, item_id: `${ref}-02`, ref_no: ref, item_name: "Plates", quantity: 5, status: "Stored", client_or_dept: "NIRVANA" }];
  be.rows("warehouse_package_contents").push(...lines);
  return { c, lines };
}
const pkgLine = (ref = "JLSWH26-00111") => ({ kind: "package" as const, key: `p:ci-${ref}`, clientItemId: `ci-${ref}`, ref_no: ref, boat: "NIRVANA", description: "Assorted Box" });
const contentLine = (suffix: "a" | "b", qtyOut = 2, ref = "JLSWH26-00111") => ({
  kind: "content" as const, key: `c:${ref}-${suffix}`, contentId: `${ref}-${suffix}`, ref_no: ref, itemId: `${ref}-0${suffix === "a" ? 1 : 2}`, boat: "NIRVANA", description: "x", stored: suffix === "a" ? 3 : 5, qtyOut,
});
const draft = (lines: any[], over: Record<string, unknown> = {}) => ({ mode: "client" as const, lines, date: "", driverId: "", destination: "", carrier: "", ...over });

test("a check-out saves with its lines and a WH number", async () => {
  await seedBox();
  const co = await out.saveCheckout(null, draft([contentLine("a")]), "draft");
  assert.equal(co.number, "WH0001");
  assert.equal(be.rows("warehouse_checkout_items").length, 1);
  assert.equal(be.rows("warehouse_checkout_items")[0].qty_out, 2);
});

test("items taken from a box on one check-out block the WHOLE box on another", async () => {
  await seedBox();
  await out.saveCheckout(null, draft([contentLine("a")]), "draft");
  await assert.rejects(out.saveCheckout(null, draft([pkgLine()]), "draft"), /another check-out/);
  const stock = await out.loadStock("NIRVANA", null);
  assert.equal(stock.packages.length, 0, "the box is no longer offered whole");
  assert.equal(stock.contents.length, 1, "but its other line still is");
  assert.equal((await out.findByScan("JLSWH26-00111", null)).reason?.includes("can't go out whole"), true);
});

test("a whole box on one check-out blocks its items on another", async () => {
  await seedBox();
  await out.saveCheckout(null, draft([pkgLine()]), "draft");
  await assert.rejects(out.saveCheckout(null, draft([contentLine("b")]), "draft"), /another check-out/);
  const stock = await out.loadStock("NIRVANA", null);
  assert.equal(stock.packages.length, 0);
  assert.equal(stock.contents.length, 0);
});

test("the same check-out cannot hold a box whole AND items from inside it", async () => {
  await seedBox();
  await assert.rejects(out.saveCheckout(null, draft([pkgLine(), contentLine("a")]), "draft"), /whole package AND/);
  assert.equal(be.rows("warehouse_checkouts").length, 0);
  assert.equal(out.sameBoxClash([pkgLine(), contentLine("a")]) !== null, true);
  assert.equal(out.sameBoxClash([contentLine("a"), contentLine("b")]), null);
});

test("editing a check-out does not collide with its own earlier lines", async () => {
  await seedBox();
  const co = await out.saveCheckout(null, draft([contentLine("a")]), "draft");
  const again = await out.saveCheckout(co.id, draft([contentLine("a", 1), contentLine("b")]), "draft");
  assert.equal(again.id, co.id);
  assert.equal(be.rows("warehouse_checkout_items").length, 2);
});

test("a Qty Out larger than what is stored is refused", async () => {
  await seedBox();
  await assert.rejects(out.saveCheckout(null, draft([contentLine("a", 4)]), "draft"), /between 1 and 3/);
  await assert.rejects(out.saveCheckout(null, draft([contentLine("a", 0)]), "draft"), /between 1 and 3/);
});

test("a brand-new check-out whose lines fail to save is not left behind as an empty draft", async () => {
  await seedBox();
  be.faults.push({ match: /POST \/rest\/v1\/warehouse_checkout_items/, fault: 500, times: 1 });
  await assert.rejects(out.saveCheckout(null, draft([contentLine("a")]), "draft"));
  assert.equal(be.rows("warehouse_checkouts").length, 0);
});

test("if the old lines can't be removed while editing, the new ones are backed out (no double counting at release)", async () => {
  await seedBox();
  const co = await out.saveCheckout(null, draft([contentLine("a")]), "draft");
  be.faults.push({ match: /DELETE \/rest\/v1\/warehouse_checkout_items/, fault: 500, times: 1 });
  await assert.rejects(out.saveCheckout(co.id, draft([contentLine("b")]), "draft"));
  assert.deepEqual(be.rows("warehouse_checkout_items").map((i) => i.content_id), ["JLSWH26-00111-a"]);
});

test("saving or cancelling a check-out that has already been released says so, instead of pretending", async () => {
  await seedBox();
  const co = await out.saveCheckout(null, draft([contentLine("a")]), "draft");
  be.rows("warehouse_checkouts").find((c) => c.id === co.id)!.status = "released";
  await assert.rejects(out.saveCheckout(co.id, draft([contentLine("a")]), "draft"), /already been released/);
  await assert.rejects(out.cancelCheckout(co.id), /already been released/);
});

test("a cancelled check-out frees its stock", async () => {
  await seedBox();
  const co = await out.saveCheckout(null, draft([pkgLine()]), "draft");
  assert.equal((await out.loadStock("NIRVANA", null)).packages.length, 0);
  await out.cancelCheckout(co.id);
  assert.equal((await out.loadStock("NIRVANA", null)).packages.length, 1);
});

test("scanning: a package reference or an item ID resolves; unknown and already-out codes explain themselves", async () => {
  await seedBox();
  assert.equal((await out.findByScan("jlswh26-00111", null)).line?.kind, "package");
  assert.equal((await out.findByScan("JLSWH26-00111-02", null)).line?.kind, "content");
  assert.match((await out.findByScan("NOPE-1", null)).reason ?? "", /isn't in the warehouse/);
  be.rows("warehouse_client_items")[0].status = "Completed";
  assert.match((await out.findByScan("JLSWH26-00111", null)).reason ?? "", /already left/);
});

test("the delivery note for a third-party driver lists every line and escapes what was typed", async () => {
  let blob: Blob | null = null;
  (globalThis as any).window = { open: () => null };
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = (b: Blob) => { blob = b; return "blob:x"; };
  try {
    out.openDeliveryNote({ number: "WH0003", boat_name: "<NIRVANA>" } as any, [{ ...contentLine("a"), description: "<script>x</script>" }], "Bob & Co");
  } finally { URL.createObjectURL = realCreate; }
  const html = await (blob as unknown as Blob).text();
  assert.match(html, /Delivery Note WH0003/);
  assert.match(html, /&lt;NIRVANA&gt;/);
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /Bob &amp; Co/);
  assert.ok(!html.includes("<script>x</script>"), "typed text is never injected as markup");
});
