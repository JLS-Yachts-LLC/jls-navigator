/**
 * Inventory grid — the register as a spreadsheet. Click a cell to change it
 * (saved when you leave the cell), Enter moves down a row like Excel, Escape
 * puts the value back. The last row adds an item: type the name, fill what you
 * know, press Enter. Pasting several rows from Excel into that row opens the
 * import preview instead of adding them one by one.
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Check, Loader2, MoreHorizontal, Paperclip, Plus, ShoppingCart, SquareKanban, Trash2 } from "lucide-react";
import { onboardRequest } from "./section-ui";
import {
  INV_COLUMNS, columnForHeading, parseDelimited, rowToItem,
  type ImportRow, type InvColumn, type InvField,
} from "@/lib/portal/inventory";

export type GridItem = { id: string; last_checked_by_name?: string | null } & Partial<Record<InvField, any>>;

type CellState = { state: "saving" | "saved" | "error"; message?: string };

const cellCls = "h-9 w-full min-w-0 bg-transparent px-2 text-[13px] outline-none focus:bg-primary/10 focus:ring-1 focus:ring-inset focus:ring-primary/60 disabled:opacity-60";

/** What a cell shows / starts editing from. */
const shown = (col: InvColumn, v: unknown) => (v == null ? "" : String(v));
const display = (col: InvColumn, v: unknown) => {
  if (v == null || v === "") return "";
  if (col.type === "select") return col.options?.find(([k]) => k === v)?.[1] ?? String(v);
  if (col.type === "date") return new Date(`${v}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (col.key === "purchase_price") return Number(v).toLocaleString("en-GB");
  return String(v);
};

export function InventoryGrid({ items, showValue, canEdit, onPatched, onCreated, onPasteRows, onCheck, onFiles, onDelete, checking,
  linkedTasks = {}, onTask, onRequisition, onBadCondition }: {
  items: GridItem[]; showValue: boolean; canEdit: boolean;
  onPatched: (id: string, fields: Partial<Record<InvField, any>>) => void;
  onCreated: () => void;
  onPasteRows: (rows: ImportRow[]) => void;
  onCheck: (item: GridItem) => void;
  onFiles: (item: GridItem) => void;
  onDelete: (item: GridItem) => void;
  checking: string | null;
  /** Open task per item (from "Create a task"), shown as a chip. */
  linkedTasks?: Record<string, string>;
  onTask?: (item: GridItem) => void;
  onRequisition?: (item: GridItem) => void;
  /** An item has just been marked damaged or missing. */
  onBadCondition?: (item: GridItem) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const cols = useMemo(() => INV_COLUMNS.filter((c) => showValue || !c.money), [showValue]);
  const [sort, setSort] = useState<{ key: InvField; dir: 1 | -1 } | null>(null);
  const [cells, setCells] = useState<Record<string, CellState>>({});
  const [draft, setDraft] = useState<Partial<Record<InvField, string>>>({});
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!sort) return items;
    const col = cols.find((c) => c.key === sort.key);
    return [...items].sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      const r = col?.type === "number" ? Number(x) - Number(y) : String(x).localeCompare(String(y), undefined, { numeric: true });
      return r * sort.dir;
    });
  }, [items, sort, cols]);

  const focusCell = (r: number, c: number) => {
    const el = document.querySelector<HTMLElement>(`[data-inv-cell="${r}:${c}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  };

  const save = async (item: GridItem, col: InvColumn, raw: string) => {
    const before = shown(col, item[col.key]);
    if (raw === before) return;
    const k = `${item.id}:${col.key}`;
    if (col.key === "name" && !raw.trim()) { setCells((s) => ({ ...s, [k]: { state: "error", message: "An item needs a name" } })); return; }
    const value = raw.trim() === "" ? null : col.type === "number" ? Number(raw.replace(/,/g, "")) : raw.trim();
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0 || (col.key === "quantity" && !Number.isInteger(value)))) {
      setCells((s) => ({ ...s, [k]: { state: "error", message: col.key === "quantity" ? "Quantity must be a whole number" : "Enter a number" } }));
      return;
    }
    if (col.key === "quantity" && value === null) { setCells((s) => ({ ...s, [k]: { state: "error", message: "Quantity can't be blank — use 0" } })); return; }
    setCells((s) => ({ ...s, [k]: { state: "saving" } }));
    try {
      await onboardRequest("inventory_item", { method: "PATCH", id: item.id, body: JSON.stringify({ [col.key]: value }) });
      onPatched(item.id, { [col.key]: value });
      if (col.key === "condition" && (value === "damaged" || value === "missing")) onBadCondition?.({ ...item, condition: value });
      setCells((s) => ({ ...s, [k]: { state: "saved" } }));
      setTimeout(() => setCells((s) => { const n = { ...s }; if (n[k]?.state === "saved") delete n[k]; return n; }), 1200);
    } catch (e) {
      setCells((s) => ({ ...s, [k]: { state: "error", message: e instanceof Error ? e.message : "Not saved" } }));
    }
  };

  const addRow = async () => {
    if (!draft.name?.trim()) { setAddError("Type the item's name first."); return; }
    const row = rowToItem(cols.map((c) => draft[c.key] ?? ""), cols.map((c) => c.key), 0);
    if (row.errors.length) { setAddError(row.errors.join(" · ")); return; }
    setAdding(true); setAddError(null);
    try {
      await onboardRequest("inventory_item", { method: "POST", body: JSON.stringify({ department: "interior", quantity: 1, condition: "good", ...row.values }) });
      setDraft({});
      onCreated();
      setTimeout(() => focusCell(rows.length + 1, 0), 50);
    } catch (e) { setAddError(e instanceof Error ? e.message : "Could not add that item."); }
    finally { setAdding(false); }
  };

  /** Several rows pasted from a spreadsheet → the import preview. */
  const onPaste = (startCol: number) => (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.trim())) return; // one value: an ordinary paste
    e.preventDefault();
    const grid = parseDelimited(text);
    if (!grid.length) return;
    // A heading row says which column is which; otherwise the cells line up from where you pasted.
    const headed = grid[0].filter((h) => columnForHeading(h)).length >= 2;
    const fields: Array<InvField | null> = headed
      ? grid[0].map(columnForHeading)
      : grid[0].map((_, i) => cols[startCol + i]?.key ?? null);
    const body = headed ? grid.slice(1) : grid;
    onPasteRows(body.map((cells, i) => rowToItem(cells, fields, i + 1)));
  };

  const header = (c: InvColumn) => (
    <th key={c.key} style={{ minWidth: c.width, width: c.width }}
        className={cn("border-b border-r border-border/60 bg-card px-0 py-0 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
          c.key === "name" && "sticky left-0 z-20")}>
      <button type="button" onClick={() => setSort((s) => s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}
              className="flex h-8 w-full items-center gap-1 px-2 hover:text-foreground">
        {c.label}
        {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  const editor = (c: InvColumn, r: number, ci: number, value: string, props: {
    onCommit?: (v: string) => void; onChange?: (v: string) => void; controlled?: boolean; onEnter?: () => void; onPasteCell?: (e: React.ClipboardEvent) => void;
  }) => {
    const common = {
      "data-inv-cell": `${r}:${ci}`,
      disabled: !canEdit,
      className: cellCls,
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (props.onEnter) { props.onEnter(); return; }
          (e.currentTarget as HTMLElement).blur();
          focusCell(r + 1, ci);
        }
        if (e.key === "Escape" && !props.controlled) {
          (e.currentTarget as HTMLInputElement).value = value;
          (e.currentTarget as HTMLElement).blur();
        }
      },
    };
    const valueProps = props.controlled
      ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => props.onChange?.(e.target.value) }
      : { defaultValue: value, onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => props.onCommit?.(e.target.value) };
    if (c.type === "select") {
      return (
        <select {...common} {...valueProps}
                onChange={props.controlled ? valueProps.onChange : (e) => props.onCommit?.(e.target.value)}
                onBlur={undefined}>
          {(c.key !== "department" && c.key !== "condition") || props.controlled ? <option value="">{props.controlled ? "—" : ""}</option> : null}
          {c.options!.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      );
    }
    return (
      <input {...common} {...valueProps} onPaste={props.onPasteCell}
             type={c.type === "date" ? "date" : "text"} inputMode={c.type === "number" ? "decimal" : undefined}
             maxLength={c.type === "longtext" ? 4000 : 160}
             placeholder={props.controlled && c.key === "name" ? "+ New item…" : undefined} />
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/60">
      <div className="max-h-[70vh] overflow-auto">
        <table className="border-separate border-spacing-0 text-sm" style={{ minWidth: "100%" }}>
          <thead className="sticky top-0 z-30">
            <tr>
              {cols.map(header)}
              <th className="border-b border-border/60 bg-card px-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ minWidth: 160 }}>
                {canEdit ? "" : "Checked by"}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, r) => (
              <tr key={item.id} className="group">
                {cols.map((c, ci) => {
                  const st = cells[`${item.id}:${c.key}`];
                  return (
                    <td key={c.key} title={st?.state === "error" ? st.message : undefined}
                        className={cn("border-b border-r border-border/40 p-0 align-middle",
                          c.key === "name" && "sticky left-0 z-10 bg-card font-medium",
                          st?.state === "saved" && "bg-emerald-500/10",
                          st?.state === "error" && "bg-red-500/15 ring-1 ring-inset ring-red-500/50")}>
                      {canEdit ? (
                        // Keyed on the value so a change made elsewhere (a reload) shows here.
                        <div className="relative" key={shown(c, item[c.key])}>
                          {editor(c, r, ci, shown(c, item[c.key]), {
                            onCommit: (v) => void save(item, c, v),
                          })}
                          {st?.state === "saving" && <Loader2 className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted-foreground" />}
                        </div>
                      ) : (
                        <div className="truncate px-2 py-2 text-[13px]" title={display(c, item[c.key])}>{display(c, item[c.key]) || <span className="text-muted-foreground/40">—</span>}</div>
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-border/40 px-1.5">
                  {canEdit ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onCheck(item)} disabled={checking === item.id}
                              title={item.last_checked ? `Checked ${item.last_checked}${item.last_checked_by_name ? ` by ${item.last_checked_by_name}` : ""} — tap to check again today` : "Mark as checked today"}
                              className={cn("flex h-7 w-7 items-center justify-center rounded-md border transition",
                                item.last_checked === new Date().toISOString().slice(0, 10) ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-border text-muted-foreground hover:text-foreground")}>
                        {checking === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button type="button" onClick={() => onFiles(item)} title="Photos & receipts"
                              className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground">
                        <Paperclip className="h-3.5 w-3.5" />
                      </button>
                      <div className="relative">
                        <button type="button" onClick={() => setMenu((m) => m === item.id ? null : item.id)} title="More" aria-haspopup="menu" aria-expanded={menu === item.id}
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:text-foreground">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {menu === item.id && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                            <div role="menu" className={cn("absolute right-0 z-50 w-52 overflow-hidden rounded-xl border border-border bg-card py-1 text-sm shadow-xl", r >= rows.length - 3 && rows.length > 3 ? "bottom-8" : "top-8")}>
                              {onTask && (
                                <button type="button" role="menuitem" onClick={() => { setMenu(null); onTask(item); }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background/60">
                                  <SquareKanban className="h-3.5 w-3.5" /> Create a task
                                </button>
                              )}
                              {onRequisition && (
                                <button type="button" role="menuitem" onClick={() => { setMenu(null); onRequisition(item); }}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-background/60">
                                  <ShoppingCart className="h-3.5 w-3.5" /> Raise a requisition
                                </button>
                              )}
                              <button type="button" role="menuitem" onClick={() => { setMenu(null); onDelete(item); }}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-300 hover:bg-red-500/10">
                                <Trash2 className="h-3.5 w-3.5" /> Remove from inventory
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      {linkedTasks[item.id] && (
                        <span title="Open task for this item" className="whitespace-nowrap rounded-md bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">{linkedTasks[item.id]}</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">{item.last_checked_by_name ?? ""}</span>
                  )}
                </td>
              </tr>
            ))}

            {/* The add row */}
            {canEdit && (
              <tr className="bg-primary/[0.04]">
                {cols.map((c, ci) => (
                  <td key={c.key} className={cn("border-b border-r border-border/40 p-0", c.key === "name" && "sticky left-0 z-10 bg-card")}>
                    {editor(c, rows.length, ci, draft[c.key] ?? "", {
                      controlled: true,
                      onChange: (v) => { setDraft((d) => ({ ...d, [c.key]: v })); setAddError(null); },
                      onEnter: () => void addRow(),
                      onPasteCell: onPaste(ci),
                    })}
                  </td>
                ))}
                <td className="border-b border-border/40 px-1.5">
                  <button type="button" onClick={() => void addRow()} disabled={adding || !draft.name?.trim()}
                          className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-40">
                    {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 px-3 py-2 text-[11px]", addError ? "text-red-300" : "text-muted-foreground")}>
          {addError ?? <>
            <span>Click a cell to edit — it saves when you move on. <kbd className="rounded border border-border px-1">Enter</kbd> moves down, <kbd className="rounded border border-border px-1">Esc</kbd> undoes.</span>
            <span>Bottom row adds an item. Paste rows copied from Excel into it to add many at once.</span>
          </>}
        </div>
      )}
    </div>
  );
}
