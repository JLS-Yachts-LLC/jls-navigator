/**
 * The background syncs and parcels checked in from the phone.
 *   - SharePoint: an OLDER record with the same AWB must not take a new phone parcel over; batch writes must not
 *     blank fields; a missing Status must not reset an existing row.
 *   - Monday: the phone's Warehouse status, paid details, board and Shipment Type survive the hourly pull; an empty
 *     board never deletes everything.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../components/logistics/__tests__/fake-backend";

const be = new FakeBackend();
let sp: typeof import("../sharepoint-sync.server");
let monday: typeof import("../shipsync/monday-import-board.server");

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  sp = await import("../sharepoint-sync.server");
  monday = await import("../shipsync/monday-import-board.server");
});
after(async () => { await be.stop(); });
beforeEach(() => be.reset());

const phoneRow = (created_at = "2026-10-09T10:57:23Z") => ({ extra: { checked_in_via: "logistics-app" }, created_at });

// ── SharePoint: older records ────────────────────────────────────────────────

test("an OLDER SharePoint record with the same AWB does not take a phone parcel over (the real incident)", () => {
  // phone check-in at 14:57 Dubai = 10:57Z; the old Power App record was created long before
  assert.equal(sp.spRecordPredatesPhoneRow({ createdDateTime: "2026-09-02T08:00:00Z" }, phoneRow()), true);
  assert.equal(sp.spRecordPredatesPhoneRow({ createdDateTime: "2026-10-09T10:30:00Z" }, phoneRow()), true);
});

test("a record created AFTER the check-in (the Power App entering the same parcel) is still merged, as are near-simultaneous ones", () => {
  assert.equal(sp.spRecordPredatesPhoneRow({ createdDateTime: "2026-10-09T11:30:00Z" }, phoneRow()), false);
  assert.equal(sp.spRecordPredatesPhoneRow({ createdDateTime: "2026-10-09T10:56:50Z" }, phoneRow()), false, "within a minute: treated as the same event");
});

test("rows that did not come from the phone are never protected, and unknown dates fail open to the old behaviour", () => {
  assert.equal(sp.spRecordPredatesPhoneRow({ createdDateTime: "2020-01-01T00:00:00Z" }, { extra: {}, created_at: "2026-10-09T10:57:23Z" }), false);
  assert.equal(sp.spRecordPredatesPhoneRow({}, phoneRow()), false);
  assert.equal(sp.spRecordPredatesPhoneRow({ createdDateTime: "not a date" }, phoneRow()), false);
  assert.equal(sp.spRecordPredatesPhoneRow({ createdDateTime: "2020-01-01T00:00:00Z" }, { extra: { checked_in_via: "logistics-app" } }), false);
});

// ── SharePoint: batch writes ─────────────────────────────────────────────────

test("rows are grouped by the exact set of columns they carry", () => {
  const groups = sp.groupByColumnSet([
    { id: "a", boat_name: "X", boe_no: "1" }, { id: "b", boat_name: "Y" }, { id: "c", boe_no: "2", boat_name: "Z" }, { id: "d", boat_name: "W" },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.map((r) => r.id).sort()).sort(), [["a", "c"], ["b", "d"]]);
});

test("WITHOUT grouping, one mixed batch blanks a field on the row that didn't carry it (why the grouping exists)", async () => {
  const { supabase } = await import("@/integrations/supabase/client");
  be.rows("shipsync_packages").push({ id: "p1", boat_name: "A", boe_no: "KEEP-ME" }, { id: "p2", boat_name: "B", boe_no: "OLD" });
  await (supabase as any).from("shipsync_packages").upsert([{ id: "p1", boat_name: "A2" }, { id: "p2", boat_name: "B2", boe_no: "NEW" }] as never, { onConflict: "id" });
  assert.equal(be.rows("shipsync_packages").find((r) => r.id === "p1")!.boe_no, null, "p1's BOE was wiped by p2's key");
});

test("WITH grouping, the same updates leave that field alone", async () => {
  const { supabase } = await import("@/integrations/supabase/client");
  be.rows("shipsync_packages").push({ id: "p1", boat_name: "A", boe_no: "KEEP-ME" }, { id: "p2", boat_name: "B", boe_no: "OLD" });
  for (const g of sp.groupByColumnSet([{ id: "p1", boat_name: "A2" }, { id: "p2", boat_name: "B2", boe_no: "NEW" }])) {
    await (supabase as any).from("shipsync_packages").upsert(g as never, { onConflict: "id" });
  }
  const r = (id: string) => be.rows("shipsync_packages").find((x) => x.id === id)!;
  assert.equal(r("p1").boe_no, "KEEP-ME");
  assert.equal(r("p1").boat_name, "A2");
  assert.equal(r("p2").boe_no, "NEW");
});

// ── Monday ───────────────────────────────────────────────────────────────────

const mondayNow = (over: Record<string, string> = {}) => ({
  local_import: "Import", trade_type: "Import Shipment", courier: "DHL",
  extra: { monday_item_id: "m1", monday: { STATUS: "Incoming", "Item ID": "M-9", ...over }, monday_group_title: "IMPORT", monday_group_id: "g1", monday_group_position: 0, monday_synced_group_title: "IMPORT" },
});
const phoneExtra = {
  checked_in_via: "logistics-app", monday_group_title: "TRANSIT", monday_group_position: 3,
  monday: { STATUS: "Warehouse", "Paid Amount": "250", "PAYMENT METHOD": "Cash", "Item ID": "SHP26-000900" },
};

test("Monday's pull keeps the phone's Warehouse status and paid details", () => {
  const out = monday.keepPhoneFields(mondayNow(), phoneExtra, null) as any;
  assert.equal(out.extra.monday.STATUS, "Warehouse", "Incoming does not put an arrived parcel back");
  assert.equal(out.extra.monday["Paid Amount"], "250");
  assert.equal(out.extra.monday["PAYMENT METHOD"], "Cash");
  assert.equal(out.extra.monday["Item ID"], "M-9", "Monday's own Item ID wins when it has one");
  assert.equal(out.courier, "DHL", "everything else still comes from Monday");
});

test("a Monday status that means something real (e.g. Delivered - TBI) replaces Warehouse", () => {
  const out = monday.keepPhoneFields(mondayNow({ STATUS: "Delivered - TBI" }), phoneExtra, null) as any;
  assert.equal(out.extra.monday.STATUS, "Delivered - TBI");
});

test("Monday's own paid amount wins; the phone's fills only a blank", () => {
  const out = monday.keepPhoneFields(mondayNow({ "Paid Amount": "999" }), phoneExtra, null) as any;
  assert.equal(out.extra.monday["Paid Amount"], "999");
  assert.equal(out.extra.monday["PAYMENT METHOD"], "Cash");
});

test("a Transit parcel is not turned into Import, the form's Shipment Type stands, and the group the phone chose stays", () => {
  const out = monday.keepPhoneFields(mondayNow(), phoneExtra, "Local") as any;
  assert.equal("local_import" in out, false);
  assert.equal("trade_type" in out, false);
  assert.equal(out.extra.monday_group_title, undefined, "Monday's group is not applied over the phone's");
  const noType = monday.keepPhoneFields(mondayNow(), phoneExtra, null) as any;
  assert.equal(noType.trade_type, "Import Shipment", "no type on the row: Monday's fills it");
});

test("parcels NOT checked in from the phone are merged exactly as before", () => {
  const rec = mondayNow();
  const out = monday.keepPhoneFields(rec, { monday: { STATUS: "Warehouse" } }, "Local");
  assert.equal(out, rec, "untouched");
});
