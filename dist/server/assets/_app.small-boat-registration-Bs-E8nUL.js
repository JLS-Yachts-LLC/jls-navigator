import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-DsQ-8Irl.js";
import { s as supabase, t as toast } from "./router-DIZelgi3.js";
import { c as cn, B as Button } from "./button-BpYf_3Uk.js";
import { I as Input } from "./input-BJ_AqVVM.js";
import { L as Label } from "./label-Davl8uUu.js";
import { L as LoaderCircle, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-i33xsu0B.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-rEAIxUU7.js";
import { u as useDirection, a as useControllableState, P as Primitive, b as useId, c as composeEventHandlers, d as createContextScope, e as Plus } from "./Combination-DYVvUise.js";
import { R as Root, I as Item, c as createRovingFocusGroupScope, D as DropdownMenu, a as DropdownMenuTrigger, S as SlidersHorizontal, b as DropdownMenuContent, d as DropdownMenuLabel, e as DropdownMenuSeparator, f as DropdownMenuRadioGroup, g as DropdownMenuRadioItem } from "./dropdown-menu-yuUGF0UD.js";
import { P as Presence } from "./index-EFGDcBO_.js";
import { S as Sailboat } from "./sailboat-CPRCrQVl.js";
import { C as ChevronDown } from "./chevron-down-CpX_Bl0x.js";
import { S as Search } from "./search-BweoIQVw.js";
import { E as ExternalLink } from "./external-link-C48mCQYg.js";
import { T as TriangleAlert } from "./triangle-alert-DOrzaqz9.js";
import { P as Pencil, T as Trash2 } from "./x-C86O2zKF.js";
import { C as CircleCheck } from "./circle-check-BvYGR0He.js";
import { C as Circle } from "./circle-DgUrBvuL.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-MgZLU5K_.js";
import "./chevron-right-WKf6QYSv.js";
var TABS_NAME = "Tabs";
var [createTabsContext] = createContextScope(TABS_NAME, [
  createRovingFocusGroupScope
]);
var useRovingFocusGroupScope = createRovingFocusGroupScope();
var [TabsProvider, useTabsContext] = createTabsContext(TABS_NAME);
var Tabs$1 = reactExports.forwardRef(
  (props, forwardedRef) => {
    const {
      __scopeTabs,
      value: valueProp,
      onValueChange,
      defaultValue,
      orientation = "horizontal",
      dir,
      activationMode = "automatic",
      ...tabsProps
    } = props;
    const direction = useDirection(dir);
    const [value, setValue] = useControllableState({
      prop: valueProp,
      onChange: onValueChange,
      defaultProp: defaultValue ?? "",
      caller: TABS_NAME
    });
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      TabsProvider,
      {
        scope: __scopeTabs,
        baseId: useId(),
        value,
        onValueChange: setValue,
        orientation,
        dir: direction,
        activationMode,
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          Primitive.div,
          {
            dir: direction,
            "data-orientation": orientation,
            ...tabsProps,
            ref: forwardedRef
          }
        )
      }
    );
  }
);
Tabs$1.displayName = TABS_NAME;
var TAB_LIST_NAME = "TabsList";
var TabsList$1 = reactExports.forwardRef(
  (props, forwardedRef) => {
    const { __scopeTabs, loop = true, ...listProps } = props;
    const context = useTabsContext(TAB_LIST_NAME, __scopeTabs);
    const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeTabs);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      Root,
      {
        asChild: true,
        ...rovingFocusGroupScope,
        orientation: context.orientation,
        dir: context.dir,
        loop,
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          Primitive.div,
          {
            role: "tablist",
            "aria-orientation": context.orientation,
            ...listProps,
            ref: forwardedRef
          }
        )
      }
    );
  }
);
TabsList$1.displayName = TAB_LIST_NAME;
var TRIGGER_NAME = "TabsTrigger";
var TabsTrigger$1 = reactExports.forwardRef(
  (props, forwardedRef) => {
    const { __scopeTabs, value, disabled = false, ...triggerProps } = props;
    const context = useTabsContext(TRIGGER_NAME, __scopeTabs);
    const rovingFocusGroupScope = useRovingFocusGroupScope(__scopeTabs);
    const triggerId = makeTriggerId(context.baseId, value);
    const contentId = makeContentId(context.baseId, value);
    const isSelected = value === context.value;
    return /* @__PURE__ */ jsxRuntimeExports.jsx(
      Item,
      {
        asChild: true,
        ...rovingFocusGroupScope,
        focusable: !disabled,
        active: isSelected,
        children: /* @__PURE__ */ jsxRuntimeExports.jsx(
          Primitive.button,
          {
            type: "button",
            role: "tab",
            "aria-selected": isSelected,
            "aria-controls": contentId,
            "data-state": isSelected ? "active" : "inactive",
            "data-disabled": disabled ? "" : void 0,
            disabled,
            id: triggerId,
            ...triggerProps,
            ref: forwardedRef,
            onMouseDown: composeEventHandlers(props.onMouseDown, (event) => {
              if (!disabled && event.button === 0 && event.ctrlKey === false) {
                context.onValueChange(value);
              } else {
                event.preventDefault();
              }
            }),
            onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
              if ([" ", "Enter"].includes(event.key)) context.onValueChange(value);
            }),
            onFocus: composeEventHandlers(props.onFocus, () => {
              const isAutomaticActivation = context.activationMode !== "manual";
              if (!isSelected && !disabled && isAutomaticActivation) {
                context.onValueChange(value);
              }
            })
          }
        )
      }
    );
  }
);
TabsTrigger$1.displayName = TRIGGER_NAME;
var CONTENT_NAME = "TabsContent";
var TabsContent$1 = reactExports.forwardRef(
  (props, forwardedRef) => {
    const { __scopeTabs, value, forceMount, children, ...contentProps } = props;
    const context = useTabsContext(CONTENT_NAME, __scopeTabs);
    const triggerId = makeTriggerId(context.baseId, value);
    const contentId = makeContentId(context.baseId, value);
    const isSelected = value === context.value;
    const isMountAnimationPreventedRef = reactExports.useRef(isSelected);
    reactExports.useEffect(() => {
      const rAF = requestAnimationFrame(() => isMountAnimationPreventedRef.current = false);
      return () => cancelAnimationFrame(rAF);
    }, []);
    return /* @__PURE__ */ jsxRuntimeExports.jsx(Presence, { present: forceMount || isSelected, children: ({ present }) => /* @__PURE__ */ jsxRuntimeExports.jsx(
      Primitive.div,
      {
        "data-state": isSelected ? "active" : "inactive",
        "data-orientation": context.orientation,
        role: "tabpanel",
        "aria-labelledby": triggerId,
        hidden: !present,
        id: contentId,
        tabIndex: 0,
        ...contentProps,
        ref: forwardedRef,
        style: {
          ...props.style,
          animationDuration: isMountAnimationPreventedRef.current ? "0s" : void 0
        },
        children: present && children
      }
    ) });
  }
);
TabsContent$1.displayName = CONTENT_NAME;
function makeTriggerId(baseId, value) {
  return `${baseId}-trigger-${value}`;
}
function makeContentId(baseId, value) {
  return `${baseId}-content-${value}`;
}
var Root2 = Tabs$1;
var List = TabsList$1;
var Trigger = TabsTrigger$1;
var Content = TabsContent$1;
const Tabs = Root2;
const TabsList = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  List,
  {
    ref,
    className: cn(
      "inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground",
      className
    ),
    ...props
  }
));
TabsList.displayName = List.displayName;
const TabsTrigger = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Trigger,
  {
    ref,
    className: cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
      className
    ),
    ...props
  }
));
TabsTrigger.displayName = Trigger.displayName;
const TabsContent = reactExports.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ jsxRuntimeExports.jsx(
  Content,
  {
    ref,
    className: cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    ),
    ...props
  }
));
TabsContent.displayName = Content.displayName;
const STATUSES = ["Registered", "Working on it", "Pending", "Archived"];
const BOAT_TYPES = ["Powerboat", "Jet Ski", "Sailing Yacht", "Motor Yacht", "Other"];
const AUTHORITIES = ["DMA", "FTA", "Other"];
const REG_TYPES = [
  "Pleasure",
  "Commercial",
  "New Reg Dubai Pleasure Above 12",
  "New Reg Dubai Pleasure Below 12",
  "New Reg Dubai Commercial Below 12",
  "New Reg DS <12",
  "Other"
];
const REG_SUB_TYPES = ["New Reg", "Reg. Renewal", "Transfer", "Reg. Cxl"];
const DOC_FIELDS = [
  { key: "doc_emirates_id", label: "Emirates ID" },
  { key: "doc_passport_copy", label: "Passport Copy" },
  { key: "doc_visa_copy", label: "Visa Copy" },
  { key: "doc_salary_certificate", label: "Salary Certificate (AED 20k+)" },
  { key: "doc_partnership_trade_license", label: "Partnership / Commercial Trade License (Dubai)" },
  { key: "doc_title_deed", label: "Title Deed (Freehold Property)" },
  { key: "doc_trade_license", label: "Valid Dubai-Issued Trade License" },
  { key: "doc_establishment_card", label: "Establishment Card" },
  { key: "doc_builder_certificate", label: "Marine Craft Builder Certificate" },
  { key: "doc_proof_of_ownership", label: "Proof of Ownership / Attested Purchase Invoice" },
  { key: "doc_cancellation_certificate", label: "Marine Craft Cancellation Certificate" },
  { key: "doc_sale_agreement", label: "Attested Sale Agreement" },
  { key: "doc_customs_clearance", label: "Customs Clearance Certificate" },
  { key: "doc_tdra_license", label: "TDRA – Ship Station License" },
  { key: "doc_insurance_policy", label: "Insurance Policy (valid 13 months)" },
  { key: "doc_trailer_registration", label: "Trailer Registration / Annual Berth Contract" },
  { key: "doc_environment_certificate", label: "ESMA Environment Specifications Certificate" },
  { key: "doc_stability_booklet", label: "Stability Booklet (>12 passengers)" }
];
const EMPTY_FORM = {
  boat_name: "",
  status: "Working on it",
  reg_type: "",
  authority: "",
  reg_start_date: null,
  reg_end_date: null,
  boat_type: "",
  reg_sub_type: "",
  eight_meters_or_below: false,
  marine_craft_length: "",
  client_email: "",
  login_username: "",
  login_password: "",
  quotation_no: "",
  signed_quote: false,
  quotation_approved: false,
  doc_emirates_id: false,
  doc_passport_copy: false,
  doc_visa_copy: false,
  doc_salary_certificate: false,
  doc_partnership_trade_license: false,
  doc_title_deed: false,
  doc_trade_license: false,
  doc_establishment_card: false,
  doc_builder_certificate: false,
  doc_proof_of_ownership: false,
  doc_cancellation_certificate: false,
  doc_sale_agreement: false,
  doc_customs_clearance: false,
  doc_tdra_license: false,
  doc_insurance_policy: false,
  doc_trailer_registration: false,
  doc_environment_certificate: false,
  doc_stability_booklet: false,
  document_submission_date: null,
  inspection_date: null,
  inspection_location: "",
  pro: "",
  receipts: "",
  marine_craft_license: "",
  link_to_folder: "",
  notes: "",
  send_email: false,
  archive: false
};
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function isExpired(end) {
  if (!end) return false;
  return new Date(end) < /* @__PURE__ */ new Date();
}
function docProgress(boat) {
  const total = DOC_FIELDS.length;
  const done = DOC_FIELDS.filter((f) => boat[f.key] === true).length;
  return { done, total, pct: total > 0 ? Math.round(done / total * 100) : 0 };
}
function statusColor(s) {
  switch (s) {
    case "Registered":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    case "Working on it":
      return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    case "Pending":
      return "bg-blue-500/15 text-blue-400 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
function BoolCheck({
  value,
  onChange,
  label
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(
    "button",
    {
      type: "button",
      onClick: () => onChange(!value),
      className: "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted transition text-left w-full",
      children: [
        value ? /* @__PURE__ */ jsxRuntimeExports.jsx(CircleCheck, { className: "h-4 w-4 text-emerald-400 shrink-0" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Circle, { className: "h-4 w-4 text-muted-foreground/50 shrink-0" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: value ? "text-foreground" : "text-muted-foreground", children: label })
      ]
    }
  );
}
function SmallBoatRegistrationPage() {
  const [boats, setBoats] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [search, setSearch] = reactExports.useState("");
  const [statusFilter, setStatusFilter] = reactExports.useState("all");
  const [authorityFilter, setAuthorityFilter] = reactExports.useState("all");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY_FORM);
  const [busy, setBusy] = reactExports.useState(false);
  reactExports.useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("small_boats").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setBoats(data ?? []);
    setLoading(false);
  }
  const filtered = reactExports.useMemo(() => {
    let list = boats;
    if (statusFilter !== "all") list = list.filter((b) => b.status === statusFilter);
    if (authorityFilter !== "all") list = list.filter((b) => b.authority === authorityFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (b) => b.boat_name.toLowerCase().includes(s) || (b.client_email ?? "").toLowerCase().includes(s) || (b.boat_type ?? "").toLowerCase().includes(s) || (b.reg_type ?? "").toLowerCase().includes(s)
      );
    }
    return list;
  }, [boats, statusFilter, authorityFilter, search]);
  const stats = reactExports.useMemo(() => ({
    total: boats.length,
    registered: boats.filter((b) => b.status === "Registered").length,
    inProgress: boats.filter((b) => b.status === "Working on it").length,
    expiring: boats.filter((b) => {
      if (!b.reg_end_date) return false;
      const d = new Date(b.reg_end_date);
      const diff = (d.getTime() - Date.now()) / (1e3 * 60 * 60 * 24);
      return diff >= 0 && diff <= 30;
    }).length
  }), [boats]);
  function openNew() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  }
  function openEdit(b) {
    setEditing(b);
    const { id, created_at, ...rest } = b;
    setForm(rest);
    setOpen(true);
  }
  function setF(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function handleSave() {
    if (!form.boat_name.trim()) {
      toast.error("Boat name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...form,
        boat_name: form.boat_name.trim(),
        reg_type: form.reg_type || null,
        authority: form.authority || null,
        boat_type: form.boat_type || null,
        reg_sub_type: form.reg_sub_type || null,
        marine_craft_length: form.marine_craft_length || null,
        client_email: form.client_email || null,
        login_username: form.login_username || null,
        login_password: form.login_password || null,
        quotation_no: form.quotation_no || null,
        inspection_location: form.inspection_location || null,
        pro: form.pro || null,
        receipts: form.receipts || null,
        marine_craft_license: form.marine_craft_license || null,
        link_to_folder: form.link_to_folder || null,
        notes: form.notes || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("small_boats").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Boat updated");
      } else {
        const { error } = await supabase.from("small_boats").insert([payload]);
        if (error) throw error;
        toast.success("Boat added");
      }
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }
  async function handleDelete(b) {
    if (!confirm(`Delete "${b.boat_name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("small_boats").delete().eq("id", b.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Boat deleted");
      await load();
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "border-b border-border bg-card/40 px-6 py-4 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-xs text-muted-foreground mb-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Port & Operations" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "opacity-40", children: "/" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-foreground", children: "Small Boat Registration" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "font-display text-xl font-semibold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Sailboat, { className: "h-5 w-5 text-primary" }),
            " Small Boat Registration"
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
          " Register Boat"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-4 gap-3", children: [
        { label: "Total Boats", value: stats.total, color: "text-primary" },
        { label: "Registered", value: stats.registered, color: "text-emerald-400" },
        { label: "In Progress", value: stats.inProgress, color: "text-amber-400" },
        { label: "Expiring Soon", value: stats.expiring, color: "text-red-400" }
      ].map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] uppercase tracking-wider text-muted-foreground", children: s.label }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `font-display text-xl font-bold tabular-nums ${s.color}`, children: s.value })
      ] }) }, s.label)) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenu, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", className: "h-7 gap-1 text-xs", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SlidersHorizontal, { className: "h-3 w-3" }),
            statusFilter === "all" ? "All Statuses" : statusFilter,
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-3 w-3 opacity-60" })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuContent, { align: "start", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuLabel, { children: "Status" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuSeparator, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuRadioGroup, { value: statusFilter, onValueChange: setStatusFilter, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuRadioItem, { value: "all", children: "All Statuses" }),
              STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuRadioItem, { value: s, children: s }, s))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenu, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { variant: "outline", size: "sm", className: "h-7 gap-1 text-xs", children: [
            authorityFilter === "all" ? "All Authorities" : authorityFilter,
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "h-3 w-3 opacity-60" })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuContent, { align: "start", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuLabel, { children: "Authority" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuSeparator, {}),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(DropdownMenuRadioGroup, { value: authorityFilter, onValueChange: setAuthorityFilter, children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuRadioItem, { value: "all", children: "All Authorities" }),
              AUTHORITIES.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(DropdownMenuRadioItem, { value: a, children: a }, a))
            ] })
          ] })
        ] }),
        (statusFilter !== "all" || authorityFilter !== "all" || search) && /* @__PURE__ */ jsxRuntimeExports.jsx(
          "button",
          {
            onClick: () => {
              setStatusFilter("all");
              setAuthorityFilter("all");
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
              placeholder: "Search boats…",
              className: "h-7 w-56 pl-8 text-xs"
            }
          )
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto px-6 py-4", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Sailboat, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No boats found. Register your first small boat." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "overflow-x-auto rounded-lg border border-border bg-card", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "min-w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "sticky top-0 z-10 bg-card/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium w-8", children: "●" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Boat Name" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Status" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Boat Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Authority" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Reg Type" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Reg End" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "Docs" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium", children: "PRO" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium w-20" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { children: filtered.map((b, i) => {
        const { done, total, pct } = docProgress(b);
        const expired = isExpired(b.reg_end_date);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "border-b border-border/50 hover:bg-accent/20 transition group", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-muted-foreground tabular-nums text-xs", children: String(i + 1).padStart(3, "0") }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("td", { className: "px-3 py-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "font-medium text-foreground flex items-center gap-1.5", children: [
              b.boat_name,
              b.link_to_folder && /* @__PURE__ */ jsxRuntimeExports.jsx(
                "a",
                {
                  href: b.link_to_folder.startsWith("http") ? b.link_to_folder : `https://newhorizonit.sharepoint.com${b.link_to_folder}`,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  onClick: (e) => e.stopPropagation(),
                  title: "Open SharePoint folder",
                  className: "text-muted-foreground hover:text-primary transition",
                  children: /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "h-3 w-3" })
                }
              )
            ] }),
            b.client_email && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-[10px] text-muted-foreground", children: b.client_email })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor(b.status)}`, children: b.status ?? "—" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-foreground/80 whitespace-nowrap", children: b.boat_type ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-foreground/80", children: b.authority ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-foreground/75 text-xs max-w-[180px] truncate", children: b.reg_type ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 whitespace-nowrap", children: b.reg_end_date ? /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: `flex items-center gap-1 text-xs ${expired ? "text-red-400" : "text-foreground/75"}`, children: [
            expired && /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "h-3 w-3" }),
            fmtDate(b.reg_end_date)
          ] }) : "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-1.5 w-20 rounded-full bg-muted overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
              "div",
              {
                className: `h-full rounded-full transition-all ${pct === 100 ? "bg-emerald-500" : pct > 50 ? "bg-amber-400" : "bg-muted-foreground/30"}`,
                style: { width: `${pct}%` }
              }
            ) }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-[10px] text-muted-foreground", children: [
              done,
              "/",
              total
            ] })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2 text-foreground/75 text-xs", children: b.pro ?? "—" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-2", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => openEdit(b),
                className: "rounded p-1 hover:bg-muted transition",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5 text-muted-foreground" })
              }
            ),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              "button",
              {
                onClick: () => handleDelete(b),
                className: "rounded p-1 hover:bg-destructive/10 transition",
                children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5 text-destructive/70" })
              }
            )
          ] }) })
        ] }, b.id);
      }) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-3xl max-h-[90vh] overflow-hidden flex flex-col", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Sailboat, { className: "h-4 w-4 text-primary" }),
        editing ? `Edit — ${editing.boat_name}` : "Register New Small Boat"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Tabs, { defaultValue: "basic", className: "flex-1 overflow-hidden flex flex-col", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsList, { className: "grid grid-cols-5 w-full shrink-0", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "basic", children: "Basic Info" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "dates", children: "Dates" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "commercial", children: "Commercial" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "documents", children: "Documents" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsTrigger, { value: "other", children: "Other" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 overflow-y-auto mt-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "basic", className: "space-y-4 px-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
                  "Boat Name ",
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
                ] }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    value: form.boat_name,
                    onChange: (e) => setF("boat_name", e.target.value),
                    placeholder: "e.g. DESERT EAGLE 1",
                    autoFocus: true
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Status" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.status ?? "", onValueChange: (v) => setF("status", v), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select status…" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: STATUSES.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: s, children: s }, s)) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Boat Type" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.boat_type ?? "", onValueChange: (v) => setF("boat_type", v), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select type…" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: BOAT_TYPES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: t, children: t }, t)) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Authority" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.authority ?? "", onValueChange: (v) => setF("authority", v), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select authority…" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: AUTHORITIES.map((a) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: a, children: a }, a)) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Reg. Sub-Type" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.reg_sub_type ?? "", onValueChange: (v) => setF("reg_sub_type", v), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select…" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: REG_SUB_TYPES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: t, children: t }, t)) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Registration Type" }),
                /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.reg_type ?? "", onValueChange: (v) => setF("reg_type", v), children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, { placeholder: "Select registration type…" }) }),
                  /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: REG_TYPES.map((t) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: t, children: t }, t)) })
                ] })
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Marine Craft Length" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    value: form.marine_craft_length ?? "",
                    onChange: (e) => setF("marine_craft_length", e.target.value),
                    placeholder: "e.g. 6.32m"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Client Email" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    type: "email",
                    value: form.client_email ?? "",
                    onChange: (e) => setF("client_email", e.target.value),
                    placeholder: "client@example.com"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(
              BoolCheck,
              {
                value: form.eight_meters_or_below,
                onChange: (v) => setF("eight_meters_or_below", v),
                label: "8 meters or below"
              }
            )
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(TabsContent, { value: "dates", className: "space-y-4 px-1", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Reg. Start Date" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "date",
                  value: form.reg_start_date ?? "",
                  onChange: (e) => setF("reg_start_date", e.target.value || null)
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Reg. End Date" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "date",
                  value: form.reg_end_date ?? "",
                  onChange: (e) => setF("reg_end_date", e.target.value || null)
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Document Submission Date" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "date",
                  value: form.document_submission_date ?? "",
                  onChange: (e) => setF("document_submission_date", e.target.value || null)
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Inspection Date" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  type: "date",
                  value: form.inspection_date ?? "",
                  onChange: (e) => setF("inspection_date", e.target.value || null)
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "col-span-2 space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Inspection Location" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  value: form.inspection_location ?? "",
                  onChange: (e) => setF("inspection_location", e.target.value),
                  placeholder: "e.g. Dubai Marina, Port Rashid…"
                }
              )
            ] })
          ] }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "commercial", className: "space-y-4 px-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Quotation No." }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    value: form.quotation_no ?? "",
                    onChange: (e) => setF("quotation_no", e.target.value),
                    placeholder: "e.g. Q-24-4289"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "PRO" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    value: form.pro ?? "",
                    onChange: (e) => setF("pro", e.target.value),
                    placeholder: "PRO name…"
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Marine Craft License" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    value: form.marine_craft_license ?? "",
                    onChange: (e) => setF("marine_craft_license", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Receipts" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    value: form.receipts ?? "",
                    onChange: (e) => setF("receipts", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Login Username" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    value: form.login_username ?? "",
                    onChange: (e) => setF("login_username", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Login Password" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx(
                  Input,
                  {
                    type: "text",
                    value: form.login_password ?? "",
                    onChange: (e) => setF("login_password", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(BoolCheck, { value: form.signed_quote, onChange: (v) => setF("signed_quote", v), label: "Signed Quote received" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(BoolCheck, { value: form.quotation_approved, onChange: (v) => setF("quotation_approved", v), label: "Quotation Approved" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(BoolCheck, { value: form.send_email, onChange: (v) => setF("send_email", v), label: "Send Email" })
            ] })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "documents", className: "px-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-3 flex items-center justify-between", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-muted-foreground", children: "Tick documents that have been received / are in order." }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs font-medium text-foreground", children: [
                DOC_FIELDS.filter((f) => form[f.key]).length,
                " / ",
                DOC_FIELDS.length,
                " received"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-0.5", children: DOC_FIELDS.map((f) => /* @__PURE__ */ jsxRuntimeExports.jsx(
              BoolCheck,
              {
                value: form[f.key],
                onChange: (v) => setF(f.key, v),
                label: f.label
              },
              f.key
            )) })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(TabsContent, { value: "other", className: "space-y-4 px-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "SharePoint Folder Link" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Input,
                {
                  value: form.link_to_folder ?? "",
                  onChange: (e) => setF("link_to_folder", e.target.value),
                  placeholder: "https://newhorizonit.sharepoint.com/sites/PortOperations…"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] text-muted-foreground", children: "Paste the full SharePoint URL or the relative path from the CSV." })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Notes & Updates" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                Textarea,
                {
                  rows: 4,
                  value: form.notes ?? "",
                  onChange: (e) => setF("notes", e.target.value),
                  placeholder: "Any additional notes or updates…"
                }
              )
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(BoolCheck, { value: form.archive, onChange: (v) => setF("archive", v), label: "Archive this record" })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex justify-end gap-2 pt-4 border-t border-border mt-2 shrink-0", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "outline", onClick: () => setOpen(false), disabled: busy, children: "Cancel" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: handleSave, disabled: busy, className: "gap-1.5", children: [
          busy && /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-4 w-4 animate-spin" }),
          editing ? "Save Changes" : "Register Boat"
        ] })
      ] })
    ] }) })
  ] });
}
const SplitComponent = SmallBoatRegistrationPage;
export {
  SplitComponent as component
};
