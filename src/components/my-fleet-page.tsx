import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getFleetAisPositions, doSyncAis, type AisYacht } from "@/lib/aisstream.server";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Radar, RefreshCw, Loader2, Search, Info, Navigation, Anchor } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Client-only Leaflet map (touches window → must not render during SSR).
const AisFleetMap = lazy(() => import("@/components/ais-fleet-map"));

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export function MyFleetPage({ focusYachtId }: { focusYachtId?: string | null } = {}) {
  const [yachts, setYachts] = useState<AisYacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState<{ id: string; lat: number; lon: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [fixerOpen, setFixerOpen] = useState(false);
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

  // Deep-focus from the yacht detail's "view on map" button.
  const focusApplied = useRef<string | null>(null);
  useEffect(() => {
    if (!focusYachtId || focusApplied.current === focusYachtId || loading) return;
    const y = yachts.find(v => v.id === focusYachtId);
    if (!y) return;
    focusApplied.current = focusYachtId;
    if (y.lat != null && y.lon != null) setFocus({ id: y.id, lat: y.lat, lon: y.lon });
    else toast.message(`${y.vessel_name} has no live position yet`);
  }, [focusYachtId, yachts, loading]);

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
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => setFixerOpen(true)}>
            <Search className="h-3.5 w-3.5" /> Fix untracked
          </Button>
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => void syncNow()} disabled={syncing}>
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
            {syncing ? "Syncing…" : "Sync positions"}
          </Button>
        </div>
      </header>

      {fixerOpen && <UntrackedVesselsFixer onClose={() => { setFixerOpen(false); void load(); }} />}

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

// ── Untracked vessels fixer — suggest & approve MMSI/IMO via MyShipTracking ──
type MmsiCandidate = { name: string; mmsi: string | null; imo: string | null; type: string | null; flag: string | null; area: string | null };

function UntrackedVesselsFixer({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; vessel_name: string; mmsi: string | null; imo_no: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<MmsiCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any)
        .from("yachts").select("id, vessel_name, mmsi, imo_no")
        .eq("archive", false).order("vessel_name");
      // Untracked = no valid 9-digit MMSI on the record.
      setRows((data ?? []).filter((y: any) => !/^\d{9}$/.test((y.mmsi ?? "").trim())));
      setLoading(false);
    })();
  }, []);

  async function search(yacht: { id: string; vessel_name: string }) {
    setOpenId(yacht.id); setCandidates([]); setSearching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/vessels/mmsi-suggest?q=${encodeURIComponent(yacht.vessel_name)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? "Search failed");
      setCandidates(j.candidates ?? []);
      if (!(j.candidates ?? []).length) toast.message("No vessels matched that name on AIS");
    } catch (e: any) { toast.error(String(e?.message ?? e)); setOpenId(null); }
    finally { setSearching(false); }
  }

  async function apply(yachtId: string, c: MmsiCandidate) {
    if (!c.mmsi) return;
    setApplying(c.mmsi);
    try {
      const patch: Record<string, any> = { mmsi: c.mmsi, updated_at: new Date().toISOString() };
      const row = rows.find((r) => r.id === yachtId);
      if (c.imo && !/^\d{7}$/.test((row?.imo_no ?? "").trim())) patch.imo_no = c.imo;
      const { error } = await (supabase as any).from("yachts").update(patch).eq("id", yachtId);
      if (error) throw error;
      toast.success(`MMSI set — ${row?.vessel_name} joins the live map on the next hourly sync`);
      setRows((all) => all.filter((r) => r.id !== yachtId));
      setOpenId(null);
    } catch (e: any) { toast.error(String(e?.message ?? e)); }
    finally { setApplying(null); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Radar className="h-4 w-4 text-primary" /> Untracked vessels ({rows.length})</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          These yachts have no valid MMSI, so they can't be tracked. Search AIS by name, then approve the right match —
          the MMSI (and IMO where known) is saved to the yacht and it appears on the live map within the hour.
          Each search uses 1 MyShipTracking credit.
        </p>
        {loading ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Every active yacht has a valid MMSI. 🎉</div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((y) => (
              <div key={y.id} className="rounded-lg border border-border/60 bg-muted/10">
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{y.vessel_name}</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      MMSI: {y.mmsi?.trim() || "—"} · IMO: {y.imo_no?.trim() || "—"}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"
                    disabled={searching && openId === y.id}
                    onClick={() => void search(y)}>
                    {searching && openId === y.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                    Find
                  </Button>
                </div>
                {openId === y.id && !searching && candidates.length > 0 && (
                  <div className="space-y-1 border-t border-border/50 px-3 py-2">
                    {candidates.slice(0, 8).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-md bg-background/60 px-2 py-1.5 text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">{c.name}</span>
                          <span className="ml-2 text-muted-foreground">
                            MMSI {c.mmsi ?? "—"}{c.imo ? ` · IMO ${c.imo}` : ""}{c.type ? ` · ${c.type}` : ""}{c.flag ? ` · ${c.flag}` : ""}{c.area ? ` · ${c.area}` : ""}
                          </span>
                        </div>
                        <Button size="sm" className="h-6 px-2 text-[11px]" disabled={!c.mmsi || applying === c.mmsi}
                          onClick={() => void apply(y.id, c)}>
                          {applying === c.mmsi ? <Loader2 className="h-3 w-3 animate-spin" /> : "Use"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
