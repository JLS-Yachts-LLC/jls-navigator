/** DMA notices: the agent's date control comes out, the signature and signing date have a spot. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";

let dma: typeof import("../dma-docx.server");
before(async () => {
  process.env.SUPABASE_URL = "http://127.0.0.1:1"; process.env.SUPABASE_SERVICE_ROLE_KEY = "service"; process.env.SUPABASE_PUBLISHABLE_KEY = "anon";
  dma = await import("../dma-docx.server");
});

const docXml = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)["word/document.xml"]);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

for (const key of ["dma-notice-of-departure", "dma-notice-of-arrival"]) {
  test(`${key}: the date control and its brackets are gone, everything else intact`, () => {
    const xml = docXml(dma.fillDmaDocx(key, { vessel_name: "Amara" }));
    assert.ok(!xml.includes("Click or tap to enter a date."), "no grey date prompt");
    assert.ok(!xml.includes("Click or tap here to enter text."), "every text field filled");
    assert.match(xml, /Date:<\/w:t><\/w:r><\/w:p>/, '"Date:" ends its line — no " [" or "]" left behind');
    assert.equal(count(xml, /<w:sdt>/g), count(xml, /<\/w:sdt>/g), "content controls balanced");
    assert.equal(count(xml, /<w:p[ >]/g), count(xml, /<\/w:p>/g), "paragraphs balanced");
    assert.equal(count(xml, /<w:r[ >]/g), count(xml, /<\/w:r>/g), "runs balanced");
    assert.match(xml, /Amara/);
  });
}

test("signature + date spots only for the expected page count; date only when asked", () => {
  const dep = dma.dmaSignatureFields("dma-notice-of-departure", 2, { date: true });
  assert.deepEqual(dep.map((f) => f.type ?? "signature"), ["signature", "date"]);
  assert.equal(dep[0].page, 2);
  assert.equal(dma.dmaSignatureFields("dma-notice-of-arrival", 3, { date: true })[0].page, 3);
  assert.equal(dma.dmaSignatureFields("dma-notice-of-arrival", 3, { date: true })[1].page, 2);
  assert.equal(dma.dmaSignatureFields("dma-notice-of-departure", 2).length, 1, "older PDFs: no date spot");
  assert.deepEqual(dma.dmaSignatureFields("dma-notice-of-departure", 3), [], "layout moved: no spot at all");
  assert.deepEqual(dma.dmaSignatureFields("cf12a", 2), []);
});
