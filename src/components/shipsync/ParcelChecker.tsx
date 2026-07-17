import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ScanLine, Search, PackageSearch, MapPin } from "lucide-react";
import { BarcodeScannerDialog } from "@/components/shipsync/BarcodeScanner";
import { StatusBadge, fmtDate } from "@/components/shipsync/shared";
import { STATUS_META, type ShipSyncPackage } from "@/lib/shipsync/model";

const db = supabase as any;

/**
 * Parcel Checker — mirrors the PowerApps "Parcel Checker" screen: scan (camera or
 * handheld) or type a barcode / air-waybill and instantly see that parcel's
 * status, boat, owner, courier, warehouse zone, delivery note and dates.
 */
export function ParcelChecker() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [results, setResults] = useState<ShipSyncPackage[] | null>(null);
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});
  const [noteNumbers, setNoteNumbers] = useState<Record<string, string>>({});

  async function lookup(raw: string) {
    const q = raw.trim();
    if (!q) return;
    setLoading(true); setResults(null);
    try {
      const { data } = await db.from("shipsync_packages")
        .select("*")
        .or(`barcode.ilike.%${q}%,boat_name.ilike.%${q}%,package_owner.ilike.%${q}%`)
        .order("received_at", { ascending: false })
        .limit(25);
      const rows = (data ?? []) as ShipSyncPackage[];
      setResults(rows);
      // Resolve driver + delivery-note labels for the matches.
      const driverIds = [...new Set(rows.map((r) => r.driver_id).filter(Boolean))] as string[];
      const noteIds = [...new Set(rows.map((r) => r.delivery_note_id).filter(Boolean))] as string[];
      if (driverIds.length) {
        const { data: d } = await db.from("shipsync_drivers").select("id, name").in("id", driverIds);
        setDriverNames(Object.fromEntries((d ?? []).map((x: any) => [x.id, x.name])));
      }
      if (noteIds.length) {
        const { data: n } = await db.from("shipsync_delivery_notes").select("id, number").in("id", noteIds);
        setNoteNumbers(Object.fromEntries((n ?? []).map((x: any) => [x.id, x.number])));
      }
    } finally { setLoading(false); }
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-5">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 font-display text-lg font-bold"><PackageSearch className="h-5 w-5 text-primary" /> Parcel Checker</h1>
        <p className="mt-1 text-sm text-muted-foreground">Scan or type a barcode / air-waybill to find a parcel and its status.</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void lookup(code); }}
            placeholder="Barcode, boat or owner…"
            className="h-11 pl-9"
            autoFocus
          />
        </div>
        <Button variant="outline" className="h-11 gap-1.5" onClick={() => setScanOpen(true)}><ScanLine className="h-4 w-4" /> Scan</Button>
        <Button className="h-11" onClick={() => void lookup(code)} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find"}</Button>
      </div>

      {results && (
        <div className="mt-4 space-y-2">
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">No parcels match “{code.trim()}”.</div>
          ) : results.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm">{p.barcode ?? "—"}</span>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-1 font-display text-base font-semibold">{p.boat_name ?? "No boat set"}</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Field label="Owner" value={p.package_owner} />
                <Field label="Courier" value={p.courier} />
                <Field label="Packages" value={String(p.num_packages ?? 1)} />
                <Field label="Zone" value={p.warehouse_zone} />
                <Field label="Delivery note" value={p.delivery_note_id ? `DN-${noteNumbers[p.delivery_note_id] ?? "…"}` : null} />
                <Field label="Driver" value={p.driver_id ? driverNames[p.driver_id] ?? "…" : null} />
                <Field label="Status" value={STATUS_META[p.status]?.label ?? p.status} />
                <Field label="Received" value={p.received_at ? fmtDate(p.received_at) : null} />
                <Field label="Planned" value={p.planned_delivery_date ? fmtDate(p.planned_delivery_date) : null} />
                <Field label="Delivered" value={p.delivered_at ? fmtDate(p.delivered_at) : null} />
              </div>
              {p.description && <div className="mt-2 border-t border-border/40 pt-2 text-xs text-muted-foreground">{p.description}</div>}
            </div>
          ))}
        </div>
      )}

      <BarcodeScannerDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(v) => { setScanOpen(false); setCode(v); void lookup(v); }}
        title="Scan a parcel"
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</div>
      <div className="truncate">{value || "—"}</div>
    </div>
  );
}
