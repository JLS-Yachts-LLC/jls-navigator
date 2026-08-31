/**
 * ShipSync — EDAS board.
 *
 * Mirrors the Monday.com "EDAS 2026" board (id 5089054389) — a much simpler
 * board than Import/Export/Local: one flat group ("EDAS 2026"), no
 * multi-stage status workflow, just an AWB, a client, a date, and the
 * customs paperwork (receipts, LCA/attestation PDFs) attached per shipment.
 * Same one-<table>-for-every-group structure as Import/Export (see that
 * file's header comment for why — sticky header + horizontal scroll both
 * need to belong to a single scroll box), kept even though there's normally
 * only one group, so a group Monday ever adds still shows up automatically.
 *
 * Every field is editable locally for day-to-day office use, but nothing
 * writes back to Monday: the next sync (lib/shipsync/monday-edas-board.server.ts)
 * re-pulls the board and overwrites any Monday-linked row's fields back to
 * whatever Monday currently has. Rows added here by hand (no monday_item_id)
 * are never touched by the sync.
 */
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Search, ChevronDown, ChevronRight, RefreshCw, FileText, FileCheck2, Plus, Trash2, X } from "lucide-react";
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
import { fmtDate, mondayRow, extraMondayColumns, DocumentDropzoneDialog, TableChartToggle, ShipSyncChartsPanel, type StatusDatum } from "@/components/shipsync/shared";
import { loadEdasPackages, patchPackage, createPackage, deletePackage, addPackageDocuments, removePackageDocument } from "@/lib/shipsync/data";
import type { ShipSyncPackage } from "@/lib/shipsync/model";
import { syncMondayEdasBoard } from "@/lib/shipsync/monday-edas-board.server";

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

/** Titles the explicit cells below already cover — anything else genuinely
 *  Monday-only (Subitems, the linked-board Mirror status) still shows via
 *  the extra-columns fallback at the end. */
const COVERED = ["awb", "client", "date", "file"];

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
  | { kind: "documents" };

/** Left-to-right, matching the Monday board's own column order exactly
 *  (Name, AWB, CLIENT, Date, Files) — "Subitems" and the linked-board
 *  "Mirror" status column aren't modelled here (every sampled row had both
 *  blank); they still show via the extra-columns fallback if Monday ever
 *  populates them. */
const CELLS: CellSpec[] = [
  { kind: "field", col: fieldCol("barcode", "Name", "w-32", "text", "barcode") },
  { kind: "field", col: mondayCol("awb", "AWB", "w-40", "AWB") },
  { kind: "field", col: fieldCol("boat_name", "CLIENT", "w-32", "text", "boat_name") },
  { kind: "field", col: fieldCol("received_at", "Date", "w-28", "date", "received_at") },
  { kind: "documents" },
];

interface GroupInfo { title: string; position: number }
interface Group extends GroupInfo { rows: ShipSyncPackage[] }

export function ShipSyncEdasBoard() {
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
  const [docTarget, setDocTarget] = useState<ShipSyncPackage | null>(null);
  const [view, setView] = useState<"table" | "chart">("table");

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function reload() {
    const data = await loadEdasPackages();
    setRows(data);
  }
  useEffect(() => { setLoading(true); void reload().finally(() => setLoading(false)); }, []);

  async function sync() {
    setSyncing(true);
    try {
      const r = await (syncMondayEdasBoard as any)();
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

  async function uploadDocuments(p: ShipSyncPackage, files: File[]) {
    const documents = await addPackageDocuments(p, files);
    await commit(p, `${p.id}:documents`, { documents });
  }

  async function removeDocument(p: ShipSyncPackage, index: number) {
    try {
      const documents = await removePackageDocument(p, index);
      await commit(p, `${p.id}:documents`, { documents });
    } catch (e: any) { toast.error(e?.message ?? "Couldn't remove file"); }
  }

  async function addShipment(g: GroupInfo, name: string) {
    const barcode = name.trim();
    if (!barcode) return;
    setAddingIn(null);
    setNewName("");
    try {
      const created = await createPackage({
        barcode, local_import: "EDAS", status: "in_office",
        extra: { monday_group_title: g.title, monday_group_position: g.position },
      });
      setRows((prev) => [...prev, created]);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add EDAS entry");
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
      toast.success(ids.length > 1 ? `${ids.length} entries removed` : "Entry removed");
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
      [p.barcode, p.boat_name, ...Object.values(mondayRow(p))].join(" ").toLowerCase().includes(s),
    );
  }, [rows, search]);

  const mondayColumns = useMemo(() => extraMondayColumns(rows, COVERED), [rows]);

  /** No status workflow on this board — the panel's status pie just shows
   *  "Nothing to chart yet"; the by-vessel / by-month widgets still work
   *  fine off boat_name/received_at, which this board does have. */
  const chartData = useMemo<StatusDatum[]>(() => [], []);

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
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search EDAS entries…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        <TableChartToggle value={view} onChange={setView} />
        <Button size="sm" onClick={() => { setNpGroup(allGroups[0]?.title ?? ""); setNpName(""); setNewPackageOpen(true); }} className="ml-auto h-9 gap-1.5">
          <Plus className="h-4 w-4" /> New EDAS entry
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

      {view === "chart" ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <ShipSyncChartsPanel rows={filtered} statusData={chartData} title="EDAS entries" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/60">
            <FileCheck2 className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold">No EDAS entries yet</div>
          <p className="max-w-md text-[13px] text-muted-foreground">Click "Sync from Monday" to pull in the EDAS 2026 board.</p>
        </div>
      ) : (
        // Same one-scroll-box structure as the Import/Export boards — see
        // Import's header comment for why (a table per group breaks sticky).
        <div className="pds-scroll min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px] [&_td]:border-r [&_td]:border-border/40 [&_th]:border-r [&_th]:border-border/40">
            <thead className="sticky top-0 z-20 will-change-transform">
              <tr className="bg-card text-left text-[10px] font-semibold uppercase tracking-[0.05em] text-muted-foreground shadow-[inset_0_-1px_0_0_var(--border)]">
                <th className="sticky left-0 z-20 w-9 bg-card px-3 py-1.5 will-change-transform"></th>
                <th className="w-28 px-2 py-1.5">Group</th>
                {CELLS.map((c) => {
                  if (c.kind === "field") return <th key={c.col.key} className={cn("px-2 py-1.5", c.col.width)}>{c.col.label}</th>;
                  return <th key="documents" className="w-40 px-2 py-1.5">Files</th>;
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
                        <button onClick={() => toggle(g.title)}
                          className={cn("sticky left-0 flex w-fit min-w-[200px] items-center gap-2 border-l-4 bg-muted/20 px-4 py-2 text-left", groupColor(g.title))}>
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-display text-sm font-semibold uppercase tracking-wide">{g.title}</span>
                          <span className="text-xs text-muted-foreground">{g.rows.length} entr{g.rows.length === 1 ? "y" : "ies"}</span>
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
                            return (
                              <td key="documents" className="overflow-hidden px-2 py-1" onClick={(e) => e.stopPropagation()}>
                                {docs.length === 0 ? (
                                  <button type="button" onClick={() => setDocTarget(p)}
                                    className="inline-flex items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:border-primary hover:text-primary">
                                    <Plus className="h-3 w-3" /> Add files
                                  </button>
                                ) : (
                                  <div className="flex flex-wrap items-center gap-1">
                                    {docs.map((d, i) => (
                                      <span key={i} className="group/doc inline-flex max-w-[100px] items-center gap-1 rounded border border-border pl-1 pr-0.5 py-0.5 text-[10px] text-primary hover:bg-primary/5">
                                        <a href={d.url} target="_blank" rel="noopener noreferrer" title={d.name}
                                          className="flex min-w-0 items-center gap-1 truncate">
                                          <FileText className="h-3 w-3 shrink-0" /> <span className="truncate">{d.name}</span>
                                        </a>
                                        <button type="button" onClick={() => removeDocument(p, i)} title="Remove file"
                                          className="shrink-0 rounded p-0.5 text-muted-foreground/60 opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/doc:opacity-100">
                                          <X className="h-3 w-3" />
                                        </button>
                                      </span>
                                    ))}
                                    <button type="button" onClick={() => setDocTarget(p)} title="Add files"
                                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary">
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
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
                                placeholder="Name…"
                                className="h-7 w-56 text-xs"
                              />
                              <Button size="sm" className="h-7 text-xs" disabled={!newName.trim()} onClick={() => void addShipment(g, newName)}>Add</Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setAddingIn(null); setNewName(""); }}>Cancel</Button>
                            </div>
                          ) : (
                            <button onClick={() => setAddingIn(g.title)}
                              className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent/30 hover:text-foreground">
                              <Plus className="h-3.5 w-3.5" /> Add EDAS entry
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
          <DialogHeader><DialogTitle>New EDAS entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="np-name">Name</Label>
              <Input id="np-name" autoFocus value={npName} onChange={(e) => setNpName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && npName.trim() && npGroup) void submitNewPackage(); }}
                placeholder="Name…" />
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

      <DocumentDropzoneDialog open={!!docTarget} onClose={() => setDocTarget(null)}
        onUpload={(files) => uploadDocuments(docTarget!, files)} />

      <AlertDialog open={!!confirmDeleteIds} onOpenChange={(o) => !o && setConfirmDeleteIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{(confirmDeleteIds?.length ?? 0) > 1 ? `Remove ${confirmDeleteIds?.length} entries?` : "Remove entry?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? `${deleteTarget.barcode ?? deleteTarget.boat_name ?? "This entry"} will be permanently removed.`
                : `${confirmDeleteIds?.length ?? 0} entries will be permanently removed.`}
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

export default ShipSyncEdasBoard;
