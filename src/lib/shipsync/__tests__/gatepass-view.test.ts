/** What the Gate Pass board shows from the stored rows, and how an edit on the board is written. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gatePassCell, gatePassColumns, gatePassEdit, gatePassGroups, gatePassNameColumn, gatePassSearchText, isDateColumn, newGatePass,
} from "../gatepass-view";

const LIVE = ["Gate Pass Reference Number", "Name", "Port name", "Gate Pass Date", "Boat Name", "Date Requested"];

const row = (name: string, monday: Record<string, string>, group: string | null, columns = ["Name", "Client", "Gate Pass No.", "Files", "Subitems"], order = ["2026", "Archive"]) =>
  ({ id: name, barcode: name, extra: { monday_item_name: name, monday, monday_columns: columns, monday_group_title: group, monday_group_order: order } }) as any;

test("the columns are Monday's, in Monday's order, the item-name column first; Subitems/Mirror only when something is in them", () => {
  const rows = [row("GP-1", { Client: "Orka", "Gate Pass No.": "A1" }, "2026"), row("GP-2", { Client: "Zeus" }, "2026")];
  assert.deepEqual(gatePassColumns(rows), ["Name", "Client", "Gate Pass No.", "Files"], "an empty Files column still shows so it can be filled in");
  rows[1].extra.monday.Subitems = "x";
  assert.deepEqual(gatePassColumns(rows), ["Name", "Client", "Gate Pass No.", "Files", "Subitems"]);
  assert.deepEqual(gatePassColumns([]), ["Gate Pass Reference Number"]);
});

test("a column a row holds that the list lacks still shows (a row synced before the column existed)", () => {
  const rows = [row("GP-1", { Client: "Orka", "New Column": "x" }, "2026")];
  assert.deepEqual(gatePassColumns(rows), ["Name", "Client", "Gate Pass No.", "Files", "New Column"]);
});

test("the reference-number column is Monday's item-name column, so a real 'Name' column next to it shows the person's name", () => {
  const r = row("03092624034826", { Name: "Taufeeq", "Port name": "DMC" }, "Gate Pass 2026", LIVE);
  const nameCol = gatePassNameColumn([r]);
  assert.equal(nameCol, "Gate Pass Reference Number");
  assert.equal(gatePassCell(r, nameCol, nameCol), "03092624034826");
  assert.equal(gatePassCell(r, "Name", nameCol), "Taufeeq");
  assert.deepEqual(gatePassColumns([r]).slice(0, 3), ["Gate Pass Reference Number", "Name", "Port name"]);
  r.extra.monday_name_column = "Ref";
  assert.equal(gatePassNameColumn([r]), "Ref", "the title recorded at sync wins over the first column");
});

test("a cell is the item name for the item-name column, the stored text for any other, and empty when there is nothing", () => {
  const r = row("GP-1", { Client: "Orka" }, "2026");
  assert.equal(gatePassCell(r, "Name", "Name"), "GP-1");
  assert.equal(gatePassCell(r, "Client", "Name"), "Orka");
  assert.equal(gatePassCell(r, "Gate Pass No.", "Name"), "");
});

test("an edit writes the cell, keeps the lifted fields in step, and marks the row as edited here", () => {
  const r = row("GP-1", { "Boat Name": "Orka" }, "2026", LIVE);
  const nameCol = "Gate Pass Reference Number";
  const a = gatePassEdit(r, "Boat Name", nameCol, "Aurora X") as any;
  assert.equal(a.extra.monday["Boat Name"], "Aurora X");
  assert.equal(a.boat_name, "AURORA X", "the client filter follows the edit");
  assert.ok(a.extra.edited_at);
  const b = gatePassEdit(r, nameCol, nameCol, "123") as any;
  assert.equal(b.barcode, "123");
  assert.equal(b.extra.monday_item_name, "123");
  const c = gatePassEdit(r, "Gate Pass Date", nameCol, "2026-10-19") as any;
  assert.equal(String(c.received_at).slice(0, 10), "2026-10-19");
  const d = gatePassEdit(r, "Boat Name", nameCol, "") as any;
  assert.equal("Boat Name" in d.extra.monday, false, "clearing a cell removes it");
  assert.equal(d.boat_name, null);
});

test("a new gate pass carries the board's columns and lands in the chosen group", () => {
  const existing = [row("GP-1", {}, "Gate Pass 2026", LIVE, ["Gate Pass 2026"])];
  const n = newGatePass(existing, "Gate Pass 2026", "") as any;
  assert.equal(n.local_import, "Gate Pass");
  assert.equal(n.status, "completed");
  assert.equal(n.barcode, null);
  assert.deepEqual(n.extra.monday_columns, LIVE);
  assert.equal(n.extra.monday_group_title, "Gate Pass 2026");
  assert.equal(n.extra.monday_item_id, undefined, "never linked to a Monday item, so the sync never touches it");
});

test("date columns are recognised by title", () => {
  assert.ok(isDateColumn("Gate Pass Date"));
  assert.ok(isDateColumn("Date Requested"));
  assert.ok(!isDateColumn("Boat Name"));
  assert.ok(!isDateColumn("Updated"));
});

test("groups follow Monday's own order, with anything ungrouped last", () => {
  const groups = gatePassGroups([
    row("A", {}, "Archive"), row("B", {}, "2026"), row("C", {}, null), row("D", {}, "2026"), row("E", {}, "Made up"),
  ]);
  assert.deepEqual(groups.map((g) => [g.title, g.rows.length]), [["2026", 2], ["Archive", 1], ["Made up", 1], ["Not on Monday", 1]]);
});

test("search text covers the name and every cell", () => {
  assert.ok(gatePassSearchText(row("GP-77", { Client: "Orka", "Gate Pass No.": "XYZ-9" }, "2026")).includes("xyz-9"));
  assert.ok(gatePassSearchText(row("GP-77", {}, "2026")).includes("gp-77"));
});
