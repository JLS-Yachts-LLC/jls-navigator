import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-CA1Re7tQ.js";
import { s as supabase, t as toast } from "./router-BiLVVNgM.js";
import { B as Button } from "./button-DUPLVSck.js";
import { I as Input } from "./input-Dk9i5um_.js";
import { L as Label } from "./label-Djzk5h6G.js";
import { L as LoaderCircle, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-DQSrubKo.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-CTytXxG7.js";
import { R as Route, N as Navigation } from "./route-8On_thXV.js";
import { P as Plus } from "./Combination-CuzF6V9F.js";
import { P as Pencil, T as Trash2 } from "./x-C5JCqeJc.js";
import { M as MapPin } from "./map-pin-Cz8nqxLI.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-BkiIOXMm.js";
import "./chevron-down-fMwAeKn0.js";
import "./index-BYBvOuqV.js";
const EMPTY_FORM = {
  trip_type: "crew_pickup",
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
  status: "pending",
  notes: ""
};
const TYPE_LABEL = { crew_pickup: "Crew Pickup", inhouse: "In-House" };
const TYPE_COLOR = { crew_pickup: "bg-blue-500/15 text-blue-400", inhouse: "bg-purple-500/15 text-purple-400" };
const STATUS_LABEL = { pending: "Pending", confirmed: "Confirmed", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" };
const STATUS_COLOR = { pending: "bg-muted text-muted-foreground", confirmed: "bg-blue-500/15 text-blue-400", in_progress: "bg-amber-500/15 text-amber-400", completed: "bg-emerald-500/15 text-emerald-400", cancelled: "bg-red-500/15 text-red-400" };
function TypeBadge({ type }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_COLOR[type]}`, children: TYPE_LABEL[type] });
}
function StatusBadge({ status }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`, children: STATUS_LABEL[status] });
}
function fmtDt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}
function RouteMap({ pickupLat, pickupLng, dropLat, dropLng }) {
  const midLat = ((pickupLat + dropLat) / 2).toFixed(5);
  const midLng = ((pickupLng + dropLng) / 2).toFixed(5);
  const src = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${pickupLat}%2C${pickupLng}%3B${dropLat}%2C${dropLng}#map=11/${midLat}/${midLng}`;
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "iframe",
    {
      src,
      title: "Route Preview",
      className: "w-full h-full rounded-lg border border-border",
      style: { minHeight: 300 },
      loading: "lazy"
    },
    src
  );
}
function TripsPage() {
  const [trips, setTrips] = reactExports.useState([]);
  const [locations, setLocations] = reactExports.useState([]);
  const [drivers, setDrivers] = reactExports.useState([]);
  const [vehicles, setVehicles] = reactExports.useState([]);
  const [yachts, setYachts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [filter, setFilter] = reactExports.useState("all");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY_FORM);
  const [busy, setBusy] = reactExports.useState(false);
  reactExports.useEffect(() => {
    void loadAll();
  }, []);
  async function loadAll() {
    setLoading(true);
    const [tripsRes, locsRes, driversRes, vehiclesRes, yachtsRes] = await Promise.all([
      supabase.from("crew_trips").select(`*, driver:crew_drivers(full_name), vehicle:crew_vehicles(make,model,registration), pickup_loc:crew_locations!pickup_location_id(name,latitude,longitude), dropoff_loc:crew_locations!dropoff_location_id(name,latitude,longitude), yacht:yachts(vessel_name)`).order("pickup_datetime", { ascending: false }),
      supabase.from("crew_locations").select("id,name,address,latitude,longitude").order("name"),
      supabase.from("crew_drivers").select("id,full_name").eq("status", "active").order("full_name"),
      supabase.from("crew_vehicles").select("id,make,model,registration").eq("status", "available").order("make"),
      supabase.from("yachts").select("id,vessel_name").order("vessel_name")
    ]);
    if (tripsRes.error) toast.error(tripsRes.error.message);
    else setTrips(tripsRes.data);
    if (!locsRes.error) setLocations(locsRes.data);
    if (!driversRes.error) setDrivers(driversRes.data);
    if (!vehiclesRes.error) setVehicles(vehiclesRes.data);
    if (!yachtsRes.error) setYachts(yachtsRes.data);
    setLoading(false);
  }
  const filtered = reactExports.useMemo(() => filter === "all" ? trips : trips.filter((t) => t.trip_type === filter), [trips, filter]);
  function openNew() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  }
  function openEdit(t) {
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
      notes: t.notes ?? ""
    });
    setOpen(true);
  }
  const pickupLoc = locations.find((l) => l.id === form.pickup_location_id);
  const dropoffLoc = locations.find((l) => l.id === form.dropoff_location_id);
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
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("crew_trips").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Trip updated");
      } else {
        const { error } = await supabase.from("crew_trips").insert([payload]);
        if (error) throw error;
        toast.success("Trip created");
      }
      setOpen(false);
      await loadAll();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleDelete(t) {
    if (!confirm("Delete this trip?")) return;
    const { error } = await supabase.from("crew_trips").delete().eq("id", t.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Trip removed");
      await loadAll();
    }
  }
  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pickupDisplay = (t) => t.pickup_loc?.name ?? t.pickup_address ?? "—";
  const dropoffDisplay = (t) => t.dropoff_loc?.name ?? t.dropoff_address ?? "—";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { className: "h-5 w-5 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold", children: "Trips" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-1 ml-2", children: ["all", "crew_pickup", "inhouse"].map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setFilter(f), className: `rounded-md px-3 py-1 text-xs font-medium transition ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`, children: f === "all" ? "All" : TYPE_LABEL[f] }, f)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " New Trip"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No trips yet. Plan your first trip." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm min-w-[1000px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/40 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Type", "Passenger", "Yacht", "Pickup", "Drop-off", "Pickup Time", "Dropoff Time", "Driver", "Vehicle", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: filtered.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(TypeBadge, { type: t.trip_type }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-medium", children: t.passenger_name ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-xs text-muted-foreground", children: t.yacht?.vessel_name ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate", children: pickupDisplay(t) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate", children: dropoffDisplay(t) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground whitespace-nowrap", children: fmtDt(t.pickup_datetime) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground whitespace-nowrap", children: fmtDt(t.dropoff_datetime) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: t.driver?.full_name ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground text-xs", children: t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}${t.vehicle.registration ? ` (${t.vehicle.registration})` : ""}` : "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: t.status }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(t), className: "h-7 w-7 p-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleDelete(t), className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
        ] }) })
      ] }, t.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-5xl max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
        editing ? "Edit" : "New",
        " Trip"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-6", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 grid grid-cols-2 gap-4 content-start", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Trip Type" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.trip_type, onValueChange: (v) => setForm((f) => ({ ...f, trip_type: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "crew_pickup", children: "Crew Pickup" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "inhouse", children: "In-House" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setForm((f) => ({ ...f, status: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: ["pending", "confirmed", "in_progress", "completed", "cancelled"].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s, children: STATUS_LABEL[s] }, s)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Passenger Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.passenger_name, onChange: setF("passenger_name"), placeholder: "e.g. Captain Smith / Crew of MV Horizon" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Yacht ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground text-xs", children: "(client)" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.yacht_id, onValueChange: (v) => setForm((f) => ({ ...f, yacht_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht…" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Driver" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.driver_id, onValueChange: (v) => setForm((f) => ({ ...f, driver_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select driver" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                drivers.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: d.id, children: d.full_name }, d.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Vehicle" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.vehicle_id, onValueChange: (v) => setForm((f) => ({ ...f, vehicle_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vehicle" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                vehicles.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectItem, { value: v.id, children: [
                  v.make,
                  " ",
                  v.model,
                  v.registration ? ` (${v.registration})` : ""
                ] }, v.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Pickup Location" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.pickup_location_id, onValueChange: (v) => setForm((f) => ({ ...f, pickup_location_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select saved location" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— Custom address —" }),
                locations.map((l) => /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectItem, { value: l.id, children: [
                  l.name,
                  l.address ? ` — ${l.address}` : ""
                ] }, l.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Pickup Address ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground text-xs", children: "(if not a saved location)" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.pickup_address, onChange: setF("pickup_address"), placeholder: "e.g. Gate 7, Dubai International Airport" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Drop-off Location" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.dropoff_location_id, onValueChange: (v) => setForm((f) => ({ ...f, dropoff_location_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select saved location" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— Custom address —" }),
                locations.map((l) => /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectItem, { value: l.id, children: [
                  l.name,
                  l.address ? ` — ${l.address}` : ""
                ] }, l.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Drop-off Address ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground text-xs", children: "(if not a saved location)" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.dropoff_address, onChange: setF("dropoff_address"), placeholder: "e.g. JLS Marina, Dubai" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Pickup Date & Time" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "datetime-local", value: form.pickup_datetime, onChange: setF("pickup_datetime") })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Drop-off Date & Time" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "datetime-local", value: form.dropoff_datetime, onChange: setF("dropoff_datetime") })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5 col-span-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 3, value: form.notes, onChange: setF("notes"), placeholder: "Flight number, special instructions, number of bags…" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-80 shrink-0 flex flex-col gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 text-sm font-medium", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Navigation, { className: "h-4 w-4 text-primary" }),
            " Route Preview"
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 min-h-[400px] rounded-lg border border-border overflow-hidden bg-muted/20", children: hasMapCoords ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            RouteMap,
            {
              pickupLat: pickupLoc.latitude,
              pickupLng: pickupLoc.longitude,
              dropLat: dropoffLoc.latitude,
              dropLng: dropoffLoc.longitude
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-10 w-10 opacity-30" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs leading-relaxed", children: "Select saved locations with coordinates for both pickup and drop-off to see the route preview here." })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-4 border-t border-border mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
          busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
          editing ? "Save Changes" : "Create Trip"
        ] })
      ] })
    ] }) })
  ] });
}
const SplitComponent = TripsPage;
export {
  SplitComponent as component
};
