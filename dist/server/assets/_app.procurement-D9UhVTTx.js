import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { s as supabase, t as toast } from "./router-DtI2KWt0.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { L as Label } from "./label-Ds3qDWN_.js";
import { T as Textarea } from "./textarea-DR2LoV9d.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-Ccda9G2L.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-C7GSg9K8.js";
import { S as ShoppingCart } from "./shopping-cart-CF6T_jko.js";
import { c as createLucideIcon } from "./createLucideIcon-DhyYiX_6.js";
import { P as Plus } from "./plus-CfTJ2ZaO.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import { X } from "./x-DFtrhGVJ.js";
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
import "./chevron-down-HwTvS_C7.js";
const __iconNode = [
  [
    "path",
    {
      d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",
      key: "zw3jo"
    }
  ],
  [
    "path",
    {
      d: "M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",
      key: "1wduqc"
    }
  ],
  [
    "path",
    {
      d: "M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",
      key: "kqbvx6"
    }
  ]
];
const Layers = createLucideIcon("layers", __iconNode);
const CATEGORIES = [
  { value: "electronics", label: "Electronics" },
  { value: "provisions", label: "Provisions" },
  { value: "maintenance", label: "Maintenance" },
  { value: "safety", label: "Safety" },
  { value: "cleaning", label: "Cleaning" },
  { value: "clothing", label: "Clothing" },
  { value: "other", label: "Other" }
];
const STATUSES = [
  { value: "requested", label: "Requested" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" }
];
const EMPTY_FORM = {
  request_no: null,
  yacht_name: "",
  vendor: "",
  description: "",
  category: "other",
  quantity: 1,
  unit_price: null,
  total_amount: null,
  currency: "AED",
  invoice_ref: null,
  status: "requested",
  requested_date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
  ordered_date: null,
  received_date: null,
  requested_by: null,
  notes: null
};
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtAed(n) {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function StatusBadge({ status }) {
  const map = {
    requested: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    ordered: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    received: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    cancelled: "bg-muted text-muted-foreground border-border"
  };
  const label = STATUSES.find((s) => s.value === status)?.label ?? status;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[status] ?? map.cancelled}`, children: label });
}
function CategoryBadge({ category }) {
  const map = {
    electronics: "bg-blue-500/15 text-blue-400",
    provisions: "bg-green-500/15 text-green-400",
    maintenance: "bg-orange-500/15 text-orange-400",
    safety: "bg-red-500/15 text-red-400",
    cleaning: "bg-sky-500/15 text-sky-400",
    clothing: "bg-purple-500/15 text-purple-400",
    other: "bg-muted text-muted-foreground"
  };
  const label = CATEGORIES.find((c) => c.value === category)?.label ?? category;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${map[category] ?? map.other}`, children: label });
}
function ProcurementPage() {
  const [items, setItems] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [search, setSearch] = reactExports.useState("");
  const [statusFilter, setStatusFilter] = reactExports.useState("all");
  const [categoryFilter, setCategoryFilter] = reactExports.useState("all");
  const [yachtFilter, setYachtFilter] = reactExports.useState("all");
  const [vendorFilter, setVendorFilter] = reactExports.useState("all");
  const [yearFilter, setYearFilter] = reactExports.useState("all");
  const [groupByYacht, setGroupByYacht] = reactExports.useState(false);
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
    const { data, error } = await supabase.from("procurement_items").select("*").order("requested_date", { ascending: false });
    if (error) toast.error(error.message);
    else setItems(data ?? []);
    setLoading(false);
  }
  const yachtOptions = reactExports.useMemo(() => {
    const names = [...new Set(items.map((i) => i.yacht_name))].sort();
    return names;
  }, [items]);
  const vendorOptions = reactExports.useMemo(() => {
    const vendors = [...new Set(items.map((i) => i.vendor))].sort();
    return vendors;
  }, [items]);
  const yearOptions = reactExports.useMemo(() => {
    const years = [...new Set(items.map((i) => i.requested_date?.slice(0, 4)).filter(Boolean))].sort().reverse();
    return years;
  }, [items]);
  const filtered = reactExports.useMemo(() => {
    let list = items;
    if (statusFilter !== "all") list = list.filter((i) => i.status === statusFilter);
    if (categoryFilter !== "all") list = list.filter((i) => i.category === categoryFilter);
    if (yachtFilter !== "all") list = list.filter((i) => i.yacht_name === yachtFilter);
    if (vendorFilter !== "all") list = list.filter((i) => i.vendor === vendorFilter);
    if (yearFilter !== "all") list = list.filter((i) => i.requested_date?.startsWith(yearFilter));
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (i) => i.yacht_name.toLowerCase().includes(s) || i.vendor.toLowerCase().includes(s) || i.description.toLowerCase().includes(s) || (i.request_no ?? "").toLowerCase().includes(s) || (i.invoice_ref ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [items, statusFilter, categoryFilter, yachtFilter, vendorFilter, yearFilter, search]);
  const stats = reactExports.useMemo(() => {
    const totalValue = items.reduce((sum, i) => sum + (i.total_amount ?? 0), 0);
    return {
      total: items.length,
      requested: items.filter((i) => i.status === "requested").length,
      ordered: items.filter((i) => i.status === "ordered").length,
      received: items.filter((i) => i.status === "received").length,
      totalValue
    };
  }, [items]);
  const groupedItems = reactExports.useMemo(() => {
    if (!groupByYacht) return null;
    const map = /* @__PURE__ */ new Map();
    for (const item of filtered) {
      const group = map.get(item.yacht_name) ?? [];
      group.push(item);
      map.set(item.yacht_name, group);
    }
    return map;
  }, [filtered, groupByYacht]);
  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  }
  function openEdit(item) {
    setEditing(item);
    const { id, created_at, updated_at, ...rest } = item;
    setForm(rest);
    setOpen(true);
  }
  function setF(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "quantity" || key === "unit_price") {
        const qty = key === "quantity" ? value : prev.quantity;
        const price = key === "unit_price" ? value : prev.unit_price;
        next.total_amount = qty != null && price != null ? qty * price : null;
      }
      return next;
    });
  }
  async function handleSave() {
    if (!form.yacht_name.trim()) {
      toast.error("Yacht name is required");
      return;
    }
    if (!form.vendor.trim()) {
      toast.error("Vendor is required");
      return;
    }
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        request_no: form.request_no?.trim() || null,
        yacht_name: form.yacht_name.trim(),
        vendor: form.vendor.trim(),
        description: form.description.trim(),
        category: form.category,
        quantity: form.quantity,
        unit_price: form.unit_price,
        total_amount: form.total_amount,
        currency: form.currency || "AED",
        invoice_ref: form.invoice_ref?.trim() || null,
        status: form.status,
        requested_date: form.requested_date,
        ordered_date: form.ordered_date || null,
        received_date: form.received_date || null,
        requested_by: form.requested_by?.trim() || null,
        notes: form.notes?.trim() || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("procurement_items").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Item updated");
      } else {
        const { error } = await supabase.from("procurement_items").insert([payload]);
        if (error) throw error;
        toast.success("Request created");
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
    const { error } = await supabase.from("procurement_items").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Request deleted");
      await load();
    }
    setDeleteTarget(null);
  }
  const hasFilters = statusFilter !== "all" || categoryFilter !== "all" || yachtFilter !== "all" || vendorFilter !== "all" || yearFilter !== "all" || search.trim() !== "";
  function clearFilters() {
    setStatusFilter("all");
    setCategoryFilter("all");
    setYachtFilter("all");
    setVendorFilter("all");
    setYearFilter("all");
    setSearch("");
  }
  function TableRows({ rows }) {
    return /* @__PURE__ */ jsxRuntimeExports.jsx(jsxRuntimeExports.Fragment, { children: rows.map((item) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/50 hover:bg-accent/20 transition group", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs text-muted-foreground font-mono whitespace-nowrap", children: item.request_no ?? "—" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 font-medium whitespace-nowrap", children: item.yacht_name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-muted-foreground whitespace-nowrap", children: item.vendor }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 max-w-[200px] truncate", title: item.description, children: item.description }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CategoryBadge, { category: item.category }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 tabular-nums text-center", children: item.quantity }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 tabular-nums text-right", children: fmtAed(item.unit_price) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 tabular-nums text-right font-medium", children: fmtAed(item.total_amount) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs text-muted-foreground whitespace-nowrap", children: item.invoice_ref ?? "—" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx(StatusBadge, { status: item.status }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-xs text-muted-foreground whitespace-nowrap", children: fmtDate(item.requested_date) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition justify-end", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => openEdit(item),
            className: "rounded p-1 hover:bg-muted transition",
            title: "Edit",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5 text-muted-foreground" })
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => setDeleteTarget(item),
            className: "rounded p-1 hover:bg-destructive/10 transition",
            title: "Delete",
            children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5 text-destructive/70" })
          }
        )
      ] }) })
    ] }, item.id)) });
  }
  const TABLE_HEADERS = ["Ref", "Yacht", "Vendor", "Description", "Category", "Qty", "Unit Price", "Total (AED)", "Invoice Ref", "Status", "Requested", ""];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "border-b border-border bg-card/40 px-6 py-4 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-xs text-muted-foreground", children: "Procurement" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "font-display text-xl font-semibold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ShoppingCart, { className: "h-5 w-5 text-primary" }),
            "Procurement"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            Button,
            {
              size: "sm",
              variant: groupByYacht ? "default" : "outline",
              className: "gap-1.5 h-8 text-xs",
              onClick: () => setGroupByYacht((v) => !v),
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Layers, { className: "h-3.5 w-3.5" }),
                "Group by Yacht"
              ]
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
            " New Request"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-5 gap-3", children: [
        { label: "Total Requests", value: stats.total, color: "text-primary", isNum: false },
        { label: "Requested", value: stats.requested, color: "text-blue-400", isNum: false },
        { label: "Ordered", value: stats.ordered, color: "text-amber-400", isNum: false },
        { label: "Received", value: stats.received, color: "text-emerald-400", isNum: false },
        { label: "Total Value (AED)", value: fmtAed(stats.totalValue), color: "text-foreground", isNum: true }
      ].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(
        "div",
        {
          className: "flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5",
          children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-muted-foreground", children: s.label }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `font-display ${s.isNum ? "text-base" : "text-xl"} font-bold tabular-nums ${s.color}`, children: s.value })
          ] })
        },
        s.label
      )) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Input,
            {
              value: search,
              onChange: (e) => setSearch(e.target.value),
              placeholder: "Search…",
              className: "h-7 w-44 pl-8 text-xs"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: yachtFilter, onValueChange: setYachtFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-7 w-36 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All Yachts" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Yachts" }),
            yachtOptions.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y, children: y }, y))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: vendorFilter, onValueChange: setVendorFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-7 w-36 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All Vendors" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Vendors" }),
            vendorOptions.map((v) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: v, children: v }, v))
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-7 w-32 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "All Statuses" }) }),
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
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: yearFilter, onValueChange: setYearFilter, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { className: "h-7 w-24 text-xs", children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Year" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: "all", children: "All Years" }),
            yearOptions.map((y) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: y, children: y }, y))
          ] })
        ] }),
        hasFilters && /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            onClick: clearFilters,
            className: "flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition",
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(X, { className: "h-3 w-3" }),
              " Clear filters"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-6 py-4", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ShoppingCart, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: hasFilters ? "No items match your filters." : "No procurement requests yet. Create your first request." })
    ] }) : groupByYacht && groupedItems ? (
      // Grouped view
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-4", children: [...groupedItems.entries()].map(([yacht, rows]) => {
        const subtotal = rows.reduce((s, i) => s + (i.total_amount ?? 0), 0);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-semibold", children: yacht }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground", children: [
              rows.length,
              " item",
              rows.length !== 1 ? "s" : "",
              " ·",
              " ",
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "font-medium text-foreground", children: [
                "AED ",
                fmtAed(subtotal)
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: TABLE_HEADERS.map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium whitespace-nowrap", children: h }, h)) }) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(TableRows, { rows }) })
          ] })
        ] }, yacht);
      }) })
    ) : (
      // Flat view
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 z-10 bg-card/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: TABLE_HEADERS.map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2.5 text-left font-medium whitespace-nowrap", children: h }, h)) }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(TableRows, { rows: filtered }) })
      ] }) })
    ) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-xl max-h-[90vh] overflow-y-auto", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ShoppingCart, { className: "h-4 w-4 text-primary" }),
        editing ? `Edit — ${editing.description.slice(0, 40)}` : "New Procurement Request"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 mt-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Request No." }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.request_no ?? "",
                onChange: (e) => setF("request_no", e.target.value || null),
                placeholder: "e.g. PO-2026-001"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Requested Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.requested_date,
                onChange: (e) => setF("requested_date", e.target.value)
              }
            )
          ] }),
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
              "Vendor ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.vendor,
                onChange: (e) => setF("vendor", e.target.value),
                placeholder: "e.g. Amazon, Carrefour"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
              "Description ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.description,
                onChange: (e) => setF("description", e.target.value),
                placeholder: "What was ordered…"
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
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status, onValueChange: (v) => setF("status", v), children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s.value, children: s.label }, s.value)) })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quantity" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                min: "1",
                value: form.quantity,
                onChange: (e) => setF("quantity", parseInt(e.target.value) || 1)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Unit Price (AED)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                min: "0",
                step: "0.01",
                value: form.unit_price ?? "",
                onChange: (e) => setF("unit_price", e.target.value ? parseFloat(e.target.value) : null),
                placeholder: "0.00"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Total Amount (AED)" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "number",
                min: "0",
                step: "0.01",
                value: form.total_amount ?? "",
                onChange: (e) => setF("total_amount", e.target.value ? parseFloat(e.target.value) : null),
                placeholder: "Auto-calculated from Qty × Unit Price"
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-muted-foreground", children: "Auto-calculated from Qty × Unit Price. Override manually if needed." })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Invoice Ref" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.invoice_ref ?? "",
                onChange: (e) => setF("invoice_ref", e.target.value || null),
                placeholder: "e.g. INV-2026-042"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Requested By" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                value: form.requested_by ?? "",
                onChange: (e) => setF("requested_by", e.target.value || null),
                placeholder: "Name or team"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Ordered Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.ordered_date ?? "",
                onChange: (e) => setF("ordered_date", e.target.value || null)
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Received Date" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              Input,
              {
                type: "date",
                value: form.received_date ?? "",
                onChange: (e) => setF("received_date", e.target.value || null)
              }
            )
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
            editing ? "Save Changes" : "Create Request"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTarget, onOpenChange: (o) => !o && setDeleteTarget(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Delete request?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          deleteTarget?.request_no && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTarget.request_no }),
            " — "
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTarget?.description?.slice(0, 60) }),
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
const SplitComponent = ProcurementPage;
export {
  SplitComponent as component
};
