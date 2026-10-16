/** The Overview's yacht import / export lists. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { yachtOverviewRows, isFinishedYachtStatus } from "../yacht-overview";

const row = (over: Record<string, unknown>) => ({ direction: "import", yacht_name: "MY X", loa: "50m", pol: "Genoa", arrival_port: "Jebel Ali", eta: null, status: "In Progress", ...over }) as any;

test("complete and cancelled yacht shipments are not coming up", () => {
  assert.equal(isFinishedYachtStatus("Complete"), true);
  assert.equal(isFinishedYachtStatus("Cancelled"), true);
  assert.equal(isFinishedYachtStatus("In Progress"), false);
  assert.equal(isFinishedYachtStatus("On Hold"), false);
  assert.equal(isFinishedYachtStatus(null), false);
});

test("each direction lists only its own open shipments, soonest date first, undated last", () => {
  const rows = [
    row({ yacht_name: "LATE", eta: "2026-12-01" }),
    row({ yacht_name: "NO DATE" }),
    row({ yacht_name: "SOON", eta: "2026-10-20" }),
    row({ yacht_name: "DONE", eta: "2026-10-01", status: "Complete" }),
    row({ yacht_name: "OUT", direction: "export", eta: "2026-11-05", pol: "Dubai", arrival_port: "Antibes" }),
    row({ yacht_name: "OLD OUT", direction: "export", status: "Cancelled" }),
  ];
  assert.deepEqual(yachtOverviewRows(rows, "import").map((r) => r.client), ["SOON", "LATE", "NO DATE"]);
  const out = yachtOverviewRows(rows, "export");
  assert.deepEqual(out.map((r) => r.client), ["OUT"]);
  assert.deepEqual([out[0].pol, out[0].pod, out[0].date], ["Dubai", "Antibes", "2026-11-05"]);
});

test("a raw status key reads as its label", () => {
  const [a, b] = yachtOverviewRows([row({ yacht_name: "A", status: "new_lead" }), row({ yacht_name: "B", status: "In Progress" })], "import");
  assert.equal(a.status, "New Lead");
  assert.equal(b.status, "In Progress");
});

test("blank fields come through empty, a nameless shipment shows a dash, and a missing direction counts as import", () => {
  const [r] = yachtOverviewRows([row({ yacht_name: "  ", loa: null, pol: null, arrival_port: null, direction: null })], "import");
  assert.deepEqual([r.client, r.loa, r.pol, r.pod], ["—", "", "", ""]);
});
