/**
 * SIM Cards — bulk import from Excel / CSV.
 *
 * Staff export the Etisalat / Du account sheets (or fill in our template) and
 * drop the file on the register. Everything happens in the browser: the .xlsx
 * is unzipped with JSZip and the first worksheet read cell by cell; a .csv is
 * split directly. Headers are matched loosely (case, spaces, punctuation and a
 * few synonyms ignored) so the client's own column names work without editing.
 *
 * Each row is validated into a ready-to-insert sim_cards record or a list of
 * problems, and checked against the existing register so re-importing the same
 * sheet does not create duplicates.
 */
import JSZip from "jszip";

export type SimProvider = "etisalat" | "du";
export type SimStatus = "active" | "suspended" | "cancelled" | "spare";

export type SimImportRow = {
  provider: SimProvider;
  phone_number: string | null;
  iccid: string | null;
  plan_name: string | null;
  yacht_id: string | null;
  assigned_to: string | null;
  status: SimStatus;
  monthly_cost: number | null;
  cost_currency: string;
  sell_price: number | null;
  sell_currency: string;
  data_allowance: string | null;
  activated_on: string | null;
  renewal_date: string | null;
  notes: string | null;
};

export type ParsedSimRow = {
  /** 1-based row number in the sheet, for the preview. */
  line: number;
  raw: Record<string, string>;
  record: SimImportRow | null;
  /** Blocking problems — the row will not be imported. */
  errors: string[];
  /** Non-blocking notes — imported, but worth a look. */
  warnings: string[];
  /** Already in the register (same number or ICCID) — skipped unless the user says otherwise. */
  duplicateOf: string | null;
};

/** The columns we understand, in template order, with the header names we accept for each. */
export const SIM_COLUMNS: { key: keyof SimImportRow | "yacht"; label: string; aliases: string[]; required?: boolean; hint: string }[] = [
  { key: "provider", label: "Provider", aliases: ["provider", "network", "operator", "carrier", "telco"], required: true, hint: "Etisalat or Du" },
  { key: "phone_number", label: "Phone Number", aliases: ["phone number", "phone", "number", "mobile", "mobile number", "msisdn", "sim number", "line"], hint: "+971 5x xxx xxxx" },
  { key: "iccid", label: "ICCID", aliases: ["iccid", "sim serial", "serial", "serial number", "sim id", "iccid / serial"], hint: "8971…" },
  { key: "plan_name", label: "Plan", aliases: ["plan", "plan name", "package", "tariff", "rate plan", "bundle"], hint: "e.g. Business 100GB" },
  { key: "data_allowance", label: "Data Allowance", aliases: ["data allowance", "data", "allowance", "quota", "data quota"], hint: "100 GB / Unlimited" },
  { key: "yacht", label: "Yacht", aliases: ["yacht", "vessel", "boat", "yacht name", "vessel name", "customer", "client"], hint: "Exact vessel name from Polaris" },
  { key: "assigned_to", label: "Assigned To", aliases: ["assigned to", "assigned", "user", "device", "holder", "person", "used by"], hint: "Captain / router / crew iPad…" },
  { key: "monthly_cost", label: "Monthly Cost", aliases: ["monthly cost", "cost", "cost / month", "cost per month", "our cost", "buy price", "we pay"], hint: "What we pay, per month" },
  { key: "cost_currency", label: "Cost Currency", aliases: ["cost currency", "cost ccy", "buy currency"], hint: "AED (default)" },
  { key: "sell_price", label: "Monthly Billed", aliases: ["monthly billed", "billed", "billed / month", "sell price", "selling price", "price", "charge", "yacht pays", "resale"], hint: "What the yacht pays, per month" },
  { key: "sell_currency", label: "Billed Currency", aliases: ["billed currency", "sell currency", "sell ccy", "price currency"], hint: "AED (default)" },
  { key: "activated_on", label: "Activated", aliases: ["activated", "activated on", "activation date", "start date", "start", "activation"], hint: "Date" },
  { key: "renewal_date", label: "Renewal", aliases: ["renewal", "renewal date", "renew", "expiry", "expiry date", "expires", "end date", "valid until"], hint: "Date" },
  { key: "status", label: "Status", aliases: ["status", "state"], hint: "active / suspended / spare / cancelled (default active)" },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "remarks", "comment", "comments"], hint: "Free text" },
];

const CCYS = ["AED", "USD", "EUR", "GBP"];

/** Loosen a header for matching: lower-case, strip punctuation, squash spaces. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Map sheet headers → our column keys. Unknown headers are reported so nothing is silently ignored. */
export function mapHeaders(headers: string[]): { map: Map<number, string>; unknown: string[]; missing: string[] } {
  const map = new Map<number, string>();
  const unknown: string[] = [];
  const taken = new Set<string>();
  headers.forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const col = SIM_COLUMNS.find((c) => !taken.has(c.key) && c.aliases.some((a) => norm(a) === n));
    if (col) { map.set(i, col.key); taken.add(col.key); } else unknown.push(h);
  });
  const missing = SIM_COLUMNS.filter((c) => c.required && !taken.has(c.key)).map((c) => c.label);
  return { map, unknown, missing };
}

// ── Reading the file ─────────────────────────────────────────────────────────

export type SheetGrid = { headers: string[]; rows: string[][]; sheetName: string | null };

export async function readSpreadsheet(file: File): Promise<SheetGrid> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") return fromRows(parseCsv(await file.text()), null);
  if (name.endsWith(".xlsx") || name.endsWith(".xlsm")) return readXlsx(await file.arrayBuffer());
  if (name.endsWith(".xls")) throw new Error("Old .xls format — open it in Excel and Save As .xlsx first.");
  throw new Error("Use an Excel (.xlsx) or CSV file.");
}

function fromRows(all: string[][], sheetName: string | null): SheetGrid {
  // The header is the first row with at least two filled cells — title rows above it are skipped.
  const start = all.findIndex((r) => r.filter((c) => c.trim()).length >= 2);
  if (start < 0) throw new Error("The sheet is empty.");
  const headers = all[start].map((c) => c.trim());
  const rows = all.slice(start + 1).filter((r) => r.some((c) => c.trim()));
  return { headers, rows, sheetName };
}

/** RFC-4180-ish CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * First worksheet of an .xlsx as a grid of display strings. Dates stored as
 * Excel serial numbers are turned into ISO dates when the cell carries a date
 * number format; everything else keeps its raw value.
 */
export async function readXlsx(buf: ArrayBuffer): Promise<SheetGrid> {
  const zip = await JSZip.loadAsync(buf);
  const xml = async (path: string) => { const f = zip.file(path); return f ? f.async("string") : null; };

  const wb = await xml("xl/workbook.xml");
  if (!wb) throw new Error("Not an Excel workbook.");
  const firstSheet = /<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"/.exec(wb) ?? /<sheet\b[^>]*\br:id="([^"]+)"[^>]*\bname="([^"]*)"/.exec(wb);
  const sheetName = firstSheet ? decode(firstSheet[1].startsWith("rId") ? firstSheet[2] : firstSheet[1]) : null;
  const rId = firstSheet ? (firstSheet[1].startsWith("rId") ? firstSheet[1] : firstSheet[2]) : null;
  const rels = await xml("xl/_rels/workbook.xml.rels");
  let target = "xl/worksheets/sheet1.xml";
  if (rels && rId) {
    const m = new RegExp(`<Relationship\\b[^>]*\\bId="${rId}"[^>]*\\bTarget="([^"]+)"`).exec(rels) ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rId}"`).exec(rels);
    if (m) target = m[1].startsWith("/") ? m[1].slice(1) : `xl/${m[1]}`;
  }
  const sheet = await xml(target);
  if (!sheet) throw new Error("The workbook has no worksheet.");

  // Shared strings — <si> may hold one <t> or several rich-text <r><t> runs.
  const shared: string[] = [];
  const ss = await xml("xl/sharedStrings.xml");
  if (ss) for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    shared.push(decode([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }
  // Which cell styles are date formats — built-in ids 14–22, 45–47, or a custom format containing d/m/y.
  const dateStyles = new Set<number>();
  const styles = await xml("xl/styles.xml");
  if (styles) {
    const custom = new Map<number, string>();
    for (const nf of styles.matchAll(/<numFmt\b[^>]*\bnumFmtId="(\d+)"[^>]*\bformatCode="([^"]*)"/g)) custom.set(Number(nf[1]), decode(nf[2]));
    const cellXfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
    [...cellXfs.matchAll(/<xf\b[^>]*>/g)].forEach((xf, i) => {
      const id = Number(/\bnumFmtId="(\d+)"/.exec(xf[0])?.[1] ?? 0);
      const code = custom.get(id) ?? "";
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[dmy]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, "").replace(/h|s|AM|PM/gi, ""))) dateStyles.add(i);
    });
  }

  const grid: string[][] = [];
  for (const rowM of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of rowM[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] ?? "";
      // Cells normally carry their reference (r="C7"); a writer that omits it means "next column".
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? colIndex(ref) : cells.length;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const s = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1);
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
      let out = "";
      if (t === "s") out = shared[Number(v)] ?? "";
      else if (t === "inlineStr") out = decode([...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (t === "b") out = v === "1" ? "TRUE" : "FALSE";
      else if (t === "str" || t === "e") out = decode(v);
      else if (v !== "") out = dateStyles.has(s) && /^\d+(\.\d+)?$/.test(v) ? serialToIso(Number(v)) : decode(v);
      while (cells.length < col) cells.push("");
      cells[col] = out.trim();
    }
    grid.push(cells);
  }
  return fromRows(grid, sheetName);
}

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
/** Excel serial date (1900 system) → YYYY-MM-DD. */
function serialToIso(n: number): string {
  const ms = Math.round((n - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

// ── Validation ───────────────────────────────────────────────────────────────

export type ExistingSim = { id: string; phone_number: string | null; iccid: string | null };
export type YachtOpt = { id: string; vessel_name: string };

const digits = (s: string) => s.replace(/\D/g, "");

export function validateRows(
  grid: SheetGrid, map: Map<number, string>, yachts: YachtOpt[], existing: ExistingSim[],
): ParsedSimRow[] {
  const yachtByName = new Map(yachts.map((y) => [norm(y.vessel_name), y]));
  const byPhone = new Map(existing.filter((e) => e.phone_number).map((e) => [digits(e.phone_number!), e]));
  const byIccid = new Map(existing.filter((e) => e.iccid).map((e) => [digits(e.iccid!), e]));
  const seenInFile = new Set<string>();

  return grid.rows.map((cells, i) => {
    const raw: Record<string, string> = {};
    map.forEach((key, idx) => { raw[key] = (cells[idx] ?? "").trim(); });
    const errors: string[] = [], warnings: string[] = [];
    const get = (k: string) => raw[k] ?? "";

    // Provider
    const pv = norm(get("provider"));
    const provider: SimProvider | null = /etisalat|e&|eand/.test(pv) ? "etisalat" : pv === "du" || /\bdu\b/.test(pv) ? "du" : null;
    if (!provider) errors.push(get("provider") ? `Provider "${get("provider")}" — use Etisalat or Du` : "Provider is missing");

    // Identity — at least one of number / ICCID
    const phone = get("phone_number") || null;
    const iccid = get("iccid") || null;
    if (!phone && !iccid) errors.push("Needs a phone number or an ICCID");
    if (iccid && !/^\d{18,22}$/.test(digits(iccid))) warnings.push("ICCID is not the usual 19–20 digits");

    // Status
    const sv = norm(get("status"));
    let status: SimStatus = "active";
    if (sv) {
      const m = (["active", "suspended", "cancelled", "spare"] as SimStatus[]).find((s) => sv.startsWith(s.slice(0, 4)));
      if (m) status = m; else if (/inactive|deactiv|terminat|closed/.test(sv)) status = "cancelled";
      else if (/stock|unassigned|free|available/.test(sv)) status = "spare";
      else warnings.push(`Status "${get("status")}" not recognised — set to active`);
    }

    // Yacht — by exact (loose) name; unknown names are kept in the notes so nothing is lost.
    let yacht_id: string | null = null;
    let notes = get("notes") || null;
    const yv = get("yacht");
    if (yv) {
      const y = yachtByName.get(norm(yv));
      if (y) yacht_id = y.id;
      else {
        warnings.push(`Yacht "${yv}" not found in Polaris — left unassigned, name kept in notes`);
        notes = [notes, `Yacht on import sheet: ${yv}`].filter(Boolean).join("\n");
      }
    }

    // Money
    const num = (k: string, label: string): number | null => {
      const v = get(k);
      if (!v) return null;
      const n = Number(v.replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n)) { warnings.push(`${label} "${v}" is not a number — left blank`); return null; }
      return n;
    };
    const ccy = (k: string, fallback: string) => {
      const v = get(k).toUpperCase().trim();
      if (!v) return fallback;
      if (CCYS.includes(v)) return v;
      warnings.push(`Currency "${v}" not recognised — set to ${fallback}`);
      return fallback;
    };
    // A currency written into the amount cell ("AED 150") is honoured.
    const inlineCcy = (k: string) => CCYS.find((c) => get(k).toUpperCase().includes(c));

    // Dates
    const date = (k: string, label: string): string | null => {
      const v = get(k);
      if (!v) return null;
      const d = parseDate(v);
      if (!d) warnings.push(`${label} "${v}" is not a date — left blank`);
      return d;
    };

    const record: SimImportRow | null = provider && (phone || iccid) ? {
      provider,
      phone_number: phone,
      iccid,
      plan_name: get("plan_name") || null,
      yacht_id,
      assigned_to: get("assigned_to") || null,
      status,
      monthly_cost: num("monthly_cost", "Monthly cost"),
      cost_currency: inlineCcy("monthly_cost") ?? ccy("cost_currency", "AED"),
      sell_price: num("sell_price", "Monthly billed"),
      sell_currency: inlineCcy("sell_price") ?? ccy("sell_currency", "AED"),
      data_allowance: get("data_allowance") || null,
      activated_on: date("activated_on", "Activated"),
      renewal_date: date("renewal_date", "Renewal"),
      notes,
    } : null;

    // Duplicates — against the register and within the file itself.
    let duplicateOf: string | null = null;
    const pk = phone ? digits(phone) : "", ik = iccid ? digits(iccid) : "";
    const hit = (pk && byPhone.get(pk)) || (ik && byIccid.get(ik)) || null;
    if (hit) duplicateOf = hit.phone_number ?? hit.iccid ?? hit.id;
    const fileKey = pk || ik;
    if (fileKey) {
      if (seenInFile.has(fileKey)) errors.push("Repeated within the file — first occurrence kept");
      seenInFile.add(fileKey);
    }

    return { line: i + 2, raw, record: errors.length ? null : record, errors, warnings, duplicateOf };
  });
}

/** ISO, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, d Mon yyyy, or anything Date can parse. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (dmy) {
    const y = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const d = new Date(Date.UTC(y, Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n > 20000 && n < 80000 ? serialToIso(n) : null; }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ── Template ─────────────────────────────────────────────────────────────────

/** A one-sheet .xlsx with our headers and two example rows, built with JSZip. */
export async function buildTemplateXlsx(): Promise<Blob> {
  const headers = SIM_COLUMNS.map((c) => c.label);
  const examples = [
    ["Etisalat", "+971 50 123 4567", "8997101234567890123", "Business 100GB", "100 GB", "Aquila", "Captain's iPhone", "150", "AED", "250", "AED", "2026-01-15", "2027-01-14", "active", ""],
    ["Du", "+971 55 987 6543", "8997109876543210987", "Data Only 50GB", "50 GB", "", "Spare stock", "80", "AED", "", "AED", "", "", "spare", "Kept in the IT cupboard"],
  ];
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const colRef = (i: number) => { let n = i + 1, s = ""; while (n) { s = String.fromCharCode(65 + ((n - 1) % 26)) + s; n = Math.floor((n - 1) / 26); } return s; };
  const row = (cells: string[], r: number, style?: number) =>
    `<row r="${r}">${cells.map((v, i) => `<c r="${colRef(i)}${r}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t>${esc(v)}</t></is></c>`).join("")}</row>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${headers.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="20" customWidth="1"/>`).join("")}</cols>
<sheetData>${row(headers, 1, 1)}${examples.map((e, i) => row(e, i + 2)).join("")}</sheetData>
</worksheet>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF07435E"/></patternFill></fill></fills>
<borders count="1"><border/></borders>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="SIM Cards" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  zip.file("xl/styles.xml", styles);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
