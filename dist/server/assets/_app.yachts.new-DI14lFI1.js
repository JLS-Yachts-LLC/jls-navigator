import { r as reactExports, U as jsxRuntimeExports, a0 as createServerFn } from "./worker-entry-B0zFaYG8.js";
import { c as createSsrRpc } from "./createSsrRpc-iPyZBj8s.js";
import { u as useAuth, a as useNavigate, L as Link, t as toast, s as supabase } from "./router-0M2wkbai.js";
import { B as Button } from "./button-4TeUwq9z.js";
import { I as Input } from "./input-yYDVFuKq.js";
import { L as Label } from "./label-Ccupze3W.js";
import { Y as YACHT_COLUMNS } from "./yacht-fields-BxFZKucR.js";
import { A as ArrowLeft, U as Upload } from "./upload-DeQgs4-r.js";
import { S as Save } from "./save-B0NckKzr.js";
import "node:events";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
import "./createLucideIcon-CNvXOZm9.js";
const doPushToSharePoint = createServerFn({
  method: "POST"
}).handler(createSsrRpc("72410b0d758223d6843af93760837cbe41f7f4a32b5ec4f15aed33a3ead26a73"));
const doCreateSpFolder = createServerFn({
  method: "POST"
}).handler(createSsrRpc("bce3ee10f55a91e455657d07dd88487be9d6c6d103d7ed1ae7d45335102e80bf"));
const NUMERIC_KEYS = /* @__PURE__ */ new Set(["built_year", "gross_tonnage", "net_tonnage", "length_overall_m", "breadth_m", "draught_m", "air_draft_m", "max_crew", "max_guests"]);
const DATE_KEYS = /* @__PURE__ */ new Set(["eta", "etd", "cruising_permit_expiry", "departed_date"]);
const SECTIONS = [{
  title: "Identity",
  keys: ["vessel_name", "vessel_type", "flag", "imo_no", "official_no", "port_of_registry"]
}, {
  title: "Build",
  keys: ["built_year", "builders_name", "built_place"]
}, {
  title: "Dimensions",
  keys: ["gross_tonnage", "net_tonnage", "length_overall_m", "breadth_m", "draught_m", "air_draft_m"]
}, {
  title: "Communications",
  keys: ["radio_call_sign", "frequency", "equipment_model", "manufacturer", "serial_no", "mmsi"]
}, {
  title: "Capacity",
  keys: ["max_crew", "max_guests"]
}, {
  title: "Owner",
  keys: ["owners_name", "owners_nationality", "owners_address", "company_name"]
}, {
  title: "Contact",
  keys: ["contact_person", "email_address", "contact_no", "billing_address", "link_to_folder"]
}, {
  title: "Operations",
  keys: ["status", "berth", "eta", "etd", "location", "cruising_permit_expiry", "departed_date", "dma_permit_phase_status", "planner_id", "engine"]
}];
function labelFor(key) {
  return YACHT_COLUMNS.find((c) => c.key === key)?.label ?? key;
}
function NewYacht() {
  const {
    user
  } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = reactExports.useState({
    status: "Active"
  });
  const [imageFile, setImageFile] = reactExports.useState(null);
  const [imagePreview, setImagePreview] = reactExports.useState(null);
  const [busy, setBusy] = reactExports.useState(false);
  function set(key, val) {
    setForm((f) => ({
      ...f,
      [key]: val
    }));
  }
  function pickImage(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  }
  async function submit(e) {
    e.preventDefault();
    if (!user) return;
    if (!form.vessel_name) {
      toast.error("Vessel name is required");
      return;
    }
    setBusy(true);
    try {
      let vessel_image = null;
      if (imageFile) {
        const path = `${user.id}/${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
        const {
          error: upErr
        } = await supabase.storage.from("vessel-images").upload(path, imageFile);
        if (upErr) throw upErr;
        vessel_image = supabase.storage.from("vessel-images").getPublicUrl(path).data.publicUrl;
      }
      const payload = {
        created_by: user.id,
        vessel_image
      };
      for (const [k, v] of Object.entries(form)) {
        if (v === "" || v === void 0) continue;
        if (NUMERIC_KEYS.has(k)) payload[k] = Number(v);
        else payload[k] = v;
      }
      const {
        data,
        error
      } = await supabase.from("yachts").insert([payload]).select("id").single();
      if (error) throw error;
      toast.success("Yacht added");
      doPushToSharePoint({
        data: {
          yachtId: data.id
        }
      }).catch(() => {
      });
      doCreateSpFolder({
        data: {
          vesselName: form.vessel_name,
          yachtId: data.id
        }
      }).catch(() => {
      });
      navigate({
        to: "/yachts/$id",
        params: {
          id: data.id
        }
      });
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex h-full flex-col", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "flex items-center justify-between border-b border-border bg-card/40 px-6 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Button, { asChild: true, variant: "ghost", size: "sm", className: "gap-1.5", children: /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/yachts", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "h-3.5 w-3.5" }),
          " Back"
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "font-display text-lg font-semibold", children: "Add Yacht" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Button, { onClick: submit, disabled: busy, className: "gap-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Save, { className: "h-4 w-4" }),
        " ",
        busy ? "Saving…" : "Save Yacht"
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("form", { onSubmit: submit, className: "flex-1 overflow-auto p-6", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-5xl space-y-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-border bg-card p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-display text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider", children: "Vessel Image" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "aspect-video w-64 overflow-hidden rounded-md border border-border bg-muted", children: imagePreview ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: imagePreview, alt: "", className: "h-full w-full object-cover" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex h-full items-center justify-center text-xs text-muted-foreground", children: "No image" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(Upload, { className: "h-4 w-4" }),
            " Upload image",
            /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: "image/*", className: "hidden", onChange: pickImage })
          ] })
        ] })
      ] }),
      SECTIONS.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-lg border border-border bg-card p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "font-display text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider", children: s.title }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", children: s.keys.map((k) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-1.5", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs(Label, { htmlFor: k, className: "text-xs", children: [
            labelFor(k),
            k === "vessel_name" ? " *" : ""
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Input, { id: k, type: DATE_KEYS.has(k) ? "date" : NUMERIC_KEYS.has(k) ? "number" : "text", step: NUMERIC_KEYS.has(k) ? "any" : void 0, value: form[k] ?? "", onChange: (e) => set(k, e.target.value), required: k === "vessel_name" })
        ] }, k)) })
      ] }, s.title))
    ] }) })
  ] });
}
export {
  NewYacht as component
};
