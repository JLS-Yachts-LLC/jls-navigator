/**
 * ShipSync — Import board.
 *
 * Mirrors the Monday.com "Shipment - Import/Transit" board, grouped into the
 * exact same sections Monday shows on-screen (IMPORT, TRANSIT, Completed, …)
 * — discovered at sync time, never hardcoded, so a group Monday adds or
 * renames shows up here automatically.
 *
 * "Status" here means "which section" — changing it moves the shipment
 * between groups, same as dragging a card between columns on Monday. Every
 * field is editable locally for day-to-day office use, but nothing writes
 * back to Monday: the next hourly sync (lib/shipsync/monday-import-board.server.ts)
 * re-pulls the board and overwrites any Monday-linked row's fields (including
 * a manual group move) back to whatever Monday currently has. Rows added
 * here by hand (no monday_item_id) are never touched by the sync.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Search, ChevronDown, ChevronRight, RefreshCw, FileText, ArrowDownToLine, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fmtDate, mondayRow, extraMondayColumns } from "@/components/shipsync/shared";
import { loadImportPackages, patchPackage, createPackage } from "@/lib/shipsync/data";
import type { ShipSyncPackage } from "@/lib/shipsync/model";
import { syncMondayImportBoard } from "@/lib/shipsync/monday-import-board.server";

/** Deterministic colour per Monday group title — same idea as a Monday group's
 *  own colour bar, just derived instead of picked, since we don't fetch colours. */
const GROUP_PALETTE = [
  "border-blue-500", "border-emerald-500", "border-amber-500", "border-violet-500",
  "border-rose-500", "border-cyan-500", "border-lime-500", "border-fuchsia-500",
];
function groupColor(title: string): string {
  let h = 0;
  for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
  return GROUP_PALETTE[h % GROUP_PALETTE.length];
}

function extraOf(p: ShipSyncPackage): Record<string, any> { return (p.extra as any) ?? {}; }
function mondayText(p: ShipSyncPackage, title: string): string { return mondayRow(p)[title] ?? ""; }
function fromMonday(p: ShipSyncPackage, keyword: string): string {
  const row = mondayRow(p);
  const key = Object.keys(row).find((k) => k.toLowerCase().includes(keyword));
  return (key && row[key]) || "";
}

/** Titles the explicit columns below already cover — anything else genuinely
 *  Monday-only still shows via the extra-columns fallback. */
const COVERED = [
  "air waybill", "waybill", "tracking", "account", "invoice", "item id",
  "yacht", "vessel", "boat", "status", "shipment type", "boe", "supplier",
  "date received", "received", "date delivered", "delivered", "dn no",
  "delivery note", "receiver", "driver", "courier", "qty", "number of packages",
  "packages", "file", "duty", "vat", "edas", "remarks",
];

type ColType = "text" | "number" | "date" | "boolean";
interface ColDef {
  key: string;
  label: string;
  width: string;
  type: ColType;
  get: (p: ShipSyncPackage) => string;
  /** Commit a new value — routes to a first-class column or into extra.monday. */
  set: (p: ShipSyncPackage, value: string) => Partial<ShipSyncPackage>;
}

function fieldCol(key: string, label: string, width: string, type: ColType, field: keyof ShipSyncPackage): ColDef {
  return {
    key, label, width, type,
    get: (p) => (p[field] == null ? "" : String(p[field])),
    set: (_p, value) => {
      if (type === "number") return { [field]: value === "" ? null : Number(value) } as any;
      if (type === "date") return { [field]: value === "" ? null : new Date(value).toISOString() } as any;
      return { [field]: value === "" ? null : value } as any;
    },
  };
}
function mondayCol(key: string, label: string, width: string, mondayKey: string): ColDef {
  return {
    key, label, width, type: "text",
    get: (p) => mondayText(p, mondayKey),
    set: (p, value) => ({ extra: { ...extraOf(p), monday: { ...mondayRow(p), [mondayKey]: value } } } as any),
  };
}

const COLS: ColDef[] = [
  fieldCol("barcode", "Air waybill/tracking", "w-32", "text", "barcode"),
  mondayCol("accounts", "Accounts", "w-20", "Accounts"),
  mondayCol("invoiceNo", "Invoice No.", "w-24", "Invoice No."),
  mondayCol("itemId", "Item ID", "w-24", "Item ID"),
  fieldCol("boat_name", "Yacht Name", "w-32", "text", "boat_name"),
  mondayCol("mondayStatus", "Monday Status", "w-28", "STATUS"),
  fieldCol("trade_type", "Shipment Type", "w-28", "text", "trade_type"),
  fieldCol("boe_no", "BOE No.", "w-24", "text", "boe_no"),
  fieldCol("supplier", "Supplier", "w-28", "text", "supplier"),
  fieldCol("received_at", "Date Received", "w-24", "date", "received_at"),
  fieldCol("delivered_at", "Date Delivered", "w-24", "date", "delivered_at"),
  fieldCol("delivery_note_no", "DN No.", "w-20", "text", "delivery_note_no"),
  fieldCol("receiver_full_name", "Receiver", "w-24", "text", "receiver_full_name"),
  mondayCol("driver", "Driver", "w-24", "DRIVER"),
  fieldCol("courier", "Courier", "w-20", "text", "courier"),
  fieldCol("num_packages", "Qty", "w-12", "number", "num_packages"),
  fieldCol("duty", "Duty", "w-16", "number", "duty"),
  fieldCol("vat", "VAT", "w-16", "number", "vat"),
];

interface GroupInfo { title: string; position: number }
interface Group extends GroupInfo { rows: ShipSyncPackage[] }

export function ShipSyncImportBoard() {
  const [rows, setRows] = useState<ShipSyncPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  async function reload() {
    const data = await loadImportPackages();
    setRows(data);
  }
  useEffect(() => { setLoading(true); void reload().finally(() => setLoading(false)); }, []);

  async function sync() {
    setSyncing(true);
    try {
      const r = await (syncMondayImportBoard as any)();
      if (!r.ok && r.synced === 0) throw new Error(r.detail);
      toast.success(r.detail);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Monday sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function commit(p: ShipSyncPackage, cellId: string, patch: Partial<ShipSyncPackage>) {
    setSavingCell(cellId);
    setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, ...patch } as ShipSyncPackage : r)));
    try { await patchPackage(p.id, patch); }
    catch (e: any) { toast.error(e?.message ?? "Update failed"); await reload(); }
    finally { setSavingCell(null); }
  }

  async function moveGroup(p: ShipSyncPackage, g: GroupInfo) {
    const cellId = `${p.id}:group`;
    const extra = { ...extraOf(p), monday_group_title: g.title, monday_group_position: g.position };
    await commit(p, cellId, { extra } as any);
  }

  async function addShipment(g: GroupInfo, name: string) {
    const boat = name.trim();
    if (!boat) return;
    setAddingIn(null);
    setNewName("");
    try {
      const created = await createPackage({
        boat_name: boat, local_import: "Import", status: "in_office",
        extra: { monday_group_title: g.title, monday_group_position: g.position },
      });
      setRows((prev) => [...prev, created]);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add shipment");
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((p) =>
      [p.barcode, p.boat_name, p.supplier, p.courier, p.boe_no, p.receiver_full_name,
       ...Object.values(mondayRow(p))].join(" ").toLowerCase().includes(s),
    );
  }, [rows, search]);

  const mondayColumns = useMemo(() => extraMondayColumns(rows, COVERED), [rows]);

  /** Every group currently known, from the WHOLE data set (not search-filtered) —
   *  so the move-to dropdown never loses an option while searching. */
  const allGroups = useMemo(() => {
    const map = new Map<string, GroupInfo>();
    for (const p of rows) {
      const extra = extraOf(p);
      const title: string = extra.monday_group_title ?? "Not on Monday";
      const position: number = typeof extra.monday_group_position === "number" && extra.monday_group_position >= 0
        ? extra.monday_group_position : 999;
      if (!map.has(title)) map.set(title, { title, position });
    }
    return [...map.values()].sort((a, b) => a.position - b.position);
  }, [rows]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const g of allGroups) map.set(g.title, { ...g, rows: [] });
    for (const p of filtered) {
      const title: string = extraOf(p).monday_group_title ?? "Not on Monday";
      if (!map.has(title)) map.set(title, { title, position: 999, rows: [] });
      map.get(title)!.rows.push(p);
    }
    return [...map.values()].sort((a, b) => a.position - b.position);
  }, [filtered, allGroups]);

  function toggle(title: string) { setCollapsed((p) => ({ ...p, [title]: !p[title] })); }

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search import shipments…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing} className="ml-auto h-9 gap-1.5">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/60">
            <ArrowDownToLine className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold">No import shipments yet</div>
          <p className="max-w-md text-[13px] text-muted-foreground">Click "Sync from Monday" to pull in the Import/Transit board.</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-auto">
          {groups.map((g) => {
            const isCollapsed = collapsed[g.title];
            return (
              <div key={g.title} className="overflow-hidden rounded-xl border border-border bg-card">
                <button onClick={() => toggle(g.title)}
                  className={cn("flex w-full items-center gap-2 border-l-4 bg-muted/20 px-4 py-2 text-left", groupColor(g.title))}>
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-display text-sm font-semibold uppercase tracking-wide">{g.title}</span>
                  <span className="text-xs text-muted-foreground">{g.rows.length} shipment{g.rows.length === 1 ? "" : "s"}</span>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-[12.5px]">
                      <thead>
                        <tr className="border-b border-border bg-card text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                          <th className="w-28 px-2 py-1.5">Status</th>
                          {COLS.map((c) => <th key={c.key} className={cn("px-2 py-1.5", c.width)}>{c.label}</th>)}
                          <th className="w-14 px-2 py-1.5">EDAS</th>
                          <th className="w-28 px-2 py-1.5">Documents</th>
                          {mondayColumns.map((c) => <th key={c} className="w-28 px-2 py-1.5">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((p) => {
                          const row = mondayRow(p);
                          const docs = p.documents ?? [];
                          return (
                            <tr key={p.id} className="border-b border-border/40 hover:bg-accent/10">
                              <td className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                <Select value={g.title} onValueChange={(v) => {
                                  const target = allGroups.find((x) => x.title === v);
                                  if (target) void moveGroup(p, target);
                                }}>
                                  <SelectTrigger className="h-7 w-full border-none bg-transparent px-1.5 text-[11px] hover:bg-accent/40">
                                    {savingCell === `${p.id}:group` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                                      <span className={cn("truncate rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-semibold", groupColor(g.title))}>{g.title}</span>
                                    )}
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allGroups.map((opt) => <SelectItem key={opt.title} value={opt.title}>{opt.title}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </td>
                              {COLS.map((c) => (
                                <td key={c.key} className={cn("overflow-hidden px-1 py-0.5", c.width)}>
                                  <EditableCell col={c} p={p} saving={savingCell === `${p.id}:${c.key}`}
                                    onChange={(v) => void commit(p, `${p.id}:${c.key}`, c.set(p, v))} />
                                </td>
                              ))}
                              <td className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                <Select value={p.edas_required == null ? "unset" : p.edas_required ? "yes" : "no"}
                                  onValueChange={(v) => void commit(p, `${p.id}:edas`, { edas_required: v === "unset" ? null : v === "yes" } as any)}>
                                  <SelectTrigger className="h-7 w-full border-none bg-transparent px-1.5 text-[11px] hover:bg-accent/40">
                                    {savingCell === `${p.id}:edas` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (
                                      <span>{p.edas_required == null ? "—" : p.edas_required ? "Yes" : "No"}</span>
                                    )}
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="unset">—</SelectItem>
                                    <SelectItem value="yes">Yes</SelectItem>
                                    <SelectItem value="no">No</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="overflow-hidden px-2 py-1">
                                {docs.length === 0 ? <span className="text-muted-foreground">—</span> : (
                                  <div className="flex flex-wrap gap-1">
                                    {docs.map((d, i) => (
                                      <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" title={d.name}
                                        className="inline-flex max-w-[90px] items-center gap-1 truncate rounded border border-border px-1 py-0.5 text-[10px] text-primary hover:bg-primary/5">
                                        <FileText className="h-3 w-3 shrink-0" /> <span className="truncate">{d.name}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </td>
                              {mondayColumns.map((c) => (
                                <td key={c} className="overflow-hidden truncate px-2 py-1 text-muted-foreground">{row[c] || "—"}</td>
                              ))}
                            </tr>
                          );
                        })}
                        <tr>
                          <td colSpan={COLS.length + 3 + mondayColumns.length} className="px-2 py-1">
                            {addingIn === g.title ? (
                              <div className="flex items-center gap-2 py-0.5">
                                <Input
                                  autoFocus
                                  value={newName}
                                  onChange={(e) => setNewName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void addShipment(g, newName);
                                    if (e.key === "Escape") { setAddingIn(null); setNewName(""); }
                                  }}
                                  placeholder="Yacht name…"
                                  className="h-7 w-56 text-xs"
                                />
                                <Button size="sm" className="h-7 text-xs" disabled={!newName.trim()} onClick={() => void addShipment(g, newName)}>Add</Button>
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setAddingIn(null); setNewName(""); }}>Cancel</Button>
                              </div>
                            ) : (
                              <button onClick={() => setAddingIn(g.title)}
                                className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground">
                                <Plus className="h-3.5 w-3.5" /> Add shipment
                              </button>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EditableCell({ col, p, saving, onChange }: { col: ColDef; p: ShipSyncPackage; saving: boolean; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const value = col.get(p);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  function commit() {
    setEditing(false);
    if (draft !== value) onChange(draft);
  }

  if (!editing) {
    let content: ReactNode;
    if (!value) content = <span className="text-muted-foreground/30">—</span>;
    else if (col.type === "date") content = <span className="truncate">{fmtDate(value)}</span>;
    else content = <span className="truncate">{value}</span>;
    return (
      <button onClick={() => setEditing(true)} className="flex h-7 w-full items-center rounded px-1.5 text-left hover:bg-accent/30">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : content}
      </button>
    );
  }

  return (
    <input
      autoFocus
      type={col.type === "date" ? "date" : col.type === "number" ? "number" : "text"}
      value={col.type === "date" && draft ? draft.slice(0, 10) : draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="h-7 w-full rounded border border-input bg-background px-1.5 text-[12.5px] outline-none ring-1 ring-primary/40"
    />
  );
}

export default ShipSyncImportBoard;
