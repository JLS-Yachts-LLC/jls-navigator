/**
 * Orbit field app offline — just enough of PostgREST's URL language to replay
 * the crew's own unsent changes over data saved on the phone.
 *
 * When the phone has no signal, a list or job screen is drawn from the last
 * response saved for that exact request. Changes made since (Attend, Done, a
 * note, a checklist tick) sit in the outbox; this module applies them to the
 * saved rows so the screen shows what the person actually did — and keeps doing
 * so after signal returns until the outbox has been sent.
 *
 * Deliberately conservative: anything it cannot evaluate (or= filters, filters
 * on embedded tables, operators it doesn't know) is left alone rather than guessed.
 */

export type Filter = { col: string; op: string; not: boolean; value: string };
export type ParsedFilters = { filters: Filter[]; unsupported: boolean };
export type Row = Record<string, unknown>;

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

/** The table a /rest/v1/ URL addresses (null for rpc or anything else). */
export function restTable(url: string): string | null {
  const m = /\/rest\/v1\/([^/?#]+)/.exec(url);
  if (!m || m[1] === "rpc") return null;
  return decodeURIComponent(m[1]);
}

export function parseFilters(params: URLSearchParams): ParsedFilters {
  const filters: Filter[] = [];
  let unsupported = false;
  for (const [key, raw] of params) {
    if (RESERVED.has(key)) continue;
    // or=(…), and=(…), or a filter on an embedded resource (boats.name=eq.x).
    if (key === "or" || key === "and" || key.includes(".")) { unsupported = true; continue; }
    let rest = raw;
    let not = false;
    if (rest.startsWith("not.")) { not = true; rest = rest.slice(4); }
    const dot = rest.indexOf(".");
    if (dot < 0) { unsupported = true; continue; }
    filters.push({ col: key, op: rest.slice(0, dot), not, value: rest.slice(dot + 1) });
  }
  return { filters, unsupported };
}

/** Split "a,b,\"c, d\"" respecting PostgREST's double quotes. */
function splitList(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "\\" && quoted && i + 1 < s.length) { cur += s[++i]; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

const inner = (v: string, open: string, close: string) =>
  v.startsWith(open) && v.endsWith(close) ? v.slice(1, -1) : v;

/** How PostgREST would print a cell in a filter value. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** Numbers compare as numbers; everything else (ISO dates included) as text. */
function compare(a: unknown, b: string): number {
  if (typeof a === "number") {
    const nb = Number(b);
    if (!Number.isNaN(nb)) return a - nb;
  }
  const sa = cellText(a);
  return sa < b ? -1 : sa > b ? 1 : 0;
}

/** true / false, or undefined when this filter can't be judged on this row. */
export function matchFilter(row: Row, f: Filter): boolean | undefined {
  if (!(f.col in row)) return undefined;
  const cell = row[f.col];
  let r: boolean | undefined;
  switch (f.op) {
    case "eq": r = cellText(cell) === f.value; break;
    case "neq": r = cellText(cell) !== f.value; break;
    case "gt": r = cell !== null && compare(cell, f.value) > 0; break;
    case "gte": r = cell !== null && compare(cell, f.value) >= 0; break;
    case "lt": r = cell !== null && compare(cell, f.value) < 0; break;
    case "lte": r = cell !== null && compare(cell, f.value) <= 0; break;
    case "in": r = splitList(inner(f.value, "(", ")")).includes(cellText(cell)); break;
    case "is":
      r = f.value === "null" ? cell === null || cell === undefined
        : f.value === "true" ? cell === true
        : f.value === "false" ? cell === false
        : undefined;
      break;
    case "cs": {
      if (!Array.isArray(cell)) return undefined;
      const want = splitList(inner(f.value, "{", "}")).filter((x) => x !== "");
      const have = cell.map(cellText);
      r = want.every((w) => have.includes(w));
      break;
    }
    default: return undefined;
  }
  if (r !== undefined && f.not) r = !r;
  return r;
}

export function matchAll(row: Row, filters: Filter[]): boolean | undefined {
  let unknown = false;
  for (const f of filters) {
    const r = matchFilter(row, f);
    if (r === false) return false;
    if (r === undefined) unknown = true;
  }
  return unknown ? undefined : true;
}

type OrderTerm = { col: string; asc: boolean; nullsFirst: boolean };

export function parseOrder(params: URLSearchParams): OrderTerm[] | null {
  const raw = params.get("order");
  if (!raw) return null;
  const terms: OrderTerm[] = [];
  for (const part of raw.split(",")) {
    const bits = part.split(".");
    const col = bits[0];
    if (!col || col.includes("(")) return null;
    const asc = !bits.includes("desc");
    // PostgREST's defaults: ascending puts nulls last, descending puts them first.
    const nullsFirst = bits.includes("nullsfirst") ? true : bits.includes("nullslast") ? false : !asc;
    terms.push({ col, asc, nullsFirst });
  }
  return terms;
}

export function sortRows(rows: Row[], order: OrderTerm[]): Row[] {
  return [...rows].sort((a, b) => {
    for (const t of order) {
      const av = a[t.col];
      const bv = b[t.col];
      const an = av === null || av === undefined;
      const bn = bv === null || bv === undefined;
      if (an || bn) {
        if (an && bn) continue;
        return (an ? -1 : 1) * (t.nullsFirst ? 1 : -1);
      }
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : cellText(av).localeCompare(cellText(bv));
      if (c !== 0) return t.asc ? c : -c;
    }
    return 0;
  });
}

/** One unsent change, as far as replaying it over saved rows is concerned. */
export type PendingWrite = {
  table: string;
  method: string;
  url: string;
  /** Parsed JSON body (object or array) — null for deletes. */
  body: unknown;
  upsert: boolean;
  conflictCols: string[];
};

/** Single-row reads (.single() / .maybeSingle()) ask for an object, not a list. */
export function wantsObject(accept: string | null): boolean {
  return !!accept && accept.includes("application/vnd.pgrst.object+json");
}

/**
 * Apply unsent changes to a saved response for `getUrl`. `data` is the parsed
 * response — an array, or a single object (or null) for single-row reads.
 */
export function applyOverlay(getUrl: string, data: unknown, writes: PendingWrite[], asObject: boolean): unknown {
  const table = restTable(getUrl);
  if (!table) return data;
  const mine = writes.filter((w) => w.table === table);
  if (!mine.length) return data;

  const params = new URL(getUrl).searchParams;
  const { filters, unsupported } = parseFilters(params);
  let rows: Row[] = asObject
    ? (data && typeof data === "object" ? [{ ...(data as Row) }] : [])
    : Array.isArray(data) ? (data as Row[]).map((r) => ({ ...r })) : [];
  let added = false;

  for (const w of mine) {
    if (w.method === "PATCH" || w.method === "DELETE") {
      const pf = parseFilters(new URL(w.url).searchParams);
      if (pf.unsupported || !pf.filters.length) continue;
      if (w.method === "PATCH") {
        const patch = (w.body && typeof w.body === "object" && !Array.isArray(w.body)) ? (w.body as Row) : {};
        rows = rows.map((r) => (matchAll(r, pf.filters) === true ? { ...r, ...patch } : r));
      } else {
        rows = rows.filter((r) => matchAll(r, pf.filters) !== true);
      }
      continue;
    }
    if (w.method !== "POST") continue;
    const items = (Array.isArray(w.body) ? w.body : [w.body]).filter((x): x is Row => !!x && typeof x === "object");
    for (const it of items) {
      // Same row already on screen — an upsert's conflict key, or the id we gave it.
      const keyCols = w.upsert && w.conflictCols.length ? w.conflictCols : "id" in it ? ["id"] : [];
      const idx = keyCols.length
        ? rows.findIndex((r) => keyCols.every((c) => c in r && c in it && cellText(r[c]) === cellText(it[c])))
        : -1;
      if (idx >= 0) { rows[idx] = { ...rows[idx], ...it }; continue; }
      // A single-row read never gains a row it didn't have; a list only gains
      // rows that provably belong in it.
      if (asObject || unsupported) continue;
      if (matchAll(it, filters) === true) { rows.push({ ...it }); added = true; }
    }
  }

  if (asObject) return rows[0] ?? null;
  // A change can take a row out of a list (a job marked complete leaves "My jobs").
  if (!unsupported) rows = rows.filter((r) => matchAll(r, filters) !== false);
  if (added) {
    const order = parseOrder(params);
    if (order) rows = sortRows(rows, order);
  }
  return rows;
}

/** The plain `col=eq.value` pairs of a URL — used to echo a row for a queued update. */
export function eqValues(url: string): Row {
  const out: Row = {};
  for (const f of parseFilters(new URL(url).searchParams).filters) {
    if (f.op === "eq" && !f.not) out[f.col] = f.value;
  }
  return out;
}
