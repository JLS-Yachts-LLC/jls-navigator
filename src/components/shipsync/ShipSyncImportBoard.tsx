/**
 * ShipSync — Import board.
 *
 * Mirrors the Monday.com "Shipment - Import/Transit" board, grouped into the
 * exact same sections Monday shows on-screen (IMPORT, TRANSIT, Completed, …)
 * — discovered at sync time, never hardcoded, so a group Monday adds or
 * renames shows up here automatically. Column order matches Monday's own
 * board left-to-right (its "Accounts" column is dropped — unused on every
 * item so far and not wanted here).
 *
 * "Group" (pinned first — not a real Monday column, so it has no "correct"
 * position to match) moves a shipment between sections, same as dragging a
 * card between columns on Monday. "Status" is the separate, real Monday
 * STATUS column — same 18 labels and colours as Monday's own status picker
 * — sitting where Monday has it (after Yacht Name). The two are independent:
 * changing Status never moves a shipment's group. Every field is editable
 * locally for day-to-day office use, but nothing writes back to Monday: the
 * next hourly sync
 * (lib/shipsync/monday-import-board.server.ts) re-pulls the board and
 * overwrites any Monday-linked row's fields (including a manual group move)
 * back to whatever Monday currently has. Rows added here by hand (no
 * monday_item_id) are never touched by the sync.
 *
 * ONE <table> for every group, not one table per group: a group's own toggle
 * row and its shipment rows are all part of the same table body, so there is
 * exactly one scrolling box (border below) for the whole board — the sticky
 * column header and the horizontal scrollbar both belong to that one box,
 * instead of each group fighting for its own. A separate table per group
 * was tried first and doesn't work: nesting a horizontally-scrolling box
 * inside a vertically-scrolling one breaks position:sticky (CSS forces a
 * box's overflow-y to auto the moment its overflow-x isn't visible, which
 * hijacks sticky onto that box's own, never-scrolling viewport).
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Search, ChevronDown, ChevronRight, RefreshCw, FileText, ArrowDownToLine, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fmtDate, mondayRow, extraMondayColumns } from "@/components/shipsync/shared";
import { loadImportPackages, patchPackage, createPackage, deletePackage } from "@/lib/shipsync/data";
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

/** Monday's real STATUS column — its exact 18 labels and colours (from the
 *  board's column settings), in the same order Monday's own label picker
 *  shows them. Independent of the group/section a shipment sits in. */
const MONDAY_STATUS_LABELS: { label: string; color: string }[] = [
  { label: "New Request", color: "#ff007f" },
  { label: "Intransit", color: "#784bd1" },
  { label: "Incoming", color: "#c4c4c4" },
  { label: "Warehouse", color: "#fdab3d" },
  { label: "Delivered - TBI", color: "#ffcb00" },
  { label: "Collected from Origin", color: "#333333" },
  { label: "Office", color: "#df2f4a" },
  { label: "1st Inspection", color: "#007eb5" },
  { label: "Collected in Warehouse", color: "#9d50dd" },
  { label: "2nd Inspection", color: "#579bfc" },
  { label: "Out for Delivery", color: "#cab641" },
  { label: "Scheduled for Delivery", color: "#037f4c" },
  { label: "Exported", color: "#bb3354" },
  { label: "In Warehouse - For Inspection", color: "#5559df" },
  { label: "In Warehouse", color: "#ff5ac4" },
  { label: "Arrived in UAE", color: "#9cd326" },
  { label: "Canceled", color: "#66ccff" },
  { label: "Complete", color: "#00c875" },
];
function mondayStatusColor(label: string): string {
  return MONDAY_STATUS_LABELS.find((s) => s.label === label)?.color ?? "#6b7280";
}

/** Monday's "Shipment Type" column — same 3 labels and colours as Monday's
 *  own label picker. */
const SHIPMENT_TYPE_LABELS: { label: string; color: string }[] = [
  { label: "Transit Shipment", color: "#00c875" },
  { label: "Import Shipment", color: "#fdab3d" },
  { label: "DDP Shipment", color: "#e2445c" },
];
function shipmentTypeColor(label: string): string {
  return SHIPMENT_TYPE_LABELS.find((s) => s.label === label)?.color ?? "#6b7280";
}

function extraOf(p: ShipSyncPackage): Record<string, any> { return (p.extra as any) ?? {}; }
function mondayText(p: ShipSyncPackage, title: string): string { return mondayRow(p)[title] ?? ""; }

/** Titles the explicit cells below already cover (including the dropped
 *  Accounts column) — anything else genuinely Monday-only still shows via
 *  the extra-columns fallback at the end. */
const COVERED = [
  "air waybill", "waybill", "tracking", "account", "invoice", "item id",
  "yacht", "vessel", "boat", "status", "shipment type", "boe", "supplier",
  "date received", "received", "date delivered", "delivered", "dn no",
  "delivery note", "receiver", "driver", "qty", "number of packages",
  "packages", "file", "edas", "courier", "paid amount", "payment copy",
  "remarks", "payment method", "client email", "requestor", "quotation",
  "collection and destination", "duty", "vat",
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
  | { kind: "mondayStatus" }
  | { kind: "shipmentType" }
  | { kind: "documents" }
  | { kind: "edas" };

/** Left-to-right, exactly matching the Monday board's own column order
 *  (Air WayBill/Tracking Number, Accounts[dropped], Invoice No., Item ID,
 *  Yacht Name, STATUS, Shipment Type, BOE No., Supplier, Date Received,
 *  Date Delivered, DN No., Receiver, Driver, Qty, Files, EDAS Required,
 *  Courier, Paid Amount, Payment Copy, Remarks, Payment Method, Client
 *  Email, Requestor, Quotation, Collection and Destination, Duty, VAT). */
const CELLS: CellSpec[] = [
  { kind: "field", col: fieldCol("barcode", "Air waybill/tracking", "w-32", "text", "barcode") },
  { kind: "field", col: mondayCol("invoiceNo", "Invoice No.", "w-24", "Invoice No.") },
  { kind: "field", col: mondayCol("itemId", "Item ID", "w-24", "Item ID") },
  { kind: "field", col: fieldCol("boat_name", "Yacht Name", "w-32", "text", "boat_name") },
  { kind: "mondayStatus" },
  { kind: "shipmentType" },
  { kind: "field", col: fieldCol("boe_no", "BOE No.", "w-24", "text", "boe_no") },
  { kind: "field", col: fieldCol("supplier", "Supplier", "w-28", "text", "supplier") },
  { kind: "field", col: fieldCol("received_at", "Date Received", "w-24", "date", "received_at") },
  { kind: "field", col: fieldCol("delivered_at", "Date Delivered", "w-24", "date", "delivered_at") },
  { kind: "field", col: fieldCol("delivery_note_no", "DN No.", "w-20", "text", "delivery_note_no") },
  { kind: "field", col: fieldCol("receiver_full_name", "Receiver", "w-24", "text", "receiver_full_name") },
  { kind: "field", col: mondayCol("driver", "Driver", "w-24", "DRIVER") },
  { kind: "field", col: fieldCol("num_packages", "Qty", "w-12", "number", "num_packages") },
  { kind: "documents" },
  { kind: "edas" },
  { kind: "field", col: fieldCol("courier", "Courier", "w-20", "text", "courier") },
  { kind: "field", col: mondayCol("paidAmount", "Paid Amount", "w-20", "Paid Amount") },
  { kind: "field", col: mondayCol("paymentCopy", "Payment Copy", "w-24", "PAYMENT COPY") },
  { kind: "field", col: fieldCol("description", "Remarks", "w-40", "text", "description") },
  { kind: "field", col: mondayCol("paymentMethod", "Payment Method", "w-24", "PAYMENT METHOD") },
  { kind: "field", col: mondayCol("clientEmail", "Client Email", "w-28", "Client Email") },
  { kind: "field", col: mondayCol("requestor", "Requestor", "w-24", "Requestor") },
  { kind: "field", col: mondayCol("quotation", "Quotation", "w-24", "Quotation") },
  { kind: "field", col: fieldCol("origin", "Collection and Destination", "w-40", "text", "origin") },
  { kind: "field", col: fieldCol("duty", "Duty", "w-16", "number", "duty") },
  { kind: "field", col: fieldCol("vat", "VAT", "w-16", "number", "vat") },
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
  const [newPackageOpen, setNewPackageOpen] = useState(false);
  const [npName, setNpName] = useState("");
  const [npGroup, setNpGroup] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(null);

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

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

  async function addShipment(g: GroupInfo, awbNumber: string) {
    const awb = awbNumber.trim();
    if (!awb) return;
    setAddingIn(null);
    setNewName("");
    try {
      const created = await createPackage({
        barcode: awb, local_import: "Import", status: "in_office",
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

  async function confirmDelete() {
    const ids = confirmDeleteIds;
    if (!ids || ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => deletePackage(id)));
      setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
      setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
      toast.success(ids.length > 1 ? `${ids.length} shipments removed` : "Shipment removed");
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
    } finally {
      setConfirmDeleteIds(null);
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

  const colCount = 2 + CELLS.length + mondayColumns.length + 1;
  const deleteTarget = confirmDeleteIds && confirmDeleteIds.length === 1
    ? rows.find((r) => r.id === confirmDeleteIds[0])
    : null;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search import shipments…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <Button size="sm" onClick={() => { setNpGroup(allGroups[0]?.title ?? ""); setNpName(""); setNewPackageOpen(true); }} className="ml-auto h-9 gap-1.5">
          <Plus className="h-4 w-4" /> New Package
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs text-destructive"
            onClick={() => setConfirmDeleteIds([...selected])}>
            <Trash2 className="h-3.5 w-3.5" /> Delete {selected.size} selected
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing} className="h-9 gap-1.5">
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
        // The one and only scroll box for the whole board — bounded, its own
        // border/scrollbar, both axes. table-fixed + border-separate (not
        // border-collapse — Chrome ghosts the row scrolling up behind a
        // sticky <thead> in a collapsed-border table) so the sticky column
        // header renders cleanly.
        <div className="pds-scroll min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px] [&_td]:border-r [&_td]:border-border/40 [&_th]:border-r [&_th]:border-border/40">
            <thead className="sticky top-0 z-20 will-change-transform">
              {/* box-shadow instead of border-b: border-separate drops <tr>
                  borders (the separated-borders model only recognises
                  borders on <td>/<th>). An inset box-shadow isn't part of
                  the table border model, so it renders the divider line
                  either way. */}
              <tr className="bg-card text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground shadow-[inset_0_-1px_0_0_var(--border)]">
                <th className="sticky left-0 z-20 w-9 bg-card px-3 py-1.5 will-change-transform"></th>
                <th className="w-28 px-2 py-1.5">Group</th>
                {CELLS.map((c) => {
                  if (c.kind === "field") return <th key={c.col.key} className={cn("px-2 py-1.5", c.col.width)}>{c.col.label}</th>;
                  if (c.kind === "mondayStatus") return <th key="mondayStatus" className="w-36 px-2 py-1.5">Status</th>;
                  if (c.kind === "shipmentType") return <th key="shipmentType" className="w-28 px-2 py-1.5">Shipment Type</th>;
                  if (c.kind === "documents") return <th key="documents" className="w-28 px-2 py-1.5">Files</th>;
                  return <th key="edas" className="w-14 px-2 py-1.5">EDAS</th>;
                })}
                {mondayColumns.map((c) => <th key={c} className="w-28 px-2 py-1.5">{c}</th>)}
                <th className="w-10 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed[g.title];
                return (
                  <Fragment key={g.title}>
                    <tr>
                      <td colSpan={colCount} className="p-0">
                        {/* sticky left-0 on the INNER wrapper (not the td —
                            a colSpan cell already spans the full row, so
                            making IT sticky does nothing to its content's
                            position): keeps the group name readable no
                            matter how far right you've scrolled. */}
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
                        <tr key={p.id} className="group shadow-[inset_0_-1px_0_0_var(--border)] hover:bg-accent/10">
                          <td className="sticky left-0 z-10 w-9 bg-card px-3 py-0.5 will-change-transform group-hover:bg-accent/10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} />
                          </td>
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
                            if (c.kind === "mondayStatus") {
                              const current = mondayText(p, "STATUS");
                              return (
                                <td key="mondayStatus" className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                  <Select value={current || undefined}
                                    onValueChange={(v) => void commit(p, `${p.id}:mondayStatus`, { extra: { ...extraOf(p), monday: { ...mondayRow(p), STATUS: v } } } as any)}>
                                    <SelectTrigger className="h-7 w-full border-none bg-transparent px-1.5 text-[11px] hover:bg-accent/40">
                                      {savingCell === `${p.id}:mondayStatus` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : current ? (
                                        <span className="truncate rounded px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: mondayStatusColor(current) }}>{current}</span>
                                      ) : <span className="text-muted-foreground/30">—</span>}
                                    </SelectTrigger>
                                    <SelectContent>
                                      {MONDAY_STATUS_LABELS.map((s) => (
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
                            if (c.kind === "shipmentType") {
                              const current = p.trade_type ?? "";
                              return (
                                <td key="shipmentType" className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                                  <Select value={current || undefined}
                                    onValueChange={(v) => void commit(p, `${p.id}:shipmentType`, { trade_type: v } as any)}>
                                    <SelectTrigger className="h-7 w-full border-none bg-transparent px-1.5 text-[11px] hover:bg-accent/40">
                                      {savingCell === `${p.id}:shipmentType` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : current ? (
                                        <span className="truncate rounded px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: shipmentTypeColor(current) }}>{current}</span>
                                      ) : <span className="text-muted-foreground/30">—</span>}
                                    </SelectTrigger>
                                    <SelectContent>
                                      {SHIPMENT_TYPE_LABELS.map((s) => (
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
                            if (c.kind === "documents") {
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
                            }
                            return (
                              <td key="edas" className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
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
                            );
                          })}
                          {mondayColumns.map((c) => (
                            <td key={c} className="overflow-hidden truncate px-2 py-1 text-muted-foreground">{row[c] || "—"}</td>
                          ))}
                          <td className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive opacity-0 group-hover:opacity-100" onClick={() => setConfirmDeleteIds([p.id])}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!isCollapsed && (
                      <tr>
                        <td className="sticky left-0 z-10 w-9 bg-card px-3 py-1 will-change-transform"></td>
                        <td colSpan={colCount - 1} className="px-2 py-1">
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
                                placeholder="Airway bill / tracking no…"
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
          <DialogHeader><DialogTitle>New package</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-name">Airway bill / tracking no.</Label>
              <Input id="np-name" autoFocus value={npName} onChange={(e) => setNpName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && npName.trim() && npGroup) void submitNewPackage(); }}
                placeholder="Airway bill / tracking no…" />
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

      <AlertDialog open={!!confirmDeleteIds} onOpenChange={(o) => !o && setConfirmDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{(confirmDeleteIds?.length ?? 0) > 1 ? `Remove ${confirmDeleteIds?.length} shipments?` : "Remove shipment?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${deleteTarget.barcode ?? deleteTarget.boat_name ?? "This shipment"} will be permanently removed.`
                : `${confirmDeleteIds?.length ?? 0} shipments will be permanently removed.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
