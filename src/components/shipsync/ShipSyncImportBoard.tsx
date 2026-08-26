/**
 * ShipSync — Import board.
 *
 * Read-only mirror of the Monday.com "Shipment - Import/Transit" board,
 * grouped into the exact same sections Monday shows on-screen (IMPORT,
 * TRANSIT, Completed, …) — discovered at sync time, never hardcoded, so a
 * group Monday adds or renames shows up here automatically. Only the
 * office-owned "Status" dropdown is editable; every other field mirrors
 * Monday and is never written back (see lib/shipsync/monday-import-board.server.ts).
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, ChevronDown, ChevronRight, RefreshCw, FileText, ArrowDownToLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusBadge, fmtDate, mondayRow, extraMondayColumns } from "@/components/shipsync/shared";
import { loadImportPackages, patchPackage } from "@/lib/shipsync/data";
import { STATUS_META, type PackageStatus, type ShipSyncPackage } from "@/lib/shipsync/model";
import { syncMondayImportBoard } from "@/lib/shipsync/monday-import-board.server";

const STATUS_OPTIONS = Object.keys(STATUS_META) as PackageStatus[];

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

function fromMonday(p: ShipSyncPackage, keyword: string): string {
  const row = mondayRow(p);
  const key = Object.keys(row).find((k) => k.toLowerCase().includes(keyword));
  return (key && row[key]) || "—";
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

interface Group { title: string; position: number; rows: ShipSyncPackage[] }

export function ShipSyncImportBoard() {
  const [rows, setRows] = useState<ShipSyncPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [savingCell, setSavingCell] = useState<string | null>(null);

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

  async function quickStatus(p: ShipSyncPackage, status: PackageStatus) {
    const cellId = `${p.id}:status`;
    setSavingCell(cellId);
    setRows((prev) => prev.map((r) => (r.id === p.id ? { ...r, status } : r)));
    try { await patchPackage(p.id, { status }); }
    catch (e: any) { toast.error(e?.message ?? "Update failed"); await reload(); }
    finally { setSavingCell(null); }
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

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const p of filtered) {
      const extra = (p.extra as any) ?? {};
      const title: string = extra.monday_group_title ?? "Not on Monday";
      const position: number = typeof extra.monday_group_position === "number" && extra.monday_group_position >= 0
        ? extra.monday_group_position : 999;
      if (!map.has(title)) map.set(title, { title, position, rows: [] });
      map.get(title)!.rows.push(p);
    }
    return [...map.values()].sort((a, b) => a.position - b.position);
  }, [filtered]);

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
                  className={cn("flex w-full items-center gap-2 border-l-4 bg-muted/20 px-4 py-2.5 text-left", groupColor(g.title))}>
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <span className="font-display text-sm font-semibold uppercase tracking-wide">{g.title}</span>
                  <span className="text-xs text-muted-foreground">{g.rows.length} shipment{g.rows.length === 1 ? "" : "s"}</span>
                </button>

                {!isCollapsed && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1600px] text-sm">
                      <thead>
                        <tr className="border-b border-border bg-card text-left text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                          {["Air waybill/tracking", "Accounts", "Invoice No.", "Item ID", "Yacht Name", "Monday Status", "Status",
                            "Shipment Type", "BOE No.", "Supplier", "Date Received", "Date Delivered", "DN No.", "Receiver", "Driver",
                            "Courier", "Qty", "Duty", "VAT", "EDAS", "Documents"].map((h) => (
                            <th key={h} className="px-3 py-2.5 whitespace-nowrap">{h}</th>
                          ))}
                          {mondayColumns.map((c) => <th key={c} className="px-3 py-2.5 whitespace-nowrap">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((p) => {
                          const row = mondayRow(p);
                          const docs = p.documents ?? [];
                          return (
                            <tr key={p.id} className="border-b border-border/40 hover:bg-accent/20">
                              <td className="px-3 py-2.5 font-mono text-[12px] text-foreground whitespace-nowrap">{p.barcode ?? "—"}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fromMonday(p, "account")}</td>
                              <td className="px-3 py-2.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">{fromMonday(p, "invoice")}</td>
                              <td className="px-3 py-2.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">{fromMonday(p, "item id")}</td>
                              <td className="px-3 py-2.5 font-medium whitespace-nowrap">{p.boat_name ?? "—"}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">{fromMonday(p, "status")}</span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <Select value={p.status} onValueChange={(v) => void quickStatus(p, v as PackageStatus)}>
                                  <SelectTrigger className="h-7 w-[132px] border-none bg-transparent p-0 hover:bg-accent/40">
                                    {savingCell === `${p.id}:status` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StatusBadge status={p.status} />}
                                  </SelectTrigger>
                                  <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
                                </Select>
                              </td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.trade_type ?? "—"}</td>
                              <td className="px-3 py-2.5 font-mono text-[12px] text-muted-foreground whitespace-nowrap">{p.boe_no ?? "—"}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.supplier ?? "—"}</td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{fmtDate(p.received_at)}</td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{fmtDate(p.delivered_at)}</td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{p.delivery_note_no ?? "—"}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.receiver_full_name ?? "—"}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{fromMonday(p, "driver")}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.courier ?? "—"}</td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground text-center">{p.num_packages ?? 1}</td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{p.duty ?? "—"}</td>
                              <td className="px-3 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{p.vat ?? "—"}</td>
                              <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{p.edas_required == null ? "—" : p.edas_required ? "Yes" : "No"}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {docs.length === 0 ? <span className="text-muted-foreground">—</span> : (
                                  <div className="flex flex-wrap gap-1.5">
                                    {docs.map((d, i) => (
                                      <a key={i} href={d.url} target="_blank" rel="noopener noreferrer" title={d.name}
                                        className="inline-flex max-w-[120px] items-center gap-1 truncate rounded border border-border px-1.5 py-0.5 text-[11px] text-primary hover:bg-primary/5">
                                        <FileText className="h-3 w-3 shrink-0" /> <span className="truncate">{d.name}</span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </td>
                              {mondayColumns.map((c) => (
                                <td key={c} className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{row[c] || "—"}</td>
                              ))}
                            </tr>
                          );
                        })}
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

export default ShipSyncImportBoard;
