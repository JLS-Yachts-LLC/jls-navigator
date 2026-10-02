/**
 * Read a checklist PDF and propose its items, tick positions and header fields.
 *
 * Inspection checklists from the RYA, flag states and the like share a shape:
 * a header block ("Name of boat", "Inspection date", "Inspector's name"…) and
 * one or two tables with a "Check" column, items lettered (A, B, C…) or not,
 * grouped under headings, followed by notes. This reads the PDF's text layer
 * (pdf.js, in the browser), finds every "Check" column header, and walks the
 * rows below it. It is a proposal: the review screen shows every detected tick
 * position on the page, and the admin corrects anything it got wrong before
 * the checklist is saved.
 *
 * Proven against the three RYA forms (Personal Water Craft, Powerboat,
 * Cruising), which differ in exactly the ways other forms will: lettered vs
 * numbered headings, wrapped items, bullet sub-lines, footnotes, a second
 * table mid-page, notes pages that must not become items.
 */
import type { FormHeaderField } from "./checklist-form";

export type DetectedRow = {
  kind: "item" | "section";
  text: string;
  ref: string;
  page: number | null;
  x: number | null;
  y: number | null;
};

export type DetectedForm = {
  pageCount: number;
  pageSizes: { width: number; height: number }[];
  title: string | null;
  rows: DetectedRow[];
  headerFields: FormHeaderField[];
  /** What the detector could not be sure of, for the review screen. */
  warnings: string[];
};

type Seg = { x: number; w: number; h: number; s: string };
type Line = { y: number; segs: Seg[] };
type Col = { left: number; right: number; itemX: number; checkX: number };

/** pdf.js, loaded only in the browser — it has no place in the server bundle. */
export async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  return pdfjs;
}

export async function detectChecklist(bytes: ArrayBuffer): Promise<DetectedForm> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const pages: { width: number; height: number; lines: Line[] }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();
    pages.push({ width: vp.width, height: vp.height, lines: toLines(items as any[]) });
  }
  return detectFromPages(pages);
}

/** Group text runs into visual lines, top to bottom, runs left to right. */
function toLines(items: { str: string; transform: number[]; width: number; height: number }[]): Line[] {
  const byY: { y: number; segs: Seg[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const y = Math.round(it.transform[5]);
    let line = byY.find((l) => Math.abs(l.y - y) <= 2);
    if (!line) { line = { y, segs: [] }; byY.push(line); }
    line.segs.push({ x: it.transform[4], w: it.width, h: it.height || Math.abs(it.transform[3]) || 10, s: it.str });
  }
  for (const l of byY) l.segs.sort((a, b) => a.x - b.x);
  return byY.sort((a, b) => b.y - a.y);
}

const joinSegs = (segs: Seg[]) => {
  let out = "";
  segs.forEach((sg, i) => {
    const prev = segs[i - 1];
    const gap = prev ? sg.x - (prev.x + prev.w) : 0;
    out += (i && gap > 1.2 && !out.endsWith(" ") ? " " : "") + sg.s;
  });
  return out.replace(/\s+/g, " ").trim();
};

// ── Recognising the parts of a form ──────────────────────────────────────────

const isCheckMark = (s: string) => /[√✓✔]/.test(s) || /^\(?\s*(check(ed)?|tick|ok|y\s*\/\s*n|yes\s*\/\s*no)\s*\)?$/i.test(s.trim());
const isHeaderWords = (t: string) => /^((ref(erence)?|item|items|description|requirement|check(ed)?|tick|remarks?|comments?|notes?|\(?\s*[√✓✔]\s*(or\s*x)?\s*\)?)\s*)+$/i.test(t.trim());
const ITEM_WORD = /^(item|items|description|requirement|requirements|equipment|details)$/i;

/** The table columns a header line declares — one per Check mark. */
function headerColumns(line: Line, width: number): Col[] | null {
  const marks: { l: number; r: number }[] = [];
  line.segs.forEach((sg, i) => {
    if (!isCheckMark(sg.s)) return;
    // "( √ or X)" arrives as three runs — take the bracketing ones with the mark.
    let l = sg.x, r = sg.x + sg.w;
    const before = line.segs[i - 1], after = line.segs[i + 1];
    if (before && /^\($/.test(before.s.trim()) && sg.x - (before.x + before.w) < 6) l = before.x;
    if (after && /^or\s*x\)?$/i.test(after.s.trim()) && after.x - r < 6) r = after.x + after.w;
    marks.push({ l, r });
  });
  if (!marks.length) return null;
  // Header lines are short — a sentence that happens to contain "check" is not one.
  if (line.segs.filter((s) => !isCheckMark(s.s)).some((s) => s.s.trim().split(/\s+/).length > 3)) return null;
  const cols: Col[] = [];
  marks.forEach((m, i) => {
    const prevR = i ? marks[i - 1].r : -1;
    const own = line.segs.filter((s) => s.x > prevR && s.x + s.w <= m.l + 1 && !isCheckMark(s.s) && !/^\(|or\s*x\)?$/i.test(s.s.trim()));
    const first = own[0];
    const itemSeg = own.find((s) => ITEM_WORD.test(s.s.trim())) ?? own[1] ?? own[0];
    const left = i === 0 ? 0 : (marks[i - 1].r + (first?.x ?? m.l)) / 2;
    cols.push({ left, right: width, itemX: itemSeg?.x ?? m.l - 150, checkX: Math.round((m.l + m.r) / 2) });
    if (i) cols[i - 1].right = left;
  });
  return cols;
}

const HEADER_LABELS: [RegExp, string][] = [
  [/^(name of (the )?(boat|vessel|yacht|craft)|(boat|vessel|yacht|craft)( name)?)$/, "boatName"],
  [/^((inspection|survey|check) )?date( of (inspection|survey))?$/, "inspectionDate"],
  [/^(name of (the )?inspector|(inspector|surveyor|examiner)s?( name)?|(inspected|checked) by)$/, "inspectorName"],
  [/^((boat|vessel|craft) type|type( of (boat|vessel|craft))?)$/, "boatType"],
  [/^((no|number) of (persons|people|passengers|pax)|persons|max(imum)? (persons|passengers))$/, "persons"],
  [/^((inspection|survey) )?(place|location|port|venue)$/, "inspectionPlace"],
  [/^(rtc|centre|center|company|organisation|organization|club|operator)( name)?$/, "rtcName"],
];
const normLabel = (s: string) => s.toLowerCase().replace(/[’'.:]/g, "").replace(/\s+/g, " ").trim();

/** "Name of boat", "Inspection date"… above the first table: where each value is written. */
function detectHeaderFields(lines: Line[], width: number): FormHeaderField[] {
  const found: { key: string; label: string; x: number; r: number; y: number; next: number | null }[] = [];
  for (const line of lines) {
    line.segs.forEach((sg, i) => {
      const n = normLabel(sg.s);
      const hit = HEADER_LABELS.find(([re]) => re.test(n));
      if (!hit || found.some((f) => f.key === hit[1])) return;
      found.push({ key: hit[1], label: sg.s.trim().replace(/:$/, ""), x: sg.x, r: sg.x + sg.w, y: line.y, next: line.segs[i + 1]?.x ?? null });
    });
  }
  // Labels stacked in one column share a value column: just right of the widest of them.
  return found.map((f) => {
    const column = found.filter((g) => Math.abs(g.x - f.x) <= 6);
    const x = Math.round(Math.max(...column.map((g) => g.r)) + 6);
    const maxWidth = Math.max(60, Math.round((f.next != null && f.next > x ? f.next - 8 : width - 36) - x));
    return { key: f.key, label: f.label, page: 1, x, y: f.y, maxWidth };
  });
}

// ── Walking the tables ───────────────────────────────────────────────────────

export function detectFromPages(pages: { width: number; height: number; lines: Line[] }[]): DetectedForm {
  const rows: DetectedRow[] = [];
  const warnings: string[] = [];
  let cols: Col[] | null = null;
  let done = false;
  let title: string | null = null;
  let headerFields: FormHeaderField[] = [];
  let section: string | null = null;

  for (let p = 0; p < pages.length && !done; p++) {
    const { width, lines } = pages[p];
    const live = lines.filter((l) => l.y > 25 && !/^(last updated|page \d+|©|\d+\s*\/\s*\d+$)/i.test(joinSegs(l.segs)));
    // Split the page into bands, each governed by the header line above it.
    type Band = { cols: Col[] | null; lines: Line[] };
    const bands: Band[] = [{ cols, lines: [] }];
    for (const line of live) {
      const h = headerColumns(line, width);
      if (h) { bands.push({ cols: h, lines: [] }); cols = h; continue; }
      bands[bands.length - 1].lines.push(line);
    }

    for (const band of bands) {
      if (done) break;
      if (!band.cols) {
        // Above the first table on the first page with one: the form's header block.
        if (p === 0 || !headerFields.length) {
          headerFields = headerFields.length ? headerFields : detectHeaderFields(band.lines, width);
          if (!title) {
            const tallest = [...band.lines].sort((a, b) => Math.max(...b.segs.map((s) => s.h)) - Math.max(...a.segs.map((s) => s.h)))[0];
            title = tallest ? joinSegs(tallest.segs).replace(/\s*ref:.*$/i, "").trim() || null : null;
          }
        }
        continue;
      }
      const bcols = band.cols;
      // Prose that runs across the columns (a note between tables) is not part of either.
      const boundaries = bcols.slice(1).map((c) => c.left);
      const crosses = (l: Line) => l.segs.some((s) => boundaries.some((b) => s.x < b - 4 && s.x + s.w > b + 8));
      // Notes end the checklist: everything after them is guidance, not items.
      const notesAt = band.lines.findIndex((l) => /^notes?\s*[:.]?(\s|$)/i.test(joinSegs(l.segs)));
      const tableLines = (notesAt >= 0 ? band.lines.slice(0, notesAt) : band.lines).filter((l) => !crosses(l));
      if (notesAt >= 0) done = true;

      for (const col of bcols) {
        const colLines = tableLines
          .map((l) => ({ y: l.y, segs: l.segs.filter((s) => s.x >= col.left && s.x < col.right && !(Math.abs(s.x + s.w / 2 - col.checkX) < 16 && s.s.trim().length <= 3)) }))
          .filter((l) => l.segs.length);
        const firstBody = (l: Line) => l.segs.filter((s) => s.x >= col.itemX - 3);
        const lettered = colLines.filter((l) => { const b = firstBody(l); return b.length > 1 && /^[A-Z]{1,2}$/.test(b[0].s.trim()); }).length >= 2;
        // A table with numbered headings ("12. External Lockers") uses capitals for items
        // ("RADAR"), so capitals only mark a heading where nothing is numbered.
        const numbered = colLines.filter((l) => /^\d{1,2}\.\s+\S/.test(joinSegs(firstBody(l)))).length >= 2;
        let cur: DetectedRow | null = null;
        let pendingRef = "";
        let skipping = false;
        let lastWasSection = false;
        const flush = () => { if (cur) rows.push(cur); cur = null; };

        for (const l of colLines) {
          const refSegs = l.segs.filter((s) => s.x < col.itemX - 3);
          const bodySegs = firstBody(l);
          const refRaw = joinSegs(refSegs);
          // The Ref column holds codes ("TCP4", "MGN 349", "+"); a heading printed across it
          // ("EQUIPMENT", "SAFETY BOAT COURSES") or a stray line of prose is not a reference.
          const refIsCode = /\d/.test(refRaw) && refRaw.length <= 10 || /^(TC[A-Z]{0,3}|MGN|MSN|SOLAS)$/.test(refRaw);
          const ref = refIsCode ? refRaw : "";
          const refHeading = !refIsCode && refRaw && (() => {
            const letters = refRaw.replace(/[^A-Za-z]/g, "");
            return letters.length >= 3 && letters.replace(/[^A-Z]/g, "").length / letters.length >= 0.85;
          })();
          let text = joinSegs(bodySegs);
          if (refHeading) {
            flush();
            section = `${refRaw}${text ? ` ${text}` : ""}`.replace(/:$/, "").trim();
            rows.push({ kind: "section", text: section, ref: "", page: null, x: null, y: null });
            skipping = false; lastWasSection = true; pendingRef = "";
            continue;
          }
          if (!text) { if (ref) { if (cur) (cur as DetectedRow).ref ||= ref; else pendingRef = ref; } continue; }
          if (isHeaderWords(text)) continue;

          // Footnotes ("*Engines which…", "+Whether these…") and their wrapped lines.
          if (/^[*+†]\s?\S/.test(text) && text.length > 12) { flush(); skipping = true; lastWasSection = false; continue; }

          const code = lettered && bodySegs.length > 1 && /^[A-Z]{1,2}$/.test(bodySegs[0].s.trim());
          if (code) text = joinSegs(bodySegs.slice(1));
          const letters = text.replace(/[^A-Za-z]/g, "");
          const upper = letters.replace(/[^A-Z]/g, "").length;
          const isHeading = !code && (
            /^\d{1,2}\.\s+\S/.test(text)
            || (!numbered && letters.length >= 3 && upper / letters.length >= 0.85 && !/^[A-Z]{1,3}\d/.test(text))
            || (/\bonly$/i.test(text) && text.length < 40)
          );

          if (isHeading) {
            flush();
            section = text.replace(/^\d{1,2}\.\s+/, "").replace(/:$/, "").trim();
            rows.push({ kind: "section", text: section, ref: "", page: null, x: null, y: null });
            skipping = false; lastWasSection = true; pendingRef = "";
            continue;
          }
          // A bracketed or lower-case line straight under a heading is the heading wrapping:
          // "(if inboard – …)", "classification system or equivalent standard)".
          if (lastWasSection && !code && /^[a-z(]/.test(text)) {
            const s = rows[rows.length - 1];
            s.text = `${s.text} ${text}`; section = s.text;
            continue;
          }
          lastWasSection = false;

          const bullet = /^[•·▪●◦]\s*/.test(text);
          if (bullet) text = text.replace(/^[•·▪●◦]\s*/, "");
          const c = cur as DetectedRow | null;
          const continues = c && !code && (
            lettered || bullet || /^[a-z(]/.test(text) || /[,&/:–-]$/.test(c.text) || /\b(and|or|of|to|the|for|with|a|an|in|on|by|if)$/i.test(c.text)
          );
          if (continues && c) { c.text = `${c.text}${bullet ? " • " : " "}${text}`; continue; }
          if (lettered && !code) continue; // orphan prose in a lettered table
          if (skipping && !code && /^[a-z(]/.test(text)) continue;
          flush();
          skipping = false;
          cur = { kind: "item", text, ref: ref || pendingRef, page: p + 1, x: col.checkX, y: l.y };
          pendingRef = "";
        }
        flush();
      }
    }
  }

  const items = rows.filter((r) => r.kind === "item").length;
  if (!items) warnings.push("No checklist table was found — the PDF may be a scan (no text layer) or have no \"Check\" column. Add the items by hand and click where each tick goes.");
  if (!headerFields.length) warnings.push("No header fields (boat name, date, inspector) were recognised — add them by clicking on the page.");
  return { pageCount: pages.length, pageSizes: pages.map(({ width, height }) => ({ width, height })), title, rows, headerFields, warnings };
}
