import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ZPL_COMMANDS, parseLabels, renderLabel, renderLabels, zplText } from "./zpl";

const media = { widthMm: 100, heightMm: 50, dpi: 203 };

test("text that looks like ZPL is escaped, not obeyed", () => {
  assert.equal(zplText("Box ^XZ~JR_1"), "Box _5EXZ_7EJR_5F1");
  assert.equal(zplText("Café"), "Caf_C3_A9");
  const zpl = renderLabel({ code: "JLSWH26-00001", title: "^NSA,10.0.0.1~WC", lines: ["~JUF"] }, media);
  assert.ok(!zpl.includes("~"));
  assert.ok(!zpl.includes("^NS"));
});

test("only the commands the connector allows are emitted", () => {
  const zpl = renderLabels([
    { code: "JLSWH26-00001", title: "M/Y Example", lines: ["Spare parts — 3 boxes", "Location A-01-2"] },
    { code: "JLSWH26-00001-02", title: "Pump seal", lines: ["Qty 2 pcs"] },
  ], media, 2);
  const used = new Set([...zpl.matchAll(/\^(.{2})/g)].map((m) => m[1]));
  for (const c of used) assert.ok((ZPL_COMMANDS as readonly string[]).includes(c), `unexpected ^${c}`);
  assert.equal(zpl.match(/\^XA/g)?.length, 2);
  assert.ok(zpl.includes("^PQ2"));
  assert.ok(zpl.includes("^FDMA,JLSWH26-00001-02^FS"));
});

test("the connector's allow-list matches the renderer's", () => {
  const ps = readFileSync(join(process.cwd(), "public/print-connector/PolarisPrintConnector.ps1"), "utf8");
  const list = ps.match(/\$AllowedCommands = @\(([^)]*)\)/)?.[1] ?? "";
  const fromPs = [...list.matchAll(/'([A-Z0-9]{2})'/g)].map((m) => m[1]).sort();
  assert.deepEqual(fromPs, [...ZPL_COMMANDS].sort());
});

test("label size follows the printer's media and resolution", () => {
  assert.ok(renderLabel({ code: "X1", title: "", lines: [] }, media).includes("^PW800\n^LL400"));
  assert.ok(renderLabel({ code: "X1", title: "", lines: [] }, { widthMm: 62, heightMm: 29, dpi: 300 }).includes("^PW744\n^LL348"));
});

test("queue rows are shape-checked", () => {
  assert.throws(() => parseLabels({}), /list/);
  assert.throws(() => parseLabels([{ title: "no code" }]), /no code/);
  assert.deepEqual(parseLabels([{ code: "A", lines: ["x", 3] }]), [{ code: "A", title: "", lines: ["x"] }]);
});
