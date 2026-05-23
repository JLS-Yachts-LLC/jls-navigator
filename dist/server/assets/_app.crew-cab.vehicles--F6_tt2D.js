import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { s as supabase, t as toast } from "./router-DtI2KWt0.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { L as Label } from "./label-Ds3qDWN_.js";
import { T as Textarea } from "./textarea-DR2LoV9d.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-Ccda9G2L.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-C7GSg9K8.js";
import { C as Car } from "./car-DqbaTNnc.js";
import { T as TriangleAlert } from "./triangle-alert-VZ0QUpdk.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import { P as Plus } from "./plus-CfTJ2ZaO.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { P as Pencil } from "./index-C-33PlkV.js";
import { T as Trash2 } from "./index-DBkBZibR.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./utils-Bz4m9VPB.js";
import "./Combination-B8MApAKg.js";
import "./index-Br3F6A4M.js";
import "./createLucideIcon-DhyYiX_6.js";
import "./chevron-down-HwTvS_C7.js";
import "./x-DFtrhGVJ.js";
const EMPTY = {
  make: "",
  model: "",
  year: "",
  registration: "",
  color: "",
  capacity: "4",
  mileage: "0",
  status: "available",
  insurance_expiry: "",
  notes: ""
};
function StatusBadge({ status }) {
  const map = {
    available: "bg-emerald-500/15 text-emerald-400",
    in_use: "bg-blue-500/15 text-blue-400",
    maintenance: "bg-amber-500/15 text-amber-400"
  };
  const label = {
    available: "Available",
    in_use: "In Use",
    maintenance: "Maintenance"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`, children: label[status] ?? status });
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = (/* @__PURE__ */ new Date(dateStr + "T00:00:00")).getTime();
  const today = /* @__PURE__ */ new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today.getTime()) / (1e3 * 60 * 60 * 24));
}
function InsuranceBadge({ expiry }) {
  const days = daysUntil(expiry);
  if (days === null) return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "—" });
  let cls = "text-foreground/80";
  let icon = null;
  if (days < 0) {
    cls = "text-destructive font-semibold";
    icon = /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3 w-3 inline mr-0.5" });
  } else if (days <= 30) {
    cls = "text-warning font-semibold";
    icon = /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3 w-3 inline mr-0.5" });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: cls, children: [
    icon,
    expiry,
    days < 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-1 text-[10px] opacity-80", children: "(expired)" }) : days <= 30 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 text-[10px] opacity-80", children: [
      "(",
      days,
      "d)"
    ] }) : null
  ] });
}
function VehiclesPage() {
  const [vehicles, setVehicles] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [q, setQ] = reactExports.useState("");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY);
  const [busy, setBusy] = reactExports.useState(false);
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("crew_vehicles").select("*").order("make");
    if (error) toast.error(error.message);
    else setVehicles(data);
    setLoading(false);
  }
  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(v) {
    setEditing(v);
    setForm({
      make: v.make,
      model: v.model,
      year: v.year ? String(v.year) : "",
      registration: v.registration ?? "",
      color: v.color ?? "",
      capacity: String(v.capacity),
      mileage: String(v.mileage),
      status: v.status,
      insurance_expiry: v.insurance_expiry ?? "",
      notes: v.notes ?? ""
    });
    setOpen(true);
  }
  async function handleSave() {
    if (!form.make.trim() || !form.model.trim()) {
      toast.error("Make and Model are required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        make: form.make.trim(),
        model: form.model.trim(),
        year: form.year ? Number(form.year) : null,
        registration: form.registration || null,
        color: form.color || null,
        capacity: Number(form.capacity) || 4,
        mileage: Number(form.mileage) || 0,
        status: form.status,
        insurance_expiry: form.insurance_expiry || null,
        notes: form.notes || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("crew_vehicles").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Vehicle updated");
      } else {
        const { error } = await supabase.from("crew_vehicles").insert([payload]);
        if (error) throw error;
        toast.success("Vehicle added");
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
    const { error } = await supabase.from("crew_vehicles").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Vehicle removed");
      await load();
    }
    setDeleteTarget(null);
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const filtered = reactExports.useMemo(() => {
    if (!q.trim()) return vehicles;
    const s = q.toLowerCase();
    return vehicles.filter(
      (v) => [v.make, v.model, v.registration, v.color].some((val) => String(val ?? "").toLowerCase().includes(s))
    );
  }, [vehicles, q]);
  const expiryWarnings = reactExports.useMemo(
    () => vehicles.filter((v) => {
      const d = daysUntil(v.insurance_expiry);
      return d !== null && d <= 30;
    }).length,
    [vehicles]
  );
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Car, { className: "h-4 w-4 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold", children: "Vehicles" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground", children: [
          "(",
          vehicles.length,
          ")"
        ] }),
        expiryWarnings > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3 w-3" }),
          " ",
          expiryWarnings,
          " insurance expiring"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: q,
              onChange: (e) => setQ(e.target.value),
              placeholder: "Search vehicles…",
              className: "h-8 w-52 pl-8 text-xs"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "h-8 gap-1.5 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " Add Vehicle"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-5", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Car, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: q ? `No vehicles matching "${q}"` : "No vehicles yet. Add your first vehicle." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs min-w-[900px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/40 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Make", "Model", "Year", "Registration", "Color", "Capacity", "Mileage", "Insurance Expiry", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: filtered.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 font-medium text-sm", children: v.make }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: v.model }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: v.year ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground font-mono", children: v.registration ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: v.color ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground", children: v.capacity }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-3 py-1.5 text-muted-foreground", children: [
          v.mileage?.toLocaleString(),
          " km"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(InsuranceBadge, { expiry: v.insurance_expiry }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: v.status }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(v), className: "h-7 w-7 p-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              variant: "ghost",
              size: "sm",
              onClick: () => setDeleteTarget(v),
              className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" })
            }
          )
        ] }) })
      ] }, v.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
        editing ? "Edit" : "Add",
        " Vehicle"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Make ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.make, onChange: set("make"), placeholder: "e.g. Toyota" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Model ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.model, onChange: set("model"), placeholder: "e.g. Land Cruiser" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Year" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", value: form.year, onChange: set("year"), placeholder: "2024" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Registration" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.registration, onChange: set("registration"), placeholder: "DXB 12345" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Color" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.color, onChange: set("color"), placeholder: "White" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Capacity" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", value: form.capacity, onChange: set("capacity") })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Mileage (km)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", value: form.mileage, onChange: set("mileage") })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Insurance Expiry" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "date", value: form.insurance_expiry, onChange: set("insurance_expiry") })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setForm((f) => ({ ...f, status: v })), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "available", children: "Available" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "in_use", children: "In Use" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "maintenance", children: "Maintenance" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 2, value: form.notes, onChange: set("notes"), placeholder: "Any notes…" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t border-border", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
            busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
            editing ? "Save Changes" : "Add Vehicle"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTarget, onOpenChange: (o) => !o && setDeleteTarget(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Delete vehicle?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("strong", { children: [
            deleteTarget?.make,
            " ",
            deleteTarget?.model
          ] }),
          " will be permanently removed. This cannot be undone."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogCancel, { children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          AlertDialogAction,
          {
            onClick: confirmDelete,
            className: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            children: "Delete"
          }
        )
      ] })
    ] }) })
  ] });
}
const SplitComponent = VehiclesPage;
export {
  SplitComponent as component
};
