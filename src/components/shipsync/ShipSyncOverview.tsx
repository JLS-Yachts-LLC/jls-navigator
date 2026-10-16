/**
 * ShipSync Overview — the first thing people see when they open Logistics.
 *
 * A plain-language summary for people who don't work in logistics: what is coming in, what is going out, what is waiting, and
 * the yachts being shipped. No graphs and no jargon; the Dashboard tab keeps the charts and the working detail.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { fmtDate } from "@/components/shipsync/shared";
import { loadImportPackages, loadExportPackages } from "@/lib/shipsync/data";
import type { ShipSyncPackage } from "@/lib/shipsync/model";
import {
  tradeTotals, arrivingShipments, exportTotals, upcomingExports, isRoutable, type TradeRow,
} from "@/lib/shipsync/trade-summary";
import { yachtOverviewRows, type YachtOverviewRow, type YachtShipmentRow } from "@/lib/shipsync/yacht-overview";
import { IncomingList, OpenExportList, ListCard, Tile, th, td } from "@/components/shipsync/ShipSyncTradeOverview";
import type { ShipSyncData } from "@/components/shipsync-page";

const pieces = (rows: ShipSyncPackage[]) => rows.reduce((n, p) => n + (p.num_packages ?? 1), 0);

/** The yachts being shipped: client, length, where from, where to, and the date. */
function YachtList({ title, rows, dateLabel, empty }: { title: string; rows: YachtOverviewRow[]; dateLabel: "ETA" | "ETD"; empty: string }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? rows : rows.slice(0, 12);
  return (
    <ListCard title={`${title} (${rows.length})`} note={`Shipments that are not yet complete, soonest ${dateLabel} first.`}>
      {rows.length === 0 ? <div className="text-sm text-muted-foreground">{empty}</div> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>Client</th><th className={th}>LOA</th><th className={th}>POL</th><th className={th}>POD</th>
                  <th className={th}>{dateLabel}</th><th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {shown.map((r, i) => (
                  <tr key={`${r.client}-${i}`}>
                    <td className={`${td} font-medium`}>{r.client}</td>
                    <td className={td}>{r.loa || <span className="text-muted-foreground/60">—</span>}</td>
                    <td className={td}>{r.pol || <span className="text-muted-foreground/60">—</span>}</td>
                    <td className={td}>{r.pod || <span className="text-muted-foreground/60">—</span>}</td>
                    <td className={td}>{r.date ? fmtDate(r.date) : <span className="text-muted-foreground/60">Not set</span>}</td>
                    <td className={`${td} text-muted-foreground`}>{r.status || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 12 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-[12px] font-medium text-primary hover:underline">
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </ListCard>
  );
}

export function ShipSyncOverview({ data }: { data: ShipSyncData }) {
  const [boards, setBoards] = useState<{ imports: ShipSyncPackage[]; exports: ShipSyncPackage[] } | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [yachts, setYachts] = useState<YachtShipmentRow[] | null>(null);
  const [yachtError, setYachtError] = useState<string | null>(null);

  useEffect(() => {
    let on = true;
    Promise.all([loadImportPackages(), loadExportPackages()])
      .then(([imports, exports]) => { if (on) setBoards({ imports, exports }); })
      .catch((e) => { if (on) setBoardError(e?.message ?? "Could not load the shipments"); });
    // Separate from the above, so one failing doesn't hide the other.
    void (async () => {
      const { data: rows, error } = await fetchAllRows(() => (supabase as any).from("yacht_shipments").select("direction, yacht_name, loa, pol, arrival_port, eta, status").order("created_at"));
      if (!on) return;
      if (error) setYachtError((error as any).message ?? "Could not load the yacht shipments");
      else setYachts((rows ?? []) as YachtShipmentRow[]);
    })();
    return () => { on = false; };
  }, []);

  const totals = useMemo(() => (boards ? tradeTotals(boards.imports as TradeRow[]) : null), [boards]);
  const incoming = useMemo(() => (boards ? arrivingShipments(boards.imports as TradeRow[]) : []), [boards]);
  const out = useMemo(() => (boards ? exportTotals(boards.exports as TradeRow[]) : null), [boards]);
  const upcoming = useMemo(() => (boards ? upcomingExports(boards.exports as TradeRow[]) : []), [boards]);
  const waiting = useMemo(() => data.deliverable.filter(isRoutable), [data.deliverable]);
  const onTheRoad = useMemo(() => data.deliverable.filter((p) => p.status === "assigned" || p.status === "out_for_delivery"), [data.deliverable]);
  const yachtImports = useMemo(() => (yachts ? yachtOverviewRows(yachts, "import") : []), [yachts]);
  const yachtExports = useMemo(() => (yachts ? yachtOverviewRows(yachts, "export") : []), [yachts]);

  return (
    <div className="space-y-5 px-6 py-5">
      <div>
        <h2 className="font-display text-[1.35rem] font-semibold leading-tight">Overview</h2>
        <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">
          What is coming in, what is going out and what is waiting. The Dashboard tab has the charts and the working detail.
        </p>
      </div>

      {boardError ? <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{boardError}</div>
        : !totals || !out ? <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Tile label="Imports on the way or in the office" tally={totals.Import.pending} tone="warn" />
              <Tile label="Transit shipments not yet delivered" tally={totals.Transit.pending} tone="warn" />
              <Tile label="Exports still open" tally={{ shipments: out.open, qty: out.openQty }} tone="warn" />
              <Tile label="Parcels waiting to go out" tally={{ shipments: waiting.length, qty: pieces(waiting) }} />
              <Tile label="Parcels out for delivery" tally={{ shipments: onTheRoad.length, qty: pieces(onTheRoad) }} tone="ok" />
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <IncomingList incoming={incoming} limit={10} />
              <OpenExportList upcoming={upcoming} limit={10} />
            </div>
          </>
        )}

      {yachtError ? <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{yachtError}</div>
        : !yachts ? <div className="flex h-16 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <YachtList title="Yacht import shipments" rows={yachtImports} dateLabel="ETA" empty="No yacht import shipments right now." />
            <YachtList title="Yacht export shipments" rows={yachtExports} dateLabel="ETD" empty="No yacht export shipments right now." />
          </div>
        )}
    </div>
  );
}
