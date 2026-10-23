/** The Dashboard / Routing / chart logic for Import, Transit and Export shipments. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  progressOf, tradeKind, tradeTotals, incomingShipments, arrivingShipments, isIncomingStatus, exportTotals, upcomingExports, isRoutable, awbOf, type TradeRow,
} from "../trade-summary";
import { bucketKey, bucketRange, timeSeries } from "../chart-buckets";

let n = 0;
const row = (over: Record<string, unknown> = {}, monday: Record<string, string> = {}, group?: string): TradeRow & { delivery_note_id?: string | null } =>
  ({
    id: `R${++n}`, status: "in_office", local_import: "Import", num_packages: 1, boat_name: "ORKA", barcode: `AWB${n}`, received_at: "2026-10-10T08:00:00Z",
    extra: { monday, ...(group ? { monday_group_title: group } : {}) }, ...over,
  }) as any;

test("the Monday group decides what is finished, not the app status: a Completed shipment still reading 'in office' is not pending", () => {
  assert.equal(progressOf(row({}, {}, "Completed")), "delivered");
  assert.equal(progressOf(row({}, {}, "Delivered Shipment")), "delivered");
  assert.equal(progressOf(row({}, {}, "IMPORT")), "pending");
  assert.equal(progressOf(row({}, {}, "TRANSIT")), "pending");
  assert.equal(progressOf(row({}, {}, "Cancelled")), "cancelled");
  assert.equal(progressOf(row({}, { STATUS: "Canceled" }, "Completed")), "cancelled", "a Canceled status wins even in the Completed group");
});

test("with no Monday group the recorded status decides", () => {
  assert.equal(progressOf(row({ status: "delivered" })), "delivered");
  assert.equal(progressOf(row({ status: "delivered_tbi" })), "delivered");
  assert.equal(progressOf(row({ status: "in_office" })), "pending");
  assert.equal(progressOf(row({ status: "assigned" })), "pending");
});

test("Transit is the Transit tag, the TRANSIT group or a Transit Shipment; the rest of that board is Import", () => {
  assert.equal(tradeKind(row({ local_import: "Transit" })), "Transit");
  assert.equal(tradeKind(row({}, {}, "TRANSIT")), "Transit");
  assert.equal(tradeKind(row({}, { "Shipment Type": "Transit Shipment" })), "Transit");
  assert.equal(tradeKind(row({}, { "Shipment Type": "DDP Shipment" })), "Import");
  assert.equal(tradeKind(row({}, {}, "IMPORT")), "Import");
});

test("totals split Import and Transit into not yet delivered and delivered, counting quantity, and leave cancelled out", () => {
  const t = tradeTotals([
    row({ num_packages: 3 }, {}, "IMPORT"), row({ num_packages: 2 }, {}, "IMPORT"),
    row({ local_import: "Transit", num_packages: 4 }, {}, "TRANSIT"),
    row({ num_packages: 5 }, {}, "Completed"), row({ local_import: "Transit", num_packages: 1, status: "delivered" }),
    row({}, {}, "Cancelled"),
  ]);
  assert.deepEqual(t.Import.pending, { shipments: 2, qty: 5 });
  assert.deepEqual(t.Import.delivered, { shipments: 1, qty: 5 });
  assert.deepEqual(t.Transit.pending, { shipments: 1, qty: 4 });
  assert.deepEqual(t.Transit.delivered, { shipments: 1, qty: 1 });
});

test("the incoming list is only what is not delivered, soonest ETA first, with no-ETA ones last (newest received first)", () => {
  const list = incomingShipments([
    row({ boat_name: "NO ETA OLD", received_at: "2026-09-01T00:00:00Z" }, {}, "IMPORT"),
    row({ boat_name: "LATE", eta: "2026-11-20" }, {}, "IMPORT"),
    row({ boat_name: "SOON", eta: "2026-10-18", local_import: "Transit" }, {}, "TRANSIT"),
    row({ boat_name: "NO ETA NEW", received_at: "2026-10-12T00:00:00Z" }, {}, "IMPORT"),
    row({ boat_name: "DONE", eta: "2026-10-01" }, {}, "Completed"),
    row({ boat_name: "", eta: "2026-10-25" }, {}, "IMPORT"),
  ]);
  assert.deepEqual(list.map((r) => r.client), ["SOON", "—", "LATE", "NO ETA NEW", "NO ETA OLD"]);
  assert.equal(list[0].kind, "Transit");
  assert.equal(list[0].eta, "2026-10-18");
});

test("the AWB is the barcode on the Import board and the Monday AWB column on the Export board", () => {
  const r = row({ barcode: "Q26-0001" }, { "Air WayBill/Tracking Number": "176-1234" });
  assert.equal(awbOf(r, "import"), "Q26-0001");
  assert.equal(awbOf(r, "export"), "176-1234");
});

test("export totals count every export but cancelled, split into open and completed; the upcoming list is the open ones by ETD", () => {
  const rows = [
    row({ local_import: "Export", num_packages: 2, boat_name: "A", etd: "2026-10-30" }, { "Air WayBill/Tracking Number": "111" }, "Export"),
    row({ local_import: "Export", boat_name: "B", etd: "2026-10-20" }, { "Air WayBill/Tracking Number": "222" }, "Export"),
    row({ local_import: "Export", boat_name: "C" }, { "Air WayBill/Tracking Number": "333" }, "COMPLETED"),
    row({ local_import: "Export", boat_name: "D" }, {}, "Cancelled"),
  ];
  assert.deepEqual(exportTotals(rows), { total: 3, open: 2, completed: 1, qty: 4, openQty: 3 });
  assert.deepEqual(upcomingExports(rows).map((r) => [r.client, r.awb, r.etd]), [["B", "222", "2026-10-20"], ["A", "111", "2026-10-30"]]);
});

test("Routing takes Local, Import and Transit parcels waiting in the office, not finished or cancelled ones, nor Export / EDAS", () => {
  assert.equal(isRoutable(row({ local_import: "Local" })), true);
  assert.equal(isRoutable(row({ local_import: null })), true, "an untagged legacy parcel is Local");
  assert.equal(isRoutable(row({ local_import: "Import" }, {}, "IMPORT")), true);
  assert.equal(isRoutable(row({ local_import: "Import" })), true, "a phone check-in with no Monday group yet");
  assert.equal(isRoutable(row({ local_import: "Transit", status: "in_storage" }, {}, "TRANSIT")), true);
  assert.equal(isRoutable(row({ local_import: "Import" }, {}, "Completed")), false, "Monday says it is done, whatever the status reads");
  assert.equal(isRoutable(row({ local_import: "Import" }, {}, "Cancelled")), false);
  assert.equal(isRoutable(row({ local_import: "Export" }, {}, "Export")), false);
  assert.equal(isRoutable(row({ local_import: "EDAS" })), false);
  assert.equal(isRoutable(row({ local_import: "Local", delivery_note_id: "N1" })), false);
  assert.equal(isRoutable(row({ local_import: "Local", status: "assigned" })), false);
  assert.equal(isRoutable(row({ local_import: "Local", extra: { warehouse_ref: "W1" } })), false);
});

// ── chart periods ────────────────────────────────────────────────────────────

const NOW = new Date(2026, 9, 16, 12, 0, 0); // Fri 16 Oct 2026

test("each period has a fixed window ending today: 30 days, 12 weeks (Monday-based), 12 months", () => {
  const d = bucketRange("daily", NOW); assert.equal(d.length, 30); assert.equal(d[29], "2026-10-16"); assert.equal(d[0], "2026-09-17");
  const w = bucketRange("weekly", NOW); assert.equal(w.length, 12); assert.equal(w[11], "2026-10-12", "this week's Monday"); assert.equal(w[0], "2026-07-27");
  const m = bucketRange("monthly", NOW); assert.equal(m.length, 12); assert.equal(m[11], "2026-10"); assert.equal(m[0], "2025-11");
  assert.equal(bucketKey("weekly", new Date(2026, 9, 18)), "2026-10-12", "Sunday belongs to the week that began the Monday before");
});

test("the time series is quantity per bucket by client: empty buckets are zero rows, other clients fold into Other, undated or old rows are left out", () => {
  const rows = [
    { received_at: new Date(2026, 9, 16, 9).toISOString(), boat_name: "ORKA", num_packages: 2 },
    { received_at: new Date(2026, 9, 16, 15).toISOString(), boat_name: "ORKA", num_packages: 1 },
    { received_at: new Date(2026, 9, 14, 9).toISOString(), boat_name: "ZEUS", num_packages: 4 },
    { received_at: new Date(2026, 9, 14, 9).toISOString(), boat_name: "OTHERS", num_packages: 5 },
    { received_at: null, boat_name: "ORKA", num_packages: 9 },
    { received_at: new Date(2025, 0, 5).toISOString(), boat_name: "ORKA", num_packages: 9 },
  ];
  const daily = timeSeries(rows, "daily", NOW, ["ORKA", "ZEUS"]);
  assert.equal(daily.length, 30);
  assert.equal(daily[29].ORKA, 3);
  assert.equal(daily[27].ZEUS, 4);
  assert.equal(daily[27].Other, 5);
  assert.equal(daily[28].ORKA, undefined, "a quiet day has no bars");
  const weekly = timeSeries(rows, "weekly", NOW, ["ORKA", "ZEUS"]);
  assert.equal(weekly[11].ORKA, 3); assert.equal(weekly[11].ZEUS, 4);
  const monthly = timeSeries(rows, "monthly", NOW, ["ORKA"]);
  assert.equal(monthly[11].ORKA, 3); assert.equal(monthly[11].Other, 9);  // every row carries its own total, for the figure above the bar
  assert.equal(daily[29].__total, 3);
  assert.equal(daily[27].__total, 9, "ZEUS 4 + the others folded into Other 5");
  assert.equal(daily[28].__total, 0, "a quiet day totals zero");
  assert.equal(weekly[11].__total, 12);
});

test("the Incoming list is only shipments whose status is Incoming, not ones already in the Warehouse or Office", () => {
  assert.equal(isIncomingStatus("Incoming"), true);
  assert.equal(isIncomingStatus("  incoming "), true);
  assert.equal(isIncomingStatus("Warehouse"), false);
  assert.equal(isIncomingStatus(""), false);
  const list = arrivingShipments([
    row({ boat_name: "ON ITS WAY", eta: "2026-10-20" }, { STATUS: "Incoming" }, "TRANSIT"),
    row({ boat_name: "IN WAREHOUSE", eta: "2026-10-18" }, { STATUS: "Warehouse" }, "IMPORT"),
    row({ boat_name: "IN OFFICE" }, { STATUS: "Office" }, "IMPORT"),
    row({ boat_name: "NO STATUS" }, {}, "IMPORT"),
    row({ boat_name: "ALSO INCOMING", eta: "2026-10-25" }, { STATUS: "Incoming" }, "IMPORT"),
    row({ boat_name: "ARRIVED AND DONE" }, { STATUS: "Incoming" }, "Completed"),
  ]);
  assert.deepEqual(list.map((r) => r.client), ["ON ITS WAY", "ALSO INCOMING"]);
});

test("Import and Transit shipments whose status says they have not arrived are not waiting to be routed", () => {
  for (const status of ["Incoming", "Intransit", "New Request", "Collected from Origin", "Arrived in UAE"]) {
    assert.equal(isRoutable(row({ local_import: "Import" }, { STATUS: status }, "IMPORT")), false, status);
  }
  for (const status of ["Warehouse", "Office", "Out for Delivery", ""]) {
    assert.equal(isRoutable(row({ local_import: "Import" }, status ? { STATUS: status } : {}, "IMPORT")), true, status || "no status");
  }
  assert.equal(isRoutable(row({ local_import: "Local" }, { STATUS: "Incoming" })), true, "a Local parcel has no Monday status to go by");
});
