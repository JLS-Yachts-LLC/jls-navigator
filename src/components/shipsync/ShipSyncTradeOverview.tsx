/**
 * ShipSync Dashboard — Import / Transit / Export at a glance.
 *
 *   Import and Transit   how many shipments (and how many pieces) are not yet delivered, and how many are
 *   Incoming             the not-yet-delivered ones, soonest ETA first: client, type, AWB, ETA
 *   Export               total shipments, how many are open, and the open ones by ETD: client, AWB, ETD
 *
 * ETA and ETD are typed into the Import and Export boards (Monday has neither), so a shipment without one sits at the
 * bottom of its list until somebody sets it.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/components/shipsync/shared";
import { loadImportPackages, loadExportPackages } from "@/lib/shipsync/data";
import {
  tradeTotals, incomingShipments, exportTotals, upcomingExports, type TradeRow, type Tally,
} from "@/lib/shipsync/trade-summary";

const SHOWN = 12;

function Tile({ label, tally, tone }: { label: string; tally: Tally; tone?: "warn" | "ok" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-bold tabular-nums", tone === "warn" && "text-amber-500", tone === "ok" && "text-emerald-500")}>
        {tally.shipments.toLocaleString()}
      </div>
      <div className="text-[12px] text-muted-foreground">{tally.qty.toLocaleString()} piece{tally.qty === 1 ? "" : "s"}</div>
    </div>
  );
}

function ListCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      {note && <div className="mb-3 text-[12px] text-muted-foreground">{note}</div>}
      {children}
    </div>
  );
}

const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const td = "px-2 py-1.5 text-[13px]";

function DateCell({ value }: { value: string | null }) {
  return value ? <span>{fmtDate(value)}</span> : <span className="text-muted-foreground/60">Not set</span>;
}

export function ShipSyncTradeOverview() {
  const [imports, setImports] = useState<TradeRow[] | null>(null);
  const [exports, setExports] = useState<TradeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllIn, setShowAllIn] = useState(false);
  const [showAllOut, setShowAllOut] = useState(false);

  useEffect(() => {
    let on = true;
    Promise.all([loadImportPackages(), loadExportPackages()])
      .then(([i, e]) => { if (on) { setImports(i as TradeRow[]); setExports(e as TradeRow[]); } })
      .catch((e) => { if (on) setError(e?.message ?? "Could not load the Import and Export boards"); });
    return () => { on = false; };
  }, []);

  const totals = useMemo(() => (imports ? tradeTotals(imports) : null), [imports]);
  const incoming = useMemo(() => (imports ? incomingShipments(imports) : []), [imports]);
  const out = useMemo(() => (exports ? exportTotals(exports) : null), [exports]);
  const upcoming = useMemo(() => (exports ? upcomingExports(exports) : []), [exports]);

  if (error) return <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{error}</div>;
  if (!totals || !out) return <div className="mb-5 flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const noEta = incoming.filter((r) => !r.eta).length;
  const noEtd = upcoming.filter((r) => !r.etd).length;
  const inRows = showAllIn ? incoming : incoming.slice(0, SHOWN);
  const outRows = showAllOut ? upcoming : upcoming.slice(0, SHOWN);

  return (
    <div className="mb-5 space-y-4">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Import and Transit</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Import — not yet delivered" tally={totals.Import.pending} tone="warn" />
          <Tile label="Import — delivered" tally={totals.Import.delivered} tone="ok" />
          <Tile label="Transit — not yet delivered" tally={totals.Transit.pending} tone="warn" />
          <Tile label="Transit — delivered" tally={totals.Transit.delivered} tone="ok" />
        </div>
      </div>

      <ListCard title={`Incoming Import and Transit (${incoming.length})`}
        note={noEta ? `${noEta} ha${noEta === 1 ? "s" : "ve"} no ETA yet — set it on the Import board's ETA column.` : "Not yet delivered, soonest ETA first."}>
        {incoming.length === 0 ? <div className="text-sm text-muted-foreground">Nothing incoming right now.</div> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className={th}>Client</th><th className={th}>Type</th><th className={th}>AWB</th><th className={th}>ETA</th><th className={th}>Status</th></tr></thead>
                <tbody className="divide-y divide-border/50">
                  {inRows.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>{r.client}</td>
                      <td className={td}>{r.kind}</td>
                      <td className={cn(td, "font-mono")}>{r.awb || "—"}</td>
                      <td className={td}><DateCell value={r.eta} /></td>
                      <td className={cn(td, "text-muted-foreground")}>{r.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {incoming.length > SHOWN && (
              <button type="button" onClick={() => setShowAllIn((v) => !v)} className="mt-2 text-[12px] font-medium text-primary hover:underline">
                {showAllIn ? "Show fewer" : `Show all ${incoming.length}`}
              </button>
            )}
          </>
        )}
      </ListCard>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Export</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Total export shipments" tally={{ shipments: out.total, qty: out.qty }} />
          <Tile label="Still open" tally={{ shipments: out.open, qty: out.openQty }} tone="warn" />
          <Tile label="Completed" tally={{ shipments: out.completed, qty: out.qty - out.openQty }} tone="ok" />
        </div>
      </div>

      <ListCard title={`Open export shipments (${upcoming.length})`}
        note={noEtd ? `${noEtd} ha${noEtd === 1 ? "s" : "ve"} no ETD yet — set it on the Export board's ETD column.` : "Soonest ETD first."}>
        {upcoming.length === 0 ? <div className="text-sm text-muted-foreground">No open export shipments.</div> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead><tr><th className={th}>Client</th><th className={th}>AWB</th><th className={th}>ETD</th><th className={th}>Status</th></tr></thead>
                <tbody className="divide-y divide-border/50">
                  {outRows.map((r) => (
                    <tr key={r.id}>
                      <td className={td}>{r.client}</td>
                      <td className={cn(td, "font-mono")}>{r.awb || "—"}</td>
                      <td className={td}><DateCell value={r.etd} /></td>
                      <td className={cn(td, "text-muted-foreground")}>{r.status || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {upcoming.length > SHOWN && (
              <button type="button" onClick={() => setShowAllOut((v) => !v)} className="mt-2 text-[12px] font-medium text-primary hover:underline">
                {showAllOut ? "Show fewer" : `Show all ${upcoming.length}`}
              </button>
            )}
          </>
        )}
      </ListCard>
    </div>
  );
}
