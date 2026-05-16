import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Loader2, Route, MapPin, Navigation,
  Table2, LayoutGrid, Search, Check, X, ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type TripType = "crew_pickup" | "inhouse";
type TripStatus = "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
type ViewMode = "table" | "board";

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

type FormState = {
  trip_type: TripType;
  passenger_name: string;
  yacht_id: string;
  pickup_location_id: string;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  dropoff_location_id: string;
  dropoff_address: string;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  pickup_datetime: string;
  dropoff_datetime: string;
  driver_id: string;
  vehicle_id: string;
  status: TripStatus;
  notes: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  trip_type: "crew_pickup",
  passenger_name: "",
  yacht_id: "__none",
  pickup_location_id: "__none",
  pickup_address: "",
  pickup_lat: null,
  pickup_lng: null,
  dropoff_location_id: "__none",
  dropoff_address: "",
  dropoff_lat: null,
  dropoff_lng: null,
  pickup_datetime: "",
  dropoff_datetime: "",
  driver_id: "__none",
  vehicle_id: "__none",
  status: "pending",
  notes: "",
};

const TYPE_LABEL: Record<TripType, string> = { crew_pickup: "Crew Pickup", inhouse: "In-House" };
const TYPE_COLOR: Record<TripType, string> = {
  crew_pickup: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  inhouse: "bg-purple-500/15 text-purple-400 border-purple-500/20",
};
const STATUS_LABEL: Record<TripStatus, string> = {
  pending: "Pending", confirmed: "Confirmed", in_progress: "In Progress",
  completed: "Completed", cancelled: "Cancelled",
};
const STATUS_COLOR: Record<TripStatus, string> = {
  pending: "bg-muted/60 text-muted-foreground border-border",
  confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/20",
};
const STATUS_ORDER: TripStatus[] = ["pending", "confirmed", "in_progress", "completed", "cancelled"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDt(dt: string | null) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide", color)}>
      {label}
    </span>
  );
}

// ─── Address Combobox ─────────────────────────────────────────────────────────

type AddressSuggestion =
  | { kind: "saved"; id: string; label: string; sub: string | null; lat: number | null; lng: number | null }
  | { kind: "nominatim"; label: string; lat: number; lng: number };

type AddressValue = {
  location_id: string;   // "__none" or a saved-location uuid
  address: string;
  lat: number | null;
  lng: number | null;
};

function AddressCombobox({
  value, onChange, savedLocations, placeholder,
}: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  savedLocations: SavedLocation[];
  placeholder?: string;
}) {
  const displayLabel =
    value.location_id !== "__none"
      ? (savedLocations.find(l => l.id === value.location_id)?.name ?? value.address)
      : value.address;

  const [query, setQuery] = useState(displayLabel);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sync display label when value changes externally
  useEffect(() => { setQuery(displayLabel); }, [displayLabel]);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleInput(q: string) {
    setQuery(q);
    setOpen(true);
    clearTimeout(timerRef.current);
    if (q.length < 2) { setSuggestions([]); return; }

    const savedMatches: AddressSuggestion[] = savedLocations
      .filter(l => l.name.toLowerCase().includes(q.toLowerCase()) || (l.address ?? "").toLowerCase().includes(q.toLowerCase()))
      .slice(0, 4)
      .map(l => ({ kind: "saved", id: l.id, label: l.name, sub: l.address, lat: l.latitude, lng: l.longitude }));

    setSuggestions(savedMatches);

    timerRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=0`,
          { headers: { "Accept-Language": "en" } }
        );
        if (!res.ok) return;
        const data: { display_name: string; lat: string; lon: string }[] = await res.json();
        setSuggestions([
          ...savedMatches,
          ...data.map<AddressSuggestion>(r => ({
            kind: "nominatim",
            label: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon),
          })),
        ]);
      } catch { /* network error — just keep saved matches */ }
      finally { setFetching(false); }
    }, 450);
  }

  function select(s: AddressSuggestion) {
    if (s.kind === "saved") {
      onChange({ location_id: s.id, address: s.label, lat: s.lat, lng: s.lng });
      setQuery(s.label);
    } else {
      onChange({ location_id: "__none", address: s.label, lat: s.lat, lng: s.lng });
      setQuery(s.label);
    }
    setSuggestions([]);
    setOpen(false);
  }

  function handleBlur() {
    // If the user typed but didn't pick a suggestion, store as free-text
    setTimeout(() => {
      if (!open) return;
      onChange({ location_id: "__none", address: query, lat: null, lng: null });
      setOpen(false);
    }, 150);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          onBlur={handleBlur}
          placeholder={placeholder ?? "Search address or saved location…"}
          className="h-8 pl-6 text-xs"
        />
        {fetching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => select(s)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent transition"
            >
              <MapPin className={cn("mt-0.5 h-3 w-3 shrink-0", s.kind === "saved" ? "text-primary" : "text-muted-foreground")} />
              <div className="min-w-0">
                <div className="truncate font-medium">{s.kind === "saved" ? s.label : s.label.split(",")[0]}</div>
                {s.kind === "saved" && s.sub && <div className="truncate text-muted-foreground">{s.sub}</div>}
                {s.kind === "nominatim" && <div className="truncate text-muted-foreground">{s.label.split(",").slice(1, 3).join(",").trim()}</div>}
              </div>
              {s.kind === "saved" && (
                <span className="ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] bg-primary/15 text-primary">Saved</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Route Map ────────────────────────────────────────────────────────────────

function RouteMap({ pickupLat, pickupLng, dropLat, dropLng }: { pickupLat: number; pickupLng: number; dropLat: number; dropLng: number }) {
  const midLat = ((pickupLat + dropLat) / 2).toFixed(5);
  const midLng = ((pickupLng + dropLng) / 2).toFixed(5);
  const src = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${pickupLat}%2C${pickupLng}%3B${dropLat}%2C${dropLng}#map=11/${midLat}/${midLng}`;
  return (
    <iframe
      key={src}
      src={src}
      title="Route Preview"
      className="w-full h-full rounded-md border border-border"
      style={{ minHeight: 260 }}
      loading="lazy"
    />
  );
}

// ─── Board Cell ───────────────────────────────────────────────────────────────

function BoardCell({
  children, editing, onClick, className,
}: { children: React.ReactNode; editing?: boolean; onClick: () => void; className?: string }) {
  return (
    <td
      onClick={onClick}
      className={cn(
        "border-r border-border/40 px-2 py-1 text-xs cursor-pointer",
        editing ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "hover:bg-accent/30",
        className,
      )}
    >
      {children}
    </td>
  );
}

// ─── Inline Select ─────────────────────────────────────────────────────────────

function InlineSelect<T extends string>({
  value, options, onChange, onDone,
}: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; onDone: () => void }) {
  return (
    <select
      autoFocus
      value={value}
      onChange={e => { onChange(e.target.value as T); onDone(); }}
      onBlur={onDone}
      className="h-6 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Board Row ─────────────────────────────────────────────────────────────────

type BoardCell = { row: string | "new"; field: string } | null;

function BoardRow({
  trip, locations, drivers, vehicles, yachts, active, onActivate, onSave, onDelete,
}: {
  trip: Trip;
  locations: SavedLocation[];
  drivers: Driver[];
  vehicles: Vehicle[];
  yachts: Yacht[];
  active: BoardCell;
  onActivate: (field: string) => void;
  onSave: (id: string, patch: Partial<Trip>) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const isActive = (f: string) => active?.row === trip.id && active.field === f;

  const pickupLabel = trip.pickup_loc?.name ?? trip.pickup_address ?? "—";
  const dropoffLabel = trip.dropoff_loc?.name ?? trip.dropoff_address ?? "—";
  const driverLabel = trip.driver?.full_name ?? "—";
  const vehicleLabel = trip.vehicle ? `${trip.vehicle.make} ${trip.vehicle.model}` : "—";
  const yachtLabel = trip.yacht?.vessel_name ?? "—";

  async function patchStatus(s: TripStatus) { await onSave(trip.id, { status: s }); }

  return (
    <tr className="border-b border-border/40 group hover:bg-muted/10 transition-colors h-8">
      {/* Type */}
      <BoardCell editing={isActive("trip_type")} onClick={() => onActivate("trip_type")} className="w-28">
        {isActive("trip_type") ? (
          <InlineSelect
            value={trip.trip_type}
            options={[{ value: "crew_pickup", label: "Crew Pickup" }, { value: "inhouse", label: "In-House" }]}
            onChange={v => onSave(trip.id, { trip_type: v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <Badge label={TYPE_LABEL[trip.trip_type]} color={TYPE_COLOR[trip.trip_type]} />
        )}
      </BoardCell>

      {/* Passenger */}
      <BoardCell editing={isActive("passenger_name")} onClick={() => onActivate("passenger_name")} className="min-w-[120px]">
        {isActive("passenger_name") ? (
          <input
            autoFocus
            defaultValue={trip.passenger_name ?? ""}
            onBlur={e => onSave(trip.id, { passenger_name: e.target.value || null })}
            onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); onSave(trip.id, { passenger_name: (e.target as HTMLInputElement).value || null }); onActivate(""); } }}
            className="h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
          />
        ) : (
          <span className={trip.passenger_name ? "text-foreground font-medium" : "text-muted-foreground/50"}>{trip.passenger_name ?? "—"}</span>
        )}
      </BoardCell>

      {/* Yacht */}
      <BoardCell editing={isActive("yacht_id")} onClick={() => onActivate("yacht_id")} className="w-28">
        {isActive("yacht_id") ? (
          <InlineSelect
            value={trip.yacht_id ?? "__none"}
            options={[{ value: "__none", label: "— None —" }, ...yachts.map(y => ({ value: y.id, label: y.vessel_name }))]}
            onChange={v => onSave(trip.id, { yacht_id: v === "__none" ? null : v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <span className="text-muted-foreground">{yachtLabel}</span>
        )}
      </BoardCell>

      {/* Pickup */}
      <BoardCell editing={isActive("pickup_address")} onClick={() => onActivate("pickup_address")} className="min-w-[140px]">
        {isActive("pickup_address") ? (
          <input
            autoFocus
            defaultValue={pickupLabel !== "—" ? pickupLabel : ""}
            onBlur={e => onSave(trip.id, { pickup_address: e.target.value || null, pickup_location_id: null })}
            onKeyDown={e => { if (e.key === "Enter") { onSave(trip.id, { pickup_address: (e.target as HTMLInputElement).value || null, pickup_location_id: null }); onActivate(""); } }}
            className="h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
          />
        ) : (
          <span className="text-muted-foreground truncate block max-w-[140px]">{pickupLabel}</span>
        )}
      </BoardCell>

      {/* Drop-off */}
      <BoardCell editing={isActive("dropoff_address")} onClick={() => onActivate("dropoff_address")} className="min-w-[140px]">
        {isActive("dropoff_address") ? (
          <input
            autoFocus
            defaultValue={dropoffLabel !== "—" ? dropoffLabel : ""}
            onBlur={e => onSave(trip.id, { dropoff_address: e.target.value || null, dropoff_location_id: null })}
            onKeyDown={e => { if (e.key === "Enter") { onSave(trip.id, { dropoff_address: (e.target as HTMLInputElement).value || null, dropoff_location_id: null }); onActivate(""); } }}
            className="h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
          />
        ) : (
          <span className="text-muted-foreground truncate block max-w-[140px]">{dropoffLabel}</span>
        )}
      </BoardCell>

      {/* Pickup DateTime */}
      <BoardCell editing={isActive("pickup_datetime")} onClick={() => onActivate("pickup_datetime")} className="w-36">
        {isActive("pickup_datetime") ? (
          <input
            autoFocus
            type="datetime-local"
            defaultValue={trip.pickup_datetime ? trip.pickup_datetime.slice(0, 16) : ""}
            onBlur={e => { onSave(trip.id, { pickup_datetime: e.target.value || null }); onActivate(""); }}
            className="h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
          />
        ) : (
          <span className="text-muted-foreground whitespace-nowrap">{fmtDt(trip.pickup_datetime)}</span>
        )}
      </BoardCell>

      {/* Drop-off Time */}
      <BoardCell editing={isActive("dropoff_datetime")} onClick={() => onActivate("dropoff_datetime")} className="w-36">
        {isActive("dropoff_datetime") ? (
          <input
            autoFocus
            type="datetime-local"
            defaultValue={trip.dropoff_datetime ? trip.dropoff_datetime.slice(0, 16) : ""}
            onBlur={e => { onSave(trip.id, { dropoff_datetime: e.target.value || null }); onActivate(""); }}
            className="h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
          />
        ) : (
          <span className="text-muted-foreground whitespace-nowrap">{fmtDt(trip.dropoff_datetime)}</span>
        )}
      </BoardCell>

      {/* Driver */}
      <BoardCell editing={isActive("driver_id")} onClick={() => onActivate("driver_id")} className="w-28">
        {isActive("driver_id") ? (
          <InlineSelect
            value={trip.driver_id ?? "__none"}
            options={[{ value: "__none", label: "— None —" }, ...drivers.map(d => ({ value: d.id, label: d.full_name }))]}
            onChange={v => onSave(trip.id, { driver_id: v === "__none" ? null : v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <span className="text-muted-foreground">{driverLabel}</span>
        )}
      </BoardCell>

      {/* Vehicle */}
      <BoardCell editing={isActive("vehicle_id")} onClick={() => onActivate("vehicle_id")} className="w-32">
        {isActive("vehicle_id") ? (
          <InlineSelect
            value={trip.vehicle_id ?? "__none"}
            options={[{ value: "__none", label: "— None —" }, ...vehicles.map(v => ({ value: v.id, label: `${v.make} ${v.model}` }))]}
            onChange={v => onSave(trip.id, { vehicle_id: v === "__none" ? null : v })}
            onDone={() => onActivate("")}
          />
        ) : (
          <span className="text-muted-foreground">{vehicleLabel}</span>
        )}
      </BoardCell>

      {/* Status */}
      <BoardCell editing={isActive("status")} onClick={() => onActivate("status")} className="w-28">
        {isActive("status") ? (
          <InlineSelect
            value={trip.status}
            options={STATUS_ORDER.map(s => ({ value: s, label: STATUS_LABEL[s] }))}
            onChange={v => patchStatus(v)}
            onDone={() => onActivate("")}
          />
        ) : (
          <Badge label={STATUS_LABEL[trip.status]} color={STATUS_COLOR[trip.status]} />
        )}
      </BoardCell>

      {/* Actions */}
      <td className="w-16 px-2 py-1">
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          <button
            onClick={e => { e.stopPropagation(); onDelete(trip.id); }}
            className="rounded p-1 hover:bg-destructive/10 transition"
          >
            <Trash2 className="h-3 w-3 text-destructive/60" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Board Add Row ─────────────────────────────────────────────────────────────

function BoardAddRow({
  locations, drivers, vehicles, yachts, onAdd,
}: {
  locations: SavedLocation[];
  drivers: Driver[];
  vehicles: Vehicle[];
  yachts: Yacht[];
  onAdd: (form: Partial<FormState>) => Promise<void>;
}) {
  const [active, setActive] = useState(false);
  const [form, setForm] = useState<Partial<FormState>>({
    trip_type: "crew_pickup", status: "pending",
    yacht_id: "__none", driver_id: "__none", vehicle_id: "__none",
    passenger_name: "", pickup_address: "", dropoff_address: "", pickup_datetime: "", dropoff_datetime: "",
  });
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (!form.passenger_name && !form.pickup_address) return;
    setSaving(true);
    await onAdd(form);
    setForm({ trip_type: "crew_pickup", status: "pending", yacht_id: "__none", driver_id: "__none", vehicle_id: "__none", passenger_name: "", pickup_address: "", dropoff_address: "", pickup_datetime: "", dropoff_datetime: "" });
    setActive(false);
    setSaving(false);
  }

  if (!active) {
    return (
      <tr className="border-b border-border/40">
        <td colSpan={10} className="px-3 py-1.5">
          <button
            onClick={() => setActive(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <Plus className="h-3 w-3" /> Add trip
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border/40 bg-primary/5">
      <td className="border-r border-border/40 px-2 py-1">
        <select value={form.trip_type} onChange={e => setForm(f => ({ ...f, trip_type: e.target.value as TripType }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1">
          <option value="crew_pickup">Crew Pickup</option>
          <option value="inhouse">In-House</option>
        </select>
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <input autoFocus placeholder="Passenger name" value={form.passenger_name ?? ""} onChange={e => setForm(f => ({ ...f, passenger_name: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary" />
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <select value={form.yacht_id} onChange={e => setForm(f => ({ ...f, yacht_id: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1">
          <option value="__none">— None —</option>
          {yachts.map(y => <option key={y.id} value={y.id}>{y.vessel_name}</option>)}
        </select>
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <input placeholder="Pickup address" value={form.pickup_address ?? ""} onChange={e => setForm(f => ({ ...f, pickup_address: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary" />
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <input placeholder="Drop-off address" value={form.dropoff_address ?? ""} onChange={e => setForm(f => ({ ...f, dropoff_address: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary" />
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <input type="datetime-local" value={form.pickup_datetime ?? ""} onChange={e => setForm(f => ({ ...f, pickup_datetime: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary" />
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <input type="datetime-local" value={form.dropoff_datetime ?? ""} onChange={e => setForm(f => ({ ...f, dropoff_datetime: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary" />
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <select value={form.driver_id} onChange={e => setForm(f => ({ ...f, driver_id: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1">
          <option value="__none">— None —</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
        </select>
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <select value={form.vehicle_id} onChange={e => setForm(f => ({ ...f, vehicle_id: e.target.value }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1">
          <option value="__none">— None —</option>
          {vehicles.map(v => <option key={v.id} value={v.id}>{v.make} {v.model}</option>)}
        </select>
      </td>
      <td className="border-r border-border/40 px-2 py-1">
        <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as TripStatus }))}
          className="h-6 w-full rounded border border-border bg-card text-xs px-1">
          {STATUS_ORDER.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <div className="flex items-center gap-1">
          <button onClick={commit} disabled={saving} className="rounded p-1 hover:bg-emerald-500/15 text-emerald-400 transition">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
          <button onClick={() => setActive(false)} className="rounded p-1 hover:bg-muted text-muted-foreground transition">
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [locations, setLocations] = useState<SavedLocation[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | TripType>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [boardActive, setBoardActive] = useState<{ row: string; field: string } | null>(null);

  useEffect(() => { void loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [tripsRes, locsRes, driversRes, vehiclesRes, yachtsRes] = await Promise.all([
      (supabase as any).from("crew_trips").select(`*, driver:crew_drivers(full_name), vehicle:crew_vehicles(make,model,registration), pickup_loc:crew_locations!pickup_location_id(name,latitude,longitude), dropoff_loc:crew_locations!dropoff_location_id(name,latitude,longitude), yacht:yachts(vessel_name)`).order("pickup_datetime", { ascending: false }),
      (supabase as any).from("crew_locations").select("id,name,address,latitude,longitude").order("name"),
      (supabase as any).from("crew_drivers").select("id,full_name").order("full_name"),
      (supabase as any).from("crew_vehicles").select("id,make,model,registration").order("make"),
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

  // ── Form mode ──────────────────────────────────────────────────────────────

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(t: Trip) {
    setEditing(t);
    const pickupSaved = t.pickup_location_id ? locations.find(l => l.id === t.pickup_location_id) : null;
    const dropoffSaved = t.dropoff_location_id ? locations.find(l => l.id === t.dropoff_location_id) : null;
    setForm({
      trip_type: t.trip_type,
      passenger_name: t.passenger_name ?? "",
      yacht_id: t.yacht_id ?? "__none",
      pickup_location_id: t.pickup_location_id ?? "__none",
      pickup_address: pickupSaved?.name ?? t.pickup_address ?? "",
      pickup_lat: pickupSaved?.latitude ?? null,
      pickup_lng: pickupSaved?.longitude ?? null,
      dropoff_location_id: t.dropoff_location_id ?? "__none",
      dropoff_address: dropoffSaved?.name ?? t.dropoff_address ?? "",
      dropoff_lat: dropoffSaved?.latitude ?? null,
      dropoff_lng: dropoffSaved?.longitude ?? null,
      pickup_datetime: t.pickup_datetime ? t.pickup_datetime.slice(0, 16) : "",
      dropoff_datetime: t.dropoff_datetime ? t.dropoff_datetime.slice(0, 16) : "",
      driver_id: t.driver_id ?? "__none",
      vehicle_id: t.vehicle_id ?? "__none",
      status: t.status,
      notes: t.notes ?? "",
    });
    setOpen(true);
  }

  const pickupValue: AddressValue = {
    location_id: form.pickup_location_id,
    address: form.pickup_address,
    lat: form.pickup_lat,
    lng: form.pickup_lng,
  };
  const dropoffValue: AddressValue = {
    location_id: form.dropoff_location_id,
    address: form.dropoff_address,
    lat: form.dropoff_lat,
    lng: form.dropoff_lng,
  };

  const pickupLoc = form.pickup_location_id !== "__none" ? locations.find(l => l.id === form.pickup_location_id) : null;
  const dropoffLoc = form.dropoff_location_id !== "__none" ? locations.find(l => l.id === form.dropoff_location_id) : null;
  const mapPickupLat = pickupLoc?.latitude ?? form.pickup_lat;
  const mapPickupLng = pickupLoc?.longitude ?? form.pickup_lng;
  const mapDropLat = dropoffLoc?.latitude ?? form.dropoff_lat;
  const mapDropLng = dropoffLoc?.longitude ?? form.dropoff_lng;
  const hasMapCoords = !!(mapPickupLat && mapPickupLng && mapDropLat && mapDropLng);

  async function handleSave() {
    setBusy(true);
    try {
      const payload = {
        trip_type: form.trip_type,
        passenger_name: form.passenger_name || null,
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        pickup_location_id: form.pickup_location_id === "__none" ? null : form.pickup_location_id,
        pickup_address: form.pickup_location_id === "__none" ? (form.pickup_address || null) : null,
        dropoff_location_id: form.dropoff_location_id === "__none" ? null : form.dropoff_location_id,
        dropoff_address: form.dropoff_location_id === "__none" ? (form.dropoff_address || null) : null,
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
        if (error) throw error;
        toast.success("Trip updated");
      } else {
        const { error } = await (supabase as any).from("crew_trips").insert([payload]);
        if (error) throw error;
        toast.success("Trip created");
      }
      setOpen(false);
      await loadAll();
    } catch (e: any) { toast.error(e.message ?? "Save failed"); }
    finally { setBusy(false); }
  }

  // ── Board mode ─────────────────────────────────────────────────────────────

  async function boardSave(id: string, patch: Partial<Trip>) {
    const { error } = await (supabase as any).from("crew_trips").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setTrips(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    setBoardActive(null);
  }

  async function boardAdd(partialForm: Partial<FormState>) {
    const payload = {
      trip_type: partialForm.trip_type ?? "crew_pickup",
      passenger_name: partialForm.passenger_name || null,
      yacht_id: partialForm.yacht_id === "__none" ? null : partialForm.yacht_id,
      pickup_address: partialForm.pickup_address || null,
      dropoff_address: partialForm.dropoff_address || null,
      pickup_datetime: partialForm.pickup_datetime || null,
      dropoff_datetime: partialForm.dropoff_datetime || null,
      driver_id: partialForm.driver_id === "__none" ? null : partialForm.driver_id,
      vehicle_id: partialForm.vehicle_id === "__none" ? null : partialForm.vehicle_id,
      status: partialForm.status ?? "pending",
    };
    const { error } = await (supabase as any).from("crew_trips").insert([payload]);
    if (error) { toast.error(error.message); return; }
    await loadAll();
    toast.success("Trip added");
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this trip?")) return;
    const { error } = await (supabase as any).from("crew_trips").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removed"); await loadAll(); }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-3">
          <Route className="h-4 w-4 text-primary" />
          <h1 className="font-display text-base font-semibold">Trips</h1>
          <div className="flex items-center gap-0.5 ml-1">
            {(["all", "crew_pickup", "inhouse"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition",
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {f === "all" ? "All" : TYPE_LABEL[f as TripType]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex h-7 items-center rounded-md border border-border bg-card p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode("table")}
              title="Table view"
              className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs transition", viewMode === "table" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              <Table2 className="h-3 w-3" /> Table
            </button>
            <button
              onClick={() => setViewMode("board")}
              title="Board / inline edit"
              className={cn("flex items-center gap-1 rounded px-2 py-1 text-xs transition", viewMode === "board" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted")}
            >
              <LayoutGrid className="h-3 w-3" /> Board
            </button>
          </div>

          <Button onClick={openNew} size="sm" className="h-7 gap-1.5 text-xs px-3">
            <Plus className="h-3.5 w-3.5" /> New Trip
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 && viewMode === "table" ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Route className="h-8 w-8 opacity-30" />
            <p className="text-xs">No trips yet.</p>
          </div>
        ) : viewMode === "table" ? (
          /* ── Table View ── */
          <div className="rounded-lg border border-border overflow-x-auto bg-card">
            <table className="w-full text-xs min-w-[1000px]">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  {["Type", "Passenger", "Yacht", "Pickup", "Drop-off", "Pickup Time", "Driver", "Vehicle", "Status", ""].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filtered.map(t => (
                  <tr key={t.id} className="hover:bg-muted/20 transition-colors group">
                    <td className="px-3 py-1.5"><Badge label={TYPE_LABEL[t.trip_type]} color={TYPE_COLOR[t.trip_type]} /></td>
                    <td className="px-3 py-1.5 font-medium text-foreground">{t.passenger_name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{t.yacht?.vessel_name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[140px] truncate">{t.pickup_loc?.name ?? t.pickup_address ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground max-w-[140px] truncate">{t.dropoff_loc?.name ?? t.dropoff_address ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{fmtDt(t.pickup_datetime)}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{t.driver?.full_name ?? "—"}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}` : "—"}</td>
                    <td className="px-3 py-1.5"><Badge label={STATUS_LABEL[t.status]} color={STATUS_COLOR[t.status]} /></td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(t)} className="rounded p-1 hover:bg-muted transition"><Pencil className="h-3 w-3 text-muted-foreground" /></button>
                        <button onClick={() => handleDelete(t.id)} className="rounded p-1 hover:bg-destructive/10 transition"><Trash2 className="h-3 w-3 text-destructive/60" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Board View ── */
          <div className="rounded-lg border border-border overflow-x-auto bg-card">
            <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2">
              <LayoutGrid className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Board — click any cell to edit inline · Tab / Enter to confirm</span>
            </div>
            <table className="w-full min-w-[1300px]">
              <thead className="bg-muted/20 border-b border-border/60">
                <tr>
                  {["Type", "Passenger", "Yacht", "Pickup", "Drop-off", "Pickup Time", "Drop-off Time", "Driver", "Vehicle", "Status", ""].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-r border-border/40 last:border-r-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <BoardRow
                    key={t.id}
                    trip={t}
                    locations={locations}
                    drivers={drivers}
                    vehicles={vehicles}
                    yachts={yachts}
                    active={boardActive?.row === t.id ? boardActive : null}
                    onActivate={field => field ? setBoardActive({ row: t.id, field }) : setBoardActive(null)}
                    onSave={boardSave}
                    onDelete={handleDelete}
                  />
                ))}
                <BoardAddRow
                  locations={locations}
                  drivers={drivers}
                  vehicles={vehicles}
                  yachts={yachts}
                  onAdd={boardAdd}
                />
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Form Dialog ── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-5 pt-4 pb-3 border-b border-border shrink-0">
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Route className="h-3.5 w-3.5 text-primary" />
              {editing ? "Edit Trip" : "New Trip"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Left: Form */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">

                {/* Type + Status */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Trip Type</Label>
                  <Select value={form.trip_type} onValueChange={v => setForm(f => ({ ...f, trip_type: v as TripType }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crew_pickup">Crew Pickup</SelectItem>
                      <SelectItem value="inhouse">In-House</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as TripStatus }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Passenger + Yacht */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Passenger Name</Label>
                  <Input
                    value={form.passenger_name}
                    onChange={e => setForm(f => ({ ...f, passenger_name: e.target.value }))}
                    placeholder="e.g. Captain Smith"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Yacht <span className="text-muted-foreground/60">(client)</span></Label>
                  <Select value={form.yacht_id} onValueChange={v => setForm(f => ({ ...f, yacht_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select yacht…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— None —</SelectItem>
                      {yachts.map(y => <SelectItem key={y.id} value={y.id}>{y.vessel_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Driver + Vehicle */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Driver</Label>
                  <Select value={form.driver_id} onValueChange={v => setForm(f => ({ ...f, driver_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select driver" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— None —</SelectItem>
                      {drivers.map(d => <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Vehicle</Label>
                  <Select value={form.vehicle_id} onValueChange={v => setForm(f => ({ ...f, vehicle_id: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— None —</SelectItem>
                      {vehicles.map(v => <SelectItem key={v.id} value={v.id}>{v.make} {v.model}{v.registration ? ` (${v.registration})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {/* Pickup address */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-emerald-400" /> Pickup Location
                  </Label>
                  <AddressCombobox
                    value={pickupValue}
                    onChange={v => setForm(f => ({ ...f, pickup_location_id: v.location_id, pickup_address: v.address, pickup_lat: v.lat, pickup_lng: v.lng }))}
                    savedLocations={locations}
                    placeholder="Search saved locations or any address…"
                  />
                </div>

                {/* Drop-off address */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-red-400" /> Drop-off Location
                  </Label>
                  <AddressCombobox
                    value={dropoffValue}
                    onChange={v => setForm(f => ({ ...f, dropoff_location_id: v.location_id, dropoff_address: v.address, dropoff_lat: v.lat, dropoff_lng: v.lng }))}
                    savedLocations={locations}
                    placeholder="Search saved locations or any address…"
                  />
                </div>

                {/* Dates */}
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Pickup Date &amp; Time</Label>
                  <Input
                    type="datetime-local"
                    value={form.pickup_datetime}
                    onChange={e => setForm(f => ({ ...f, pickup_datetime: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Drop-off Date &amp; Time</Label>
                  <Input
                    type="datetime-local"
                    value={form.dropoff_datetime}
                    onChange={e => setForm(f => ({ ...f, dropoff_datetime: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>

                {/* Notes */}
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Flight number, bags, special instructions…"
                    className="text-xs resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Right: Map */}
            <div className="w-72 shrink-0 border-l border-border flex flex-col bg-muted/10">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/60">
                <Navigation className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">Route Preview</span>
              </div>
              <div className="flex-1 p-3">
                {hasMapCoords ? (
                  <RouteMap
                    pickupLat={mapPickupLat!}
                    pickupLng={mapPickupLng!}
                    dropLat={mapDropLat!}
                    dropLng={mapDropLng!}
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <MapPin className="h-8 w-8 opacity-20" />
                    <p className="text-[10px] leading-relaxed">
                      Select addresses with known coordinates to preview the route.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} size="sm" className="h-7 text-xs px-3">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={busy} size="sm" className="h-7 text-xs px-3 gap-1.5">
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {editing ? "Save Changes" : "Create Trip"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
