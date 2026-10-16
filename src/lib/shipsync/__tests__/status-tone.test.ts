/** One colour, one meaning: Monday's own status words and group names mapped to waiting / on its way / done / problem. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { semanticTone } from "../status-tone";

test("the Import board's 18 Monday statuses land on a meaningful colour", () => {
  const want: Record<string, string> = {
    "New Request": "amber", Intransit: "blue", Incoming: "blue", Warehouse: "amber", "Delivered - TBI": "green",
    "Collected from Origin": "blue", Office: "amber", "1st Inspection": "amber", "Collected in Warehouse": "amber",
    "2nd Inspection": "amber", "Out for Delivery": "blue", "Scheduled for Delivery": "blue", Exported: "green",
    "In Warehouse - For Inspection": "amber", "In Warehouse": "amber", "Arrived in UAE": "blue", Canceled: "grey", Complete: "green",
  };
  for (const [label, tone] of Object.entries(want)) assert.equal(semanticTone(label), tone, label);
});

test("the Export board's statuses and the board group names do too", () => {
  const want: Record<string, string> = {
    "For Approval": "amber", Approved: "blue", Collected: "blue", "Delivered/ TBI": "green", Returned: "red", Cancelled: "grey",
    "Held In Customs Destination": "red", Hold: "red", "For Invoicing": "green", Completed: "green",
    TRANSIT: "blue", "Delivered Shipment": "green", COMPLETED: "green", "NOT ON MONDAY": "grey", "EDAS 2026": "grey",
  };
  for (const [label, tone] of Object.entries(want)) assert.equal(semanticTone(label), tone, label);
});
