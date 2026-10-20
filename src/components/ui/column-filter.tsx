import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Excel-style column headers for a plain table: click the label to sort
 * (A→Z, Z→A, off), click the funnel to tick which values to show. Staff asked
 * for this on every tracker, so one hook serves them all:
 *
 *   const cf = useColumnFilters(rows, [{ key: "holder", label: "Holder", value: (r) => r.holder_name }, …]);
 *   <th>{cf.header("holder")}</th>   …   cf.rows.map(…)
 */
export interface FilterColumn<T> {
  key: string;
  label: string;
  /** What the column shows (and filters/sorts on). */
  value: (row: T) => string | number | null | undefined;
  /** Sort on something else than the shown text, e.g. a raw date. */
  sortValue?: (row: T) => string | number | null | undefined;
}

type Sort = { key: string; dir: "asc" | "desc" } | null;
export const BLANK = "(Blank)";

function text(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return BLANK;
  const s = String(v).trim();
  return s === "" ? BLANK : s;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
function compare(a: string | number | null | undefined, b: string | number | null | undefined): number {
  const ea = a === null || a === undefined || a === "";
  const eb = b === null || b === undefined || b === "";
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1; // blanks last either way
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

export function useColumnFilters<T>(rows: T[], columns: FilterColumn<T>[]) {
  const [sort, setSort] = useState<Sort>(null);
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);

  const passes = (row: T, skip?: string) =>
    Object.entries(filters).every(([k, vals]) => {
      if (k === skip || !vals.length) return true;
      const c = byKey.get(k);
      return !c || vals.includes(text(c.value(row)));
    });

  const out = useMemo(() => {
    const kept = rows.filter((r) => passes(r));
    const c = sort && byKey.get(sort.key);
    if (!c || !sort) return kept;
    const get = c.sortValue ?? c.value;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...kept].sort((a, b) => {
      const va = get(a), vb = get(b);
      const blankA = va === null || va === undefined || va === "";
      const blankB = vb === null || vb === undefined || vb === "";
      if (blankA || blankB) return compare(va, vb); // keep blanks at the bottom
      return sign * compare(va, vb);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filters, sort, byKey]);

  /** Distinct values of one column among rows that pass the OTHER filters, like Excel. */
  function options(key: string): { value: string; count: number }[] {
    const c = byKey.get(key);
    if (!c) return [];
    const counts = new Map<string, number>();
    for (const r of rows) if (passes(r, key)) {
      const v = text(c.value(r));
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => (a.value === BLANK ? 1 : b.value === BLANK ? -1 : collator.compare(a.value, b.value)));
  }

  function cycleSort(key: string) {
    setSort((s) => (!s || s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));
  }
  function setFilter(key: string, vals: string[]) {
    setFilters((f) => ({ ...f, [key]: vals }));
  }
  const activeCount = Object.values(filters).filter((v) => v.length).length;
  function clearAll() { setFilters({}); setSort(null); }

  /** The header cell content for column `k` (put it inside your own <th>). */
  function header(k: string, children?: ReactNode) {
    const c = byKey.get(k);
    return (
      <ColumnHeader
        label={children ?? c?.label ?? k}
        name={c?.label ?? k}
        dir={sort?.key === k ? sort.dir : null}
        selected={filters[k] ?? []}
        onSort={() => cycleSort(k)}
        options={() => options(k)}
        onChange={(v) => setFilter(k, v)}
      />
    );
  }

  return { rows: out, header, activeCount, sorted: !!sort, clearAll };
}

/**
 * A sticky header row sticks below its scroll box's top padding, so rows scrolling
 * up show through that band (24px on a p-6 page). Pull the row's sticky cells up
 * by that padding so the header sits flush with the top edge. Use as a ref on any
 * element inside the header row; column headers do it for you.
 */
export function alignStickyRow(el: HTMLElement | null) {
  const tr = el?.closest("tr");
  if (!tr) return;
  let box = tr.parentElement;
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  const pad = box ? parseFloat(getComputedStyle(box).paddingTop) || 0 : 0;
  for (const cell of Array.from(tr.children) as HTMLElement[]) {
    if (getComputedStyle(cell).position === "sticky") cell.style.top = `${-pad}px`;
  }
}

function ColumnHeader({ label, name, dir, selected, onSort, options, onChange }: {
  label: ReactNode;
  name: string;
  dir: "asc" | "desc" | null;
  selected: string[];
  onSort: () => void;
  options: () => { value: string; count: number }[];
  onChange: (vals: string[]) => void;
}) {
  return (
    <span ref={alignStickyRow} className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onSort}
        className={cn("inline-flex items-center gap-1 uppercase tracking-[inherit] hover:text-foreground", dir && "text-foreground")}
        title="Sort"
      >
        {label}
        {dir === "asc" ? <ArrowUp className="h-3 w-3" /> : dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 opacity-30" />}
      </button>
      <ValuePicker label={name} selected={selected} options={options} onChange={onChange} />
    </span>
  );
}

function ValuePicker({ label, selected, options, onChange }: {
  label: string;
  selected: string[];
  options: () => { value: string; count: number }[];
  onChange: (vals: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Work on a draft so ticking ten boxes doesn't re-filter the table ten times.
  const [draft, setDraft] = useState<string[]>(selected);
  const all = useMemo(() => (open ? options() : []), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? all.filter((o) => o.value.toLowerCase().includes(s)) : all).slice(0, 300);
  }, [all, q]);
  const active = selected.length > 0;

  function toggle(v: string) {
    setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDraft(selected); setQ(""); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={active ? `Filtered: ${selected.join(", ")}` : `Filter ${label}`}
          className={cn("rounded p-0.5 hover:bg-accent/40 hover:text-foreground", active ? "text-primary" : "opacity-40")}
        >
          <Filter className={cn("h-3 w-3", active && "fill-current")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2 normal-case tracking-normal">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}…`} className="h-8 pl-7 text-xs" />
        </div>
        <div className="max-h-64 overflow-auto text-xs">
          {shown.length === 0 ? (
            <div className="px-2 py-3 text-center text-muted-foreground">No values</div>
          ) : shown.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent/40">
              <Checkbox checked={draft.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
              <span className={cn("min-w-0 flex-1 truncate", o.value === "(Blank)" && "italic text-muted-foreground")}>{o.value}</span>
              <span className="tabular-nums text-muted-foreground/60">{o.count}</span>
            </label>
          ))}
          {all.length > shown.length && !q && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">Showing 300 of {all.length}. Search to narrow down.</div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { onChange([]); setOpen(false); }}>Clear</Button>
          <div className="flex gap-1.5">
            {q && shown.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setDraft((d) => Array.from(new Set([...d, ...shown.map((o) => o.value)])))}>Tick shown</Button>
            )}
            <Button size="sm" className="h-7 text-xs" onClick={() => { onChange(draft); setOpen(false); }}>Apply</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
