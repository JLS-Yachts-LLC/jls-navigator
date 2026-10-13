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

// ── Photo look-ups that found nothing ────────────────────────────────────────

test("a photo that was looked for and not found is left alone for a day, then tried again", () => {
  const now = Date.parse("2026-10-13T12:00:00Z");
  const extra = { photo_miss: { delivery_photo_url: "2026-10-13T06:00:00Z" } };
  assert.equal(sp.photoRecentlyMissed(extra, "delivery_photo_url", now), true, "6 hours ago: skip");
  assert.equal(sp.photoRecentlyMissed(extra, "signature_url", now), false, "a different photo is its own question");
  assert.equal(sp.photoRecentlyMissed({ photo_miss: { delivery_photo_url: "2026-10-12T06:00:00Z" } }, "delivery_photo_url", now), false, "30 hours ago: try again");
  assert.equal(sp.photoRecentlyMissed(undefined, "delivery_photo_url", now), false);
  assert.equal(sp.photoRecentlyMissed({ photo_miss: { delivery_photo_url: "garbage" } }, "delivery_photo_url", now), false);
});

// -- Finding a delivery note's stage folder ----------------------------------

test("the stage folder is found despite spelling differences, and files are never mistaken for folders", () => {
  const kids = [
    { name: "Received in Office", folder: {} }, { name: "Delivery Images", folder: {} }, { name: "signature", folder: {} },
    { name: "Delivery Image.jpg", file: {} },
  ];
  assert.equal(sp.pickStageFolder(kids, "Received in Office")?.name, "Received in Office");
  assert.equal(sp.pickStageFolder(kids, "Delivery Image")?.name, "Delivery Images", "plural");
  assert.equal(sp.pickStageFolder(kids, "Signature Image")?.name, "signature", "first word");
  assert.equal(sp.pickStageFolder([{ name: "Delivery Image.jpg", file: {} }], "Delivery Image"), null, "a file is not a folder");
  assert.equal(sp.pickStageFolder([], "Delivery Image"), null);
  assert.equal(sp.pickStageFolder([{ name: "Other", folder: {} }], "Signature Image"), null);
});

test("a loose picture's Power App column is read from its file name, and a note folder is described by what it holds", () => {
  assert.equal(sp.pictureTag("Reserved_ImageAttachment_[13]_[PictureofItem][32]_[0a59][1]_[1].jpeg-SUNRAYS-1629.jpg"), "PictureofItem");
  assert.equal(sp.pictureTag("IMG_0001.jpg"), null);
  const text = sp.describeNoteFolder([
    { name: "Reserved_ImageAttachment_[13]_[PictureofItem][32]_[a][1]_[1].jpeg-X-1.jpg", file: {} },
    { name: "Reserved_ImageAttachment_[13]_[PictureofItem][32]_[b][1]_[1].jpeg-X-1.jpg", file: {} },
    { name: "Reserved_ImageAttachment_[25]_[PictureonDeliverytoClient][37]_[c][1]_[7].jpeg-X-1.jpg", file: {} },
    { name: "Notes", folder: {} },
  ]);
  assert.match(text, /3 file\(s\)/);
  assert.match(text, /PictureofItem x2/);
  assert.match(text, /PictureonDeliverytoClient x1/);
  assert.match(text, /folders: Notes/);
});

// ── Power App vs Polaris comparison ──────────────────────────────────────────

test("the real SharePoint picture columns are recognised, whichever list spells them", () => {
  assert.equal(sp.pictureKind("PictureofItem"), "item");
  assert.equal(sp.pictureKind("Picture_x0020_of_x0020_Item_x002"), "item");
  assert.equal(sp.pictureKind("PictureonDeliverytoClient"), "delivery");
  assert.equal(sp.pictureKind("Picture_x0020_on_x0020_Delivery_"), "delivery");
  assert.equal(sp.pictureKind("SignatureReceiverOnDelivery"), "signature");
  assert.equal(sp.pictureKind("Signature_x0020_Receiver_x0020_O"), "signature");
  assert.equal(sp.pictureKind("Deliverynoteimage"), null);
  assert.equal(sp.pictureKind("Barcode"), null);
});

test("values are normalised before they are compared, so spelling and date format don't count as differences", () => {
  assert.equal(sp.normForCompare("boat_name", "  OCEAN  Victory "), "ocean victory");
  assert.equal(sp.normForCompare("delivered_at", "2026-07-31T18:55:35Z"), "2026-07-31");
  assert.equal(sp.normForCompare("num_packages", "3.0"), "3");
  assert.equal(sp.normForCompare("status", ""), "");
  assert.equal(sp.normForCompare("status", null), "");
});

// -- Two Power App records for one AWB -----------------------------------------

test("the real delivery wins over a placeholder record for the same AWB, whichever comes last in the list", () => {
  const placeholder = { delivery_note_no: "0000", received_at: "2026-01-16", status: "delivered", boat_name: "AURORA X", extra: { sp_delivered_item_id: 7974 } };
  const real = { delivery_note_no: "1640", delivered_at: "2026-01-09", receiver_full_name: "Adrian Heron", received_at: "2026-01-09", boat_name: "AURORA X", courier: "Amazon", status: "delivered", extra: { sp_delivered_item_id: 6584 } };
  for (const [a, b] of [[placeholder, real], [real, placeholder]]) {
    const m = sp.mergeSpRecords(a, b);
    assert.equal(m.delivery_note_no, "1640");
    assert.equal(m.receiver_full_name, "Adrian Heron");
    assert.equal(m.delivered_at, "2026-01-09");
    assert.equal(m.extra.sp_delivered_item_id, 6584, "the parcel stays linked to the record that won");
  }
});

test("the loser still fills in what the winner doesn't know, and an equal pair keeps the later record as before", () => {
  const a = { delivery_note_no: "1700", courier: "DHL", boat_name: "X", extra: { n: 1 } };
  const b = { delivery_note_no: "1701", receiver_full_name: "Pat", boat_name: "X", extra: { n: 2 } };
  const m = sp.mergeSpRecords(a, b);
  assert.equal(m.delivery_note_no, "1701", "tie: the later one");
  assert.equal(m.courier, "DHL", "the earlier one's courier is not lost");
  assert.equal(m.receiver_full_name, "Pat");
  assert.equal(m.extra.n, 2);
});
