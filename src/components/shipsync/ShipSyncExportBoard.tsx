/**
 * ShipSync — Export board.
 *
 * Mirrors the Monday.com "Shipment -  Export - 2026" board, grouped into the
 * exact same sections Monday shows on-screen (Export, Delivered, COMPLETED,
 * Cancelled) — discovered at sync time, never hardcoded, so a group Monday
 * adds or renames shows up here automatically. Same structure as the Import
 * board (components/shipsync/ShipSyncImportBoard.tsx) — see that file's own
 * header comment for why it's ONE <table> for every group rather than one
 * table per group (sticky header + horizontal scroll both need to belong to
 * a single scroll box, which a per-group table can't give them).
 *
 * Unlike Import, this board has no dedicated tracking-number column that's
 * always populated — the item's own name (a quotation reference like
 * "Q26-01816") is the one thing every row reliably has, so that's what
 * "Quotation Ref" is: the same barcode field Import uses for its AWB, just
 * playing a different role here. The real Air WayBill/Tracking Number
 * column (populated once a courier's actually booked) shows separately when
 * present.
 *
 * "Group" moves a shipment between sections, same as dragging a card
 * between columns on Monday. "Status" is the separate, real Monday STATUS
 * column — its own 10 labels and colours (from the board's column
 * settings), independent of which group a shipment sits in. Every field is
 * editable locally for day-to-day office use, but nothing writes back to
 * Monday: the next sync (lib/shipsync/monday-export-board.server.ts)
 * re-pulls the board and overwrites any Monday-linked row's fields back to
 * whatever Monday currently has. Rows added here by hand (no
 * monday_item_id) are never touched by the sync.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Search, ChevronDown, ChevronRight, RefreshCw, FileText, ArrowUpFromLine, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fmtDate, mondayRow, extraMondayColumns } from "@/components/shipsync/shared";
import { loadExportPackages, patchPackage, createPackage } from "@/lib/shipsync/data";
import type { ShipSyncPackage } from "@/lib/shipsync/model";
import { syncMondayExportBoard } from "@/lib/shipsync/monday-export-board.server";

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

/** Monday's real STATUS column on the Export board — its exact 10 labels and
 *  colours (from the board's column settings), in the same order Monday's
 *  own status picker shows them. Independent of the group/section a
 *  shipment sits in. Deliberately its own list, not shared with the Import
 *  board's MONDAY_STATUS_LABELS — the two boards' STATUS columns have
 *  entirely different, unrelated label sets. */
const EXPORT_STATUS_LABELS: { label: string; color: string }[] = [
  { label: "For Approval", color: "#c4c4c4" },
  { label: "Approved", color: "#00c875" },
  { label: "Collected", color: "#579bfc" },
  { label: "Delivered/ TBI", color: "#ffcb00" },
  { label: "Returned", color: "#007eb5" },
  { label: "Cancelled", color: "#df2f4a" },
  { label: "Held In Customs Destination", color: "#037f4c" },
  { label: "Hold", color: "#ff5ac4" },
  { label: "For Invoicing", color: "#cab641" },
  { label: "Completed", color: "#9d50dd" },
];
function exportStatusColor(label: string): string {
  return EXPORT_STATUS_LABELS.find((s) => s.label === label)?.color ?? "#6b7280";
}

function extraOf(p: ShipSyncPackage): Record<string, any> { return (p.extra as any) ?? {}; }
function mondayText(p: ShipSyncPackage, title: string): string { return mondayRow(p)[title] ?? ""; }

/** Titles the explicit cells below already cover — anything else genuinely
 *  Monday-only still shows via the extra-columns fallback at the end. */
const COVERED = [
  "client", "air waybill", "tracking", "invoice", "requested date", "status",
  "courier", "consignee", "shipping cost", "quote value", "destination",
  "item description", "remarks", "file", "accounts",
];

type ColType = "text" | "number" | "date";
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

type CellSpec =
  | { kind: "field"; col: ColDef }
  | { kind: "exportStatus" }
  | { kind: "documents" };

/** Left-to-right, exactly matching the Monday board's own column order
 *  (Client, Air WayBill/Tracking Number, Invoice number, Requested Date,
 *  STATUS, Courier/Agent, Consignee, Shipping Cost, Quote Value,
 *  DESTINATION, ITEM DESCRIPTION, REMARKS, Files, Accounts). */
const CELLS: CellSpec[] = [
  { kind: "field", col: fieldCol("boat_name", "Client", "w-28", "text", "boat_name") },
  { kind: "field", col: mondayCol("awb", "AWB/Tracking Number", "w-32", "Air WayBill/Tracking Number") },
  { kind: "field", col: mondayCol("invoiceNo", "Invoice No.", "w-28", "Invoice number") },
  { kind: "field", col: fieldCol("received_at", "Requested Date", "w-28", "date", "received_at") },
  { kind: "exportStatus" },
  { kind: "field", col: fieldCol("courier", "Courier/Agent", "w-24", "text", "courier") },
  { kind: "field", col: mondayCol("consignee", "Consignee", "w-28", "Consignee") },
  { kind: "field", col: mondayCol("shippingCost", "Shipping Cost", "w-24", "Shipping Cost") },
  { kind: "field", col: mondayCol("quoteValue", "Quote Value", "w-24", "Quote Value") },
  { kind: "field", col: mondayCol("destination", "Destination", "w-28", "DESTINATION") },
  { kind: "field", col: fieldCol("description", "Item Description", "w-48", "text", "description") },
  { kind: "field", col: mondayCol("remarks", "Remarks", "w-48", "REMARKS") },
  { kind: "documents" },
  { kind: "field", col: mondayCol("accounts", "Accounts", "w-32", "Accounts") },
];

interface GroupInfo { title: string; position: number }
interface Group extends GroupInfo { rows: ShipSyncPackage[] }

export function ShipSyncExportBoard() {
  const [rows, setRows] = useState<ShipSyncPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPackageOpen, setNewPackageOpen] = useState(false);
  const [npName, setNpName] = useState("");
  const [npGroup, setNpGroup] = useState("");

  async function reload() {
    const data = await loadExportPackages();
    setRows(data);
  }
  useEffect(() => { setLoading(true); void reload().finally(() => setLoading(false)); }, []);

  async function sync() {
    setSyncing(true);
    try {
      const r = await (syncMondayExportBoard as any)();
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
    const client = name.trim();
    if (!client) return;
    setAddingIn(null);
    setNewName("");
    try {
      const created = await createPackage({
        boat_name: client, local_import: "Export", status: "in_office",
        extra: { monday_group_title: g.title, monday_group_position: g.position },
      });
      setRows((prev) => [...prev, created]);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add shipment");
    }
  }

  async function submitNewPackage() {
    const target = allGroups.find((g) => g.title === npGroup);
    if (!target) return;
    await addShipment(target, npName);
    setNewPackageOpen(false);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((p) =>
      [p.barcode, p.boat_name, p.courier, p.description, ...Object.values(mondayRow(p))].join(" ").toLowerCase().includes(s),
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

  const colCount = 1 + CELLS.length + mondayColumns.length;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search export shipments…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button size="sm" onClick={() => { setNpGroup(allGroups[0]?.title ?? ""); setNpName(""); setNewPackageOpen(true); }} className="ml-auto h-9 gap-1.5">
          <Plus className="h-4 w-4" /> New Shipment
        </Button>
        <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing} className="h-9 gap-1.5">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/60">
            <ArrowUpFromLine className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold">No export shipments yet</div>
          <p className="max-w-md text-[13px] text-muted-foreground">Click "Sync from Monday" to pull in the Export board.</p>
        </div>
      ) : (
        // Same one-scroll-box structure as the Import board — see that
        // file's header comment for why (a table per group breaks sticky).
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]">
            <thead className="sticky top-0 z-20 will-change-transform">
              <tr className="bg-card text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground shadow-[inset_0_-1px_0_0_var(--border)]">
                <th className="w-28 px-2 py-1.5">Group</th>
                {CELLS.map((c) => {
                  if (c.kind === "field") return <th key={c.col.key} className={cn("px-2 py-1.5", c.col.width)}>{c.col.label}</th>;
                  if (c.kind === "exportStatus") return <th key="exportStatus" className="w-36 px-2 py-1.5">Status</th>;
                  return <th key="documents" className="w-28 px-2 py-1.5">Files</th>;
                })}
                {mondayColumns.map((c) => <th key={c} className="w-28 px-2 py-1.5">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed[g.title];
                return (
                  <Fragment key={g.title}>
                    <tr>
                      <td colSpan={colCount} className="p-0">
                        <button onClick={() => toggle(g.title)}
                          className={cn("sticky left-0 flex w-fit min-w-[200px] items-center gap-2 border-l-4 bg-muted/20 px-4 py-2 text-left", groupColor(g.title))}>
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-display text-sm font-semibold uppercase tracking-wide">{g.title}</span>
                          <span className="text-xs text-muted-foreground">{g.rows.length} shipment{g.rows.length === 1 ? "" : "s"}</span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed && g.rows.map((p) => {
                      const row = mondayRow(p);
                      const docs = p.documents ?? [];
                      return (
                        <tr key={p.id} className="shadow-[inset_0_-1px_0_0_color-mix(in_oklab,var(--border)_40%,transparent)] hover:bg-accent/10">
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
                          {CELLS.map((c) => {
                            if (c.kind === "field") {
                              const col = c.col;
                              return (
                                <td key={col.key} className={cn("overflow-hidden px-1 py-0.5", col.width)}>
                                  <EditableCell col={col} p={p} saving={savingCell === `${p.id}:${col.key}`}
                                    onChange={(v) => void commit(p, `${p.id}:${col.key}`, col.set(p, v))} />
                                </td>
                              );
                            }
                            if (c.kind === "exportStatus") {
                              const current = mondayText(p, "STATUS");
                              return (
                                <td key="exportStatus" className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                  <Select value={current || undefined}
                                    onValueChange={(v) => void commit(p, `${p.id}:exportStatus`, { extra: { ...extraOf(p), monday: { ...mondayRow(p), STATUS: v } } } as any)}>
                                    <SelectTrigger className="h-7 w-full border-none bg-transparent px-1.5 text-[11px] hover:bg-accent/40">
                                      {savingCell === `${p.id}:exportStatus` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : current ? (
                                        <span className="truncate rounded px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: exportStatusColor(current) }}>{current}</span>
                                      ) : <span className="text-muted-foreground/30">—</span>}
                                    </SelectTrigger>
                                    <SelectContent>
                                      {EXPORT_STATUS_LABELS.map((s) => (
                                        <SelectItem key={s.label} value={s.label}>
                                          <span className="flex items-center gap-2">
                                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                                            {s.label}
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                              );
                            }
                            return (
                              <td key="documents" className="overflow-hidden px-2 py-1">
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
                            );
                          })}
                          {mondayColumns.map((c) => (
                            <td key={c} className="overflow-hidden truncate px-2 py-1 text-muted-foreground">{row[c] || "—"}</td>
                          ))}
                        </tr>
                      );
                    })}
                    {!isCollapsed && (
                      <tr>
                        <td colSpan={colCount} className="px-2 py-1">
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
                                placeholder="Client name…"
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
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={newPackageOpen} onOpenChange={setNewPackageOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New export shipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-name">Client name</Label>
              <Input id="np-name" autoFocus value={npName} onChange={(e) => setNpName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && npName.trim() && npGroup) void submitNewPackage(); }}
                placeholder="Client name…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="np-group">Group</Label>
              <Select value={npGroup} onValueChange={setNpGroup}>
                <SelectTrigger id="np-group"><span>{npGroup || "Select group…"}</span></SelectTrigger>
                <SelectContent>
                  {allGroups.map((g) => <SelectItem key={g.title} value={g.title}>{g.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewPackageOpen(false)}>Cancel</Button>
            <Button disabled={!npName.trim() || !npGroup} onClick={() => void submitNewPackage()}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

export default ShipSyncExportBoard;
