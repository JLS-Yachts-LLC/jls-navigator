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
 *
 * When the warehouse's Zebra printers are set up (ShipSync → Printers), the same page
 * offers "Send to label printer", which goes straight to the printer through the print
 * connector on the office network. A phone can be told to always use one printer; its
 * "Print label" buttons then print there directly and only open the page to choose another.
 */
import QRCode from "qrcode";
import { toast } from "sonner";
import { errorMessage } from "@/lib/error-message";
import { supabase } from "@/integrations/supabase/client";
import { locationCode } from "./logistics-warehouse-data";
import type { Label } from "@/lib/printing/zpl";
import {
  getDefaultPrinterId, isOnline, listPrinters, printerStateText, queueLabels, setDefaultPrinterId, waitForJob,
  type LabelPrinter,
} from "@/lib/printing/printers";

const sb = supabase as any;

export type { Label };

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
export async function printLabels(source: Label[] | Promise<Label[]>, ref?: string): Promise<boolean> {
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
.bar[hidden],.zopts[hidden]{display:none}
.zbar{background:#e3f1ea}
.zopts{padding:6px 10px 10px;background:#e3f1ea;border-bottom:1px solid #ccd;font-size:15px}
.zopts label{display:flex;gap:8px;align-items:center}
#zmsg{margin-top:6px;font-weight:700}
#zmsg.err{color:#b00020}
@media print{.bar,.zopts{display:none}}
</style></head><body>
<div class="bar zbar" id="zbar" hidden><select id="zpick"></select><button id="zgo">Send to label printer</button></div>
<div class="zopts" id="zopts" hidden><label><input type="checkbox" id="zdef"> Always use this printer on this device</label><div id="zmsg"></div></div>
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
    void wireLabelPrinters(w, labels, ref);
  } catch (e) {
    w.close();
    throw e;
  }
  return true;
}

/** Fill the print page's "Send to label printer" bar, if any Zebra printer is set up. */
async function wireLabelPrinters(w: Window, labels: Label[], ref?: string): Promise<void> {
  let printers: LabelPrinter[];
  try { printers = await listPrinters(); } catch { return; }
  if (!printers.length || w.closed) return;
  const doc = w.document;
  const bar = doc.getElementById("zbar"), opts = doc.getElementById("zopts");
  const pick = doc.getElementById("zpick") as HTMLSelectElement | null;
  const go = doc.getElementById("zgo") as HTMLButtonElement | null;
  const def = doc.getElementById("zdef") as HTMLInputElement | null;
  const msg = doc.getElementById("zmsg");
  if (!bar || !opts || !pick || !go || !def || !msg) return;

  for (const p of printers) {
    const o = doc.createElement("option");
    o.value = p.id;
    o.textContent = `${p.name} — ${printerStateText(p)}`;
    o.disabled = !isOnline(p);
    pick.appendChild(o);
  }
  const saved = getDefaultPrinterId();
  const first = printers.find((p) => p.id === saved && isOnline(p)) ?? printers.find(isOnline);
  if (first) pick.value = first.id;
  const syncDefault = () => { def.checked = pick.value === getDefaultPrinterId(); };
  syncDefault();
  pick.onchange = syncDefault;
  def.onchange = () => setDefaultPrinterId(def.checked ? pick.value : null);
  bar.hidden = false;
  opts.hidden = false;

  const say = (text: string, err = false) => { msg.textContent = text; msg.className = err ? "err" : ""; };
  go.onclick = async () => {
    const p = printers.find((x) => x.id === pick.value);
    if (!p || !isOnline(p)) { say("Choose a printer that is online.", true); return; }
    go.disabled = true;
    say(`Sending ${labels.length} label${labels.length === 1 ? "" : "s"} to ${p.name}…`);
    try {
      const r = await waitForJob(await queueLabels(p.id, labels, { source: "warehouse", ref }));
      if (r.status === "printed") say(`Printed on ${p.name}. You can close this page.`);
      else if (r.status === "failed") say(`${p.name}: ${r.error}`, true);
      else say(`Sent to ${p.name} — it hasn't confirmed yet. Check the printer before sending again.`, true);
    } catch (e) {
      say(errorMessage(e, "Could not send the labels"), true);
    } finally {
      go.disabled = false;
    }
  };
}

/** Print a reference's labels straight on this device's chosen Zebra printer, saying how it went. */
async function sendToDefaultPrinter(printerId: string, ref: string): Promise<void> {
  const other = { label: "Other printer", onClick: () => openLabelPage(ref) };
  const t = toast.loading("Sending labels to the printer…");
  try {
    const [printers, labels] = await Promise.all([listPrinters(), loadLabelsForRef(ref)]);
    const p = printers.find((x) => x.id === printerId);
    if (!p) {
      setDefaultPrinterId(null);
      toast.error("The label printer this device used is no longer set up — choose another.", { id: t, action: { label: "Choose", onClick: () => openLabelPage(ref) } });
      return;
    }
    if (!isOnline(p)) {
      toast.error(`${p.name} is offline — nothing was sent.`, { id: t, action: other, duration: 15000 });
      return;
    }
    const id = await queueLabels(p.id, labels, { source: "warehouse", ref });
    toast.loading(`Printing ${labels.length} label${labels.length === 1 ? "" : "s"} on ${p.name}…`, { id: t });
    const r = await waitForJob(id);
    if (r.status === "printed") toast.success(`Printed on ${p.name}`, { id: t, action: other });
    else if (r.status === "failed") toast.error(`${p.name}: ${r.error}`, { id: t, action: other, duration: 15000 });
    else toast.warning(`Sent to ${p.name} — it hasn't confirmed yet. Check the printer before sending again.`, { id: t, action: other, duration: 15000 });
  } catch (e) {
    toast.error(errorMessage(e, "Could not print the labels"), { id: t, action: other });
  }
}

function openLabelPage(ref: string): void {
  void printLabels(loadLabelsForRef(ref), ref).then((opened) => {
    if (!opened) toast.error("Your browser blocked the label window — allow pop-ups for this site and try again.");
  }).catch((e) => toast.error(errorMessage(e, "Could not prepare the labels")));
}

/**
 * The tap handler behind every "Print label" button. On a device told to always use a
 * Zebra printer, the labels go straight there; otherwise the print page opens (with the
 * Zebra printers on it, if any), saying so if the browser blocks the window or the
 * reference can't be read.
 */
export function labelsFor(ref: string): void {
  const printer = getDefaultPrinterId();
  if (printer) void sendToDefaultPrinter(printer, ref);
  else openLabelPage(ref);
}
