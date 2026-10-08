/**
 * Inventory (On board) — the register's columns, and turning a spreadsheet
 * (CSV file, or rows pasted from Excel) into items. Shared by the grid, the
 * import dialog and the CSV export so all three use the same headings: export
 * a register, edit it in Excel, import it back.
 */

export const INV_DEPARTMENTS: Array<[string, string]> = [
  ["interior", "Interior"], ["deck", "Deck"], ["engine", "Engineering"], ["galley", "Galley"],
  ["bar", "Bar"], ["safety", "Safety"], ["other", "Other"],
];
export const INV_CONDITIONS: Array<[string, string]> = [
  ["new", "New"], ["good", "Good"], ["fair", "Fair"], ["poor", "Poor"], ["damaged", "Damaged"], ["missing", "Missing"],
];
export const INV_CURRENCIES = ["EUR", "USD", "AED", "GBP"] as const;

export type InvField =
  | "name" | "category" | "department" | "location" | "quantity" | "condition"
  | "make" | "model" | "serial_number" | "supplier" | "purchase_date"
  | "purchase_price" | "currency" | "warranty_expiry" | "last_checked" | "notes";

export type InvColumn = {
  key: InvField;
  /** Heading in the grid, the template and the export. */
  label: string;
  type: "text" | "number" | "date" | "select" | "longtext";
  options?: Array<[string, string]>;
  /** Other headings accepted on import. */
  aliases?: string[];
  /** Only for people who see the vessel's accounts. */
  money?: boolean;
  width: number;
  example: string;
};

export const INV_COLUMNS: InvColumn[] = [
  { key: "name", label: "Item", type: "text", aliases: ["name", "item name", "description"], width: 220, example: "Christofle dinner plate" },
  { key: "category", label: "Category", type: "text", width: 130, example: "Tableware" },
  { key: "department", label: "Department", type: "select", options: INV_DEPARTMENTS, aliases: ["dept"], width: 120, example: "Interior" },
  { key: "location", label: "Location", type: "text", aliases: ["where", "where it's kept", "stored"], width: 150, example: "Main saloon sideboard" },
  { key: "quantity", label: "Quantity", type: "number", aliases: ["qty", "count", "no", "number"], width: 80, example: "24" },
  { key: "condition", label: "Condition", type: "select", options: INV_CONDITIONS, width: 105, example: "Good" },
  { key: "make", label: "Make", type: "text", aliases: ["brand", "manufacturer", "maker"], width: 120, example: "Christofle" },
  { key: "model", label: "Model", type: "text", width: 120, example: "Malmaison" },
  { key: "serial_number", label: "Serial", type: "text", aliases: ["serial number", "s/n", "sn", "part number", "part no"], width: 130, example: "" },
  { key: "supplier", label: "Supplier", type: "text", aliases: ["vendor"], width: 120, example: "" },
  { key: "purchase_date", label: "Bought", type: "date", aliases: ["purchase date", "purchased", "date bought"], width: 125, example: "2025-03-14" },
  { key: "purchase_price", label: "Value each", type: "number", aliases: ["value", "price", "unit price", "cost", "purchase price"], money: true, width: 100, example: "180" },
  { key: "currency", label: "Currency", type: "select", options: INV_CURRENCIES.map((c) => [c, c]), aliases: ["ccy"], money: true, width: 85, example: "EUR" },
  { key: "warranty_expiry", label: "Warranty until", type: "date", aliases: ["warranty", "warranty expiry", "warranty end"], width: 125, example: "" },
  { key: "last_checked", label: "Last checked", type: "date", aliases: ["checked", "last check"], width: 125, example: "" },
  { key: "notes", label: "Notes", type: "longtext", aliases: ["comments", "remarks"], width: 220, example: "Set of 24, hand wash only" },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();

/** Which field a spreadsheet heading means, if any. */
export function columnForHeading(heading: string): InvField | null {
  const h = norm(heading);
  if (!h) return null;
  for (const c of INV_COLUMNS) {
    if (norm(c.label) === h || norm(c.key.replace(/_/g, " ")) === h || c.aliases?.some((a) => norm(a) === h)) return c.key;
  }
  return null;
}

/** Parse CSV (or tab-separated text pasted from Excel) into rows of cells. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = src.split("\n", 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : (firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** A date as YYYY-MM-DD from "2025-03-14", "14/03/2025", "14-03-25", "14 Mar 2025"… else null. */
export function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    const d = new Date(Date.UTC(Number(y), Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(dmy[1]) ? null : d.toISOString().slice(0, 10);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/** Map a pick-list cell ("Engineering", "engine", "ENG") to its stored value, else null. */
function pick(options: Array<[string, string]>, raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const hit = options.find(([k, l]) => k.toLowerCase() === v || l.toLowerCase() === v)
    ?? options.find(([k, l]) => l.toLowerCase().startsWith(v) || k.toLowerCase().startsWith(v));
  return hit?.[0] ?? null;
}

export type ImportRow = {
  /** 1-based line in the sheet (for messages). */
  line: number;
  values: Partial<Record<InvField, string | number | null>>;
  errors: string[];
};

/**
 * Turn one row of cells into an item, given which field each column holds.
 * Blank cells are left out (so an import never blanks an existing value).
 */
export function rowToItem(cells: string[], fields: Array<InvField | null>, line: number): ImportRow {
  const values: ImportRow["values"] = {};
  const errors: string[] = [];
  fields.forEach((f, i) => {
    if (!f) return;
    const raw = (cells[i] ?? "").trim();
    if (!raw) return;
    const col = INV_COLUMNS.find((c) => c.key === f)!;
    if (col.type === "number") {
      const n = Number(raw.replace(/[^\d.\-]/g, ""));
      if (!Number.isFinite(n) || n < 0) errors.push(`${col.label} "${raw}" isn't a number`);
      else if (f === "quantity" && !Number.isInteger(n)) errors.push(`Quantity "${raw}" must be a whole number`);
      else values[f] = n;
    } else if (col.type === "date") {
      const d = toIsoDate(raw);
      if (!d) errors.push(`${col.label} "${raw}" isn't a date`);
      else values[f] = d;
    } else if (col.type === "select") {
      const v = pick(col.options!, raw);
      if (!v) errors.push(`${col.label} "${raw}" isn't one of ${col.options!.map(([, l]) => l).join(", ")}`);
      else values[f] = v;
    } else {
      if (raw.length > (col.type === "longtext" ? 4000 : 160)) errors.push(`${col.label} is too long`);
      else values[f] = raw;
    }
  });
  if (!values.name) errors.push("No item name");
  return { line, values, errors };
}

/** Read a whole sheet: the first row is the headings. */
export function sheetToItems(text: string): { rows: ImportRow[]; fields: Array<InvField | null>; unknown: string[] } {
  const grid = parseDelimited(text);
  if (!grid.length) return { rows: [], fields: [], unknown: [] };
  const fields = grid[0].map(columnForHeading);
  const unknown = grid[0].filter((h, i) => h.trim() && !fields[i]);
  const rows = grid.slice(1).map((cells, i) => rowToItem(cells, fields, i + 2));
  return { rows, fields, unknown };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The template: every heading, plus two example rows to copy the format from. */
export function templateCsv(showValue: boolean): string {
  const cols = INV_COLUMNS.filter((c) => showValue || !c.money);
  const second: Partial<Record<InvField, string>> = {
    name: "Seabob F5 SR", category: "Tenders & toys", department: "Deck", location: "Tender garage", quantity: "2",
    condition: "Good", make: "Seabob", model: "F5 SR", serial_number: "SB-F5-004417", supplier: "",
    purchase_date: "2024-06-01", purchase_price: "17500", currency: "EUR", warranty_expiry: "2026-06-01", last_checked: "", notes: "",
  };
  return [
    cols.map((c) => c.label).join(","),
    cols.map((c) => csvCell(c.example)).join(","),
    cols.map((c) => csvCell(second[c.key] ?? "")).join(","),
  ].join("\n");
}

/** Save text as a file in the browser. */
export function downloadText(name: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export { csvCell };
