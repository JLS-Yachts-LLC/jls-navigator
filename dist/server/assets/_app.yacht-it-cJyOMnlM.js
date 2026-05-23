import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { s as supabase, t as toast } from "./router-DtI2KWt0.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { L as Label } from "./label-Ds3qDWN_.js";
import { T as Textarea } from "./textarea-DR2LoV9d.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-Ccda9G2L.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-C7GSg9K8.js";
import { M as Monitor } from "./monitor-BF1eKesX.js";
import { P as Plus } from "./plus-CfTJ2ZaO.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { c as createLucideIcon } from "./createLucideIcon-DhyYiX_6.js";
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
  ["path", { d: "M12 20h.01", key: "zekei9" }],
  ["path", { d: "M2 8.82a15 15 0 0 1 20 0", key: "dnpr2z" }],
  ["path", { d: "M5 12.859a10 10 0 0 1 14 0", key: "1x1e6c" }],
  ["path", { d: "M8.5 16.429a5 5 0 0 1 7 0", key: "1bycff" }]
];
const Wifi = createLucideIcon("wifi", __iconNode);
const CATEGORIES = [
  { value: "software", label: "Software" },
  { value: "hardware", label: "Hardware" },
  { value: "connectivity", label: "Connectivity" },
  { value: "security", label: "Security" },
  { value: "support", label: "Support" },
  { value: "other", label: "Other" }
];
const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "one_off", label: "One-off" }
];
const STATUSES = [
  { value: "active", label: "Active" },
  { value: "expiring_soon", label: "Expiring Soon" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" }
];
const EMPTY_FORM = {
  yacht_name: "",
  service_name: "",
  vendor: null,
  category: "other",
  charge_amount: null,
  cost_amount: null,
  billing_cycle: "monthly",
  start_date: null,
  expiry_date: null,
  status: "active",
  notes: null
};
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtAed(n) {
  if (n == null) return "—";
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function daysUntil(d) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / (1e3 * 60 * 60 * 24));
}
function effectiveStatus(contract) {
  if (contract.status !== "active") return contract.status;
  const days = daysUntil(contract.expiry_date);
  if (days !== null && days >= 0 && days <= 30) return "expiring_soon";
  if (days !== null && days < 0) return "expired";
  return "active";
}
function StatusBadge({ status }) {
  const map = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    expiring_soon: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    expired: "bg-red-500/15 text-red-400 border-red-500/20",
    cancelled: "bg-muted text-muted-foreground border-border"
  };
  const label = {
    active: "Active",
    expiring_soon: "Expiring Soon",
    expired: "Expired",
    cancelled: "Cancelled"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? map.cancelled}`, children: label[status] ?? status });
}
function CategoryBadge({ category }) {
  const map = {
    software: "bg-blue-500/15 text-blue-400",
    hardware: "bg-purple-500/15 text-purple-400",
    connectivity: "bg-sky-500/15 text-sky-400",
    security: "bg-orange-500/15 text-orange-400",
    support: "bg-green-500/15 text-green-400",
    other: "bg-muted text-muted-foreground"
  };
  const label = CATEGORIES.find((c) => c.value === category)?.label ?? category;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${map[category] ?? map.other}`, children: label });
}
function YachtItPage() {
  const [contracts, setContracts] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [search, setSearch] = reactExports.useState("");
  const [statusFilter, setStatusFilter] = reactExports.useState("all");
  const [categoryFilter, setCategoryFilter] = reactExports.useState("all");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY_FORM);
  const [busy, setBusy] = reactExports.useState(false);
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("yacht_it_contracts").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setContracts(data ?? []);
    setLoading(false);
  }
  const contractsWithStatus = reactExports.useMemo(
    () => contracts.map((c) => ({ ...c, _effectiveStatus: effectiveStatus(c) })),
    [contracts]
  );
  const filtered = reactExports.useMemo(() => {
    let list = contractsWithStatus;
    if (statusFilter !== "all") list = list.filter((c) => c._effectiveStatus === statusFilter);
    if (categoryFilter !== "all") list = list.filter((c) => c.category === categoryFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (c) => c.yacht_name.toLowerCase().includes(s) || c.service_name.toLowerCase().includes(s) || (c.vendor ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [contractsWithStatus, statusFilter, categoryFilter, search]);
  const stats = reactExports.useMemo(() => {
    const all = contractsWithStatus;
    return {
      total: all.length,
      active: all.filter((c) => c._effectiveStatus === "active").length,
      expiringSoon: all.filter((c) => c._effectiveStatus === "expiring_soon").length,
      expired: all.filter((c) => c._effectiveStatus === "expired").length
    };
  }, [contractsWithStatus]);
  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  }
  function openEdit(c) {
    setEditing(c);
    const { id, created_at, updated_at, ...rest } = c;
    setForm(rest);
    setOpen(true);
  }
  function setF(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function handleSave() {
    if (!form.yacht_name.trim()) {
      toast.error("Yacht name is required");
      return;
    }
    if (!form.service_name.trim()) {
      toast.error("Service name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        yacht_name: form.yacht_name.trim(),
        service_name: form.service_name.trim(),
        vendor: form.vendor?.trim() || null,
        category: form.category,
        charge_amount: form.charge_amount,
        cost_amount: form.cost_amount,
        billing_cycle: form.billing_cycle,
        start_date: form.start_date || null,
        expiry_date: form.expiry_date || null,
        status: form.status,
        notes: form.notes?.trim() || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("yacht_it_contracts").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Contract updated");
      } else {
        const { error } = await supabase.from("yacht_it_contracts").insert([payload]);
        if (error) throw error;
        toast.success("Contract added");
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
    const { error } = await supabase.from("yacht_it_contracts").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Contract deleted");
      await load();
    }
    setDeleteTarget(null);
  }
  const hasFilters = statusFilter !== "all" || categoryFilter !== "all" || search.trim() !== "";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "border-b border-border bg-card/40 px-6 py-4 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Yacht IT Solutions" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "font-display text-xl font-semibold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Monitor, { className: "h-5 w-5 text-primary" }),
            "Yacht IT Solutions"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
          " Add Contract"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-4 gap-3", children: [
        { label: "Total Contracts", value: stats.total, color: "text-primary" },
        { label: "Active", value: stats.active, color: "text-emerald-400" },
        { label: "Expiring Soon", value: stats.expiringSoon, color: "text-amber-400" },
        { label: "Expired", value: stats.expired, color: "text-red-400" }
      ].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-muted-foreground", children: s.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `font-display text-xl font-bold tabular-nums ${s.color}`, children: s.value })
          ] })
        },
        s.label
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-7 w-36 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All Statuses" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Statuses" }),
            STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: categoryFilter, onValueChange: setCategoryFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-7 w-36 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All Categories" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Categories" }),
            CATEGORIES.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: c.value, children: c.label }, c.value))
          ] })
        ] }),
        hasFilters && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              setStatusFilter("all");
              setCategoryFilter("all");
              setSearch("");
            },
            className: "text-xs text-muted-foreground hover:text-foreground transition",
            children: "Clear filters"
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "ml-auto relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: search,
              onChange: (e) => setSearch(e.target.value),
              placeholder: "Search contracts…",
              className: "h-7 w-56 pl-8 text-xs"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-6 py-4", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Wifi, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: hasFilters ? "No contracts match your filters." : "No contracts yet. Add your first IT contract." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 z-10 bg-card/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: ["Yacht", "Service", "Vendor", "Category", "Charge (AED)", "Cost (AED)", "Profit (AED)", "Billing", "Start", "Expiry", "Status", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2.5 text-left font-medium whitespace-nowrap", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filtered.map((c) => {
        const profit = c.charge_amount != null && c.cost_amount != null ? c.charge_amount - c.cost_amount : null;
        const days = daysUntil(c.expiry_date);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/50 hover:bg-accent/20 transition group", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 font-medium whitespace-nowrap", children: c.yacht_name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: c.service_name }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-muted-foreground", children: c.vendor ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CategoryBadge, { category: c.category }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 tabular-nums text-right", children: fmtAed(c.charge_amount) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 tabular-nums text-right", children: fmtAed(c.cost_amount) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: `px-3 py-2 tabular-nums text-right font-medium ${profit != null && profit > 0 ? "text-emerald-400" : profit != null && profit < 0 ? "text-red-400" : ""}`, children: fmtAed(profit) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-muted-foreground whitespace-nowrap", children: BILLING_CYCLES.find((b) => b.value === c.billing_cycle)?.label ?? c.billing_cycle }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-muted-foreground whitespace-nowrap text-xs", children: fmtDate(c.start_date) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 whitespace-nowrap text-xs", children: c.expiry_date ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: days !== null && days < 0 ? "text-red-400" : days !== null && days <= 30 ? "text-amber-400" : "text-muted-foreground", children: [
            fmtDate(c.expiry_date),
            days !== null && days >= 0 && days <= 30 && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "ml-1 text-[10px]", children: [
              "(",
              days,
              "d)"
            ] })
          ] }) : "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: c._effectiveStatus }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition justify-end", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => openEdit(c),
                className: "rounded p-1 hover:bg-muted transition",
                title: "Edit",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5 text-muted-foreground" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => setDeleteTarget(c),
                className: "rounded p-1 hover:bg-destructive/10 transition",
                title: "Delete",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5 text-destructive/70" })
              }
            )
          ] }) })
        ] }, c.id);
      }) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-lg max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Monitor, { className: "h-4 w-4 text-primary" }),
        editing ? `Edit — ${editing.service_name}` : "Add IT Contract"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Yacht Name ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.yacht_name,
                onChange: (e) => setF("yacht_name", e.target.value),
                placeholder: "e.g. MY STARGAZER",
                autoFocus: true
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Service Name ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.service_name,
                onChange: (e) => setF("service_name", e.target.value),
                placeholder: "e.g. Starlink Maritime"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Vendor" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.vendor ?? "",
                onChange: (e) => setF("vendor", e.target.value || null),
                placeholder: "e.g. SpaceX"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Category" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.category, onValueChange: (v) => setF("category", v), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: CATEGORIES.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: c.value, children: c.label }, c.value)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Charge to Customer (AED)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                min: "0",
                step: "0.01",
                value: form.charge_amount ?? "",
                onChange: (e) => setF("charge_amount", e.target.value ? parseFloat(e.target.value) : null),
                placeholder: "0.00"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Our Cost (AED)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                min: "0",
                step: "0.01",
                value: form.cost_amount ?? "",
                onChange: (e) => setF("cost_amount", e.target.value ? parseFloat(e.target.value) : null),
                placeholder: "0.00"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Billing Cycle" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.billing_cycle, onValueChange: (v) => setF("billing_cycle", v), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: BILLING_CYCLES.map((b) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: b.value, children: b.label }, b.value)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setF("status", v), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Start Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.start_date ?? "",
                onChange: (e) => setF("start_date", e.target.value || null)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Expiry Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.expiry_date ?? "",
                onChange: (e) => setF("expiry_date", e.target.value || null)
              }
            )
          ] })
        ] }),
        (form.charge_amount != null || form.cost_amount != null) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-md bg-muted/40 px-3 py-2 text-xs flex items-center justify-between", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "Profit margin" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `font-semibold tabular-nums ${(form.charge_amount ?? 0) - (form.cost_amount ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`, children: [
            "AED ",
            fmtAed((form.charge_amount ?? 0) - (form.cost_amount ?? 0))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Textarea,
            {
              rows: 2,
              value: form.notes ?? "",
              onChange: (e) => setF("notes", e.target.value || null),
              placeholder: "Any additional notes…"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-2 border-t border-border", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
            busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
            editing ? "Save Changes" : "Add Contract"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTarget, onOpenChange: (o) => !o && setDeleteTarget(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Delete contract?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTarget?.service_name }),
          " for",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTarget?.yacht_name }),
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
const SplitComponent = YachtItPage;
export {
  SplitComponent as component
};
