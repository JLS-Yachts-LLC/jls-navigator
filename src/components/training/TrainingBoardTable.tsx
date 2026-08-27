/**
 * Shared table for the 4 JLS Yacht Training Institute boards (Instructors,
 * Students, Courses, Classes) — same scrolling/sticky mechanics as the
 * ShipSync Import board and Yacht Shipments board: ONE <table>, one bounded
 * scroll box, border-separate (not border-collapse — Chrome ghosts the row
 * scrolling up behind a sticky <thead> in a collapsed-border table) with
 * box-shadow row dividers, will-change-transform on the sticky header.
 *
 * Students is the only one of the 4 with real Monday groups worth keeping
 * (2025 / 2026); Instructors/Courses/Classes each have one messy or generic
 * group Monday-side, so those three render as a flat list — same underlying
 * table, `groupBy` just isn't passed for them.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ColType = "text" | "number" | "date" | "date-expiry" | "status" | "tag";

export interface StatusOption { label: string; color: string }

export interface TrainingCol {
  key: string;
  label: string;
  type: ColType;
  width: string;
  bold?: boolean;
  /** Required for type "status" — Monday's own labels + colours for this column. */
  statusOptions?: StatusOption[];
}

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
const fmtAED = (n: number) => `${n.toLocaleString("en-AE", { maximumFractionDigits: 0 })} AED`;

const TAG_PALETTE = [
  "bg-blue-500/15 text-blue-400", "bg-emerald-500/15 text-emerald-400", "bg-violet-500/15 text-violet-400",
  "bg-amber-500/15 text-amber-500", "bg-rose-500/15 text-rose-400", "bg-cyan-500/15 text-cyan-400",
  "bg-lime-500/15 text-lime-500", "bg-fuchsia-500/15 text-fuchsia-400",
];
function tagColor(v: string) {
  let h = 0;
  for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length];
}

/** Expiry-date urgency tint — red once past, amber inside 30 days — matching
 *  the compliance-alert colour language used elsewhere in Polaris (visa
 *  expiry, permit expiry). Monday itself has no such coding; this is the
 *  one deliberate addition beyond a literal 1:1 mirror. */
function expiryTone(d: string | null): string {
  if (!d) return "";
  const days = Math.floor((new Date(d + "T00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return "text-red-400 font-medium";
  if (days <= 30) return "text-amber-400 font-medium";
  return "";
}

export interface TrainingRow { id: string; [key: string]: any }

export function TrainingBoardTable({
  rows, columns, groupBy, groupLabels, onPatch, onCreate, onDelete, newRowLabel = "name",
}: {
  rows: TrainingRow[];
  columns: TrainingCol[];
  /** Row field to group by (e.g. "monday_group"). Omit for a flat table. */
  groupBy?: string;
  /** Explicit group display order — groups not listed sort after, alphabetically. */
  groupLabels?: string[];
  onPatch: (id: string, patch: Record<string, any>) => Promise<void>;
  onCreate: (name: string, group?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Column key the "Add" row's free-text input writes to (almost always name/full_name). */
  newRowLabel?: string;
}) {
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function commit(row: TrainingRow, key: string, patch: Record<string, any>) {
    const cellId = `${row.id}:${key}`;
    setSavingCell(cellId);
    try { await onPatch(row.id, patch); } finally { setSavingCell(null); }
  }

  const groups = useMemo(() => {
    if (!groupBy) return null;
    const map = new Map<string, TrainingRow[]>();
    for (const r of rows) {
      const g = r[groupBy] || "Ungrouped";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(r);
    }
    const order = groupLabels ?? [];
    return [...map.entries()].sort((a, b) => {
      const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return a[0].localeCompare(b[0]);
    });
  }, [rows, groupBy, groupLabels]);

  function toggle(g: string) { setCollapsed((p) => ({ ...p, [g]: !p[g] })); }

  async function submitAdd(group: string | undefined) {
    const name = newName.trim();
    if (!name) return;
    setAddingIn(null);
    setNewName("");
    await onCreate(name, group);
  }

  const colCount = columns.length + 2; // + delete button + leading spacer where relevant

  function renderCell(row: TrainingRow, col: TrainingCol) {
    const value = row[col.key];
    const cellId = `${row.id}:${col.key}`;
    const saving = savingCell === cellId;

    if (col.type === "status") {
      const opt = col.statusOptions?.find((o) => o.label === value);
      return (
        <Select value={value || undefined} onValueChange={(v) => void commit(row, col.key, { [col.key]: v })}>
          <SelectTrigger className="h-7 w-full border-none bg-transparent px-1.5 text-[11px] hover:bg-accent/40">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : value ? (
              <span className="truncate rounded px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: opt?.color ?? "#6b7280" }}>{value}</span>
            ) : <span className="text-muted-foreground/30">—</span>}
          </SelectTrigger>
          <SelectContent>
            {(col.statusOptions ?? []).map((o) => (
              <SelectItem key={o.label} value={o.label}>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />
                  {o.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <EditableCell
        value={value}
        type={col.type}
        bold={col.bold}
        saving={saving}
        onChange={(v) => void commit(row, col.key, { [col.key]: v })}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
      {/* border-separate (not border-collapse): Chrome ghosts the row
          scrolling up behind a sticky <thead> in a collapsed-border table. */}
      <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]">
        <thead className="sticky top-0 z-10 will-change-transform">
          <tr className="bg-card text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground shadow-[inset_0_-1px_0_0_var(--border)]">
            {columns.map((c) => <th key={c.key} className={cn("px-2 py-1.5", c.width)}>{c.label}</th>)}
            <th className="w-10 px-2 py-1.5"></th>
          </tr>
        </thead>
        <tbody>
          {groups ? groups.map(([group, groupRows]) => {
            const isCollapsed = collapsed[group];
            const visible = groupRows;
            return (
              <Fragment key={group}>
                <tr>
                  <td colSpan={colCount} className="p-0">
                    <button onClick={() => toggle(group)}
                      className="sticky left-0 flex w-fit min-w-[220px] items-center gap-2 border-l-4 border-primary/50 bg-muted/20 px-4 py-2 text-left">
                      {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-display text-sm font-semibold uppercase tracking-wide">{group}</span>
                      <span className="text-xs text-muted-foreground">{visible.length} {visible.length === 1 ? "record" : "records"}</span>
                    </button>
                  </td>
                </tr>
                {!isCollapsed && visible.map((row) => (
                  <tr key={row.id} className="shadow-[inset_0_-1px_0_0_color-mix(in_oklab,var(--border)_40%,transparent)] hover:bg-accent/10">
                    {columns.map((c) => <td key={c.key} className={cn("overflow-hidden px-1 py-0.5", c.width)}>{renderCell(row, c)}</td>)}
                    <RowDeleteCell onDelete={() => onDelete(row.id)} />
                  </tr>
                ))}
                {!isCollapsed && (
                  <AddRow adding={addingIn === group} colCount={colCount} name={newName} setName={setNewName}
                    onStart={() => setAddingIn(group)} onSubmit={() => void submitAdd(group)}
                    onCancel={() => { setAddingIn(null); setNewName(""); }} label={newRowLabel} />
                )}
              </Fragment>
            );
          }) : (
            <>
              {rows.map((row) => (
                <tr key={row.id} className="shadow-[inset_0_-1px_0_0_color-mix(in_oklab,var(--border)_40%,transparent)] hover:bg-accent/10">
                  {columns.map((c) => <td key={c.key} className={cn("overflow-hidden px-1 py-0.5", c.width)}>{renderCell(row, c)}</td>)}
                  <RowDeleteCell onDelete={() => onDelete(row.id)} />
                </tr>
              ))}
              <AddRow adding={addingIn === "__flat__"} colCount={colCount} name={newName} setName={setNewName}
                onStart={() => setAddingIn("__flat__")} onSubmit={() => void submitAdd(undefined)}
                onCancel={() => { setAddingIn(null); setNewName(""); }} label={newRowLabel} />
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RowDeleteCell({ onDelete }: { onDelete: () => void }) {
  return (
    <td className="px-1 py-0.5">
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </td>
  );
}

function AddRow({ adding, colCount, name, setName, onStart, onSubmit, onCancel, label }: {
  adding: boolean; colCount: number; name: string; setName: (v: string) => void;
  onStart: () => void; onSubmit: () => void; onCancel: () => void; label: string;
}) {
  return (
    <tr>
      <td colSpan={colCount} className="px-2 py-1">
        {adding ? (
          <div className="flex items-center gap-2 py-0.5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); if (e.key === "Escape") onCancel(); }}
              placeholder={`${label}…`}
              className="h-7 w-56 rounded border border-input bg-background px-1.5 text-xs outline-none ring-1 ring-primary/40"
            />
            <Button size="sm" className="h-7 text-xs" disabled={!name.trim()} onClick={onSubmit}>Add</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={onCancel}>Cancel</Button>
          </div>
        ) : (
          <button onClick={onStart} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </td>
    </tr>
  );
}

function EditableCell({ value, type, bold, saving, onChange }: {
  value: any; type: ColType; bold?: boolean; saving: boolean; onChange: (v: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => { setDraft(value ?? ""); }, [value]);

  function commit() {
    setEditing(false);
    if (draft === (value ?? "")) return;
    if (type === "number") onChange(draft === "" ? null : Number(draft));
    else onChange(draft === "" ? null : draft);
  }

  if (!editing) {
    let content: ReactNode;
    if (value == null || value === "") content = <span className="text-muted-foreground/30">—</span>;
    else if (type === "date" || type === "date-expiry") content = <span className={cn("truncate", type === "date-expiry" && expiryTone(value))}>{fmtDate(value)}</span>;
    else if (type === "number") content = <span className="truncate tabular-nums">{fmtAED(Number(value))}</span>;
    else if (type === "tag") content = <span className={cn("truncate rounded-full px-2 py-0.5 text-[10px] font-semibold", tagColor(String(value)))}>{value}</span>;
    else content = <span className="truncate">{value}</span>;

    return (
      <button onClick={() => setEditing(true)} className={cn("flex h-7 w-full items-center rounded px-1.5 text-left hover:bg-accent/30", bold && "font-medium")}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : content}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type={type === "date" || type === "date-expiry" ? "date" : type === "number" ? "number" : "text"}
      value={(type === "date" || type === "date-expiry") && draft ? String(draft).slice(0, 10) : draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="h-7 w-full rounded border border-input bg-background px-1.5 text-[12.5px] outline-none ring-1 ring-primary/40"
    />
  );
}
