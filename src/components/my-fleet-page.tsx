import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFleetAisPositions, doSyncAis, type AisYacht } from "@/lib/aisstream.server";
import { Radar, RefreshCw, Loader2, Search, Info, Navigation, Anchor } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Client-only Leaflet map (touches window → must not render during SSR).
const AisFleetMap = lazy(() => import("@/components/ais-fleet-map"));

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export function MyFleetPage() {
  const [yachts, setYachts] = useState<AisYacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<{ id: string; lat: number; lon: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const fitOnce = useRef(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    try {
      const res = await (getFleetAisPositions as any)() as { yachts: AisYacht[]; fetchedAt: string };
      setYachts(res.yachts);
      setFetchedAt(res.fetchedAt);
    } catch {
      /* keep last known */
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    setSyncing(true);
    try {
      const r = await (doSyncAis as any)() as { tracked: number; received: number; updated: number; invalidMmsi?: number; note?: string };
      if (r.note) toast.message(r.note);
      else {
        const suffix = r.invalidMmsi ? ` · ${r.invalidMmsi} skipped (bad MMSI)` : "";
        toast.success(`Updated ${r.updated} of ${r.tracked} vessels (${r.received} reporting)${suffix}.`);
      }
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "AIS sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const located = useMemo(() => yachts.filter(y => y.lat != null && y.lon != null), [yachts]);
  const withMmsi = useMemo(() => yachts.filter(y => y.mmsi), [yachts]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term ? located.filter(y => y.vessel_name.toLowerCase().includes(term) || (y.mmsi ?? "").includes(term)) : located;
    return [...list].sort((a, b) => a.vessel_name.localeCompare(b.vessel_name));
  }, [located, q]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border/70 bg-card/30 px-6 py-3.5">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Vessel Tracking</div>
          <h1 className="mt-0.5 flex items-center gap-2 font-display text-[1.25rem] font-semibold tracking-tight">
            <Radar className="h-4 w-4 text-primary/80" /> My Fleet (Live)
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground/60 sm:inline">
            {located.length} positioned · {withMmsi.length} with MMSI · updated {fmtTime(fetchedAt)}
          </span>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => void syncNow()} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            {syncing ? "Syncing…" : "Sync positions"}
          </Button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* Vessel list */}
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border/60 bg-card/20 md:flex">
          <div className="border-b border-border/50 p-2.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search vessels…" className="h-8 pl-8 text-xs" />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground/60">No vessels reporting a position yet.</p>
            ) : filtered.map(y => (
              <button
                key={y.id}
                onClick={() => setFocus({ id: y.id, lat: y.lat!, lon: y.lon! })}
                className="flex w-full items-center gap-2 border-b border-border/30 px-3 py-2 text-left transition hover:bg-muted/40"
              >
                {(y.speed ?? 0) > 0.5
                  ? <Navigation className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                  : <Anchor className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{y.vessel_name}</span>
                  <span className="block truncate text-[10.5px] text-muted-foreground/60">
                    {y.speed != null ? `${y.speed.toFixed(1)} kn` : "—"} · {fmtTime(y.positionAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Map */}
        <div className="relative min-h-0 flex-1">
          {(loading || !mounted) && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background">
              <Loader2 className="h-6 w-6 animate-spin text-primary/70" />
              <p className="text-sm text-muted-foreground">Loading vessel positions…</p>
            </div>
          )}
          {mounted && (
            <Suspense fallback={null}>
              <AisFleetMap yachts={located} focus={focus} fitOnce={fitOnce} />
            </Suspense>
          )}
          {mounted && !loading && located.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
              <div className="pointer-events-auto max-w-sm rounded-lg border border-border bg-card/95 px-5 py-4 text-center shadow-lg">
                <p className="text-sm font-medium">No live positions yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Click <span className="font-medium">Sync positions</span> to pull from AISStream. Only vessels with an MMSI
                  that are within terrestrial AIS range (near port/coast) will report.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-border/40 bg-muted/10 px-6 py-2">
        <Info className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span className="text-[11px] text-muted-foreground/60">
          Live AIS via MyShipTracking. Positions refresh automatically every hour (destination &amp; ETA every 6&nbsp;hours);
          vessels without a valid MMSI or IMO on their record can't be tracked.
        </span>
      </div>
    </div>
  );
}
