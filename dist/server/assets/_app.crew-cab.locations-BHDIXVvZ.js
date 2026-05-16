import { r as reactExports, U as jsxRuntimeExports } from "./worker-entry-BLRKEksJ.js";
import { s as supabase, t as toast } from "./router-uL5kJLps.js";
import { B as Button } from "./button-B_2ucNmN.js";
import { I as Input } from "./input-yBO01Cvp.js";
import { L as Label } from "./label-CMvVB0pP.js";
import { L as LoaderCircle, S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem, T as Textarea } from "./select-YdmRfyEP.js";
import { d as Dialog, D as DialogContent, a as DialogHeader, b as DialogTitle } from "./dialog-1-k-RUEb.js";
import { M as MapPin } from "./map-pin-C3rkhC88.js";
import { P as Plus } from "./Combination-DQBKw1_S.js";
import { c as createLucideIcon } from "./createLucideIcon-DIlZff88.js";
import { P as Pencil, T as Trash2 } from "./x-Btu29LI1.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./chevron-down-DzargQyo.js";
import "./index-DaS_1y0f.js";
const __iconNode = [
  ["path", { d: "M15 3h6v6", key: "1q9fwt" }],
  ["path", { d: "M10 14 21 3", key: "gplh6r" }],
  ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", key: "a6xqqp" }]
];
const ExternalLink = createLucideIcon("external-link", __iconNode);
const EMPTY = { name: "", address: "", latitude: "", longitude: "", category: "other", notes: "" };
const CATEGORIES = ["airport", "marina", "hotel", "office", "restaurant", "other"];
const CAT_LABELS = { airport: "Airport", marina: "Marina", hotel: "Hotel", office: "Office", restaurant: "Restaurant", other: "Other" };
const CAT_COLORS = { airport: "bg-sky-500/15 text-sky-400", marina: "bg-blue-500/15 text-blue-400", hotel: "bg-purple-500/15 text-purple-400", office: "bg-amber-500/15 text-amber-400", restaurant: "bg-orange-500/15 text-orange-400", other: "bg-muted text-muted-foreground" };
function CatBadge({ cat }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `rounded-full px-2.5 py-0.5 text-xs font-medium ${CAT_COLORS[cat] ?? CAT_COLORS.other}`, children: CAT_LABELS[cat] ?? cat });
}
function LocationsPage() {
  const [locations, setLocations] = reactExports.useState([]);
  const [loading, setLoading] = reactExports.useState(true);
  const [open, setOpen] = reactExports.useState(false);
  const [editing, setEditing] = reactExports.useState(null);
  const [form, setForm] = reactExports.useState(EMPTY);
  const [busy, setBusy] = reactExports.useState(false);
  const [geocoding, setGeocoding] = reactExports.useState(false);
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
    setForm({ name: l.name, address: l.address ?? "", latitude: l.latitude ? String(l.latitude) : "", longitude: l.longitude ? String(l.longitude) : "", category: l.category, notes: l.notes ?? "" });
    setOpen(true);
  }
  async function geocodeAddress() {
    if (!form.address.trim()) {
      toast.error("Enter an address first");
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(form.address)}&format=json&limit=1`, { headers: { "Accept-Language": "en" } });
      const data = await res.json();
      if (!data.length) {
        toast.error("Address not found");
        return;
      }
      setForm((f) => ({ ...f, latitude: String(parseFloat(data[0].lat).toFixed(6)), longitude: String(parseFloat(data[0].lon).toFixed(6)) }));
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
      const payload = { name: form.name.trim(), address: form.address || null, latitude: form.latitude ? parseFloat(form.latitude) : null, longitude: form.longitude ? parseFloat(form.longitude) : null, category: form.category, notes: form.notes || null, updated_at: (/* @__PURE__ */ new Date()).toISOString() };
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
  async function handleDelete(l) {
    if (!confirm(`Delete location "${l.name}"?`)) return;
    const { error } = await supabase.from("crew_locations").delete().eq("id", l.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Location removed");
      await load();
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-5 w-5 text-primary" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-xl font-semibold", children: "Locations" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-sm text-muted-foreground ml-1", children: [
          "(",
          locations.length,
          ")"
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: openNew, size: "sm", className: "gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Plus, { className: "h-4 w-4" }),
        " Add Location"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex-1 overflow-auto p-6", children: loading ? /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-40 items-center justify-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-5 w-5 animate-spin text-muted-foreground" }) }) : locations.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-40 flex-col items-center justify-center gap-2 text-muted-foreground", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-10 w-10 opacity-30" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm", children: "No saved locations yet." })
    ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-lg border border-border overflow-hidden", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("table", { className: "w-full text-sm", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("thead", { className: "bg-muted/40 border-b border-border", children: /* @__PURE__ */ jsxRuntimeExports.jsx("tr", { children: ["Name", "Address", "Category", "Coordinates", "Notes", ""].map((h) => /* @__PURE__ */ jsxRuntimeExports.jsx("th", { className: "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground", children: h }, h)) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("tbody", { className: "divide-y divide-border", children: locations.map((l) => /* @__PURE__ */ jsxRuntimeExports.jsxs("tr", { className: "hover:bg-muted/20 transition-colors", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 font-medium", children: l.name }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate", children: l.address ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx(CatBadge, { cat: l.category }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: l.latitude && l.longitude ? /* @__PURE__ */ jsxRuntimeExports.jsxs("a", { href: `https://www.openstreetmap.org/?mlat=${l.latitude}&mlon=${l.longitude}#map=15/${l.latitude}/${l.longitude}`, target: "_blank", rel: "noreferrer", className: "flex items-center gap-1 text-xs text-primary hover:underline", children: [
          Number(l.latitude).toFixed(4),
          ", ",
          Number(l.longitude).toFixed(4),
          /* @__PURE__ */ jsxRuntimeExports.jsx(ExternalLink, { className: "h-3 w-3" })
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-muted-foreground text-xs", children: "—" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3 text-muted-foreground text-xs max-w-[150px] truncate", children: l.notes ?? "—" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("td", { className: "px-4 py-3", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-1 justify-end", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => openEdit(l), className: "h-7 w-7 p-0", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Pencil, { className: "h-3.5 w-3.5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { variant: "ghost", size: "sm", onClick: () => handleDelete(l), className: "h-7 w-7 p-0 text-destructive/70 hover:text-destructive", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Trash2, { className: "h-3.5 w-3.5" }) })
        ] }) })
      ] }, l.id)) })
    ] }) }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Dialog, { open, onOpenChange: setOpen, children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogContent, { className: "max-w-md", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(DialogHeader, { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(DialogTitle, { children: [
        editing ? "Edit" : "Add",
        " Location"
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4", children: [
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
            /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { type: "button", variant: "outline", size: "sm", onClick: geocodeAddress, disabled: geocoding, className: "shrink-0 gap-1", children: [
              geocoding ? /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(MapPin, { className: "h-3.5 w-3.5" }),
              " Geocode"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-4", children: [
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
    ] }) })
  ] });
}
const SplitComponent = LocationsPage;
export {
  SplitComponent as component
};
