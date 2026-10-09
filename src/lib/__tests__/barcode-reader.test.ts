/**
 * The WASM barcode reader that gives iPhones (whose Safari has no built-in one) camera scanning.
 * Proves the reader decodes real codes — the labels the app prints and the AWB-style codes it scans —
 * from raw image pixels, which is all a camera frame is.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import QR from "qrcode";
import { readBarcodes, setZXingModuleOverrides } from "zxing-wasm/reader";

before(() => {
  setZXingModuleOverrides({ wasmBinary: fs.readFileSync("node_modules/zxing-wasm/dist/reader/zxing_reader.wasm") as unknown as ArrayBuffer });
});

/** Draw a QR code into raw RGBA pixels, as a camera frame would arrive. */
function qrPixels(text: string, scale = 8, margin = 4) {
  const { modules } = QR.create(text, { errorCorrectionLevel: "M" });
  const n = modules.size, size = (n + margin * 2) * scale;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (!modules.get(y, x)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const i = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, width: size, height: size, colorSpace: "srgb" as const };
}

test("it reads the QR labels the app prints (package reference and item ID)", async () => {
  for (const text of ["JLSWH26-00111", "JLSWH26-00111-02", "WH0003"]) {
    const found = await readBarcodes(qrPixels(text), { formats: ["QRCode"] });
    assert.deepEqual(found.map((r) => r.text), [text], text);
  }
});

test("it reads the QR code on the install poster", async () => {
  const url = "https://polaris.jlsyachts.com/logistics-app";
  const found = await readBarcodes(qrPixels(url), { formats: ["QRCode"] });
  assert.equal(found[0]?.text, url);
});

test("a frame with no code in it gives nothing, not an error", async () => {
  const blank = { data: new Uint8ClampedArray(200 * 200 * 4).fill(255), width: 200, height: 200, colorSpace: "srgb" as const };
  assert.deepEqual(await readBarcodes(blank, { formats: ["QRCode", "Code128"] }), []);
});
