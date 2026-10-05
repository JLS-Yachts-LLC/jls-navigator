/**
 * Logistics mobile app — printable QR labels for stored goods.
 *
 * Warehouse - Out's SCAN reads a package's reference (JLSWH26-00001) or, for a
 * box opened up, an item's ID (JLSWH26-00001-02). These labels put exactly that
 * text in a QR code, so what is printed is what the scanner returns — no lookup
 * table, nothing to keep in sync.
 *
 * The labels open in a plain print page with a size picker, so they print on
 * whatever the warehouse has: a roll label printer (one label per label, paper cut
 * to the chosen size) or an ordinary A4 sheet to cut and stick. The last size
 * chosen is remembered on that phone.
 */
import QRCode from "qrcode";
import { toast } from "sonner";
import { errorMessage } from "@/lib/error-message";
import { supabase } from "@/integrations/supabase/client";
import { locationCode } from "./logistics-warehouse-data";

const sb = supabase as any;

export type Label = {
  /** Encoded in the QR and printed beneath it. */
  code: string;
  title: string;
  lines: string[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The box's own label, then one per packing-list line — what Store In or Move to Storage just created. */
export async function loadLabelsForRef(ref: string): Promise<Label[]> {
  const [{ data: client }, { data: internal }, { data: contents }] = await Promise.all([
    sb.from("warehouse_client_items").select("ref_no, client_name, description, zone, bay, shelf").eq("ref_no", ref).maybeSingle(),
    sb.from("warehouse_internal_items").select("ref_no, department, description, zone, bay, shelf").eq("ref_no", ref).maybeSingle(),
    sb.from("warehouse_package_contents").select("item_id, item_name, quantity, unit, client_or_dept").eq("ref_no", ref).order("item_id"),
  ]);
  const head = client ?? internal;
  if (!head) throw new Error(`${ref} isn't in the warehouse.`);
  const owner: string = client?.client_name ?? internal?.department ?? "";
  const where = head.zone ? locationCode({ zone: head.zone, bay: head.bay, shelf: head.shelf }) : "";
  const labels: Label[] = [{ code: ref, title: owner, lines: [head.description, where && `Location ${where}`].filter(Boolean) }];
  for (const c of contents ?? []) {
    labels.push({ code: c.item_id, title: c.item_name, lines: [owner, `Qty ${Number(c.quantity)} ${c.unit}`, `In box ${ref}`].filter(Boolean) });
  }
  return labels;
}

/**
 * Open the labels in a print page. Call straight from a tap, passing the labels or
 * the promise of them: the window is opened before anything is awaited, because phones block a window opened after a wait.
 * Returns false if the browser refused to open it.
 */
export async function printLabels(source: Label[] | Promise<Label[]>): Promise<boolean> {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write("<!doctype html><title>Labels</title><body style='font-family:sans-serif'>Preparing labels…</body>");
  try {
    const labels = await source;
    const cards = await Promise.all(labels.map(async (l) => {
      const qr = await QRCode.toDataURL(l.code, { margin: 1, width: 400, errorCorrectionLevel: "M" });
      return `<div class="card"><img src="${qr}" alt=""><div class="txt"><div class="code">${esc(l.code)}</div><div class="title">${esc(l.title)}</div>${l.lines.map((x) => `<div class="line">${esc(x)}</div>`).join("")}</div></div>`;
    }));
    // Sizes in mm. "roll" sizes print one label per page cut to the label; the others flow across an A4 sheet.
    const sizes = [
      { name: "Standard — 92 × 46 mm", w: 92, h: 46, qr: 38, code: 13, title: 12, line: 9.5, roll: false },
      { name: "Large — 100 × 60 mm", w: 100, h: 60, qr: 48, code: 15, title: 13, line: 10.5, roll: false },
      { name: "A4 sheet — 90 × 50 mm, cut out", w: 90, h: 50, qr: 42, code: 13, title: 12, line: 9.5, roll: false },
      { name: "Roll label — 100 × 50 mm", w: 100, h: 50, qr: 42, code: 14, title: 12, line: 10, roll: true },
      { name: "Roll label — 62 × 29 mm", w: 62, h: 29, qr: 23, code: 8.5, title: 8, line: 6.5, roll: true },
    ];
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Labels</title>
<style id="size"></style>
<style>
body{margin:0;font-family:Arial,sans-serif;color:#000}
.bar{display:flex;gap:8px;align-items:center;padding:10px;background:#eef2f5;border-bottom:1px solid #ccd}
.bar select,.bar button{font-size:16px;padding:8px 10px}
.bar select{flex:1;min-width:0}
.sheet{display:flex;flex-wrap:wrap;gap:4mm;padding:4mm}
.card{display:flex;align-items:center;gap:3mm;box-sizing:border-box;overflow:hidden;break-inside:avoid;page-break-inside:avoid}
.card img{flex:none}
.txt{min-width:0;overflow:hidden}
.code{font-family:monospace;font-weight:700;word-break:break-all}
.title{font-weight:700;margin-top:1mm}
.line{margin-top:.8mm}
@media print{.bar{display:none}}
</style></head><body>
<div class="bar"><select id="pick"></select><button id="go">Print</button></div>
<div class="sheet">${cards.join("")}</div>
<script>
var SIZES=${JSON.stringify(sizes)};
var pick=document.getElementById("pick"),css=document.getElementById("size");
SIZES.forEach(function(z,i){var o=document.createElement("option");o.value=i;o.textContent=z.name;pick.appendChild(o)});
function apply(i){var z=SIZES[i]||SIZES[0];
  css.textContent="@page{size:"+(z.roll?z.w+"mm "+z.h+"mm;margin:0":"auto;margin:8mm")+"}"
   +".sheet{gap:"+(z.roll?0:4)+"mm;padding:"+(z.roll?0:4)+"mm}"
   +".card{width:"+z.w+"mm;height:"+z.h+"mm;padding:"+(z.roll?1.5:3)+"mm;border:"+(z.roll?"0":"1px dashed #888")+";"+(z.roll?"page-break-after:always;break-after:page":"")+"}"
   +".card img{width:"+z.qr+"mm;height:"+z.qr+"mm}"
   +".code{font-size:"+z.code+"pt}.title{font-size:"+z.title+"pt}.line{font-size:"+z.line+"pt}";}
var saved=0;try{saved=Number(localStorage.getItem("logistics-label-size"))||0}catch(e){}
pick.value=saved<SIZES.length?saved:0;apply(pick.value);
pick.onchange=function(){apply(pick.value);try{localStorage.setItem("logistics-label-size",pick.value)}catch(e){}};
document.getElementById("go").onclick=function(){window.print()};
</script></body></html>`);
    w.document.close();
  } catch (e) {
    w.close();
    throw e;
  }
  return true;
}

/** The tap handler behind every "Print label" button: print a reference's labels, saying so if the browser blocks the window or the reference can't be read. */
export function labelsFor(ref: string): void {
  void printLabels(loadLabelsForRef(ref)).then((opened) => {
    if (!opened) toast.error("Your browser blocked the label window — allow pop-ups for this site and try again.");
  }).catch((e) => toast.error(errorMessage(e, "Could not prepare the labels")));
}
