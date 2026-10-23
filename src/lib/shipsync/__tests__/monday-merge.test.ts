/** A cell edited on a Monday-mirror board survives the hourly sync until Monday itself changes that cell. */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeBackend } from "../../../components/logistics/__tests__/fake-backend";
import { mergeMondayRow } from "../monday-merge";

test("a value edited here stays while Monday still sends what it sent last time", () => {
  assert.deepEqual(mergeMondayRow({ AWB: "EDITED", Client: "Orka" }, { AWB: "A1", Client: "Orka" }, { AWB: "A1", Client: "Orka" }), { AWB: "EDITED", Client: "Orka" });
});

test("a value Monday changed replaces an edit made here; one it did not touch is kept", () => {
  const out = mergeMondayRow({ AWB: "EDITED", Remarks: "mine" }, { AWB: "A1", Remarks: "old" }, { AWB: "A2", Remarks: "old" });
  assert.deepEqual(out, { AWB: "A2", Remarks: "mine" });
});

test("a cell Monday cleared goes; a cell Monday adds appears; a cell cleared here stays cleared", () => {
  assert.deepEqual(mergeMondayRow({ A: "1", B: "2" }, { A: "1", B: "2" }, { A: "1" }), { A: "1" }, "Monday cleared B");
  assert.deepEqual(mergeMondayRow({ A: "1" }, { A: "1" }, { A: "1", C: "new" }), { A: "1", C: "new" }, "Monday added C");
  assert.deepEqual(mergeMondayRow({}, { A: "1" }, { A: "1" }), {}, "A was cleared here and Monday has not touched it");
});

test("a row with no record of the last sync simply follows Monday", () => {
  assert.deepEqual(mergeMondayRow({ A: "old" }, undefined, { A: "new" }), { A: "new" }, "stored is taken to be what Monday sent, so a different value now is Monday's change");
  assert.deepEqual(mergeMondayRow({ A: "same" }, undefined, { A: "same" }), { A: "same" });
  assert.deepEqual(mergeMondayRow(undefined, undefined, { A: "new" }), { A: "new" });
});

// ── through the real sync, against a fake Monday ─────────────────────────────

const be = new FakeBackend();
let edas: typeof import("../monday-edas-board.server");
const realFetch = globalThis.fetch;
let board: { columns: any[]; groups: any[]; items: any[] };

before(async () => {
  await be.start();
  process.env.SUPABASE_URL = be.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
  process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  edas = await import("../monday-edas-board.server");
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? input);
    if (!url.startsWith("https://api.monday.com/v2")) return realFetch(input, init);
    const q = String(JSON.parse(init?.body ?? "{}").query ?? "");
    const data = q.includes("items_page") ? { boards: [{ items_page: { cursor: null, items: board.items } }] } : { boards: [{ columns: board.columns, groups: board.groups }] };
    return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
});
after(async () => { globalThis.fetch = realFetch; await be.stop(); });
beforeEach(() => {
  be.reset();
  be.rows("integration_settings").push({ integration_name: "monday", config: { api_token: "tok" } });
  board = {
    columns: [{ id: "awb", title: "AWB", type: "text" }, { id: "client", title: "Client", type: "text" }, { id: "note", title: "Notes", type: "text" }],
    groups: [{ id: "g", title: "EDAS 2026" }],
    items: [{ id: "1", name: "ITEM-1", group: { id: "g", title: "EDAS 2026" }, column_values: [{ id: "awb", text: "A1" }, { id: "client", text: "Orka" }, { id: "note", text: "from monday" }] }],
  };
});
const edasRow = () => be.rows("shipsync_packages").find((r) => r.local_import === "EDAS")!;

test("through the EDAS sync: an edited cell survives the next sync; a cell Monday changes takes Monday's value", async () => {
  await edas.importMondayEdasBoard();
  assert.equal(edasRow().extra.monday.AWB, "A1");
  assert.deepEqual(edasRow().extra.monday_synced, { AWB: "A1", Client: "Orka", Notes: "from monday" }, "Monday's row is kept exactly as sent");

  // somebody types into two cells on the board
  edasRow().extra.monday.AWB = "MY-EDIT";
  edasRow().extra.monday.Notes = "my note";
  await edas.importMondayEdasBoard();
  assert.equal(edasRow().extra.monday.AWB, "MY-EDIT", "Monday did not change it, so the edit stands");
  assert.equal(edasRow().extra.monday.Notes, "my note");

  // Monday changes one of them
  board.items[0].column_values[2].text = "monday updated";
  await edas.importMondayEdasBoard();
  assert.equal(edasRow().extra.monday.AWB, "MY-EDIT", "still untouched on Monday");
  assert.equal(edasRow().extra.monday.Notes, "monday updated", "Monday's change wins");
  assert.equal(edasRow().extra.monday_synced.Notes, "monday updated");
});
