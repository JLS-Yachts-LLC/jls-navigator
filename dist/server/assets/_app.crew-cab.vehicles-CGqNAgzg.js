import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-CA1Re7tQ.js";
import { s as supabase, t as toast } from "./router-BiLVVNgM.js";
import { B as Button } from "./button-DUPLVSck.js";
import { I as Input } from "./input-Dk9i5um_.js";
import { L as Label } from "./label-Djzk5h6G.js";
import { L as LoaderCircle, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-DQSrubKo.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-CTytXxG7.js";
import { C as Car } from "./car-9EOcLuZu.js";
import { P as Plus } from "./Combination-CuzF6V9F.js";
import { P as Pencil, T as Trash2 } from "./x-C5JCqeJc.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-BkiIOXMm.js";
import "./chevron-down-fMwAeKn0.js";
import "./index-BYBvOuqV.js";
const EMPTY = { make: "", model: "", year: "", registration: "", color: "", capacity: "4", mileage: "0", status: "available", insurance_expiry: "", notes: "" };
function StatusBadge({ status }) {
  const map = { available: "bg-emerald-500/15 text-emerald-400", in_use: "bg-blue-500/15 text-blue-400", maintenance: "bg-amber-500/15 text-amber-400" };
  const label = { available: "Available", in_use: "In Use", maintenance: "Maintenance" };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`, children: label[status] ?? status });
}
function VehiclesPage() {
  const [vehicles, setVehicles] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY);
  const [busy, setBusy] = reactExports.useState(false);
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
    setForm({ make: v.make, model: v.model, year: v.year ? String(v.year) : "", registration: v.registration ?? "", color: v.color ?? "", capacity: String(v.capacity), mileage: String(v.mileage), status: v.status, insurance_expiry: v.insurance_expiry ?? "", notes: v.notes ?? "" });
    setOpen(true);
  }
  async function handleSave() {
    if (!form.make.trim() || !form.model.trim()) {
      toast.error("Make and Model are required");
      return;
    }
    setBusy(true);
    try {
      const payload = { make: form.make.trim(), model: form.model.trim(), year: form.year ? Number(form.year) : null, registration: form.registration || null, color: form.color || null, capacity: Number(form.capacity) || 4, mileage: Number(form.mileage) || 0, status: form.status, insurance_expiry: form.insurance_expiry || null, notes: form.notes || null, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
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
  async function handleDelete(v) {
    if (!confirm(`Delete "${v.make} ${v.model}"?`)) return;
    const { error } = await supabase.from("crew_vehicles").delete().eq("id", v.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Vehicle removed");
      await load();
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Car, { className: "h-5 w-5 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold", children: "Vehicles" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm text-muted-foreground ml-1", children: [
          "(",
          vehicles.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " Add Vehicle"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : vehicles.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Car, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No vehicles yet. Add your first vehicle." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-x-auto", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm min-w-[900px]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/40 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Make", "Model", "Year", "Registration", "Color", "Capacity", "Mileage", "Insurance Expiry", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: vehicles.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-medium", children: v.make }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: v.model }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: v.year ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground font-mono text-xs", children: v.registration ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: v.color ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: v.capacity }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-4 py-3 text-muted-foreground", children: [
          v.mileage?.toLocaleString(),
          " km"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: v.insurance_expiry ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: v.status }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(v), className: "h-7 w-7 p-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleDelete(v), className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
        ] }) })
      ] }, v.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-lg", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
        editing ? "Edit" : "Add",
        " Vehicle"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
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
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
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
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-3 gap-4", children: [
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
    ] }) })
  ] });
}
const SplitComponent = VehiclesPage;
export {
  SplitComponent as component
};
