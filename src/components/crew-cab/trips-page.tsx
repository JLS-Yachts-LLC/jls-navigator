import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Loader2, Route, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";

type TripType = "crew_pickup" | "inhouse";
type TripStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";

type SavedLocation = { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null };
type Driver = { id: string; full_name: string };
type Vehicle = { id: string; make: string; model: string; registration: string | null };
type Yacht = { id: string; vessel_name: string };

type Trip = {
  id: string;
  trip_type: TripType;
  passenger_name: string | null;
  yacht_id: string | null;
  pickup_location_id: string | null;
  pickup_address: string | null;
  dropoff_location_id: string | null;
  dropoff_address: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  driver_id: string | null;
  vehicle_id: string | null;
  status: TripStatus;
  notes: string | null;
  driver?: { full_name: string } | null;
  vehicle?: { make: string; model: string; registration: string | null } | null;
  pickup_loc?: { name: string; latitude: number | null; longitude: number | null } | null;
  dropoff_loc?: { name: string; latitude: number | null; longitude: number | null } | null;
  yacht?: { vessel_name: string } | null;
};

const EMPTY_FORM = {
  trip_type: "crew_pickup" as TripType,
  passenger_name: "",
  yacht_id: "__none",
  pickup_location_id: "__none",
  pickup_address: "",
  dropoff_location_id: "__none",
  dropoff_address: "",
  pickup_datetime: "",
  dropoff_datetime: "",
  driver_id: "__none",
  vehicle_id: "__none",
  status: "pending" as TripStatus,
  notes: "",
};

const TYPE_LABEL: Record<TripType, string> = { crew_pickup: "Crew Pickup", inhouse: "In-House" };
const TYPE_COLOR: Record<TripType, string> = { crew_pickup: "bg-blue-500/15 text-blue-400", inhouse: "bg-purple-500/15 text-purple-400" };
const STATUS_LABEL: Record<TripStatus, string> = { pending: "Pending", confirmed: "Confirmed", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLOR: Record<TripStatus, string> = { pending: "bg-muted text-muted-foreground", confirmed: "bg-blue-500/15 text-blue-400", in_progress: "bg-amber-500/15 text-amber-400", completed: "bg-emerald-500/15 text-emerald-400", cancelled: "bg-red-500/15 text-red-400" };

function TypeBadge({ type }: { type: TripType }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[type]}`}>{TYPE_LABEL[type]}</span>;
}
function StatusBadge({ status }: { status: TripStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>;
}
function fmtDt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function RouteMap({ pickupLat, pickupLng, dropLat, dropLng }: { pickupLat: number; pickupLng: number; dropLat: number; dropLng: number }) {
  const midLat = ((pickupLat + dropLat) / 2).toFixed(5);
  const midLng = ((pickupLng + dropLng) / 2).toFixed(5);
  const src = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${pickupLat}%2C${pickupLng}%3B${dropLat}%2C${dropLng}#map=11/${midLat}/${midLng}`;
  return (
    <iframe
      key={src}
      src={src}
      title="Route Preview"
      className="w-full h-full rounded-lg border border-border"
      style={{ minHeight: 300 }}
      loading="lazy"
    />
  );
}

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | TripType>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [tripsRes, locsRes, driversRes, vehiclesRes, yachtsRes] = await Promise.all([
      (supabase as any).from("crew_trips").select(`*, driver:crew_drivers(full_name), vehicle:crew_vehicles(make,model,registration), pickup_loc:crew_locations!pickup_location_id(name,latitude,longitude), dropoff_loc:crew_locations!dropoff_location_id(name,latitude,longitude), yacht:yachts(vessel_name)`).order("pickup_datetime", { ascending: false }),
      (supabase as any).from("crew_locations").select("id,name,address,latitude,longitude").order("name"),
      (supabase as any).from("crew_drivers").select("id,full_name").eq("status","active").order("full_name"),
      (supabase as any).from("crew_vehicles").select("id,make,model,registration").eq("status","available").order("make"),
      (supabase as any).from("yachts").select("id,vessel_name").order("vessel_name"),
    ]);
    if (tripsRes.error) toast.error(tripsRes.error.message); else setTrips(tripsRes.data as Trip[]);
    if (!locsRes.error) setLocations(locsRes.data as SavedLocation[]);
    if (!driversRes.error) setDrivers(driversRes.data as Driver[]);
    if (!vehiclesRes.error) setVehicles(vehiclesRes.data as Vehicle[]);
    if (!yachtsRes.error) setYachts(yachtsRes.data as Yacht[]);
    setLoading(false);
  }

  const filtered = useMemo(() => filter === "all" ? trips : trips.filter(t => t.trip_type === filter), [trips, filter]);

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(t: Trip) {
    setEditing(t);
    setForm({
      trip_type: t.trip_type,
      passenger_name: t.passenger_name ?? "",
      yacht_id: t.yacht_id ?? "__none",
      pickup_location_id: t.pickup_location_id ?? "__none",
      pickup_address: t.pickup_address ?? "",
      dropoff_location_id: t.dropoff_location_id ?? "__none",
      dropoff_address: t.dropoff_address ?? "",
      pickup_datetime: t.pickup_datetime ? t.pickup_datetime.slice(0, 16) : "",
      dropoff_datetime: t.dropoff_datetime ? t.dropoff_datetime.slice(0, 16) : "",
      driver_id: t.driver_id ?? "__none",
      vehicle_id: t.vehicle_id ?? "__none",
      status: t.status,
      notes: t.notes ?? "",
    });
    setOpen(true);
  }

  const pickupLoc = locations.find(l => l.id === form.pickup_location_id);
  const dropoffLoc = locations.find(l => l.id === form.dropoff_location_id);
  const hasMapCoords = !!(pickupLoc?.latitude && pickupLoc?.longitude && dropoffLoc?.latitude && dropoffLoc?.longitude);

  async function handleSave() {
    setBusy(true);
    try {
      const payload = {
        trip_type: form.trip_type,
        passenger_name: form.passenger_name || null,
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        pickup_location_id: form.pickup_location_id === "__none" ? null : form.pickup_location_id,
        pickup_address: form.pickup_address || null,
        dropoff_location_id: form.dropoff_location_id === "__none" ? null : form.dropoff_location_id,
        dropoff_address: form.dropoff_address || null,
        pickup_datetime: form.pickup_datetime || null,
        dropoff_datetime: form.dropoff_datetime || null,
        driver_id: form.driver_id === "__none" ? null : form.driver_id,
        vehicle_id: form.vehicle_id === "__none" ? null : form.vehicle_id,
        status: form.status,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await (supabase as any).from("crew_trips").update(payload).eq("id", editing.id);
        if (error) throw error; toast.success("Trip updated");
      } else {
        const { error } = await (supabase as any).from("crew_trips").insert([payload]);
        if (error) throw error; toast.success("Trip created");
      }
      setOpen(false); await loadAll();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  async function handleDelete(t: Trip) {
    if (!confirm("Delete this trip?")) return;
    const { error } = await (supabase as any).from("crew_trips").delete().eq("id", t.id);
    if (error) toast.error(error.message); else { toast.success("Trip removed"); await loadAll(); }
  }

  const setF = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const pickupDisplay = (t: Trip) => t.pickup_loc?.name ?? t.pickup_address ?? "—";
  const dropoffDisplay = (t: Trip) => t.dropoff_loc?.name ?? t.dropoff_address ?? "—";

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <Route className="h-5 w-5 text-primary" />
          <h1 className="font-display text-xl font-semibold">Trips</h1>
          <div className="flex items-center gap-1 ml-2">
            {(["all","crew_pickup","inhouse"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1 text-xs font-medium transition ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {f === "all" ? "All" : TYPE_LABEL[f as TripType]}
              </button>
            ))}
          </div>
        </div>
        <Button onClick={openNew} size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> New Trip</Button>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground"><Route className="h-10 w-10 opacity-30" /><p className="text-sm">No trips yet. Plan your first trip.</p></div>
        ) : (
          <div className="rounded-lg border border-border overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-muted/40 border-b border-border">
                <tr>{["Type","Passenger","Yacht","Pickup","Drop-off","Pickup Time","Dropoff Time","Driver","Vehicle","Status",""].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3"><TypeBadge type={t.trip_type} /></td>
                    <td className="px-4 py-3 font-medium">{t.passenger_name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{t.yacht?.vessel_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">{pickupDisplay(t)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">{dropoffDisplay(t)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDt(t.pickup_datetime)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDt(t.dropoff_datetime)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.driver?.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}${t.vehicle.registration ? ` (${t.vehicle.registration})` : ""}` : "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)} className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(t)} className="h-7 w-7 p-0 text-destructive/70 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit" : "New"} Trip</DialogTitle></DialogHeader>
          <div className="flex gap-6">
            {/* Left: Form */}
            <div className="flex-1 grid grid-cols-2 gap-4 content-start">
              <div className="space-y-1.5">
                <Label>Trip Type</Label>
                <Select value={form.trip_type} onValueChange={v => setForm(f => ({ ...f, trip_type: v as TripType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="crew_pickup">Crew Pickup</SelectItem><SelectItem value="inhouse">In-House</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TripStatus }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(["pending","confirmed","in_progress","completed","cancelled"] as TripStatus[]).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5">
                <Label>Passenger Name</Label>
                <Input value={form.passenger_name} onChange={setF("passenger_name")} placeholder="e.g. Captain Smith / Crew of MV Horizon" />
              </div>
              <div className="space-y-1.5">
                <Label>Yacht <span className="text-muted-foreground text-xs">(client)</span></Label>
                <Select value={form.yacht_id} onValueChange={v => setForm(f => ({ ...f, yacht_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select yacht…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— None —</SelectItem>
                    {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Driver</Label>
                <Select value={form.driver_id} onValueChange={v => setForm(f => ({ ...f, driver_id: v }))}><SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger><SelectContent><SelectItem value="__none">— None —</SelectItem>{drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle</Label>
                <Select value={form.vehicle_id} onValueChange={v => setForm(f => ({ ...f, vehicle_id: v }))}><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger><SelectContent><SelectItem value="__none">— None —</SelectItem>{vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.make} {v.model}{v.registration ? ` (${v.registration})` : ""}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Pickup Location</Label>
                <Select value={form.pickup_location_id} onValueChange={v => setForm(f => ({ ...f, pickup_location_id: v }))}><SelectTrigger><SelectValue placeholder="Select saved location" /></SelectTrigger><SelectContent><SelectItem value="__none">— Custom address —</SelectItem>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.address ? ` — ${l.address}` : ""}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Pickup Address <span className="text-muted-foreground text-xs">(if not a saved location)</span></Label>
                <Input value={form.pickup_address} onChange={setF("pickup_address")} placeholder="e.g. Gate 7, Dubai International Airport" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Drop-off Location</Label>
                <Select value={form.dropoff_location_id} onValueChange={v => setForm(f => ({ ...f, dropoff_location_id: v }))}><SelectTrigger><SelectValue placeholder="Select saved location" /></SelectTrigger><SelectContent><SelectItem value="__none">— Custom address —</SelectItem>{locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}{l.address ? ` — ${l.address}` : ""}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Drop-off Address <span className="text-muted-foreground text-xs">(if not a saved location)</span></Label>
                <Input value={form.dropoff_address} onChange={setF("dropoff_address")} placeholder="e.g. JLS Marina, Dubai" />
              </div>
              <div className="space-y-1.5">
                <Label>Pickup Date &amp; Time</Label>
                <Input type="datetime-local" value={form.pickup_datetime} onChange={setF("pickup_datetime")} />
              </div>
              <div className="space-y-1.5">
                <Label>Drop-off Date &amp; Time</Label>
                <Input type="datetime-local" value={form.dropoff_datetime} onChange={setF("dropoff_datetime")} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes} onChange={setF("notes")} placeholder="Flight number, special instructions, number of bags…" />
              </div>
            </div>

            {/* Right: Map */}
            <div className="w-80 shrink-0 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Navigation className="h-4 w-4 text-primary" /> Route Preview
              </div>
              <div className="flex-1 min-h-[400px] rounded-lg border border-border overflow-hidden bg-muted/20">
                {hasMapCoords ? (
                  <RouteMap
                    pickupLat={pickupLoc!.latitude!}
                    pickupLng={pickupLoc!.longitude!}
                    dropLat={dropoffLoc!.latitude!}
                    dropLng={dropoffLoc!.longitude!}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                    <MapPin className="h-10 w-10 opacity-30" />
                    <p className="text-xs leading-relaxed">Select saved locations with coordinates for both pickup and drop-off to see the route preview here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border mt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={handleSave} disabled={busy} className="gap-1.5">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save Changes" : "Create Trip"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
