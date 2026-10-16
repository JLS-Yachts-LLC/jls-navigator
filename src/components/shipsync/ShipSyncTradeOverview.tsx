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
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { fmtDate, PeriodBarChart } from "@/components/shipsync/shared";
import type { ShipSyncPackage } from "@/lib/shipsync/model";
import {
  tradeTotals, arrivingShipments, exportTotals, upcomingExports, tradeKind, progressOf,
  type TradeRow, type Tally, type IncomingRow, type UpcomingExport,
} from "@/lib/shipsync/trade-summary";

const SHOWN = 12;

export function Tile({ label, tally, tone }: { label: string; tally: Tally; tone?: "warn" | "ok" }) {
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

export function ListCard({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      {note && <div className="mb-3 text-[12px] text-muted-foreground">{note}</div>}
      {children}
    </div>
  );
}

export const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
export const td = "px-2 py-1.5 text-[13px]";

export function DateCell({ value }: { value: string | null }) {
  return value ? <span>{fmtDate(value)}</span> : <span className="text-muted-foreground/60">Not set</span>;
}

/** Not-yet-delivered Import and Transit shipments, soonest ETA first. Narrow on purpose: five short columns read best close together. */
export function IncomingList({ incoming, limit = SHOWN }: { incoming: IncomingRow[]; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const noEta = incoming.filter((r) => !r.eta).length;
  const rows = showAll ? incoming : incoming.slice(0, limit);
  return (
    <ListCard title={`Incoming Import and Transit (${incoming.length})`}
      note={noEta ? `${noEta} ha${noEta === 1 ? "s" : "ve"} no ETA yet — set it on the Import board's ETA column.` : "Still on their way here, soonest ETA first."}>
      {incoming.length === 0 ? <div className="text-sm text-muted-foreground">Nothing incoming right now.</div> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl">
              <thead><tr><th className={th}>Client</th><th className={th}>Type</th><th className={th}>AWB</th><th className={th}>ETA</th></tr></thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={td}>{r.client}</td>
                    <td className={td}>{r.kind}</td>
                    <td className={cn(td, "font-mono")}>{r.awb || "—"}</td>
                    <td className={td}><DateCell value={r.eta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {incoming.length > limit && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[12px] font-medium text-primary hover:underline">
              {showAll ? "Show fewer" : `Show all ${incoming.length}`}
            </button>
          )}
        </>
      )}
    </ListCard>
  );
}

/** Export shipments that are still open, soonest ETD first. */
export function OpenExportList({ upcoming, limit = SHOWN }: { upcoming: UpcomingExport[]; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const noEtd = upcoming.filter((r) => !r.etd).length;
  const rows = showAll ? upcoming : upcoming.slice(0, limit);
  return (
    <ListCard title={`Open export shipments (${upcoming.length})`}
      note={noEtd ? `${noEtd} ha${noEtd === 1 ? "s" : "ve"} no ETD yet — set it on the Export board's ETD column.` : "Soonest ETD first."}>
      {upcoming.length === 0 ? <div className="text-sm text-muted-foreground">No open export shipments.</div> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl">
              <thead><tr><th className={th}>Client</th><th className={th}>AWB</th><th className={th}>ETD</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-border/50">
                {rows.map((r) => (
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
          {upcoming.length > limit && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[12px] font-medium text-primary hover:underline">
              {showAll ? "Show fewer" : `Show all ${upcoming.length}`}
            </button>
          )}
        </>
      )}
    </ListCard>
  );
}

export function ShipSyncTradeOverview({ imports, exports, locals }: { imports: ShipSyncPackage[]; exports: ShipSyncPackage[]; locals: ShipSyncPackage[] }) {
  const totals = useMemo(() => tradeTotals(imports as TradeRow[]), [imports]);
  const incoming = useMemo(() => arrivingShipments(imports as TradeRow[]), [imports]);
  const out = useMemo(() => exportTotals(exports as TradeRow[]), [exports]);
  const upcoming = useMemo(() => upcomingExports(exports as TradeRow[]), [exports]);
  // The graphs count what arrived, so a cancelled shipment (which never did) is left out.
  const live = (rows: ShipSyncPackage[]) => rows.filter((p) => progressOf(p as TradeRow) !== "cancelled");
  const importOnly = useMemo(() => live(imports).filter((p) => tradeKind(p as TradeRow) === "Import"), [imports]);
  const transitOnly = useMemo(() => live(imports).filter((p) => tradeKind(p as TradeRow) === "Transit"), [imports]);
  const exportLive = useMemo(() => live(exports), [exports]);

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

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Export</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Total export shipments" tally={{ shipments: out.total, qty: out.qty }} />
          <Tile label="Still open" tally={{ shipments: out.open, qty: out.openQty }} tone="warn" />
          <Tile label="Completed" tally={{ shipments: out.completed, qty: out.qty - out.openQty }} tone="ok" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PeriodBarChart title="Import shipments" rows={importOnly} hint="by date received" />
        <PeriodBarChart title="Transit shipments" rows={transitOnly} hint="by date received" />
        <PeriodBarChart title="Local packages" rows={locals} hint="by date received" />
        <PeriodBarChart title="Export shipments" rows={exportLive} hint="by requested date" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <IncomingList incoming={incoming} />
        <OpenExportList upcoming={upcoming} />
      </div>
    </div>
  );
}
