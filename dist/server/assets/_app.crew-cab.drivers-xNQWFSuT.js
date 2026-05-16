import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-DsQ-8Irl.js";
import { s as supabase, t as toast } from "./router-DIZelgi3.js";
import { B as Button } from "./button-BpYf_3Uk.js";
import { I as Input } from "./input-BJ_AqVVM.js";
import { L as Label } from "./label-Davl8uUu.js";
import { L as LoaderCircle, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-i33xsu0B.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-rEAIxUU7.js";
import { C as CircleUserRound } from "./circle-user-round-Be0TXRIe.js";
import { e as Plus } from "./Combination-DYVvUise.js";
import { P as Pencil, T as Trash2 } from "./x-C86O2zKF.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-MgZLU5K_.js";
import "./chevron-down-CpX_Bl0x.js";
import "./index-EFGDcBO_.js";
const EMPTY = { full_name: "", phone: "", email: "", license_no: "", status: "active", notes: "" };
function StatusBadge({ status }) {
  const cls = status === "active" ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`, children: status === "active" ? "Active" : "Inactive" });
}
function DriversPage() {
  const [drivers, setDrivers] = reactExports.useState([]);
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
    const { data, error } = await supabase.from("crew_drivers").select("*").order("full_name");
    if (error) toast.error(error.message);
    else setDrivers(data);
    setLoading(false);
  }
  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(d) {
    setEditing(d);
    setForm({ full_name: d.full_name, phone: d.phone ?? "", email: d.email ?? "", license_no: d.license_no ?? "", status: d.status, notes: d.notes ?? "" });
    setOpen(true);
  }
  async function handleSave() {
    if (!form.full_name.trim()) {
      toast.error("Full name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = { full_name: form.full_name.trim(), phone: form.phone || null, email: form.email || null, license_no: form.license_no || null, status: form.status, notes: form.notes || null, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
      if (editing) {
        const { error } = await supabase.from("crew_drivers").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Driver updated");
      } else {
        const { error } = await supabase.from("crew_drivers").insert([payload]);
        if (error) throw error;
        toast.success("Driver added");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleDelete(d) {
    if (!confirm(`Delete driver "${d.full_name}"?`)) return;
    const { error } = await supabase.from("crew_drivers").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Driver removed");
      await load();
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(CircleUserRound, { className: "h-5 w-5 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold", children: "Drivers" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm text-muted-foreground ml-1", children: [
          "(",
          drivers.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " Add Driver"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : drivers.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(CircleUserRound, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No drivers yet. Add your first driver." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/40 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Full Name", "Phone", "Email", "License No.", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: drivers.map((d) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-medium", children: d.full_name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: d.phone ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: d.email ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground", children: d.license_no ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: d.status }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(d), className: "h-7 w-7 p-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleDelete(d), className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
        ] }) })
      ] }, d.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
        editing ? "Edit" : "Add",
        " Driver"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
            "Full Name ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.full_name, onChange: (e) => setForm((f) => ({ ...f, full_name: e.target.value })), placeholder: "e.g. Ahmed Al Mansouri" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Phone" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.phone, onChange: (e) => setForm((f) => ({ ...f, phone: e.target.value })), placeholder: "+971 50 000 0000" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Email" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "email", value: form.email, onChange: (e) => setForm((f) => ({ ...f, email: e.target.value })), placeholder: "driver@jls.ae" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "License No." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.license_no, onChange: (e) => setForm((f) => ({ ...f, license_no: e.target.value })), placeholder: "DXB-123456" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setForm((f) => ({ ...f, status: v })), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "active", children: "Active" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "inactive", children: "Inactive" })
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Textarea, { rows: 3, value: form.notes, onChange: (e) => setForm((f) => ({ ...f, notes: e.target.value })), placeholder: "Any additional notes…" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t border-border", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
            busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
            editing ? "Save Changes" : "Add Driver"
          ] })
        ] })
      ] })
    ] }) })
  ] });
}
const SplitComponent = DriversPage;
export {
  SplitComponent as component
};
