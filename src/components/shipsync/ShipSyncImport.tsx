/**
 * ShipSync → Import tab.
 *
 * A read-only mirror of the Monday.com "Import" board. Columns are derived from
 * the Monday board itself (extra.monday_columns / the keys of extra.monday), so
 * the table matches whatever the board has — no hardcoded column list. A "Sync
 * from Monday" button pulls the latest; a graceful empty state guides setup when
 * Monday isn't configured yet.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadImportPackages } from "@/lib/shipsync/data";
import { syncMondayImport } from "@/lib/shipsync/monday.server";
import type { ShipSyncPackage } from "@/lib/shipsync/model";

/** The Monday row map + item name stored on each imported package. */
function mondayRow(p: ShipSyncPackage): Record<string, string> {
  return ((p.extra as any)?.monday ?? {}) as Record<string, string>;
}
function mondayColumnOrder(p: ShipSyncPackage): string[] {
  return (((p.extra as any)?.monday_columns ?? []) as string[]).filter(Boolean);
}
function lastSyncedAt(rows: ShipSyncPackage[]): string | null {
  let latest: string | null = null;
  for (const p of rows) {
    const at = (p.extra as any)?.imported_at as string | undefined;
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}
function rel(ts: string | null): string {
  if (!ts) return "never";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h}h ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ShipSyncImport() {
  const [rows, setRows] = useState<ShipSyncPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  async function reload() {
    const data = await loadImportPackages();
    setRows(data);
  }
  useEffect(() => { void reload().finally(() => setLoading(false)); }, []);

  async function sync() {
    setSyncing(true);
    try {
      const r = await (syncMondayImport as any)();
      if (!r.ok && r.synced === 0) throw new Error(r.detail);
      toast.success(r.detail);
      await reload();
    } catch (e: any) {
      toast.error(e?.message ?? "Monday sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // Union of Monday column titles across all rows, in board order where known.
  const columns = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    // Prefer the board's own column order (captured on the most recent row).
    for (const p of rows) {
      for (const title of mondayColumnOrder(p)) {
        if (!seen.has(title)) { seen.add(title); ordered.push(title); }
      }
    }
    // Fold in any title that appears in data but wasn't in the order list.
    for (const p of rows) {
      for (const title of Object.keys(mondayRow(p))) {
        if (!seen.has(title)) { seen.add(title); ordered.push(title); }
      }
    }
    return ordered;
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((p) =>
      [p.extra && (p.extra as any).monday_item_name, ...Object.values(mondayRow(p))]
        .join(" ").toLowerCase().includes(s),
    );
  }, [rows, search]);

  const synced = lastSyncedAt(rows);

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
        <span className="text-[11px] text-muted-foreground/70">Synced {rel(synced)}</span>
        <Button size="sm" onClick={() => void sync()} disabled={syncing} className="ml-auto h-9 gap-1.5">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background/60">
            <ArrowDownToLine className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="text-sm font-semibold">No import shipments yet</div>
          <p className="max-w-md text-[13px] text-muted-foreground">
            This tab mirrors your Monday.com <span className="font-medium">Import</span> board. Add your Monday
            API token and Import board ID in <span className="font-medium">Settings → Integrations → Monday.com</span>,
            then click <span className="font-medium">Sync from Monday</span>.
          </p>
          <Button size="sm" variant="outline" onClick={() => void sync()} disabled={syncing} className="mt-1 h-9 gap-1.5">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync from Monday
          </Button>
        </div>
      ) : (
        <div className="relative min-h-0 min-w-0 flex-1">
          <div className="absolute inset-0 overflow-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-card text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="px-3 py-2.5 whitespace-nowrap">Item</th>
                  {columns.map((c) => (
                    <th key={c} className="px-3 py-2.5 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={columns.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground">No shipments match.</td></tr>
                ) : filtered.map((p) => {
                  const row = mondayRow(p);
                  return (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-accent/20">
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">{(p.extra as any)?.monday_item_name ?? "—"}</td>
                      {columns.map((c) => (
                        <td key={c} className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{row[c] || "—"}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
