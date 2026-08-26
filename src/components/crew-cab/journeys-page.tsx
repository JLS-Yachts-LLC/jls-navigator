/**
 * Journeys — the driver's day, phone-first.
 *
 * The trips already planned in Crew Care, presented the way the ShipSync
 * delivery run reads for drivers: today's pickups in time order, one big card
 * per journey, a single button that walks the trip through
 * Confirm → Start → Passenger dropped off, and one tap to navigate.
 * Built for passengers rather than parcels: passenger name front and centre,
 * flight number when it's an airport run, vessel when it's a crew movement.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  CalendarDays, ChevronLeft, ChevronRight, Loader2, MapPin, Navigation,
  Plane, RefreshCw, Ship, User, Car, CircleCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type TripStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
type Trip = {
  id: string; trip_type: string; passenger_name: string | null;
  pickup_address: string | null; dropoff_address: string | null;
  pickup_lat: number | null; pickup_lng: number | null;
  dropoff_lat: number | null; dropoff_lng: number | null;
  pickup_datetime: string | null; dropoff_datetime: string | null;
  driver_id: string | null; vehicle_id: string | null; status: TripStatus;
  notes: string | null; flight_number: string | null;
  driver?: { full_name: string } | null;
  vehicle?: { make: string; model: string; registration: string | null } | null;
  pickup_loc?: { name: string } | null;
  dropoff_loc?: { name: string } | null;
  yacht?: { vessel_name: string } | null;
};
type Driver = { id: string; full_name: string; phone: string | null };

const NEXT: Partial<Record<TripStatus, { to: TripStatus; label: string }>> = {
  pending: { to: "confirmed", label: "Confirm journey" },
  confirmed: { to: "in_progress", label: "Start — heading to pickup" },
  in_progress: { to: "completed", label: "Passenger dropped off" },
};
const STATUS_STYLE: Record<TripStatus, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  confirmed: "bg-sky-500/15 text-sky-400",
  in_progress: "bg-green-500/15 text-green-400",
  completed: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<TripStatus, string> = {
  pending: "Awaiting confirmation", confirmed: "Confirmed", in_progress: "On the road",
  completed: "Completed", cancelled: "Cancelled",
};

const dayKey = (d: Date) => d.toLocaleDateString("en-CA");
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—";
const mapsUrl = (t: Trip, leg: "pickup" | "dropoff") => {
  const lat = leg === "pickup" ? t.pickup_lat : t.dropoff_lat;
  const lng = leg === "pickup" ? t.pickup_lng : t.dropoff_lng;
  const addr = leg === "pickup" ? (t.pickup_loc?.name ?? t.pickup_address) : (t.dropoff_loc?.name ?? t.dropoff_address);
  const dest = lat != null && lng != null ? `${lat},${lng}` : encodeURIComponent(addr ?? "");
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
};

export function JourneysPage() {
  const [date, setDate] = useState(() => dayKey(new Date()));
  const [driverId, setDriverId] = useState<string>("all");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data } = await (supabase as any).from("crew_drivers")
        .select("id, full_name, phone").order("full_name");
      setDrivers((data ?? []) as Driver[]);
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const from = `${date}T00:00:00`;
    const to = `${date}T23:59:59`;
    let q = (supabase as any).from("crew_trips")
      .select("*, driver:crew_drivers(full_name), vehicle:crew_vehicles(make, model, registration), pickup_loc:pickup_location_id(name), dropoff_loc:dropoff_location_id(name), yacht:yachts(vessel_name)")
      .gte("pickup_datetime", from).lte("pickup_datetime", to)
      .neq("status", "cancelled")
      .order("pickup_datetime", { ascending: true });
    if (driverId !== "all") q = q.eq("driver_id", driverId);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setTrips((data ?? []) as Trip[]);
    setLoading(false);
  }, [date, driverId]);
  useEffect(() => { void load(); }, [load]);

  const shiftDay = (n: number) => {
    const d = new Date(date + "T00:00");
    d.setDate(d.getDate() + n);
    setDate(dayKey(d));
  };

  async function advance(t: Trip) {
    const step = NEXT[t.status];
    if (!step) return;
    setTrips(prev => prev.map(x => (x.id === t.id ? { ...x, status: step.to } : x)));
    const { error } = await (supabase as any).from("crew_trips").update({ status: step.to }).eq("id", t.id);
    if (error) { toast.error(error.message); await load(); }
  }

  const upcoming = useMemo(() => trips.filter(t => t.status !== "completed"), [trips]);
  const done = useMemo(() => trips.filter(t => t.status === "completed"), [trips]);
  const isToday = date === dayKey(new Date());

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 sm:p-4">
      {/* Day + driver picker */}
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h2 className="font-display text-sm font-semibold">Journeys</h2>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => shiftDay(-1)} className="rounded-lg border border-border p-2 text-muted-foreground"><ChevronLeft className="h-4 w-4" /></button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="h-10 rounded-lg border border-input bg-background px-2 text-sm" />
          <button onClick={() => shiftDay(1)} className="rounded-lg border border-border p-2 text-muted-foreground"><ChevronRight className="h-4 w-4" /></button>
          <button onClick={() => void load()} className="rounded-lg border border-border p-2 text-muted-foreground"><RefreshCw className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setDriverId("all")}
          className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition",
            driverId === "all" ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground")}>
          All drivers
        </button>
        {drivers.map(d => (
          <button key={d.id} onClick={() => setDriverId(d.id)}
            className={cn("shrink-0 rounded-full border px-3 py-2 text-xs font-medium transition",
              driverId === d.id ? "border-primary bg-primary/15 text-foreground" : "border-border text-muted-foreground")}>
            {d.full_name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading journeys…</div>
      ) : trips.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No journeys {isToday ? "today" : "on this day"}{driverId !== "all" ? " for this driver" : ""}.
        </div>
      ) : (
        <>
          {upcoming.map((t, i) => {
            const step = NEXT[t.status];
            const leg = t.status === "in_progress" ? "dropoff" : "pickup";
            return (
              <div key={t.id} className={cn("rounded-2xl border bg-card p-4",
                t.status === "in_progress" ? "border-green-500/50 shadow-[0_0_18px_-8px_rgba(34,197,94,0.6)]" : "border-border")}>
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-display text-sm font-bold text-primary">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> {t.passenger_name ?? "Passenger"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {fmtTime(t.pickup_datetime)} pickup
                      {t.flight_number && <span className="ml-1.5 inline-flex items-center gap-0.5"><Plane className="h-3 w-3" /> {t.flight_number}</span>}
                      {t.yacht?.vessel_name && <span className="ml-1.5 inline-flex items-center gap-0.5"><Ship className="h-3 w-3" /> {t.yacht.vessel_name}</span>}
                    </p>
                  </div>
                  <span className={cn("ml-auto shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold", STATUS_STYLE[t.status])}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>

                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400" />
                    <span className={cn(leg === "pickup" && "font-medium")}>{t.pickup_loc?.name ?? t.pickup_address ?? "—"}</span>
                  </div>
                  <div className="ml-[7px] h-3 border-l border-dashed border-border" />
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span className={cn(leg === "dropoff" && "font-medium")}>{t.dropoff_loc?.name ?? t.dropoff_address ?? "—"}</span>
                  </div>
                </div>

                {(t.vehicle || t.driver) && (
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Car className="h-3 w-3" />
                    {t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}${t.vehicle.registration ? ` · ${t.vehicle.registration}` : ""}` : ""}
                    {t.driver && driverId === "all" && <span className="ml-1">— {t.driver.full_name}</span>}
                  </p>
                )}
                {t.notes && <p className="mt-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">{t.notes}</p>}

                <div className="mt-3 flex gap-2">
                  {step && (
                    <Button className="h-12 flex-1 text-sm" onClick={() => void advance(t)}>
                      {step.label}
                    </Button>
                  )}
                  <a href={mapsUrl(t, leg)} target="_blank" rel="noreferrer"
                    className="inline-flex h-12 items-center gap-1.5 rounded-lg border border-border px-4 text-sm font-medium text-foreground transition hover:border-primary/50">
                    <Navigation className="h-4 w-4" /> Navigate
                  </a>
                </div>
              </div>
            );
          })}

          {done.length > 0 && (
            <div className="rounded-xl border border-border bg-card/60 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <CircleCheck className="h-3.5 w-3.5" /> Completed ({done.length})
              </p>
              {done.map(t => (
                <div key={t.id} className="flex items-center gap-2 border-t border-border/50 py-2 text-xs text-muted-foreground first:border-t-0">
                  <span className="tabular-nums">{fmtTime(t.pickup_datetime)}</span>
                  <span className="truncate font-medium text-foreground/70">{t.passenger_name ?? "Passenger"}</span>
                  <span className="truncate">{t.pickup_loc?.name ?? t.pickup_address} → {t.dropoff_loc?.name ?? t.dropoff_address}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
