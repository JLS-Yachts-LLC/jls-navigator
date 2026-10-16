/** What the Gate Pass board shows from the synced rows. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gatePassCell, gatePassColumns, gatePassGroups, gatePassSearchText } from "../gatepass-view";

const row = (name: string, monday: Record<string, string>, group: string | null, columns = ["Name", "Client", "Gate Pass No.", "Files", "Subitems"], order = ["2026", "Archive"]) =>
  ({ id: name, barcode: name, extra: { monday_item_name: name, monday, monday_columns: columns, monday_group_title: group, monday_group_order: order } }) as any;

test("the columns are Monday's, in Monday's order, Name first, without any that are empty on every row", () => {
  const rows = [row("GP-1", { Client: "Orka", "Gate Pass No.": "A1" }, "2026"), row("GP-2", { Client: "Zeus" }, "2026")];
  assert.deepEqual(gatePassColumns(rows), ["Name", "Client", "Gate Pass No."], "Files and Subitems hold nothing on any row");
  rows[1].extra.monday.Files = "https://x/y.pdf";
  assert.deepEqual(gatePassColumns(rows), ["Name", "Client", "Gate Pass No.", "Files"]);
  assert.deepEqual(gatePassColumns([]), ["Name"]);
});

test("a column Monday has that this row's list lacks still shows (a row synced before the column existed)", () => {
  const rows = [row("GP-1", { Client: "Orka", "New Column": "x" }, "2026")];
  assert.deepEqual(gatePassColumns(rows), ["Name", "Client", "New Column"]);
});

test("a cell is the item name for Name, Monday's text for a column, and empty when Monday has nothing", () => {
  const r = row("GP-1", { Client: "Orka" }, "2026");
  assert.equal(gatePassCell(r, "Name"), "GP-1");
  assert.equal(gatePassCell(r, "Client"), "Orka");
  assert.equal(gatePassCell(r, "Gate Pass No."), "");
});

test("groups follow Monday's own order, with anything ungrouped last", () => {
  const groups = gatePassGroups([
    row("A", {}, "Archive"), row("B", {}, "2026"), row("C", {}, null), row("D", {}, "2026"), row("E", {}, "Made up"),
  ]);
  assert.deepEqual(groups.map((g) => [g.title, g.rows.length]), [["2026", 2], ["Archive", 1], ["Made up", 1], ["Not on Monday", 1]]);
});

test("search text covers the name and every Monday cell", () => {
  assert.ok(gatePassSearchText(row("GP-77", { Client: "Orka", "Gate Pass No.": "XYZ-9" }, "2026")).includes("xyz-9"));
  assert.ok(gatePassSearchText(row("GP-77", {}, "2026")).includes("gp-77"));
});
