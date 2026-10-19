/**
 * ShipSync — Gate Pass board.
 *
 * Logistics' gate-pass register. It started as a read-only mirror of the Monday.com "Gate Pass" board
 * (https://jlsyachts.monday.com/boards/5089663441); since 19 Oct 2026 it is edited here, because Logistics are cancelling Monday.
 * Click any cell to change it, "Add gate pass" (toolbar, or under a group's header) to add one, and the row's "…" to remove one.
 * Until Monday is switched off the hourly sync still brings in what changes there, without undoing edits made here (see
 * monday-gatepass-board.server.ts).
 *
 * The columns are not fixed. The board's own column titles and order were discovered from Monday (stored on each row), so this
 * shows the same columns in the same order; the first one is the gate pass reference number (Monday's item name). The rows keep
 * Monday's groups. Newest first.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ChevronDown, ChevronRight, DoorOpen, ExternalLink, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  clientsOf, ColumnLinesToggle, downloadCsv, EmptyState, matchesWhen, RowMenu, semanticGroupBorder, ShipmentFilters, TableSkeleton,
  useColumnLines, useSearchShortcut, type When,
} from "@/components/shipsync/shared";
import { createPackage, loadGatePassPackages, patchPackage, removeGatePass } from "@/lib/shipsync/data";
import { syncMondayGatePassBoard } from "@/lib/shipsync/monday-gatepass-board.server";
import type { ShipSyncPackage } from "@/lib/shipsync/model";
import {
  gatePassCell, gatePassColumns, gatePassEdit, gatePassGroups, gatePassName, gatePassNameColumn, gatePassSearchText, isDateColumn, newGatePass,
} from "@/lib/shipsync/gatepass-view";

const BOARD_URL = "https://jlsyachts.monday.com/boards/5089663441";
const DEFAULT_GROUP = "Gate Pass 2026";

const today = () => new Date().toISOString().slice(0, 10);

/** A cell that holds links (Monday's Files column is a comma-separated list of URLs) shows them as links; anything else as text. */
function CellValue({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 0 && parts.every((s) => /^https?:\/\//i.test(s))) {
    return (
      <span className="flex flex-wrap gap-x-2">
        {parts.map((url, i) => (
          <a key={`${url}-${i}`} href={url} target="_blank" rel="noopener noreferrer" title={decodeURIComponent(url.split("/").pop() ?? url)}
            onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> {parts.length > 1 ? `File ${i + 1}` : "Open"}
          </a>
        ))}
      </span>
    );
  }
  return <span className="block truncate" title={value}>{value}</span>;
}

/** One cell you click to edit: type, then Enter (or click away) to save, Escape to leave it as it was. Date columns get a date picker. */
function EditableCell({ value, date, saving, label, onSave }: {
  value: string; date: boolean; saving: boolean; label: string; onSave: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <button type="button" onClick={() => { setDraft(value); setEditing(true); }} title="Click to edit"
        className="flex h-7 w-full min-w-[4rem] items-center rounded px-1.5 text-left transition-colors duration-150 hover:bg-accent/30">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : <CellValue value={value} />}
      </button>
    );
  }
  const commit = () => { setEditing(false); const next = draft.trim(); if (next !== value) onSave(next); };
  return (
    <input
      autoFocus
      type={date ? "date" : "text"}
      aria-label={label}
      value={date && /^\d{4}-\d{2}-\d{2}/.test(draft) ? draft.slice(0, 10) : draft}
      onFocus={(e) => { if (!date) e.currentTarget.select(); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); setDraft(value); setEditing(false); }
      }}
      className="h-7 w-full min-w-[8rem] rounded border border-primary/60 bg-background px-1.5 text-[13px] text-foreground outline-none ring-2 ring-primary/20"
    />
  );
}

export function ShipSyncGatePassBoard() {
  const [rows, setRows] = useState<ShipSyncPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [clientFilter, setClientFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newRef, setNewRef] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ShipSyncPackage | null>(null);
  const [lines, setLines] = useColumnLines();
  const searchRef = useRef<HTMLInputElement>(null);
  useSearchShortcut(searchRef);

  async function load() {
    try { setRows(await loadGatePassPackages()); setLoadError(null); }
    catch (e: any) { setLoadError(e?.message ?? "Could not load the gate passes"); }
  }
  useEffect(() => { setLoading(true); void load().finally(() => setLoading(false)); }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await (syncMondayGatePassBoard as any)();
      if (!r.ok && r.synced === 0) throw new Error(r.detail);
      toast.success(r.skipped ? "A sync is already running — try again in a minute." : r.detail);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Monday sync failed"); }
    finally { setSyncing(false); }
  }

  const clientOptions = useMemo(() => clientsOf(rows), [rows]);
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((p) => {
      if (clientFilter && (p.boat_name?.trim() ?? "") !== clientFilter) return false;
      if (!matchesWhen(p, when)) return false;
      if (!s) return true;
      return gatePassSearchText(p).includes(s);
    });
  }, [rows, search, clientFilter, when]);

  const nameColumn = useMemo(() => gatePassNameColumn(rows), [rows]);
  const columns = useMemo(() => gatePassColumns(rows), [rows]);
  const allGroups = useMemo(() => gatePassGroups(rows).map((g) => g.title), [rows]);
  // Every group shows (even one the search empties) so there is always somewhere to add a gate pass.
  const groups = useMemo(() => {
    const found = gatePassGroups(filtered);
    const titles = allGroups.length ? allGroups : [DEFAULT_GROUP];
    return titles.map((title) => found.find((g) => g.title === title) ?? { title, rows: [] });
  }, [filtered, allGroups]);
  const filtering = !!(search.trim() || clientFilter || when !== "all");

  async function saveCell(p: ShipSyncPackage, column: string, value: string) {
    const cellId = `${p.id}:${column}`;
    const patch = gatePassEdit(p, column, nameColumn, value);
    setSavingCell(cellId);
    setRows((prev) => prev.map((r) => (r.id === p.id ? ({ ...r, ...patch } as ShipSyncPackage) : r)));
    try { await patchPackage(p.id, patch); }
    catch (e: any) { toast.error(e?.message ?? "Could not save that change"); await load(); }
    finally { setSavingCell(null); }
  }

  async function addGatePass(group: string, reference: string) {
    setAdding(true);
    try {
      const draft = newGatePass(rows, group, reference.trim());
      // Today as the date requested, when the board has that column — the one thing every new gate pass has.
      const requested = columns.find((c) => /requested/i.test(c) && isDateColumn(c));
      const record = requested
        ? { ...draft, ...gatePassEdit(draft as ShipSyncPackage, requested, nameColumn, today()) }
        : draft;
      const created = await createPackage(record);
      setRows((prev) => [created, ...prev]);
      setAddingIn(null);
      setNewRef("");
      setCollapsed((prev) => ({ ...prev, [group]: false }));
      toast.success(reference.trim() ? `Gate pass ${reference.trim()} added` : "Gate pass added — click its cells to fill it in");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add the gate pass");
    } finally { setAdding(false); }
  }

  async function doDelete() {
    const p = confirmDelete;
    setConfirmDelete(null);
    if (!p) return;
    try {
      await removeGatePass(p);
      setRows((prev) => prev.filter((r) => r.id !== p.id));
      toast.success("Gate pass removed");
    } catch (e: any) { toast.error(e?.message ?? "Could not remove the gate pass"); }
  }

  function exportCsv() {
    const body = filtered.map((p) => columns.map((c) => gatePassCell(p, c, nameColumn)));
    if (body.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(`gate-passes-${new Date().toISOString().slice(0, 10)}.csv`, columns, body);
    toast.success(`Exported ${body.length} gate pass${body.length === 1 ? "" : "es"}`);
  }

  if (loading) return <TableSkeleton />;

  const colCount = columns.length + 1;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-3">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search gate passes…" title="Press / to search" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length.toLocaleString()} of {rows.length.toLocaleString()}</span>
        <ColumnLinesToggle on={lines} onChange={setLines} />
        <ShipmentFilters when={when} onWhen={setWhen} client={clientFilter} onClient={setClientFilter} clients={clientOptions} />
        <Button size="sm" className="ml-auto h-9 gap-1.5"
          onClick={() => { const g = groups[0]?.title ?? DEFAULT_GROUP; setCollapsed((prev) => ({ ...prev, [g]: false })); setNewRef(""); setAddingIn(g); }}>
          <Plus className="h-4 w-4" /> Add gate pass
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={exportCsv} title="Download the gate passes shown as a CSV — opens straight in Excel">
          <ArrowDownToLine className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void syncNow()} disabled={syncing}
          title="Bring in anything changed on the Monday Gate Pass board (until Monday is switched off). Changes made here are kept.">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
        <a href={BOARD_URL} target="_blank" rel="noopener noreferrer" title="Open the old Monday board"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-foreground">
          <ExternalLink className="h-3.5 w-3.5" /> Monday
        </a>
      </div>

      {loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); void load().finally(() => setLoading(false)); }}>Try again</Button>
        </div>
      ) : (
        <div className="pds-scroll min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <table className={cn("w-full min-w-max border-separate border-spacing-0 text-[13px]", lines && "ss-vlines")}>
            <thead className="sticky top-0 z-10 will-change-transform">
              <tr className="text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] shadow-[inset_0_-1px_0_0_var(--border)]">
                {columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2.5">{c}</th>)}
                <th className="w-10 px-2 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isCollapsed = collapsed[g.title];
                return (
                  <Fragment key={g.title}>
                    <tr>
                      <td colSpan={colCount} className="p-0">
                        <button type="button" onClick={() => setCollapsed((prev) => ({ ...prev, [g.title]: !prev[g.title] }))}
                          className={cn("sticky left-0 flex w-fit min-w-[220px] items-center gap-2 border-l-4 bg-muted/20 px-4 py-2 text-left", semanticGroupBorder(g.title))}>
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-display text-sm font-semibold uppercase tracking-wide">{g.title}</span>
                          <span className="text-xs text-muted-foreground">{g.rows.length.toLocaleString()} gate pass{g.rows.length === 1 ? "" : "es"}</span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed && (
                      <tr className="shadow-[inset_0_-1px_0_0_var(--border)]">
                        <td colSpan={colCount} className="px-3 py-1">
                          {addingIn === g.title ? (
                            <div className="sticky left-3 flex w-fit items-center gap-2 py-0.5">
                              <Input autoFocus value={newRef} onChange={(e) => setNewRef(e.target.value)} disabled={adding}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") void addGatePass(g.title, newRef);
                                  if (e.key === "Escape") { setAddingIn(null); setNewRef(""); }
                                }}
                                placeholder={`${nameColumn} (can be added later)`} aria-label={nameColumn} className="h-8 w-80 text-[13px]" />
                              <Button size="sm" className="h-8" disabled={adding} onClick={() => void addGatePass(g.title, newRef)}>
                                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                              </Button>
                              <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={() => { setAddingIn(null); setNewRef(""); }}>Cancel</Button>
                            </div>
                          ) : (
                            <button type="button" onClick={() => { setNewRef(""); setAddingIn(g.title); }}
                              className="sticky left-3 flex items-center gap-1.5 rounded px-1.5 py-1 text-[12.5px] text-muted-foreground transition-colors duration-150 hover:bg-accent/30 hover:text-foreground">
                              <Plus className="h-3.5 w-3.5" /> Add gate pass
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                    {!isCollapsed && g.rows.length === 0 && filtering && (
                      <tr><td colSpan={colCount} className="p-0">
                        <EmptyState icon={DoorOpen} title="No gate passes match" hint="Nothing matches that search or those filters."
                          action={<Button size="sm" variant="outline" onClick={() => { setSearch(""); setClientFilter(""); setWhen("all"); }}>Clear search and filters</Button>} />
                      </td></tr>
                    )}
                    {!isCollapsed && g.rows.map((p) => (
                      <tr key={p.id} className="group shadow-[inset_0_-1px_0_0_var(--border)] hover:bg-accent/10">
                        {columns.map((c, i) => (
                          <td key={c} className={cn("max-w-[22rem] px-1.5 py-0.5", i === 0 && "font-medium")}>
                            <EditableCell value={gatePassCell(p, c, nameColumn)} date={isDateColumn(c)} label={c}
                              saving={savingCell === `${p.id}:${c}`} onSave={(v) => void saveCell(p, c, v)} />
                          </td>
                        ))}
                        <td className="px-1 py-0.5">
                          <RowMenu items={[{ label: "Remove", icon: Trash2, danger: true, onSelect: () => setConfirmDelete(p) }]} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this gate pass?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && gatePassName(confirmDelete) ? `Gate pass ${gatePassName(confirmDelete)} will be removed.` : "This gate pass will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doDelete()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ShipSyncGatePassBoard;
