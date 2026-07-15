/**
 * ShipSync → Import tab.
 *
 * Inbound-shipment records (shipsync_packages where local_import = 'Import').
 * Existing rows come from the SharePoint import; the "Sync from Monday" button
 * additionally mirrors a Monday.com Import board on top of them (read-only).
 *
 * The table always renders the standard shipment/customs columns so real rows
 * show their data, and then appends any EXTRA columns the Monday board carries
 * (from extra.monday) so the tab also reflects whatever is on the board.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, RefreshCw, Search, ArrowDownToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, fmtDate } from "@/components/shipsync/shared";
import { loadImportPackages } from "@/lib/shipsync/data";
import { syncMondayImport } from "@/lib/shipsync/monday.server";
import type { ShipSyncPackage } from "@/lib/shipsync/model";

/** Standard columns — the inbound/customs shipment fields. */
const BASE_COLUMNS: { label: string; render: (p: ShipSyncPackage) => ReactNode; cls?: string }[] = [
  { label: "Air waybill/tracking", render: (p) => p.barcode ?? "—", cls: "font-mono text-[12px] text-foreground" },
  { label: "Client",               render: (p) => p.boat_name ?? "—", cls: "font-medium" },
  { label: "Date Received",        render: (p) => fmtDate(p.received_at), cls: "tabular-nums" },
  { label: "Consignee",            render: (p) => p.package_owner ?? "—" },
  { label: "Number of Packages",   render: (p) => p.num_packages ?? 1, cls: "tabular-nums text-center" },
  { label: "Courier",              render: (p) => p.courier ?? "—" },
  { label: "Supplier",             render: (p) => p.supplier ?? "—" },
  { label: "Origin",               render: (p) => p.origin ?? "—" },
  { label: "BOE No.",              render: (p) => p.boe_no ?? "—", cls: "font-mono text-[12px]" },
  { label: "Commodity",            render: (p) => p.commodity ?? "—" },
  { label: "Weight (kg)",          render: (p) => (p.weight_kg != null ? p.weight_kg : "—"), cls: "tabular-nums" },
  { label: "Delivery Note Number", render: (p) => p.delivery_note_no ?? "—", cls: "tabular-nums" },
  { label: "Status",               render: (p) => <StatusBadge status={p.status} /> },
];

/** Titles the base columns already cover — Monday columns matching these are not duplicated. */
const COVERED = new Set([
  "air waybill", "waybill", "awb", "tracking", "client", "vessel", "boat", "yacht",
  "date received", "received", "consignee", "owner", "receiver", "number of packages",
  "no. of packages", "packages", "courier", "supplier", "shipper", "origin", "boe",
  "bill of entry", "commodity", "goods", "weight", "delivery note", "status",
]);
function isCovered(title: string): boolean {
  const t = title.toLowerCase();
  return [...COVERED].some((k) => t.includes(k));
}

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

  // Extra Monday-only columns (not already covered by the base columns), in
  // board order where known. Empty until a Monday sync has actually run.
  const mondayColumns = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const add = (title: string) => {
      if (!seen.has(title) && !isCovered(title)) { seen.add(title); ordered.push(title); }
    };
    for (const p of rows) mondayColumnOrder(p).forEach(add);
    for (const p of rows) Object.keys(mondayRow(p)).forEach(add);
    return ordered;
  }, [rows]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const s = search.toLowerCase();
    return rows.filter((p) =>
      [p.barcode, p.boat_name, p.package_owner, p.courier, p.supplier, p.origin, p.commodity, p.boe_no,
       ...Object.values(mondayRow(p))].join(" ").toLowerCase().includes(s),
    );
  }, [rows, search]);

  const synced = lastSyncedAt(rows);

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const colCount = BASE_COLUMNS.length + mondayColumns.length;

  return (
    <div className="flex h-full min-w-0 flex-col px-6 py-5">
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search import shipments…" className="h-9 w-72 pl-8 text-sm" />
        </div>
        <span className="text-[12px] text-muted-foreground">{filtered.length} of {rows.length}</span>
        {synced && <span className="text-[11px] text-muted-foreground/70">Monday synced {rel(synced)}</span>}
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
        </div>
      ) : (
        <div className="relative min-h-0 min-w-0 flex-1">
          <div className="absolute inset-0 overflow-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[1400px] text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-card text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {BASE_COLUMNS.map((c) => <th key={c.label} className="px-3 py-2.5 whitespace-nowrap">{c.label}</th>)}
                  {mondayColumns.map((c) => <th key={c} className="px-3 py-2.5 whitespace-nowrap">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={colCount} className="px-4 py-12 text-center text-sm text-muted-foreground">No shipments match.</td></tr>
                ) : filtered.map((p) => {
                  const row = mondayRow(p);
                  return (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-accent/20">
                      {BASE_COLUMNS.map((c) => (
                        <td key={c.label} className={`px-3 py-2.5 whitespace-nowrap text-muted-foreground ${c.cls ?? ""}`}>{c.render(p)}</td>
                      ))}
                      {mondayColumns.map((c) => (
                        <td key={c} className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{row[c] || "—"}</td>
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
