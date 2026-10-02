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
  /** On Yes/No forms: where the No box is on the same line, for the ✗ of an item not ticked. */
  noX?: number | null;
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
function detectHeaderFields(lines: Line[], width: number, page = 1): FormHeaderField[] {
  const found: { key: string; label: string; x: number; r: number; y: number; next: number | null; colon: boolean }[] = [];
  for (const line of lines) {
    line.segs.forEach((sg, i) => {
      const n = normLabel(sg.s);
      const hit = HEADER_LABELS.find(([re]) => re.test(n));
      if (!hit) return;
      // "Date:" is a field to fill in; a bare "Date" is more often a table column heading.
      const colon = /:\s*$/.test(sg.s) || /^\s*:/.test(line.segs[i + 1]?.s ?? "");
      const prev = found.findIndex((f) => f.key === hit[1]);
      if (prev >= 0 && (found[prev].colon || !colon)) return;
      // Skip punctuation printed in the box ("  /  /") when working out how much room there is.
      const next = line.segs.slice(i + 1).find((s) => /[A-Za-z0-9]{2,}/.test(s.s))?.x ?? null;
      const entry = { key: hit[1], label: sg.s.trim().replace(/:$/, ""), x: sg.x, r: sg.x + sg.w, y: line.y, next, colon };
      if (prev >= 0) found[prev] = entry; else found.push(entry);
    });
  }
  // Labels stacked in one column share a value column: just right of the widest of them.
  return found.map((f) => {
    const column = found.filter((g) => Math.abs(g.x - f.x) <= 6);
    const x = Math.round(Math.max(...column.map((g) => g.r)) + 6);
    const maxWidth = Math.max(60, Math.round((f.next != null && f.next > x ? f.next - 8 : width - 36) - x));
    return { key: f.key, label: f.label, page, x, y: f.y, maxWidth };
  });
}

const LATIN = /[A-Za-z]/;
/**
 * The title: in the top third of the first page, the tallest line of real words — not a
 * line of Arabic or symbols the UI cannot draw, a "Label:" or a column heading. A
 * "(Inspection Checklist)" line straight under it is kept with it.
 */
function pickTitle(lines: Line[], pageHeight = 792): string | null {
  const letters = (l: Line) => (joinSegs(l.segs.filter((s) => LATIN.test(s.s))).match(/[A-Za-z]/g) ?? []).length;
  const candidates = lines.filter((l) => l.y > pageHeight * 0.66 && letters(l) >= 6 && !/:\s*$/.test(joinSegs(l.segs))
    // Not a column heading, page number or document code ("RTS-TEC-INS-23", "Ver.# : 08").
    && !l.segs.every((s) => !LATIN.test(s.s) || /^(no\.?|yes|ref|item|check|territorial|inland|waters?|page|date|owner|ver)/i.test(s.s.trim())
      || /^[A-Z0-9][A-Z0-9-]*\d/.test(s.s.trim())));
  // The highest such line: titles head the page, above the header block and the table.
  const best = [...candidates].sort((a, b) => b.y - a.y)[0];
  if (!best) return null;
  const text = (l: Line) => joinSegs(l.segs.filter((s) => LATIN.test(s.s) && !/^[A-Z0-9][A-Z0-9-]*\d/.test(s.s.trim()))).replace(/\s*ref:.*$/i, "").trim();
  const below = lines.find((l) => l.y < best.y && best.y - l.y <= 20 && l.segs.some((s) => /checklist/i.test(s.s)) && !/checklist/i.test(text(best)));
  const sub = below ? joinSegs(below.segs.filter((s) => /checklist/i.test(s.s))) : "";
  return [text(best), sub].filter(Boolean).join(" ") || null;
}

// ── Forms with a Yes box and a No box on every row ───────────────────────────
//
// The DMA inspection checklists have no Check column: each row carries printed
// "☐ ☐" boxes under "No" and "Yes", the English item text beside them, the
// Arabic above it and the item number on the right. Sections are the titles on
// the "No | Yes | Territorial Waters | Inland Waters" header rows.

const BOX = /^[□☐❑❒▢◻]$/;
const HEADER_WORD = /^(no\.?|yes|y|n|n\/a|na|territorial|inland|waters?|requirements?|items?|description|ref(erence)?|check(ed)?|remarks?|comments?|ok)$/i;

function detectBoxRows(pages: { width: number; height: number; lines: Line[] }[]): { rows: DetectedRow[]; headerFields: FormHeaderField[] } | null {
  // Page furniture — the running header and footer, the same words at the same height on
  // every page — is not content. A row of empty boxes looks the same everywhere, so never counts.
  const key = (l: Line) => `${joinSegs(l.segs)}@${Math.round(l.y / 3)}`;
  const seen = new Map<string, number>();
  for (const p of pages) for (const k of new Set(p.lines.map(key))) seen.set(k, (seen.get(k) ?? 0) + 1);
  const repeated = (l: Line) => pages.length > 1 && !l.segs.some((s) => BOX.test(s.s.trim())) && (seen.get(key(l)) ?? 0) > 1;

  // The box columns, from where the boxes actually are.
  const xs: number[] = [];
  for (const p of pages) for (const l of p.lines) for (const s of l.segs) if (BOX.test(s.s.trim())) xs.push(s.x);
  if (xs.length < 6) return null;
  const clusters: { x: number; n: number }[] = [];
  for (const x of xs) {
    const c = clusters.find((k) => Math.abs(k.x - x) <= 4);
    if (c) { c.x = (c.x * c.n + x) / (c.n + 1); c.n += 1; } else clusters.push({ x, n: 1 });
  }
  const cols = clusters.filter((c) => c.n >= Math.max(3, xs.length * 0.15)).sort((a, b) => a.x - b.x);
  if (!cols.length) return null;

  // Which column is Yes: the one under a "Yes" heading; otherwise the first.
  const centres = (re: RegExp) => pages.flatMap((p) => p.lines.flatMap((l) => l.segs.filter((s) => re.test(s.s.trim())).map((s) => s.x + s.w / 2)));
  const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const nearest = (cands: { x: number }[], target: number) => cands.reduce((b, c) => (Math.abs(c.x + 5 - target) < Math.abs(b.x + 5 - target) ? c : b));
  const yesHeads = centres(/^(yes|نعم)$/i), noHeads = centres(/^(no|لا)$/i);
  const yesX = (yesHeads.length ? nearest(cols, median(yesHeads)) : cols[0]).x;
  const others = cols.filter((c) => c.x !== yesX);
  const noX = others.length ? (noHeads.length ? nearest(others, median(noHeads)) : others[0]).x : null;
  const textLeft = Math.max(...cols.map((c) => c.x)) + 30;
  const isYesBox = (s: Seg) => BOX.test(s.s.trim()) && Math.abs(s.x - yesX) <= 4;
  /** The English words on a line, right of the boxes: no Arabic, no item numbers, no tick marks. */
  const words = (l: Line) => joinSegs(l.segs.filter((s) => s.x >= textLeft && LATIN.test(s.s) && !HEADER_WORD.test(s.s.trim())));

  const rows: DetectedRow[] = [];
  let carry: DetectedRow | null = null; // a row whose words fell onto the next page
  for (let p = 0; p < pages.length; p++) {
    const lines = pages[p].lines.filter((l) => l.y > 20 && !repeated(l));
    const used = new Set<Line>();
    const boxLines = lines.filter((l) => l.segs.some(isYesBox));
    if (carry && boxLines.length) {
      const top = lines.filter((l) => l.y > boxLines[0].y && words(l)).sort((a, b) => a.y - b.y)[0];
      if (top) { carry.text = words(top); used.add(top); }
    }
    carry = null;

    type Ev = { y: number; row: DetectedRow };
    const events: Ev[] = [];
    // Section titles sit on the Yes / No header rows.
    for (const l of lines) {
      if (!l.segs.some((s) => /^(yes|نعم)$/i.test(s.s.trim()))) continue;
      const band = lines.filter((b) => Math.abs(b.y - l.y) <= 8);
      band.forEach((b) => used.add(b));
      const title = band.sort((a, b) => b.y - a.y).map(words).filter(Boolean).join(" ").trim();
      if (title && !events.some((e) => e.row.kind === "section" && e.row.text === title)) {
        events.push({ y: l.y + 0.5, row: { kind: "section", text: title, ref: "", page: null, x: null, y: null } });
      }
    }
    for (const bl of boxLines) {
      const yes = bl.segs.find(isYesBox)!;
      const no = noX != null ? bl.segs.find((s) => BOX.test(s.s.trim()) && Math.abs(s.x - noX) <= 4) : undefined;
      // The item's words: the nearest line of English level with or just below the boxes.
      const cand = lines
        .filter((l) => !used.has(l) && l.y <= bl.y + 4 && l.y > bl.y - 16 && words(l))
        .sort((a, b) => Math.abs(a.y - bl.y) - Math.abs(b.y - bl.y))[0];
      if (cand) used.add(cand);
      const row: DetectedRow = {
        kind: "item", text: cand ? words(cand) : "", ref: "", page: p + 1,
        x: Math.round(yes.x + 1), y: bl.y, noX: no ? Math.round(no.x + 1) : null,
      };
      events.push({ y: bl.y, row });
      if (!cand && bl === boxLines[boxLines.length - 1]) carry = row;
    }
    events.sort((a, b) => b.y - a.y).forEach((e) => rows.push(e.row));
  }
  rows.forEach((r) => { if (r.kind === "item" && !r.text) r.text = "(item text not found — type it in)"; });

  // Header fields can be anywhere on these forms — the inspector's sign-off is on the last page.
  const headerFields: FormHeaderField[] = [];
  pages.forEach((pg, i) => {
    for (const f of detectHeaderFields(pg.lines.filter((l) => !repeated(l)), pg.width, i + 1)) {
      if (!headerFields.some((h) => h.key === f.key)) headerFields.push(f);
    }
  });
  // A sign-off "Date:" beside the inspector's name is the inspection date, not a table column.
  const insp = headerFields.find((h) => h.key === "inspectorName");
  const date = headerFields.find((h) => h.key === "inspectionDate");
  if (insp && date && (date.page !== insp.page || Math.abs(date.y - insp.y) > 4)) {
    const pg = pages[insp.page - 1];
    const line = pg?.lines.find((l) => Math.abs(l.y - insp.y) <= 2);
    const seg = line?.segs.find((s) => /^date\s*:?$/i.test(s.s.trim()));
    if (seg) Object.assign(date, { page: insp.page, x: Math.round(seg.x + seg.w + 6), y: insp.y, maxWidth: Math.max(60, Math.round(pg.width - 36 - (seg.x + seg.w + 6))) });
  }
  return { rows, headerFields };
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
          headerFields = headerFields.length ? headerFields : detectHeaderFields(band.lines, width, p + 1);
          if (!title) title = pickTitle(band.lines, pages[p].height);
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

  // No Check column found? The form may tick a Yes box on every row instead.
  let items = rows.filter((r) => r.kind === "item").length;
  if (items < 3) {
    const box = detectBoxRows(pages);
    const boxItems = box?.rows.filter((r) => r.kind === "item").length ?? 0;
    if (box && boxItems > items) {
      rows.splice(0, rows.length, ...box.rows);
      if (box.headerFields.length) headerFields = box.headerFields;
      title = pickTitle(pages[0].lines, pages[0].height) ?? title;
      items = boxItems;
      warnings.push("Read as a Yes / No form: ticks go in the Yes box, and \"mark items not ticked\" puts the ✗ in the No box.");
      if (box.rows.some((r) => r.kind === "item" && r.text.startsWith("(item text not found"))) {
        warnings.push("Some rows' wording could not be read — they are marked \"(item text not found)\"; type them in.");
      }
    }
  }
  if ((!title || /:\s*$/.test(title)) && pages[0]) title = pickTitle(pages[0].lines, pages[0].height);
  if (!items) warnings.push("No checklist table was found — the PDF may be a scan (no text layer) or have no \"Check\" column. Add the items by hand and click where each tick goes.");
  if (!headerFields.length) warnings.push("No header fields (boat name, date, inspector) were recognised — add them by clicking on the page.");
  return { pageCount: pages.length, pageSizes: pages.map(({ width, height }) => ({ width, height })), title, rows, headerFields, warnings };
}
