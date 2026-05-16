import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-DsQ-8Irl.js";
import { s as supabase, t as toast } from "./router-DIZelgi3.js";
import { c as cn, B as Button } from "./button-BpYf_3Uk.js";
import { I as Input } from "./input-BJ_AqVVM.js";
import { L as Label } from "./label-Davl8uUu.js";
import { L as LoaderCircle, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-i33xsu0B.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-rEAIxUU7.js";
import { R as Route, N as Navigation } from "./route-Ce9vAz2a.js";
import { c as createLucideIcon } from "./createLucideIcon-MgZLU5K_.js";
import { L as LayoutGrid } from "./layout-grid-Ct7oPvJQ.js";
import { e as Plus, o as Check } from "./Combination-DYVvUise.js";
import { P as Pencil, T as Trash2, X } from "./x-C86O2zKF.js";
import { M as MapPin } from "./map-pin-DAwq8JE1.js";
import { S as Search } from "./search-BweoIQVw.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./chevron-down-CpX_Bl0x.js";
import "./index-EFGDcBO_.js";
const __iconNode = [
  [
    "path",
    {
      d: "M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18",
      key: "gugj83"
    }
  ]
];
const Table2 = createLucideIcon("table-2", __iconNode);
const EMPTY_FORM = {
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
  notes: ""
};
const TYPE_LABEL = { crew_pickup: "Crew Pickup", inhouse: "In-House" };
const TYPE_COLOR = {
  crew_pickup: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  inhouse: "bg-purple-500/15 text-purple-400 border-purple-500/20"
};
const STATUS_LABEL = {
  pending: "Pending",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled"
};
const STATUS_COLOR = {
  pending: "bg-muted/60 text-muted-foreground border-border",
  confirmed: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/15 text-red-400 border-red-500/20"
};
const STATUS_ORDER = ["pending", "confirmed", "in_progress", "completed", "cancelled"];
function fmtDt(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}
function Badge({ label, color }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: cn("inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide", color), children: label });
}
function AddressCombobox({
  value,
  onChange,
  savedLocations,
  placeholder
}) {
  const displayLabel = value.location_id !== "__none" ? savedLocations.find((l) => l.id === value.location_id)?.name ?? value.address : value.address;
  const [query, setQuery] = reactExports.useState(displayLabel);
  const [suggestions, setSuggestions] = reactExports.useState([]);
  const [open, setOpen] = reactExports.useState(false);
  const [fetching, setFetching] = reactExports.useState(false);
  const timerRef = reactExports.useRef();
  const wrapRef = reactExports.useRef(null);
  reactExports.useEffect(() => {
    setQuery(displayLabel);
  }, [displayLabel]);
  reactExports.useEffect(() => {
    function onMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);
  function handleInput(q) {
    setQuery(q);
    setOpen(true);
    clearTimeout(timerRef.current);
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const savedMatches = savedLocations.filter((l) => l.name.toLowerCase().includes(q.toLowerCase()) || (l.address ?? "").toLowerCase().includes(q.toLowerCase())).slice(0, 4).map((l) => ({ kind: "saved", id: l.id, label: l.name, sub: l.address, lat: l.latitude, lng: l.longitude }));
    setSuggestions(savedMatches);
    timerRef.current = setTimeout(async () => {
      setFetching(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=0`,
          { headers: { "Accept-Language": "en" } }
        );
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions([
          ...savedMatches,
          ...data.map((r) => ({
            kind: "nominatim",
            label: r.display_name,
            lat: parseFloat(r.lat),
            lng: parseFloat(r.lon)
          }))
        ]);
      } catch {
      } finally {
        setFetching(false);
      }
    }, 450);
  }
  function select(s) {
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
    setTimeout(() => {
      if (!open) return;
      onChange({ location_id: "__none", address: query, lat: null, lng: null });
      setOpen(false);
    }, 150);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { ref: wrapRef, className: "relative", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        Input,
        {
          value: query,
          onChange: (e) => handleInput(e.target.value),
          onFocus: () => query.length >= 2 && setOpen(true),
          onBlur: handleBlur,
          placeholder: placeholder ?? "Search address or saved location…",
          className: "h-8 pl-6 text-xs"
        }
      ),
      fetching && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" })
    ] }),
    open && suggestions.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg overflow-hidden", children: suggestions.map((s, i) => /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        type: "button",
        onMouseDown: () => select(s),
        className: "flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-accent transition",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: cn("mt-0.5 h-3 w-3 shrink-0", s.kind === "saved" ? "text-primary" : "text-muted-foreground") }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate font-medium", children: s.kind === "saved" ? s.label : s.label.split(",")[0] }),
            s.kind === "saved" && s.sub && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-muted-foreground", children: s.sub }),
            s.kind === "nominatim" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "truncate text-muted-foreground", children: s.label.split(",").slice(1, 3).join(",").trim() })
          ] }),
          s.kind === "saved" && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto shrink-0 rounded px-1 py-0.5 text-[9px] bg-primary/15 text-primary", children: "Saved" })
        ]
      },
      i
    )) })
  ] });
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
      className: "w-full h-full rounded-md border border-border",
      style: { minHeight: 260 },
      loading: "lazy"
    },
    src
  );
}
function BoardCell({
  children,
  editing,
  onClick,
  className
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "td",
    {
      onClick,
      className: cn(
        "border-r border-border/40 px-2 py-1 text-xs cursor-pointer",
        editing ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "hover:bg-accent/30",
        className
      ),
      children
    }
  );
}
function InlineSelect({
  value,
  options,
  onChange,
  onDone
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    "select",
    {
      autoFocus: true,
      value,
      onChange: (e) => {
        onChange(e.target.value);
        onDone();
      },
      onBlur: onDone,
      className: "h-6 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1",
      children: options.map((o) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: o.value, children: o.label }, o.value))
    }
  );
}
function BoardRow({
  trip,
  locations,
  drivers,
  vehicles,
  yachts,
  active,
  onActivate,
  onSave,
  onDelete
}) {
  const isActive = (f) => active?.row === trip.id && active.field === f;
  const pickupLabel = trip.pickup_loc?.name ?? trip.pickup_address ?? "—";
  const dropoffLabel = trip.dropoff_loc?.name ?? trip.dropoff_address ?? "—";
  const driverLabel = trip.driver?.full_name ?? "—";
  const vehicleLabel = trip.vehicle ? `${trip.vehicle.make} ${trip.vehicle.model}` : "—";
  const yachtLabel = trip.yacht?.vessel_name ?? "—";
  async function patchStatus(s) {
    await onSave(trip.id, { status: s });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/40 group hover:bg-muted/10 transition-colors h-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("trip_type"), onClick: () => onActivate("trip_type"), className: "w-28", children: isActive("trip_type") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      InlineSelect,
      {
        value: trip.trip_type,
        options: [{ value: "crew_pickup", label: "Crew Pickup" }, { value: "inhouse", label: "In-House" }],
        onChange: (v) => onSave(trip.id, { trip_type: v }),
        onDone: () => onActivate("")
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { label: TYPE_LABEL[trip.trip_type], color: TYPE_COLOR[trip.trip_type] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("passenger_name"), onClick: () => onActivate("passenger_name"), className: "min-w-[120px]", children: isActive("passenger_name") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        defaultValue: trip.passenger_name ?? "",
        onBlur: (e) => onSave(trip.id, { passenger_name: e.target.value || null }),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            onSave(trip.id, { passenger_name: e.target.value || null });
            onActivate("");
          }
        },
        className: "h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: trip.passenger_name ? "text-foreground font-medium" : "text-muted-foreground/50", children: trip.passenger_name ?? "—" }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("yacht_id"), onClick: () => onActivate("yacht_id"), className: "w-28", children: isActive("yacht_id") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      InlineSelect,
      {
        value: trip.yacht_id ?? "__none",
        options: [{ value: "__none", label: "— None —" }, ...yachts.map((y) => ({ value: y.id, label: y.vessel_name }))],
        onChange: (v) => onSave(trip.id, { yacht_id: v === "__none" ? null : v }),
        onDone: () => onActivate("")
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: yachtLabel }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("pickup_address"), onClick: () => onActivate("pickup_address"), className: "min-w-[140px]", children: isActive("pickup_address") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        defaultValue: pickupLabel !== "—" ? pickupLabel : "",
        onBlur: (e) => onSave(trip.id, { pickup_address: e.target.value || null, pickup_location_id: null }),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            onSave(trip.id, { pickup_address: e.target.value || null, pickup_location_id: null });
            onActivate("");
          }
        },
        className: "h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground truncate block max-w-[140px]", children: pickupLabel }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("dropoff_address"), onClick: () => onActivate("dropoff_address"), className: "min-w-[140px]", children: isActive("dropoff_address") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        defaultValue: dropoffLabel !== "—" ? dropoffLabel : "",
        onBlur: (e) => onSave(trip.id, { dropoff_address: e.target.value || null, dropoff_location_id: null }),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            onSave(trip.id, { dropoff_address: e.target.value || null, dropoff_location_id: null });
            onActivate("");
          }
        },
        className: "h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground truncate block max-w-[140px]", children: dropoffLabel }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("pickup_datetime"), onClick: () => onActivate("pickup_datetime"), className: "w-36", children: isActive("pickup_datetime") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        type: "datetime-local",
        defaultValue: trip.pickup_datetime ? trip.pickup_datetime.slice(0, 16) : "",
        onBlur: (e) => {
          onSave(trip.id, { pickup_datetime: e.target.value || null });
          onActivate("");
        },
        className: "h-5 w-full rounded border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary px-1"
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground whitespace-nowrap", children: fmtDt(trip.pickup_datetime) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("driver_id"), onClick: () => onActivate("driver_id"), className: "w-28", children: isActive("driver_id") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      InlineSelect,
      {
        value: trip.driver_id ?? "__none",
        options: [{ value: "__none", label: "— None —" }, ...drivers.map((d) => ({ value: d.id, label: d.full_name }))],
        onChange: (v) => onSave(trip.id, { driver_id: v === "__none" ? null : v }),
        onDone: () => onActivate("")
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: driverLabel }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("vehicle_id"), onClick: () => onActivate("vehicle_id"), className: "w-32", children: isActive("vehicle_id") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      InlineSelect,
      {
        value: trip.vehicle_id ?? "__none",
        options: [{ value: "__none", label: "— None —" }, ...vehicles.map((v) => ({ value: v.id, label: `${v.make} ${v.model}` }))],
        onChange: (v) => onSave(trip.id, { vehicle_id: v === "__none" ? null : v }),
        onDone: () => onActivate("")
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: vehicleLabel }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(BoardCell, { editing: isActive("status"), onClick: () => onActivate("status"), className: "w-28", children: isActive("status") ? /* @__PURE__ */ jsxRuntimeExports.jsx(
      InlineSelect,
      {
        value: trip.status,
        options: STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
        onChange: (v) => patchStatus(v),
        onDone: () => onActivate("")
      }
    ) : /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { label: STATUS_LABEL[trip.status], color: STATUS_COLOR[trip.status] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "w-16 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "button",
      {
        onClick: (e) => {
          e.stopPropagation();
          onDelete(trip.id);
        },
        className: "rounded p-1 hover:bg-destructive/10 transition",
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3 w-3 text-destructive/60" })
      }
    ) }) })
  ] });
}
function BoardAddRow({
  locations,
  drivers,
  vehicles,
  yachts,
  onAdd
}) {
  const [active, setActive] = reactExports.useState(false);
  const [form, setForm] = reactExports.useState({
    trip_type: "crew_pickup",
    status: "pending",
    yacht_id: "__none",
    driver_id: "__none",
    vehicle_id: "__none",
    passenger_name: "",
    pickup_address: "",
    dropoff_address: "",
    pickup_datetime: ""
  });
  const [saving, setSaving] = reactExports.useState(false);
  async function commit() {
    if (!form.passenger_name && !form.pickup_address) return;
    setSaving(true);
    await onAdd(form);
    setForm({ trip_type: "crew_pickup", status: "pending", yacht_id: "__none", driver_id: "__none", vehicle_id: "__none", passenger_name: "", pickup_address: "", dropoff_address: "", pickup_datetime: "" });
    setActive(false);
    setSaving(false);
  }
  if (!active) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "border-b border-border/40", children: /* @__PURE__ */ jsxRuntimeExports.jsx("td", { colSpan: 10, className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "button",
      {
        onClick: () => setActive(true),
        className: "flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3 w-3" }),
          " Add trip"
        ]
      }
    ) }) });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/40 bg-primary/5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "select",
      {
        value: form.trip_type,
        onChange: (e) => setForm((f) => ({ ...f, trip_type: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "crew_pickup", children: "Crew Pickup" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "inhouse", children: "In-House" })
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        autoFocus: true,
        placeholder: "Passenger name",
        value: form.passenger_name ?? "",
        onChange: (e) => setForm((f) => ({ ...f, passenger_name: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "select",
      {
        value: form.yacht_id,
        onChange: (e) => setForm((f) => ({ ...f, yacht_id: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "__none", children: "— None —" }),
          yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: y.id, children: y.vessel_name }, y.id))
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        placeholder: "Pickup address",
        value: form.pickup_address ?? "",
        onChange: (e) => setForm((f) => ({ ...f, pickup_address: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        placeholder: "Drop-off address",
        value: form.dropoff_address ?? "",
        onChange: (e) => setForm((f) => ({ ...f, dropoff_address: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "input",
      {
        type: "datetime-local",
        value: form.pickup_datetime ?? "",
        onChange: (e) => setForm((f) => ({ ...f, pickup_datetime: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1 focus:outline-none focus:ring-1 focus:ring-primary"
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "select",
      {
        value: form.driver_id,
        onChange: (e) => setForm((f) => ({ ...f, driver_id: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "__none", children: "— None —" }),
          drivers.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: d.id, children: d.full_name }, d.id))
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "select",
      {
        value: form.vehicle_id,
        onChange: (e) => setForm((f) => ({ ...f, vehicle_id: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: "__none", children: "— None —" }),
          vehicles.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsxs("option", { value: v.id, children: [
            v.make,
            " ",
            v.model
          ] }, v.id))
        ]
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "border-r border-border/40 px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      "select",
      {
        value: form.status,
        onChange: (e) => setForm((f) => ({ ...f, status: e.target.value })),
        className: "h-6 w-full rounded border border-border bg-card text-xs px-1",
        children: STATUS_ORDER.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx("option", { value: s, children: STATUS_LABEL[s] }, s))
      }
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-2 py-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: commit, disabled: saving, className: "rounded p-1 hover:bg-emerald-500/15 text-emerald-400 transition", children: saving ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "h-3 w-3" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setActive(false), className: "rounded p-1 hover:bg-muted text-muted-foreground transition", children: /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3 w-3" }) })
    ] }) })
  ] });
}
function TripsPage() {
  const [trips, setTrips] = reactExports.useState([]);
  const [locations, setLocations] = reactExports.useState([]);
  const [drivers, setDrivers] = reactExports.useState([]);
  const [vehicles, setVehicles] = reactExports.useState([]);
  const [yachts, setYachts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [filter, setFilter] = reactExports.useState("all");
  const [viewMode, setViewMode] = reactExports.useState("table");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY_FORM);
  const [busy, setBusy] = reactExports.useState(false);
  const [boardActive, setBoardActive] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void loadAll();
  }, []);
  async function loadAll() {
    setLoading(true);
    const [tripsRes, locsRes, driversRes, vehiclesRes, yachtsRes] = await Promise.all([
      supabase.from("crew_trips").select(`*, driver:crew_drivers(full_name), vehicle:crew_vehicles(make,model,registration), pickup_loc:crew_locations!pickup_location_id(name,latitude,longitude), dropoff_loc:crew_locations!dropoff_location_id(name,latitude,longitude), yacht:yachts(vessel_name)`).order("pickup_datetime", { ascending: false }),
      supabase.from("crew_locations").select("id,name,address,latitude,longitude").order("name"),
      supabase.from("crew_drivers").select("id,full_name").order("full_name"),
      supabase.from("crew_vehicles").select("id,make,model,registration").order("make"),
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
    const pickupSaved = t.pickup_location_id ? locations.find((l) => l.id === t.pickup_location_id) : null;
    const dropoffSaved = t.dropoff_location_id ? locations.find((l) => l.id === t.dropoff_location_id) : null;
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
      notes: t.notes ?? ""
    });
    setOpen(true);
  }
  const pickupValue = {
    location_id: form.pickup_location_id,
    address: form.pickup_address,
    lat: form.pickup_lat,
    lng: form.pickup_lng
  };
  const dropoffValue = {
    location_id: form.dropoff_location_id,
    address: form.dropoff_address,
    lat: form.dropoff_lat,
    lng: form.dropoff_lng
  };
  const pickupLoc = form.pickup_location_id !== "__none" ? locations.find((l) => l.id === form.pickup_location_id) : null;
  const dropoffLoc = form.dropoff_location_id !== "__none" ? locations.find((l) => l.id === form.dropoff_location_id) : null;
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
        pickup_address: form.pickup_location_id === "__none" ? form.pickup_address || null : null,
        dropoff_location_id: form.dropoff_location_id === "__none" ? null : form.dropoff_location_id,
        dropoff_address: form.dropoff_location_id === "__none" ? form.dropoff_address || null : null,
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
  async function boardSave(id, patch) {
    const { error } = await supabase.from("crew_trips").update({ ...patch, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTrips((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
    setBoardActive(null);
  }
  async function boardAdd(partialForm) {
    const payload = {
      trip_type: partialForm.trip_type ?? "crew_pickup",
      passenger_name: partialForm.passenger_name || null,
      yacht_id: partialForm.yacht_id === "__none" ? null : partialForm.yacht_id,
      pickup_address: partialForm.pickup_address || null,
      dropoff_address: partialForm.dropoff_address || null,
      pickup_datetime: partialForm.pickup_datetime || null,
      driver_id: partialForm.driver_id === "__none" ? null : partialForm.driver_id,
      vehicle_id: partialForm.vehicle_id === "__none" ? null : partialForm.vehicle_id,
      status: partialForm.status ?? "pending"
    };
    const { error } = await supabase.from("crew_trips").insert([payload]);
    if (error) {
      toast.error(error.message);
      return;
    }
    await loadAll();
    toast.success("Trip added");
  }
  async function handleDelete(id) {
    if (!confirm("Delete this trip?")) return;
    const { error } = await supabase.from("crew_trips").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Removed");
      await loadAll();
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { className: "h-4 w-4 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold", children: "Trips" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center gap-0.5 ml-1", children: ["all", "crew_pickup", "inhouse"].map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setFilter(f),
            className: cn(
              "rounded px-2.5 py-1 text-xs font-medium transition",
              filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            ),
            children: f === "all" ? "All" : TYPE_LABEL[f]
          },
          f
        )) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-7 items-center rounded-md border border-border bg-card p-0.5 gap-0.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setViewMode("table"),
              title: "Table view",
              className: cn("flex items-center gap-1 rounded px-2 py-1 text-xs transition", viewMode === "table" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Table2, { className: "h-3 w-3" }),
                " Table"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "button",
            {
              onClick: () => setViewMode("board"),
              title: "Board / inline edit",
              className: cn("flex items-center gap-1 rounded px-2 py-1 text-xs transition", viewMode === "board" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutGrid, { className: "h-3 w-3" }),
                " Board"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "h-7 gap-1.5 text-xs px-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " New Trip"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-4", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin text-muted-foreground" }) }) : filtered.length === 0 && viewMode === "table" ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { className: "h-8 w-8 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs", children: "No trips yet." })
    ] }) : viewMode === "table" ? (
      /* ── Table View ── */
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-x-auto bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs min-w-[1000px]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/30 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Type", "Passenger", "Yacht", "Pickup", "Drop-off", "Pickup Time", "Driver", "Vehicle", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap", children: h }, h)) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border/50", children: filtered.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors group", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { label: TYPE_LABEL[t.trip_type], color: TYPE_COLOR[t.trip_type] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 font-medium text-foreground", children: t.passenger_name ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: t.yacht?.vessel_name ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground max-w-[140px] truncate", children: t.pickup_loc?.name ?? t.pickup_address ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground max-w-[140px] truncate", children: t.dropoff_loc?.name ?? t.dropoff_address ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground whitespace-nowrap", children: fmtDt(t.pickup_datetime) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: t.driver?.full_name ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: t.vehicle ? `${t.vehicle.make} ${t.vehicle.model}` : "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Badge, { label: STATUS_LABEL[t.status], color: STATUS_COLOR[t.status] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-0.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => openEdit(t), className: "rounded p-1 hover:bg-muted transition", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3 w-3 text-muted-foreground" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => handleDelete(t.id), className: "rounded p-1 hover:bg-destructive/10 transition", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3 w-3 text-destructive/60" }) })
          ] }) })
        ] }, t.id)) })
      ] }) })
    ) : (
      /* ── Board View ── */
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border overflow-x-auto bg-card", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 py-2 border-b border-border/60 flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(LayoutGrid, { className: "h-3 w-3 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] text-muted-foreground font-medium uppercase tracking-wider", children: "Board — click any cell to edit inline · Tab / Enter to confirm" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full min-w-[1100px]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/20 border-b border-border/60", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Type", "Passenger", "Yacht", "Pickup", "Drop-off", "Date & Time", "Driver", "Vehicle", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap border-r border-border/40 last:border-r-0", children: h }, h)) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("tbody", { children: [
            filtered.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              BoardRow,
              {
                trip: t,
                locations,
                drivers,
                vehicles,
                yachts,
                active: boardActive?.row === t.id ? boardActive : null,
                onActivate: (field) => field ? setBoardActive({ row: t.id, field }) : setBoardActive(null),
                onSave: boardSave,
                onDelete: handleDelete
              },
              t.id
            )),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              BoardAddRow,
              {
                locations,
                drivers,
                vehicles,
                yachts,
                onAdd: boardAdd
              }
            )
          ] })
        ] })
      ] })
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-4xl max-h-[88vh] overflow-hidden flex flex-col p-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { className: "px-5 pt-4 pb-3 border-b border-border shrink-0", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { className: "text-sm font-semibold flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Route, { className: "h-3.5 w-3.5 text-primary" }),
        editing ? "Edit Trip" : "New Trip"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-1 overflow-hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-y-auto px-5 py-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-x-4 gap-y-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Trip Type" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.trip_type, onValueChange: (v) => setForm((f) => ({ ...f, trip_type: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "crew_pickup", children: "Crew Pickup" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "inhouse", children: "In-House" })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setForm((f) => ({ ...f, status: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: STATUS_ORDER.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s, children: STATUS_LABEL[s] }, s)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Passenger Name" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.passenger_name,
                onChange: (e) => setForm((f) => ({ ...f, passenger_name: e.target.value })),
                placeholder: "e.g. Captain Smith",
                className: "h-8 text-xs"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { className: "text-xs text-muted-foreground", children: [
              "Yacht ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground/60", children: "(client)" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.yacht_id, onValueChange: (v) => setForm((f) => ({ ...f, yacht_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht…" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Driver" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.driver_id, onValueChange: (v) => setForm((f) => ({ ...f, driver_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select driver" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                drivers.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: d.id, children: d.full_name }, d.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Vehicle" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.vehicle_id, onValueChange: (v) => setForm((f) => ({ ...f, vehicle_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select vehicle" }) }),
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
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { className: "text-xs text-muted-foreground flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-3 w-3 text-emerald-400" }),
              " Pickup Location"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              AddressCombobox,
              {
                value: pickupValue,
                onChange: (v) => setForm((f) => ({ ...f, pickup_location_id: v.location_id, pickup_address: v.address, pickup_lat: v.lat, pickup_lng: v.lng })),
                savedLocations: locations,
                placeholder: "Search saved locations or any address…"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { className: "text-xs text-muted-foreground flex items-center gap-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-3 w-3 text-red-400" }),
              " Drop-off Location"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              AddressCombobox,
              {
                value: dropoffValue,
                onChange: (v) => setForm((f) => ({ ...f, dropoff_location_id: v.location_id, dropoff_address: v.address, dropoff_lat: v.lat, dropoff_lng: v.lng })),
                savedLocations: locations,
                placeholder: "Search saved locations or any address…"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Pickup Date & Time" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "datetime-local",
                value: form.pickup_datetime,
                onChange: (e) => setForm((f) => ({ ...f, pickup_datetime: e.target.value })),
                className: "h-8 text-xs"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Drop-off Date & Time" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "datetime-local",
                value: form.dropoff_datetime,
                onChange: (e) => setForm((f) => ({ ...f, dropoff_datetime: e.target.value })),
                className: "h-8 text-xs"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { className: "text-xs text-muted-foreground", children: "Notes" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Textarea,
              {
                rows: 2,
                value: form.notes,
                onChange: (e) => setForm((f) => ({ ...f, notes: e.target.value })),
                placeholder: "Flight number, bags, special instructions…",
                className: "text-xs resize-none"
              }
            )
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "w-72 shrink-0 border-l border-border flex flex-col bg-muted/10", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5 px-4 py-3 border-b border-border/60", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Navigation, { className: "h-3.5 w-3.5 text-primary" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-xs font-medium", children: "Route Preview" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 p-3", children: hasMapCoords ? /* @__PURE__ */ jsxRuntimeExports.jsx(
            RouteMap,
            {
              pickupLat: mapPickupLat,
              pickupLng: mapPickupLng,
              dropLat: mapDropLat,
              dropLng: mapDropLng
            }
          ) : /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-8 w-8 opacity-20" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] leading-relaxed", children: "Select addresses with known coordinates to preview the route." })
          ] }) })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 px-5 py-3 border-t border-border shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, size: "sm", className: "h-7 text-xs px-3", children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, size: "sm", className: "h-7 text-xs px-3 gap-1.5", children: [
          busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3 w-3 animate-spin" }),
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
