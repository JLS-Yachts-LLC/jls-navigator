import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { s as supabase, t as toast } from "./router-DtI2KWt0.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { L as Label } from "./label-Ds3qDWN_.js";
import { T as Textarea } from "./textarea-DR2LoV9d.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-Ccda9G2L.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-C7GSg9K8.js";
import { T as Truck } from "./truck-CPriy9OO.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import { C as Clock } from "./clock-Bd7PLjhz.js";
import { C as CircleCheck } from "./circle-check-7tBlyRXp.js";
import { c as createLucideIcon } from "./createLucideIcon-DhyYiX_6.js";
import { P as Plus } from "./plus-CfTJ2ZaO.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { M as MapPin } from "./map-pin-CfDOFZG6.js";
import { P as Pencil } from "./index-C-33PlkV.js";
import { T as Trash2 } from "./index-DBkBZibR.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./utils-Bz4m9VPB.js";
import "./Combination-B8MApAKg.js";
import "./index-Br3F6A4M.js";
import "./chevron-down-HwTvS_C7.js";
import "./x-DFtrhGVJ.js";
const __iconNode = [
  ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
  ["line", { x1: "12", x2: "12", y1: "8", y2: "12", key: "1pkeuh" }],
  ["line", { x1: "12", x2: "12.01", y1: "16", y2: "16", key: "4dfq90" }]
];
const CircleAlert = createLucideIcon("circle-alert", __iconNode);
const STATUSES = [
  { value: "scheduled", label: "Scheduled", color: "bg-blue-500/15 text-blue-400", icon: Clock },
  { value: "in_progress", label: "In Progress", color: "bg-amber-500/15 text-amber-400", icon: Truck },
  { value: "completed", label: "Completed", color: "bg-emerald-500/15 text-emerald-400", icon: CircleCheck },
  { value: "failed", label: "Failed", color: "bg-destructive/15 text-destructive", icon: CircleAlert },
  { value: "cancelled", label: "Cancelled", color: "bg-muted text-muted-foreground", icon: CircleAlert }
];
const PRIORITIES = [
  { value: "low", label: "Low", color: "bg-muted text-muted-foreground" },
  { value: "normal", label: "Normal", color: "bg-blue-500/15 text-blue-400" },
  { value: "high", label: "High", color: "bg-amber-500/15 text-amber-400" },
  { value: "urgent", label: "Urgent", color: "bg-destructive/15 text-destructive" }
];
const EMPTY = {
  package_id: "__none",
  driver_id: "__none",
  yacht_id: "__none",
  scheduled_date: "",
  completed_date: "",
  pickup_address: "",
  dropoff_address: "",
  status: "scheduled",
  priority: "normal",
  notes: ""
};
function StatusBadge({ status }) {
  const s = STATUSES.find((x) => x.value === status);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${s?.color ?? "bg-muted text-muted-foreground"}`, children: s?.label ?? status });
}
function PriorityBadge({ priority }) {
  const p = PRIORITIES.find((x) => x.value === priority);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2 py-0.5 text-xs font-medium ${p?.color ?? "bg-muted text-muted-foreground"}`, children: p?.label ?? priority });
}
function DeliveriesPage() {
  const [deliveries, setDeliveries] = reactExports.useState([]);
  const [yachts, setYachts] = reactExports.useState([]);
  const [drivers, setDrivers] = reactExports.useState([]);
  const [packages, setPackages] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [tableError, setTableError] = reactExports.useState(false);
  const [q, setQ] = reactExports.useState("");
  const [statusFilter, setStatusFilter] = reactExports.useState("all");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY);
  const [busy, setBusy] = reactExports.useState(false);
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void load();
    void loadYachts();
    void loadDrivers();
    void loadPackages();
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("deliveries").select("*").order("scheduled_date", { ascending: false });
    if (error) {
      if (String(error.message).includes("does not exist") || String(error.code) === "42P01") {
        setTableError(true);
      } else {
        toast.error(error.message);
      }
    } else {
      setDeliveries(data);
      setTableError(false);
    }
    setLoading(false);
  }
  async function loadYachts() {
    const { data } = await supabase.from("yachts").select("id, vessel_name").order("vessel_name");
    setYachts(data ?? []);
  }
  async function loadDrivers() {
    const { data } = await supabase.from("delivery_drivers").select("id, name").order("name");
    setDrivers(data ?? []);
  }
  async function loadPackages() {
    const { data } = await supabase.from("packages").select("id, tracking_number, description").order("created_at", { ascending: false });
    setPackages(data ?? []);
  }
  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(d) {
    setEditing(d);
    setForm({
      package_id: d.package_id ?? "__none",
      driver_id: d.driver_id ?? "__none",
      yacht_id: d.yacht_id ?? "__none",
      scheduled_date: d.scheduled_date ?? "",
      completed_date: d.completed_date ?? "",
      pickup_address: d.pickup_address ?? "",
      dropoff_address: d.dropoff_address ?? "",
      status: d.status,
      priority: d.priority,
      notes: d.notes ?? ""
    });
    setOpen(true);
  }
  async function handleSave() {
    if (!form.pickup_address.trim() && !form.dropoff_address.trim()) {
      toast.error("At least one address is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        package_id: form.package_id === "__none" ? null : form.package_id,
        driver_id: form.driver_id === "__none" ? null : form.driver_id,
        yacht_id: form.yacht_id === "__none" ? null : form.yacht_id,
        scheduled_date: form.scheduled_date || null,
        completed_date: form.completed_date || null,
        pickup_address: form.pickup_address || null,
        dropoff_address: form.dropoff_address || null,
        status: form.status,
        priority: form.priority,
        notes: form.notes || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("deliveries").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Delivery updated");
      } else {
        const { error } = await supabase.from("deliveries").insert([payload]);
        if (error) throw error;
        toast.success("Delivery added");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("deliveries").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Delivery removed");
      await load();
    }
    setDeleteTarget(null);
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const filtered = reactExports.useMemo(() => {
    let list = deliveries;
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (q.trim()) {
      const s = q.toLowerCase();
      const driverMap2 = Object.fromEntries(drivers.map((d) => [d.id, d.name]));
      const yachtMap2 = Object.fromEntries(yachts.map((y) => [y.id, y.vessel_name]));
      list = list.filter(
        (d) => [d.pickup_address, d.dropoff_address, d.notes, driverMap2[d.driver_id ?? ""], yachtMap2[d.yacht_id ?? ""]].some(
          (v) => String(v ?? "").toLowerCase().includes(s)
        )
      );
    }
    return list;
  }, [deliveries, statusFilter, q, drivers, yachts]);
  const driverMap = Object.fromEntries(drivers.map((d) => [d.id, d.name]));
  const yachtMap = Object.fromEntries(yachts.map((y) => [y.id, y.vessel_name]));
  const stats = {
    total: deliveries.length,
    scheduled: deliveries.filter((d) => d.status === "scheduled").length,
    inProgress: deliveries.filter((d) => d.status === "in_progress").length,
    completed: deliveries.filter((d) => d.status === "completed").length
  };
  if (tableError) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col items-center justify-center gap-4 p-8 text-center", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Truck, { className: "h-12 w-12 text-muted-foreground/40" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "font-semibold text-sm", children: "Deliveries table not set up" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-muted-foreground mt-1", children: [
          "Apply migration ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("code", { children: "20260523000004_delivery_drivers.sql" }),
          " in the Supabase Dashboard."
        ] })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Truck, { className: "h-4 w-4 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold", children: "Deliveries / Route" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground", children: [
          "(",
          deliveries.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search…", className: "h-8 w-44 pl-8 text-xs" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-8 w-36 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Status" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All statuses" }),
            STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "h-8 gap-1.5 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " Add Delivery"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-4 gap-3 border-b border-border bg-card/20 px-5 py-3", children: [
      { label: "Total", value: stats.total, color: "text-foreground" },
      { label: "Scheduled", value: stats.scheduled, color: "text-blue-400" },
      { label: "In Progress", value: stats.inProgress, color: "text-amber-400" },
      { label: "Completed", value: stats.completed, color: "text-emerald-400" }
    ].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg border border-border bg-card/60 px-4 py-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: s.label }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: `text-xl font-bold ${s.color}`, children: s.value })
    ] }, s.label)) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-5", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Truck, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: q || statusFilter !== "all" ? "No deliveries match the filters." : "No deliveries yet." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/40 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Date", "Pickup", "Dropoff", "Yacht", "Driver", "Priority", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: filtered.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground whitespace-nowrap", children: d.scheduled_date ? new Date(d.scheduled_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 max-w-[160px]", children: d.pickup_address ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 truncate", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-3 w-3 text-muted-foreground shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: d.pickup_address })
        ] }) : "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 max-w-[160px]", children: d.dropoff_address ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 truncate", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-3 w-3 text-primary shrink-0" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "truncate", children: d.dropoff_address })
        ] }) : "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: d.yacht_id ? yachtMap[d.yacht_id] ?? "—" : "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: d.driver_id ? driverMap[d.driver_id] ?? "—" : "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(PriorityBadge, { priority: d.priority }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: d.status }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(d), className: "h-7 w-7 p-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => setDeleteTarget(d), className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
        ] }) })
      ] }, d.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
        editing ? "Edit" : "Add",
        " Delivery"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Driver" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.driver_id, onValueChange: (v) => setForm((f) => ({ ...f, driver_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select driver" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                drivers.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: d.id, children: d.name }, d.id))
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Yacht" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.yacht_id, onValueChange: (v) => setForm((f) => ({ ...f, yacht_id: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select yacht" }) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
                yachts.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y.id, children: y.vessel_name }, y.id))
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Pickup Address" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.pickup_address, onChange: set("pickup_address"), placeholder: "e.g. Dubai Marina, Gate 3" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Dropoff Address" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.dropoff_address, onChange: set("dropoff_address"), placeholder: "e.g. Abu Dhabi Marina, Berth 12" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Scheduled Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.scheduled_date, onChange: set("scheduled_date") })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Completed Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.completed_date, onChange: set("completed_date") })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setForm((f) => ({ ...f, status: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Priority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.priority, onValueChange: (v) => setForm((f) => ({ ...f, priority: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: PRIORITIES.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p.value, children: p.label }, p.value)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Linked Package" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.package_id, onValueChange: (v) => setForm((f) => ({ ...f, package_id: v })), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Link to package (optional)" }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "__none", children: "— None —" }),
              packages.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: p.id, children: p.tracking_number ?? p.description ?? p.id.slice(0, 8) }, p.id))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 2, value: form.notes, onChange: set("notes"), placeholder: "Any special instructions…" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t border-border", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
            busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
            editing ? "Save Changes" : "Add Delivery"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTarget, onOpenChange: (o) => !o && setDeleteTarget(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Remove delivery?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogDescription, { children: "This delivery record will be permanently removed." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogAction, { onClick: confirmDelete, className: "bg-destructive text-destructive-foreground hover:bg-destructive/90", children: "Remove" })
      ] })
    ] }) })
  ] });
}
const SplitComponent = DeliveriesPage;
export {
  SplitComponent as component
};
