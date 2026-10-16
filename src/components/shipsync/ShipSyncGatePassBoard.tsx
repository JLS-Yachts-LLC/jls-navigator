/**
 * ShipSync — Gate Pass board.
 *
 * A read-only mirror of the Monday.com "Gate Pass" board (https://jlsyachts.monday.com/boards/5089663441), kept up to date every
 * hour and by "Sync from Monday". Monday is the source of truth, so nothing is edited here: change a gate pass on Monday and it
 * appears here at the next sync.
 *
 * The columns are not fixed. The board's own column titles and order are discovered when it syncs (stored on each row), so
 * this shows exactly what Monday shows, in the same order, and a column added on Monday appears by itself. Columns that are
 * empty on every row (Monday's Subitems, a linked-board Mirror) are left out. The rows keep Monday's groups.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, ChevronDown, ChevronRight, DoorOpen, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  clientsOf, ColumnLinesToggle, downloadCsv, EmptyState, matchesWhen, semanticGroupBorder, ShipmentFilters, TableSkeleton,
  useColumnLines, useSearchShortcut, type When,
} from "@/components/shipsync/shared";
import { loadGatePassPackages } from "@/lib/shipsync/data";
import { syncMondayGatePassBoard } from "@/lib/shipsync/monday-gatepass-board.server";
import type { ShipSyncPackage } from "@/lib/shipsync/model";
import { gatePassCell, gatePassColumns, gatePassGroups, gatePassSearchText } from "@/lib/shipsync/gatepass-view";

const BOARD_URL = "https://jlsyachts.monday.com/boards/5089663441";

/** A cell that holds links (Monday's Files column is a comma-separated list of URLs) shows them as links; anything else as text. */
function CellValue({ value }: { value: string }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length > 0 && parts.every((s) => /^https?:\/\//i.test(s))) {
    return (
      <span className="flex flex-wrap gap-x-2">
        {parts.map((url, i) => (
          <a key={`${url}-${i}`} href={url} target="_blank" rel="noopener noreferrer" title={decodeURIComponent(url.split("/").pop() ?? url)}
            className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="h-3 w-3" /> {parts.length > 1 ? `File ${i + 1}` : "Open"}
          </a>
        ))}
      </span>
    );
  }
  return <span className="block truncate" title={value}>{value}</span>;
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

  const columns = useMemo(() => gatePassColumns(rows), [rows]);
  const groups = useMemo(() => gatePassGroups(filtered), [filtered]);

  function exportCsv() {
    const body = filtered.map((p) => columns.map((c) => gatePassCell(p, c)));
    if (body.length === 0) { toast.error("Nothing to export"); return; }
    downloadCsv(`gate-passes-${new Date().toISOString().slice(0, 10)}.csv`, columns, body);
    toast.success(`Exported ${body.length} gate pass${body.length === 1 ? "" : "es"}`);
  }

  if (loading) return <TableSkeleton />;

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
        <a href={BOARD_URL} target="_blank" rel="noopener noreferrer"
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px] font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:text-foreground">
          <ExternalLink className="h-3.5 w-3.5" /> Open on Monday
        </a>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={exportCsv} title="Download the gate passes shown as a CSV — opens straight in Excel">
          <ArrowDownToLine className="h-4 w-4" /> Export
        </Button>
        <Button size="sm" className="h-9 gap-1.5" onClick={() => void syncNow()} disabled={syncing} title="Pull the board from Monday now (it also syncs every hour)">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
      </div>

      {loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={() => { setLoading(true); void load().finally(() => setLoading(false)); }}>Try again</Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/40">
          <EmptyState icon={DoorOpen} title="No gate passes yet"
            hint="This mirrors the Monday Gate Pass board. It fills by itself every hour, or press Sync from Monday to pull it now." />
        </div>
      ) : (
        <div className="pds-scroll min-h-0 min-w-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          <table className={cn("w-full min-w-max border-separate border-spacing-0 text-[13px]", lines && "ss-vlines")}>
            <thead className="sticky top-0 z-10 will-change-transform">
              <tr className="text-left text-[11.5px] font-semibold uppercase tracking-[0.06em] shadow-[inset_0_-1px_0_0_var(--border)]">
                {columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2.5">{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr><td colSpan={columns.length} className="p-0">
                  <EmptyState icon={DoorOpen} title="No gate passes match" hint="Nothing matches that search or those filters."
                    action={<Button size="sm" variant="outline" onClick={() => { setSearch(""); setClientFilter(""); setWhen("all"); }}>Clear search and filters</Button>} />
                </td></tr>
              ) : groups.map((g) => {
                const isCollapsed = collapsed[g.title];
                return (
                  <Fragment key={g.title}>
                    <tr>
                      <td colSpan={columns.length} className="p-0">
                        <button type="button" onClick={() => setCollapsed((prev) => ({ ...prev, [g.title]: !prev[g.title] }))}
                          className={cn("sticky left-0 flex w-fit min-w-[220px] items-center gap-2 border-l-4 bg-muted/20 px-4 py-2 text-left", semanticGroupBorder(g.title))}>
                          {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-display text-sm font-semibold uppercase tracking-wide">{g.title}</span>
                          <span className="text-xs text-muted-foreground">{g.rows.length.toLocaleString()} gate pass{g.rows.length === 1 ? "" : "es"}</span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed && g.rows.map((p) => (
                      <tr key={p.id} className="shadow-[inset_0_-1px_0_0_var(--border)] hover:bg-accent/10">
                        {columns.map((c, i) => (
                          <td key={c} className={cn("max-w-[22rem] px-3 py-2", i === 0 && "font-medium")}><CellValue value={gatePassCell(p, c)} /></td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ShipSyncGatePassBoard;
