import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Loader2, MapPin, Truck, Camera, CheckCircle2, ChevronLeft, ScanLine, Wifi, WifiOff, CloudUpload,
} from "lucide-react";
import { SignaturePad, type SignaturePadHandle } from "@/components/shipsync/driver/SignaturePad";
import { StatusBadge } from "@/components/shipsync/shared";
import { googleMapsDirectionsUrl, type ShipSyncDriver, type ShipSyncDestination, type ShipSyncPackage, type PackageStatus } from "@/lib/shipsync/model";
import { resolveDriver, listActiveDrivers, loadDriverRuns, scanOntoVan, deliverBoat, type DriverRuns } from "@/lib/shipsync/driver-data";
import { flushQueue, queueCount } from "@/lib/shipsync/offline";

const DRIVER_KEY = "shipsync.driverId";

export function DriverApp() {
  const { user } = useAuth();
  const [driver, setDriver] = useState<ShipSyncDriver | null>(null);
  const [pickList, setPickList] = useState<ShipSyncDriver[] | null>(null);
  const [runs, setRuns] = useState<DriverRuns>({ notes: [], packages: [], destinations: [] });
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [view, setView] = useState<"runs" | "boat">("runs");
  const [selectedBoat, setSelectedBoat] = useState<string | null>(null);

  // ── Register the service worker (installable + offline shell) ──────────────
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/shipsync-sw.js", { scope: "/shipsync/" }).catch(() => {});
    }
  }, []);

  // ── Resolve which driver this is ───────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const saved = localStorage.getItem(DRIVER_KEY);
      const list = await listActiveDrivers().catch(() => []);
      let d = saved ? list.find((x) => x.id === saved) ?? null : null;
      if (!d) d = await resolveDriver(user?.id ?? null, user?.email ?? null).catch(() => null);
      if (d) { setDriver(d); localStorage.setItem(DRIVER_KEY, d.id); }
      else setPickList(list);
      setLoading(false);
    })();
  }, [user?.id, user?.email]);

  const refresh = useCallback(async (id: string) => {
    setRuns(await loadDriverRuns(id));
    setQueued(await queueCount());
  }, []);

  useEffect(() => { if (driver) void refresh(driver.id); }, [driver, refresh]);

  // ── Online/offline + queue flushing ────────────────────────────────────────
  useEffect(() => {
    async function onUp() {
      setOnline(true);
      const n = await flushQueue();
      if (n > 0) { toast.success(`Synced ${n} update${n === 1 ? "" : "s"}`); if (driver) await refresh(driver.id); }
      setQueued(await queueCount());
    }
    function onDown() { setOnline(false); }
    window.addEventListener("online", onUp);
    window.addEventListener("offline", onDown);
    void onUp(); // flush anything pending on mount
    return () => { window.removeEventListener("online", onUp); window.removeEventListener("offline", onDown); };
  }, [driver, refresh]);

  function pickDriver(d: ShipSyncDriver) { localStorage.setItem(DRIVER_KEY, d.id); setDriver(d); setPickList(null); }

  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (!driver) {
    return (
      <div className="mx-auto max-w-sm px-5 py-10">
        <h1 className="font-display text-xl font-bold">Who's driving?</h1>
        <p className="mt-1 text-sm text-muted-foreground">We couldn't match your account to a driver. Pick yourself to continue.</p>
        <div className="mt-4 flex flex-col gap-2">
          {(pickList ?? []).map((d) => (
            <button key={d.id} onClick={() => pickDriver(d)} className="rounded-xl border border-border bg-card p-4 text-left text-base font-medium hover:border-primary">{d.name}</button>
          ))}
          {(pickList ?? []).length === 0 && <div className="text-sm text-muted-foreground">No drivers set up yet — ask logistics to add you.</div>}
        </div>
      </div>
    );
  }

  // Group the run's parcels into boat stops.
  const destByBoat = new Map<string, ShipSyncDestination>();
  for (const d of runs.destinations) destByBoat.set(d.boat_name.toUpperCase(), d);
  const noteById = new Map(runs.notes.map((n) => [n.id, n]));
  const boatsPerNote = new Map<string, string[]>();
  for (const n of runs.notes) {
    const bs = Array.from(new Set(runs.packages.filter((p) => p.delivery_note_id === n.id).map((p) => p.boat_name || "—"))).sort();
    boatsPerNote.set(n.id, bs);
  }
  const stopsMap = new Map<string, ShipSyncPackage[]>();
  for (const p of runs.packages) {
    const key = p.boat_name || "—";
    if (!stopsMap.has(key)) stopsMap.set(key, []);
    stopsMap.get(key)!.push(p);
  }
  const stops = Array.from(stopsMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const berth = (boat: string) => destByBoat.get(boat.toUpperCase());
  const dnRef = (boat: string, pkgs: ShipSyncPackage[]) => {
    const n = pkgs[0]?.delivery_note_id ? noteById.get(pkgs[0].delivery_note_id!) : null;
    if (!n) return "—";
    const bs = boatsPerNote.get(n.id) ?? [];
    const idx = bs.indexOf(boat);
    return `DN-${n.number}${bs.length > 1 && idx >= 0 ? `-${idx + 1}` : ""}`;
  };
  const routeUrl = googleMapsDirectionsUrl(stops.map(([boat]) => {
    const d = berth(boat);
    return { address: d?.address, lat: d?.lat, lng: d?.lng };
  }));
  const selectedPkgs = selectedBoat ? stopsMap.get(selectedBoat) ?? [] : [];

  return (
    <div className="mx-auto max-w-xl pb-24">
      {/* Status bar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <Truck className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-semibold">{driver.name}</div>
          <div className="text-[11px] text-muted-foreground">{stops.length} stop{stops.length === 1 ? "" : "s"} · {runs.packages.length} parcel{runs.packages.length === 1 ? "" : "s"}</div>
        </div>
        {queued > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"><CloudUpload className="h-3 w-3" /> {queued} queued</span>}
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${online ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>
          {online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />} {online ? "Online" : "Offline"}
        </span>
      </div>

      {view === "runs" ? (
        <div className="px-4 py-4">
          {routeUrl && stops.length > 0 && (
            <a href={routeUrl} target="_blank" rel="noopener noreferrer" className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
              <MapPin className="h-4 w-4" /> Navigate full route ({stops.length} stop{stops.length === 1 ? "" : "s"})
            </a>
          )}
          {stops.length === 0 ? (
            <div className="mt-12 text-center text-sm text-muted-foreground">No deliveries assigned to you right now.</div>
          ) : stops.map(([boat, pkgs]) => {
            const done = pkgs.filter((p) => p.driver_scanned).length;
            const d = berth(boat);
            const navUrl = googleMapsDirectionsUrl([{ address: d?.address, lat: d?.lat, lng: d?.lng }]);
            return (
              <div key={boat} className="mb-2.5 rounded-xl border border-border bg-card p-4">
                <button className="w-full text-left" onClick={() => { setSelectedBoat(boat); setView("boat"); }}>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-base font-bold">{boat === "—" ? "No boat set" : boat}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{dnRef(boat, pkgs)}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted-foreground">{done}/{pkgs.length} loaded · {d?.address || "no berth set"}</div>
                </button>
                {navUrl && (
                  <a href={navUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-primary">
                    <MapPin className="h-3.5 w-3.5" /> Navigate here
                  </a>
                )}
              </div>
            );
          })}
        </div>
      ) : selectedBoat ? (
        <BoatDetail
          boat={selectedBoat} dnRef={dnRef(selectedBoat, selectedPkgs)} berth={berth(selectedBoat)}
          packages={selectedPkgs} online={online}
          onBack={() => setView("runs")}
          onChanged={() => driver && refresh(driver.id)}
        />
      ) : null}
    </div>
  );
}

// ── One boat stop ──────────────────────────────────────────────────────────────
function BoatDetail({ boat, dnRef, berth, packages, online, onBack, onChanged }: {
  boat: string; dnRef: string; berth: ShipSyncDestination | undefined;
  packages: ShipSyncPackage[]; online: boolean; onBack: () => void; onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const navUrl = googleMapsDirectionsUrl([{ address: berth?.address, lat: berth?.lat, lng: berth?.lng }]);
  const label = boat === "—" ? "No boat set" : boat;

  async function scan(p: ShipSyncPackage) {
    setBusyId(p.id);
    try { await scanOntoVan(p); toast.success("Loaded onto van"); onChanged(); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusyId(null); }
  }

  return (
    <div className="px-4 py-3">
      <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" /> Stops</button>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">{label}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold">{dnRef}</span>
      </div>
      {navUrl && (
        <a href={navUrl} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          <MapPin className="h-4 w-4" /> Navigate to {label}
        </a>
      )}

      <div className="mt-3 flex flex-col gap-2">
        {packages.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px]">{p.barcode ?? "—"}</span>
              <StatusBadge status={p.status} />
              {p.driver_scanned && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            </div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">{p.package_owner ?? ""}{p.num_packages > 1 ? ` · ${p.num_packages} pcs` : ""}</div>
            {!p.driver_scanned && (
              <Button size="sm" variant="outline" className="mt-2 h-9 w-full gap-1.5" onClick={() => scan(p)} disabled={busyId === p.id}>
                {busyId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Load onto van
              </Button>
            )}
          </div>
        ))}
        {packages.length === 0 && <div className="py-8 text-center text-sm text-muted-foreground">No parcels for this boat.</div>}
      </div>

      {packages.length > 0 && (
        <Button className="mt-4 h-12 w-full gap-2 text-base" onClick={() => setSigning(true)}>
          <CheckCircle2 className="h-5 w-5" /> Deliver &amp; sign
        </Button>
      )}

      {signing && (
        <SignSheet boat={label} packages={packages} online={online}
          onClose={() => setSigning(false)} onDone={() => { setSigning(false); onChanged(); }} />
      )}
    </div>
  );
}

// ── Deliver & sign the whole boat's note (one customer signature) ───────────────
function SignSheet({ boat, packages, online, onClose, onDone }: {
  boat: string; packages: ShipSyncPackage[]; online: boolean; onClose: () => void; onDone: () => void;
}) {
  const [status, setStatus] = useState<"delivered" | "collected" | "refused">("delivered");
  const [selected, setSelected] = useState<Set<string>>(new Set(packages.map((p) => p.id)));
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sigRef = useRef<SignaturePadHandle>(null);

  const chosen = packages.filter((p) => selected.has(p.id));
  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function submit() {
    if (chosen.length === 0) { toast.error("Select at least one parcel"); return; }
    setBusy(true);
    try {
      const signature = await sigRef.current?.toBlob() ?? null;
      await deliverBoat(chosen, {
        status: status as PackageStatus as any,
        receiverName: name.trim() || undefined,
        receiverDesignation: designation.trim() || undefined,
        receiverEmail: email.trim() || undefined,
        photo, signature,
      });
      toast.success(online ? `${boat} delivered` : "Saved — will sync when back online");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Deliver &amp; sign — {boat}</DialogTitle></DialogHeader>
        <div className="grid gap-3 py-1">
          <div className="rounded-lg border border-border">
            {packages.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2.5 border-b border-border/50 px-3 py-2 text-sm last:border-b-0">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-primary" />
                <span className="font-mono text-[13px]">{p.barcode ?? "—"}</span>
                <span className="ml-auto text-[12px] text-muted-foreground">{p.package_owner ?? ""}</span>
              </label>
            ))}
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Outcome</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="collected">Collected by client</SelectItem>
                <SelectItem value="refused">Refused</SelectItem>
              </SelectContent></Select></div>
          <div className="space-y-1.5"><Label className="text-xs">Received by (name)</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5"><Label className="text-xs">Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} className="h-10" /></div>
            <div className="space-y-1.5"><Label className="text-xs">Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" /></div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Photo</Label>
            <div className="flex items-center gap-3">
              {photo && <img src={URL.createObjectURL(photo)} alt="" className="h-16 w-16 rounded object-cover border border-border" />}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => fileRef.current?.click()}><Camera className="h-4 w-4" /> {photo ? "Retake" : "Take photo"}</Button>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Customer signature</Label><SignaturePad ref={sigRef} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm delivery ({chosen.length})</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DriverApp;
