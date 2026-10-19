/** The Monday "Gate Pass" board mirror: rows land tagged and inert, columns are discovered, removed items are pruned, other boards' rows are untouched. */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";

const be = new FakeBackend();
let gp: typeof import("../monday-gatepass-board.server");
const realFetch = globalThis.fetch;

/** What the fake Monday board currently holds. */
let board: { columns: any[]; groups: any[]; items: any[] };

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  gp = await import("../monday-gatepass-board.server");
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? input);
    if (!url.startsWith("https://api.monday.com/v2")) return realFetch(input, init);
    const q = String(JSON.parse(init?.body ?? "{}").query ?? "");
    const data = q.includes("items_page")
      ? { boards: [{ items_page: { cursor: null, items: board.items } }] }
      : { boards: [{ columns: board.columns, groups: board.groups }] };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});
after(async () => { globalThis.fetch = realFetch; await be.stop(); });
beforeEach(() => {
  be.reset();
  be.rows("integration_settings").push({ integration_name: "monday", config: { api_token: "tok" } });
  board = {
    columns: [
      { id: "name", title: "Name", type: "name" }, { id: "client", title: "Client", type: "text" },
      { id: "date", title: "Date", type: "date" }, { id: "no", title: "Gate Pass No.", type: "text" }, { id: "sub", title: "Subitems", type: "subtasks" },
    ],
    groups: [{ id: "g1", title: "2026" }, { id: "g2", title: "Archive" }],
    items: [
      { id: "11", name: "GP-001", group: { id: "g1", title: "2026" }, column_values: [{ id: "client", text: "Orka" }, { id: "date", text: "2026-10-05" }, { id: "no", text: "A123" }, { id: "sub", text: "" }] },
      { id: "12", name: "GP-002", group: { id: "g2", title: "Archive" }, column_values: [{ id: "client", text: "Zeus" }, { id: "no", text: "B456" }] },
      { id: "13", name: "  ", group: null, column_values: [] },
    ],
  };
});

const gate = () => be.rows("shipsync_packages").filter((r) => r.local_import === "Gate Pass");

test("the first sync creates one inert 'Gate Pass' row per item, with Monday's columns and groups as discovered", async () => {
  const r = await gp.importMondayGatePassBoard();
  assert.deepEqual([r.ok, r.synced, r.errors, r.pruned], [true, 2, 0, 0], "the blank placeholder item is skipped");
  const rows = gate().sort((a, b) => String(a.barcode).localeCompare(String(b.barcode)));
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.equal(a.barcode, "GP-001");
  assert.equal(a.boat_name, "ORKA", "the client is lifted for searching");
  assert.equal(String(a.received_at).slice(0, 10), "2026-10-05");
  assert.equal(a.status, "completed", "never reads as a parcel waiting to go out");
  assert.equal(a.extra.monday["Gate Pass No."], "A123");
  assert.deepEqual(a.extra.monday_columns, ["Name", "Client", "Date", "Gate Pass No.", "Subitems"]);
  assert.equal(a.extra.monday_group_title, "2026");
  assert.deepEqual(a.extra.monday_group_order, ["2026", "Archive"]);
  assert.equal(a.extra.monday_item_id, "11");
  assert.equal(b.extra.monday_group_title, "Archive");
  assert.equal(b.received_at ?? null, null, "no date on Monday, none here");
});

test("a second sync updates what changed on Monday, adds new items and prunes the ones removed, leaving other boards' rows alone", async () => {
  be.rows("shipsync_packages").push(
    { id: "E1", local_import: "EDAS", barcode: "EDAS-1", status: "in_office", extra: { monday_item_id: "11" } },
    { id: "L1", local_import: "Local", barcode: "LOCAL-1", status: "in_office", extra: {} },
  );
  await gp.importMondayGatePassBoard();
  board.items = [
    { ...board.items[0], column_values: [{ id: "client", text: "Orka" }, { id: "no", text: "A999" }] },
    { id: "14", name: "GP-004", group: { id: "g1", title: "2026" }, column_values: [{ id: "client", text: "Nirvana" }] },
  ];
  const r = await gp.importMondayGatePassBoard();
  assert.deepEqual([r.synced, r.errors, r.pruned], [2, 0, 1], "GP-001 updated, GP-004 added, GP-002 pruned");
  const names = gate().map((x) => x.barcode).sort();
  assert.deepEqual(names, ["GP-001", "GP-004"]);
  assert.equal(gate().find((x) => x.barcode === "GP-001")!.extra.monday["Gate Pass No."], "A999");
  assert.ok(be.rows("shipsync_packages").some((x) => x.id === "E1" && x.local_import === "EDAS"), "an EDAS row that shares a Monday item id is not touched");
  assert.ok(be.rows("shipsync_packages").some((x) => x.id === "L1"), "Local rows are not touched");
});

test("an edit made on the Gate Pass tab survives the next sync unless Monday changes that same value", async () => {
  await gp.importMondayGatePassBoard();
  const a = gate().find((x) => x.barcode === "GP-001")!;
  a.extra = { ...a.extra, monday: { ...a.extra.monday, Client: "Aurora X", "Gate Pass No.": "LOCAL-1", Name: "Taufeeq" }, edited_at: "2026-10-19T00:00:00Z" };
  a.boat_name = "AURORA X";
  board.items[0] = { ...board.items[0], column_values: [{ id: "client", text: "Orka" }, { id: "date", text: "2026-10-05" }, { id: "no", text: "A124" }] };
  await gp.importMondayGatePassBoard();
  const after = gate().find((x) => x.barcode === "GP-001")!;
  assert.equal(after.extra.monday.Client, "Aurora X", "Monday's client did not change, so the local edit stays");
  assert.equal(after.boat_name, "AURORA X");
  assert.equal(after.extra.monday.Name, "Taufeeq", "a column only filled in here is kept");
  assert.equal(after.extra.monday["Gate Pass No."], "A124", "Monday changed this value, so Monday's new value wins");
});

test("a row edited or removed on the tab is never pruned or brought back, and an empty board prunes nothing", async () => {
  await gp.importMondayGatePassBoard();
  const [a, b] = gate().sort((x, y) => String(x.barcode).localeCompare(String(y.barcode)));
  a.extra = { ...a.extra, edited_at: "2026-10-19T00:00:00Z" };
  b.extra = { ...b.extra, deleted_at: "2026-10-19T00:00:00Z", edited_at: "2026-10-19T00:00:00Z" };
  board.items = [board.items[1]];
  let r = await gp.importMondayGatePassBoard();
  assert.equal(r.pruned, 0, "GP-001 is gone from Monday but was edited here");
  assert.equal(gate().find((x) => x.barcode === "GP-002")!.extra.deleted_at, "2026-10-19T00:00:00Z", "the removed row stays removed");
  board.items = [];
  r = await gp.importMondayGatePassBoard();
  assert.equal(r.pruned, 0);
  assert.equal(gate().length, 2);
});

test("a sync that starts while another is running does nothing", async () => {
  be.rows("integration_settings")[0].config.gatepass_board_sync_started_at = new Date().toISOString();
  const r = await gp.importMondayGatePassBoard();
  assert.equal(r.skipped, true);
  assert.equal(gate().length, 0);
});

test("the client is found on whichever client-like column the board has, and an absent one leaves the row unfiled", () => {
  assert.equal(gp.deriveFields({ Vessel: "Mango" }, "GP-9").boat_name, "MANGO");
  assert.equal(gp.deriveFields({ Yacht: "Aqua" }, "GP-9").boat_name, "AQUA");
  assert.equal(gp.deriveFields({ "Gate Pass No.": "A1" }, "GP-9").boat_name, null);
  assert.equal(gp.deriveFields({}, "GP-9").barcode, "GP-9");
});
