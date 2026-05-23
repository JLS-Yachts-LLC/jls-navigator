import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BhSB73Oa.js";
import { s as supabase, t as toast } from "./router-DtI2KWt0.js";
import { B as Button } from "./button-DOuRXxl4.js";
import { I as Input } from "./input-tSns-MFM.js";
import { L as Label } from "./label-Ds3qDWN_.js";
import { T as Textarea } from "./textarea-DR2LoV9d.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-tXTXPZMs.js";
import { D as Dialog, a as DialogContent, b as DialogHeader, c as DialogTitle } from "./dialog-Ccda9G2L.js";
import { A as AlertDialog, a as AlertDialogContent, b as AlertDialogHeader, c as AlertDialogTitle, d as AlertDialogDescription, e as AlertDialogFooter, f as AlertDialogCancel, g as AlertDialogAction } from "./alert-dialog-C7GSg9K8.js";
import { M as MapPin } from "./map-pin-CfDOFZG6.js";
import { S as Search } from "./search-Bc0LlnDZ.js";
import { P as Plus } from "./plus-CfTJ2ZaO.js";
import { L as LoaderCircle } from "./loader-circle-w1KYOQxo.js";
import { E as ExternalLink } from "./external-link-BUmczbTn.js";
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
const EMPTY = { name: "", address: "", latitude: "", longitude: "", category: "other", notes: "" };
const CATEGORIES = ["airport", "marina", "hotel", "office", "restaurant", "other"];
const CAT_LABELS = {
  airport: "Airport",
  marina: "Marina",
  hotel: "Hotel",
  office: "Office",
  restaurant: "Restaurant",
  other: "Other"
};
const CAT_COLORS = {
  airport: "bg-sky-500/15 text-sky-400",
  marina: "bg-blue-500/15 text-blue-400",
  hotel: "bg-purple-500/15 text-purple-400",
  office: "bg-amber-500/15 text-amber-400",
  restaurant: "bg-orange-500/15 text-orange-400",
  other: "bg-muted text-muted-foreground"
};
function CatBadge({ cat }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${CAT_COLORS[cat] ?? CAT_COLORS.other}`, children: CAT_LABELS[cat] ?? cat });
}
function LocationsPage() {
  const [locations, setLocations] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [q, setQ] = reactExports.useState("");
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY);
  const [busy, setBusy] = reactExports.useState(false);
  const [geocoding, setGeocoding] = reactExports.useState(false);
  const [deleteTarget, setDeleteTarget] = reactExports.useState(null);
  reactExports.useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("crew_locations").select("*").order("name");
    if (error) toast.error(error.message);
    else setLocations(data);
    setLoading(false);
  }
  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(l) {
    setEditing(l);
    setForm({
      name: l.name,
      address: l.address ?? "",
      latitude: l.latitude ? String(l.latitude) : "",
      longitude: l.longitude ? String(l.longitude) : "",
      category: l.category,
      notes: l.notes ?? ""
    });
    setOpen(true);
  }
  async function geocodeAddress() {
    if (!form.address.trim()) {
      toast.error("Enter an address first");
      return;
    }
    setGeocoding(true);
    try {
      const queries = [
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address)}&countrycodes=ae&format=json&limit=1&addressdetails=1`,
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address + ", United Arab Emirates")}&format=json&limit=1&addressdetails=1`,
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address)}&format=json&limit=1&addressdetails=1`
      ];
      let found = null;
      for (const url of queries) {
        const res = await fetch(url, { headers: { "Accept-Language": "en", "User-Agent": "JLS-Navigator/1.0" } });
        const data = await res.json();
        if (data.length) {
          found = data[0];
          break;
        }
      }
      if (!found) {
        toast.error("Address not found — try a shorter address or enter coordinates manually");
        return;
      }
      setForm((f) => ({
        ...f,
        latitude: String(parseFloat(found.lat).toFixed(6)),
        longitude: String(parseFloat(found.lon).toFixed(6))
      }));
      toast.success("Coordinates found");
    } catch {
      toast.error("Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  }
  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address || null,
        latitude: form.latitude ? parseFloat(form.latitude) : null,
        longitude: form.longitude ? parseFloat(form.longitude) : null,
        category: form.category,
        notes: form.notes || null,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      };
      if (editing) {
        const { error } = await supabase.from("crew_locations").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Location updated");
      } else {
        const { error } = await supabase.from("crew_locations").insert([payload]);
        if (error) throw error;
        toast.success("Location added");
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
    const { error } = await supabase.from("crew_locations").delete().eq("id", deleteTarget.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Location removed");
      await load();
    }
    setDeleteTarget(null);
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const filtered = reactExports.useMemo(() => {
    if (!q.trim()) return locations;
    const s = q.toLowerCase();
    return locations.filter(
      (l) => [l.name, l.address, l.category, CAT_LABELS[l.category]].some((v) => String(v ?? "").toLowerCase().includes(s))
    );
  }, [locations, q]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-5 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-4 w-4 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-base font-semibold", children: "Locations" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-muted-foreground", children: [
          "(",
          locations.length,
          ")"
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
              placeholder: "Search locations…",
              className: "h-8 w-52 pl-8 text-xs"
            }
          )
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "h-8 gap-1.5 text-xs", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-3.5 w-3.5" }),
          " Add Location"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-5", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : filtered.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: q ? `No locations matching "${q}"` : "No saved locations yet." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-xs", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/40 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Name", "Address", "Category", "Coordinates", "Notes", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-3 py-2 text-left font-medium uppercase tracking-wider text-muted-foreground", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: filtered.map((l) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 font-medium text-sm", children: l.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground max-w-[200px] truncate", children: l.address ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CatBadge, { cat: l.category }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: l.latitude && l.longitude ? /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "a",
          {
            href: `https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=15/${l.latitude}/${l.longitude}`,
            target: "_blank",
            rel: "noreferrer",
            className: "flex items-center gap-1 text-primary hover:underline",
            children: [
              Number(l.latitude).toFixed(4),
              ", ",
              Number(l.longitude).toFixed(4),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "h-3 w-3" })
            ]
          }
        ) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground", children: "—" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5 text-muted-foreground max-w-[150px] truncate", children: l.notes ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-3 py-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(l), className: "h-7 w-7 p-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            Button,
            {
              variant: "ghost",
              size: "sm",
              onClick: () => setDeleteTarget(l),
              className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive",
              children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" })
            }
          )
        ] }) })
      ] }, l.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
        editing ? "Edit" : "Add",
        " Location"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { children: [
            "Name ",
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.name, onChange: set("name"), placeholder: "e.g. Dubai International Airport T3" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Address" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { value: form.address, onChange: set("address"), placeholder: "Enter full address…", className: "flex-1" }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: geocodeAddress, disabled: geocoding, className: "shrink-0 gap-1 h-8", children: [
              geocoding ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-3.5 w-3.5" }),
              " Geocode"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Latitude" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", step: "0.000001", value: form.latitude, onChange: set("latitude"), placeholder: "25.2532" })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Longitude" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { type: "number", step: "0.000001", value: form.longitude, onChange: set("longitude"), placeholder: "55.3657" })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Label, { children: "Category" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Select, { value: form.category, onValueChange: (v) => setForm((f) => ({ ...f, category: v })), children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectTrigger, { children: /* @__PURE__ */ jsxRuntimeExports.jsx(SelectValue, {}) }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(SelectContent, { children: CATEGORIES.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsx(SelectItem, { value: c, children: CAT_LABELS[c] }, c)) })
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
            editing ? "Save Changes" : "Add Location"
          ] })
        ] })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialog, { open: !!deleteTarget, onOpenChange: (o) => !o && setDeleteTarget(null), children: /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(AlertDialogTitle, { children: "Delete location?" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(AlertDialogDescription, { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: deleteTarget?.name }),
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
const SplitComponent = LocationsPage;
export {
  SplitComponent as component
};
