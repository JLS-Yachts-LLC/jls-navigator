/** The delivery note PDF: no Van or Destination, a Courier on every line. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { buildDeliveryNotePdf } from "../pdf.server";

const note: any = { id: "n1", number: "0042", boat_name: "AURORA X", created_at: "2026-10-13T08:00:00Z", destination_address: "Marina berth 9" };
const pkgs: any[] = [
  { barcode: "AAE123", courier: "Amazon", package_owner: "Captain", num_packages: 2, boat_name: "AURORA X" },
  { barcode: "JTE999", courier: "DHL", package_owner: "Chief Eng", num_packages: 1, boat_name: "AURORA X" },
];

/** Everything the PDF draws, as one string: page content is compressed, and text is written as hex or literal strings. */
function drawnText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  let all = "";
  for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try { all += inflateSync(Buffer.from(m[1], "latin1")).toString("latin1") + "\n"; } catch { /* not a compressed stream */ }
  }
  // hex strings <48656C6C6F> -> text
  return all.replace(/<([0-9A-Fa-f]+)>/g, (_, h: string) => Buffer.from(h, "hex").toString("latin1")).replace(/\(([^)]*)\)/g, "$1");
}

test("the note shows Courier on each line, and no longer shows Van or Destination", async () => {
  const text = drawnText(await buildDeliveryNotePdf(note, pkgs, "delivery", { driverName: "Sam" }));
  assert.ok(text.includes("COURIER"), "a Courier column heading");
  assert.ok(text.includes("Amazon") && text.includes("DHL"), "each parcel's courier");
  assert.ok(!text.includes("DESTINATION"), "no Destination line");
  assert.ok(!/\bVAN\b/.test(text), "no Van line");
  assert.ok(!text.includes("Marina berth 9"), "the berth address is not printed");
  assert.ok(text.includes("VESSEL") && text.includes("DRIVER") && text.includes("DELIVERY DATE"), "the rest of the header is unchanged");
});
